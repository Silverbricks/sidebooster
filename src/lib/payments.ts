import "server-only";
import crypto from "node:crypto";
import { db } from "./db";
import { notify } from "./notify";
import { audit } from "./audit";
import { money } from "./format";
import { getNumber } from "./settings";
import { paymentProvider, type WebhookOutcome } from "./payment-provider";
import { AllocationError, allocateTickets, eligibilityProblems, onSoldOut } from "./campaigns";
import { bestOffer } from "./offers";
import { createSaleFromOrder, reverseForOrder } from "./commission";
import { refreshSellerStatus } from "./accounts";
import type { CurrentUser } from "./auth";

/**
 * "No verified payment = No order confirmation."
 * Checkout creates a PENDING payment and hands the buyer to the provider. Only a
 * signature-verified webhook (handleWebhook) moves a payment to SUCCEEDED and fulfils it.
 */

export class CheckoutError extends Error {}

const receipt = (p: "P" | "T") => `${p}${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
const orderNumber = () => `ORD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

async function expiry() {
  return new Date(Date.now() + (await getNumber("payment_expiry_minutes")) * 60_000);
}

// ---------------------------------------------------------------- product checkout

export async function startProductCheckout(
  buyer: CurrentUser,
  input: { listingId: string; quantity: number; shippingName: string; shippingAddress: string; notes: string | null; coupon: string | null; idempotencyKey: string },
) {
  const existing = await db.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { paymentId: existing.id, redirectUrl: `/pay/${existing.id}` };

  if (buyer.accountStatus !== "ACTIVE") throw new CheckoutError("Your account must be verified (email and mobile) before purchasing.");
  const listing = await db.listing.findUniqueOrThrow({ where: { id: input.listingId }, include: { category: true } });
  if (listing.status !== "ACTIVE") throw new CheckoutError("This listing is not available.");
  if (!listing.allowCheckout || listing.category.highValue) throw new CheckoutError("This item is sold via enquiry only.");
  if (listing.sellerId === buyer.id) throw new CheckoutError("You cannot buy your own listing.");
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > listing.quantity) throw new CheckoutError(`Choose between 1 and ${listing.quantity}.`);
  const seller = await db.sellerProfile.findUnique({ where: { userId: listing.sellerId } });
  if (seller?.status !== "ACTIVE") throw new CheckoutError("This seller cannot currently accept online payments.");

  const subtotal = listing.price * input.quantity;
  const applied = await bestOffer(listing, input.quantity, buyer.id, input.coupon);
  const deliveryFee = applied?.freeDelivery ? 0 : listing.deliveryFee;
  const discount = applied?.discount ?? 0;
  const total = subtotal - discount + deliveryFee;

  const payment = await db.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        orderNumber: orderNumber(),
        buyerId: buyer.id,
        sellerId: listing.sellerId,
        subtotal,
        discount,
        deliveryFee,
        total,
        offerId: applied?.offer.id,
        shippingName: input.shippingName,
        shippingAddress: input.shippingAddress,
        notes: input.notes,
        items: { create: [{ listingId: listing.id, title: listing.title, unitPrice: listing.price, quantity: input.quantity }] },
      },
    });
    return tx.payment.create({
      data: {
        receiptNumber: receipt("P"),
        ledger: "PRODUCT",
        userId: buyer.id,
        sellerId: listing.sellerId,
        amount: total,
        provider: paymentProvider().name,
        idempotencyKey: input.idempotencyKey,
        orderId: order.id,
        expiresAt: await expiry(),
      },
    });
  });
  const { redirectUrl } = await paymentProvider().createCheckout({
    paymentId: payment.id,
    amount: total,
    currency: "AUD",
    description: `${listing.title} × ${input.quantity}`,
    customerEmail: buyer.email,
    ledger: "PRODUCT",
    successPath: `/pay/${payment.id}/done`,
    cancelPath: `/listing/${listing.id}`,
  });
  return { paymentId: payment.id, redirectUrl };
}

// ---------------------------------------------------------------- ticket checkout (separate ledger)

export async function startTicketCheckout(buyer: CurrentUser, input: { campaignId: string; quantity: number; idempotencyKey: string }) {
  const existing = await db.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { paymentId: existing.id, redirectUrl: `/pay/${existing.id}` };

  const c = await db.campaign.findUniqueOrThrow({ where: { id: input.campaignId } });
  if (c.ticketType !== "PAID") throw new CheckoutError("This is a free campaign.");
  const problems = await eligibilityProblems(c, buyer, input.quantity);
  if (problems.length) throw new CheckoutError(problems.join(" "));
  const max = await getNumber("max_tickets_per_order");
  if (input.quantity > max) throw new CheckoutError(`Maximum ${max} tickets per order.`);
  const amount = c.ticketPrice * input.quantity;

  const payment = await db.$transaction(async (tx) => {
    const tp = await tx.ticketPurchase.create({
      data: { campaignId: c.id, buyerId: buyer.id, quantity: input.quantity, amount, idempotencyKey: input.idempotencyKey },
    });
    return tx.payment.create({
      data: {
        receiptNumber: receipt("T"),
        ledger: "TICKET",
        userId: buyer.id,
        sellerId: c.sellerId,
        amount,
        provider: paymentProvider().name,
        idempotencyKey: input.idempotencyKey,
        ticketPurchaseId: tp.id,
        expiresAt: await expiry(),
      },
    });
  });
  const { redirectUrl } = await paymentProvider().createCheckout({
    paymentId: payment.id,
    amount,
    currency: "AUD",
    description: `${input.quantity} × ticket — ${c.title}`,
    customerEmail: buyer.email,
    ledger: "TICKET",
    successPath: `/pay/${payment.id}/done`,
    cancelPath: `/draws/${c.slug}`,
  });
  return { paymentId: payment.id, redirectUrl };
}

// ---------------------------------------------------------------- webhook

export async function handleWebhook(rawBody: string, headers: Headers) {
  const provider = paymentProvider();
  const evt = await provider.parseWebhook(rawBody, headers); // throws on bad signature
  if (!evt) return { ok: true, note: "ignored" };
  try {
    await db.webhookEvent.create({ data: { id: evt.eventId, provider: provider.name, type: evt.type, payload: rawBody } });
  } catch {
    return { ok: true, note: "duplicate event ignored" }; // unique event id → replay protection
  }
  const result = await applyOutcome(evt);
  await db.webhookEvent.update({ where: { id: evt.eventId }, data: { result: JSON.stringify(result) } });
  return result;
}

async function applyOutcome(evt: WebhookOutcome): Promise<Record<string, unknown>> {
  if (evt.account) {
    const acct = await db.paymentAccount.findUnique({ where: { providerAccountId: evt.account.providerAccountId } });
    if (!acct) return { ok: false, reason: "unknown account" };
    await db.paymentAccount.update({
      where: { id: acct.id },
      data: { chargesEnabled: evt.account.chargesEnabled, payoutsEnabled: evt.account.payoutsEnabled, restricted: evt.account.restricted },
    });
    await refreshSellerStatus(acct.sellerId);
    await audit(null, "PAYOUT_ACCOUNT_UPDATED", "PaymentAccount", acct.id, evt.account);
    return { ok: true };
  }
  if (evt.status === "DISPUTED" && evt.providerRef) {
    const p = await db.payment.findUnique({ where: { providerRef: evt.providerRef }, include: { order: { include: { sale: true } } } });
    if (!p) return { ok: false, reason: "unknown payment" };
    await db.payment.update({ where: { id: p.id }, data: { status: "DISPUTED" } });
    if (p.order?.sale) await db.payout.updateMany({ where: { saleId: p.order.sale.id, status: { in: ["SCHEDULED", "HELD"] } }, data: { status: "HELD", holdReason: "Payment disputed" } });
    await audit(null, "PAYMENT_DISPUTED", "Payment", p.id);
    return { ok: true };
  }
  if (!evt.paymentId) return { ok: true, note: "no payment reference" };
  if (evt.status === "SUCCEEDED") return confirmPayment(evt.paymentId, evt.providerRef ?? evt.eventId, evt.method ?? "card");
  if (evt.status === "FAILED") {
    await failPayment(evt.paymentId, evt.failureReason ?? "Payment failed");
    return { ok: true };
  }
  return { ok: true };
}

async function failPayment(paymentId: string, reason: string) {
  await db.$transaction(async (tx) => {
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (p.status !== "PENDING" && p.status !== "PROCESSING") return;
    await tx.payment.update({ where: { id: p.id }, data: { status: "FAILED", failureReason: reason } });
    if (p.orderId) await tx.order.update({ where: { id: p.orderId }, data: { status: "CANCELLED" } });
    if (p.ticketPurchaseId) await tx.ticketPurchase.update({ where: { id: p.ticketPurchaseId }, data: { status: "FAILED" } });
  });
}

/** Abandoned checkouts expire so they never hold stock or tickets. */
export async function expirePendingPayments() {
  const stale = await db.payment.findMany({ where: { status: "PENDING", expiresAt: { lt: new Date() } }, select: { id: true } });
  for (const p of stale) await failPayment(p.id, "Checkout expired").catch(() => {});
  await db.payment.updateMany({ where: { id: { in: stale.map((s) => s.id) }, status: "FAILED", failureReason: "Checkout expired" }, data: { status: "CANCELLED" } });
  return stale.length;
}

type ConfirmResult = { ok: boolean; reason?: string; ticketNumbers?: string[] };

async function confirmPayment(paymentId: string, providerRef: string, method: string): Promise<ConfirmResult> {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (payment.status === "SUCCEEDED") return { ok: true };
  if (!["PENDING", "PROCESSING", "CANCELLED", "FAILED"].includes(payment.status)) return { ok: false, reason: `payment is ${payment.status}` };
  // money arrived for an expired/failed checkout → refund it rather than fulfil
  if (payment.status !== "PENDING" && payment.status !== "PROCESSING") {
    await autoRefund(paymentId, providerRef, "Payment received after checkout expired");
    return { ok: false, reason: "late payment refunded" };
  }
  return payment.ledger === "PRODUCT" ? fulfilProduct(paymentId, providerRef, method) : fulfilTickets(paymentId, providerRef, method);
}

async function fulfilProduct(paymentId: string, providerRef: string, method: string): Promise<ConfirmResult> {
  try {
    const order = await db.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: { in: ["PENDING", "PROCESSING"] } },
        data: { status: "SUCCEEDED", providerRef, method, paidAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("ALREADY");
      const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const order = await tx.order.findUniqueOrThrow({ where: { id: p.orderId! }, include: { items: true } });
      for (const item of order.items) {
        const dec = await tx.listing.updateMany({
          where: { id: item.listingId, status: "ACTIVE", quantity: { gte: item.quantity } },
          data: { quantity: { decrement: item.quantity } },
        });
        if (dec.count !== 1) throw new AllocationError(`"${item.title}" is no longer available.`);
        await tx.listing.updateMany({ where: { id: item.listingId, quantity: 0 }, data: { status: "SOLD" } });
      }
      if (order.offerId) {
        await tx.offer.update({ where: { id: order.offerId }, data: { usedCount: { increment: 1 } } });
        await tx.offerUsage.create({ data: { offerId: order.offerId, buyerId: order.buyerId, orderId: order.id, discount: order.discount } });
      }
      await tx.order.update({ where: { id: order.id }, data: { status: "PAID" } });
      return order;
    });
    await notify(order.buyerId, {
      type: "PAYMENT_CONFIRMED",
      title: `Payment confirmed — order ${order.orderNumber}`,
      body: `We received ${money(order.total)}. The seller has been notified.`,
      link: `/account/orders/${order.id}`,
    });
    await notify(order.sellerId, {
      type: "NEW_ORDER",
      title: `New order ${order.orderNumber}`,
      body: `${order.items.map((i) => `${i.quantity} × ${i.title}`).join(", ")} — ${money(order.total)}`,
      link: `/seller/orders`,
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY") return { ok: true };
    if (e instanceof AllocationError) {
      await autoRefund(paymentId, providerRef, e.message);
      return { ok: false, reason: e.message };
    }
    throw e;
  }
}

async function fulfilTickets(paymentId: string, providerRef: string, method: string): Promise<ConfirmResult> {
  try {
    const { numbers, purchase, soldOut } = await db.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({
        where: { id: paymentId, status: { in: ["PENDING", "PROCESSING"] } },
        data: { status: "SUCCEEDED", providerRef, method, paidAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("ALREADY");
      const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const purchase = await tx.ticketPurchase.findUniqueOrThrow({ where: { id: p.ticketPurchaseId! }, include: { campaign: true } });
      if (purchase.status !== "PENDING") throw new AllocationError("This checkout has expired.");
      const { numbers, soldOut } = await allocateTickets(tx, purchase.campaignId, purchase.buyerId, purchase.id, purchase.quantity);
      await tx.ticketPurchase.update({ where: { id: purchase.id }, data: { status: "PAID" } });
      return { numbers, purchase, soldOut };
    });
    const c = purchase.campaign;
    await notify(purchase.buyerId, {
      type: "TICKET_PURCHASED",
      title: `Ticket purchase confirmed — ${c.title}`,
      body: `Payment of ${money(purchase.amount)} received.\nYour ticket number${numbers.length > 1 ? "s" : ""}: ${numbers.join(", ")}.\nDraw: ${c.drawAt.toISOString()} (${c.timezone}).`,
      link: "/account/tickets",
    });
    if (soldOut) await onSoldOut(c.id);
    return { ok: true, ticketNumbers: numbers };
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY") return { ok: true };
    if (e instanceof AllocationError) {
      await autoRefund(paymentId, providerRef, e.message);
      return { ok: false, reason: e.message };
    }
    throw e;
  }
}

/** Money was taken but the order/tickets couldn't be fulfilled: refund in full automatically. */
async function autoRefund(paymentId: string, providerRef: string, reason: string) {
  await paymentProvider().refund(providerRef, (await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).amount).catch((e) => console.error("refund failed", e));
  await db.$transaction(async (tx) => {
    const p = await tx.payment.update({ where: { id: paymentId }, data: { status: "REFUNDED", providerRef, paidAt: new Date() } });
    await tx.refund.create({ data: { paymentId, amount: p.amount, reason: `Auto-refund: ${reason}`, status: "PROCESSED", requestedById: p.userId, processedAt: new Date() } });
    if (p.ticketPurchaseId) await tx.ticketPurchase.update({ where: { id: p.ticketPurchaseId }, data: { status: "FAILED" } });
    if (p.orderId) await tx.order.update({ where: { id: p.orderId }, data: { status: "REFUNDED" } });
    await audit(null, "PAYMENT_AUTO_REFUNDED", "Payment", paymentId, null, tx, reason);
  });
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  await notify(p.userId, { type: "REFUND_UPDATE", title: "Payment refunded", body: `${reason} Your payment of ${money(p.amount)} has been refunded.`, link: "/account/payments" });
}

// ---------------------------------------------------------------- order lifecycle

export async function markOrderFulfilled(orderId: string, sellerId: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (o.sellerId !== sellerId) throw new Error("Not your order.");
  if (o.status !== "PAID") throw new Error("Only paid orders can be marked as shipped.");
  await db.order.update({ where: { id: orderId }, data: { status: "FULFILLED", fulfilledAt: new Date() } });
  await notify(o.buyerId, { type: "ORDER_FULFILLED", title: `Order ${o.orderNumber} shipped / ready`, body: "Please confirm receipt once you have your item.", link: `/account/orders/${o.id}` });
}

/** Buyer confirms receipt → order COMPLETED → Sale → commission (approval engine decides). */
export async function completeOrder(orderId: string, actor: { id: string; role: string }) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (actor.role !== "ADMIN" && o.buyerId !== actor.id) throw new Error("Not your order.");
  if (!["PAID", "FULFILLED"].includes(o.status)) throw new Error("Order cannot be completed.");
  const disputed = await db.payment.findFirst({ where: { orderId, status: { in: ["DISPUTED", "REFUND_REQUESTED"] } } });
  if (disputed) throw new Error("Order has an open dispute or refund request.");
  await db.order.update({ where: { id: orderId }, data: { status: "COMPLETED", completedAt: new Date() } });
  await audit(actor.id, "ORDER_COMPLETED", "Order", orderId);
  await createSaleFromOrder(orderId, actor.id);
}

export async function requestRefund(userId: string, paymentId: string, reason: string) {
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { ticketPurchase: { include: { campaign: true } } } });
  if (p.userId !== userId) throw new Error("Not your payment.");
  if (p.status !== "SUCCEEDED") throw new Error("Only successful payments can be refunded.");
  if (!reason) throw new Error("Please give a reason.");
  if (p.ticketPurchase?.campaign.lockedAt) throw new Error("Tickets are locked into the draw and can no longer be refunded.");
  await db.$transaction([
    db.refund.create({ data: { paymentId, amount: p.amount, reason, requestedById: userId } }),
    db.payment.update({ where: { id: paymentId }, data: { status: "REFUND_REQUESTED" } }),
  ]);
  await audit(userId, "REFUND_REQUESTED", "Payment", paymentId, null, db, reason);
}

export async function processRefund(refundId: string, adminId: string, approve: boolean, note: string | null) {
  const refund = await db.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: { include: { ticketPurchase: { include: { campaign: true } } } } } });
  if (refund.status !== "REQUESTED") throw new Error("Refund already processed.");
  if (!approve) {
    if (!note) throw new Error("A reason is required.");
    await db.$transaction([
      db.refund.update({ where: { id: refundId }, data: { status: "REJECTED", processedById: adminId, processedAt: new Date(), adminNote: note } }),
      db.payment.update({ where: { id: refund.paymentId }, data: { status: "SUCCEEDED" } }),
    ]);
    await audit(adminId, "REFUND_REJECTED", "Refund", refundId, null, db, note);
    await notify(refund.requestedById, { type: "REFUND_UPDATE", title: "Refund request declined", body: note, link: "/account/payments" });
    return;
  }
  const tp = refund.payment.ticketPurchase;
  if (tp?.campaign.lockedAt) throw new Error("Tickets are locked into the draw; refunds only via campaign cancellation.");
  if (refund.payment.providerRef) await paymentProvider().refund(refund.payment.providerRef, refund.amount);
  await db.$transaction(async (tx) => {
    await tx.refund.update({ where: { id: refundId }, data: { status: "PROCESSED", processedById: adminId, processedAt: new Date(), adminNote: note } });
    const full = refund.amount >= refund.payment.amount;
    await tx.payment.update({ where: { id: refund.paymentId }, data: { status: full ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    if (refund.payment.orderId && full) {
      await tx.order.update({ where: { id: refund.payment.orderId }, data: { status: "REFUNDED" } });
      await reverseForOrder(tx, refund.payment.orderId, `Refund ${refundId}`);
    }
    if (tp) {
      await tx.ticketPurchase.update({ where: { id: tp.id }, data: { status: "REFUNDED" } });
      await tx.ticket.updateMany({ where: { purchaseId: tp.id }, data: { status: "VOID" } });
    }
    await audit(adminId, "REFUND_PROCESSED", "Refund", refundId, { amount: refund.amount }, tx, note);
  });
  await notify(refund.requestedById, { type: "REFUND_UPDATE", title: "Refund processed", body: `${money(refund.amount)} has been refunded to your original payment method.`, link: "/account/payments" });
}

export async function cancelUnpaidOrder(orderId: string, buyerId: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (o.buyerId !== buyerId || o.status !== "PENDING_PAYMENT") throw new Error("Order cannot be cancelled.");
  await db.$transaction([
    db.order.update({ where: { id: orderId }, data: { status: "CANCELLED" } }),
    db.payment.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "CANCELLED" } }),
  ]);
}
