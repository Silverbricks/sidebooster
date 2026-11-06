import "server-only";
import crypto from "node:crypto";
import { db, type Tx } from "./db";
import { audit } from "./audit";
import { notify } from "./notify";
import { getBool, getNumber } from "./settings";
import { money } from "./format";

/**
 * Commission engine — "No approved transaction = No commission".
 * Sale (APPROVED) → CommissionRecord (PENDING_APPROVAL) → admin approves → GENERATED
 *   → ONLINE: deducted before the seller payout (Payout row)
 *   → OFFLINE: CommissionInvoice issued to the seller → admin marks PAID
 * Refunds/cancellations reverse it.
 */

function code(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

export function pct(bps: number) {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

/** Seller-specific rule beats category rule beats parent-category rule beats platform default. */
export async function resolveRate(tx: Tx, categoryId: string, sellerId: string, at = new Date()) {
  const active = { effectiveFrom: { lte: at }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] };
  const sellerRule = await tx.commissionRule.findFirst({ where: { sellerId, ...active }, orderBy: { effectiveFrom: "desc" } });
  if (sellerRule) return { rateBps: sellerRule.rateBps, ruleId: sellerRule.id };
  const cat = await tx.category.findUnique({ where: { id: categoryId } });
  for (const cid of [categoryId, cat?.parentId].filter(Boolean) as string[]) {
    const r = await tx.commissionRule.findFirst({ where: { categoryId: cid, sellerId: null, ...active }, orderBy: { effectiveFrom: "desc" } });
    if (r) return { rateBps: r.rateBps, ruleId: r.id };
  }
  return { rateBps: await getNumber("default_commission_bps"), ruleId: null };
}

export const commissionOf = (amount: number, bps: number) => Math.round((amount * bps) / 10_000);

/** Online order completed (buyer confirmed receipt or admin completed it) → Sale. */
export async function createSaleFromOrder(orderId: string, actorId: string | null) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, sale: true } });
  if (order.sale) return order.sale;
  if (order.status !== "COMPLETED") throw new Error("Order is not completed.");
  const auto = await getBool("rule_online_sale_auto_approve");
  const sale = await db.$transaction(async (tx) => {
    const sale = await tx.sale.create({
      data: {
        saleNumber: code("SALE"),
        source: "ONLINE",
        orderId: order.id,
        listingId: order.items[0].listingId,
        buyerId: order.buyerId,
        sellerId: order.sellerId,
        salePrice: order.total - order.deliveryFee,
        status: auto ? "APPROVED" : "UNDER_REVIEW",
        buyerConfirmedAt: new Date(),
        adminApprovedAt: auto ? new Date() : null,
      },
    });
    await audit(actorId, auto ? "SALE_AUTO_APPROVED" : "SALE_SUBMITTED", "Sale", sale.id, { orderId }, tx);
    if (auto) await createCommission(tx, sale.id, null, true);
    return sale;
  });
  return sale;
}

/** Seller reports a sale settled outside the platform (cars, property, negotiated deals). */
export async function reportOfflineSale(sellerId: string, listingId: string, buyerPublicId: string, salePrice: number, note: string | null) {
  const listing = await db.listing.findUniqueOrThrow({ where: { id: listingId } });
  if (listing.sellerId !== sellerId) throw new Error("Not your listing.");
  if (!["ACTIVE", "PAUSED", "SOLD"].includes(listing.status)) throw new Error("Only published listings can be reported as sold.");
  const buyer = await db.user.findUnique({ where: { publicId: buyerPublicId.trim().toUpperCase() } });
  if (!buyer || buyer.role === "ADMIN") throw new Error("No buyer found with that Buyer ID.");
  if (buyer.id === sellerId) throw new Error("Buyer and seller must be different accounts.");
  if (!Number.isInteger(salePrice) || salePrice <= 0) throw new Error("Enter the final sale price.");
  const existing = await db.sale.findFirst({ where: { listingId, status: { notIn: ["REJECTED", "REVERSED"] } } });
  if (existing && listing.quantity <= 1) throw new Error(`A sale (${existing.saleNumber}) is already recorded for this listing.`);

  const needBuyer = await getBool("rule_offline_sale_require_buyer_confirm");
  const sale = await db.$transaction(async (tx) => {
    const sale = await tx.sale.create({
      data: {
        saleNumber: code("SALE"),
        source: "OFFLINE",
        listingId,
        buyerId: buyer.id,
        sellerId,
        salePrice,
        sellerNote: note,
        status: needBuyer ? "REPORTED" : "BUYER_CONFIRMED",
      },
    });
    await tx.listing.update({ where: { id: listingId }, data: { status: "SOLD" } });
    await audit(sellerId, "SALE_REPORTED", "Sale", sale.id, { salePrice, buyerPublicId }, tx);
    return sale;
  });
  if (needBuyer)
    await notify(buyer.id, {
      type: "SALE_CONFIRMATION_REQUEST",
      title: `Please confirm your purchase: ${listing.title}`,
      body: `The seller reported that you bought "${listing.title}" for ${money(salePrice)}. Please confirm or dispute this.`,
      link: "/account/sales",
    });
  else await afterBuyerConfirmed(sale.id);
  return sale;
}

export async function buyerRespondToSale(saleId: string, buyerId: string, confirm: boolean) {
  const sale = await db.sale.findUniqueOrThrow({ where: { id: saleId } });
  if (sale.buyerId !== buyerId) throw new Error("Not your purchase.");
  if (sale.status !== "REPORTED") throw new Error("This sale is no longer awaiting your confirmation.");
  if (!confirm) {
    await db.sale.update({ where: { id: saleId }, data: { status: "UNDER_REVIEW", buyerDisputed: true } });
    await audit(buyerId, "SALE_DISPUTED_BY_BUYER", "Sale", saleId);
    return;
  }
  await db.sale.update({ where: { id: saleId }, data: { status: "BUYER_CONFIRMED", buyerConfirmedAt: new Date() } });
  await audit(buyerId, "SALE_CONFIRMED_BY_BUYER", "Sale", saleId);
  await afterBuyerConfirmed(saleId);
}

async function afterBuyerConfirmed(saleId: string) {
  if (await getBool("rule_offline_sale_require_admin")) {
    await db.sale.update({ where: { id: saleId }, data: { status: "UNDER_REVIEW" } });
    return;
  }
  await db.$transaction(async (tx) => {
    await tx.sale.update({ where: { id: saleId }, data: { status: "APPROVED", adminApprovedAt: new Date() } });
    await createCommission(tx, saleId, null, false);
  });
}

export async function adminDecideSale(saleId: string, adminId: string, decision: "APPROVE" | "REJECT" | "MORE_INFO", note: string | null) {
  const sale = await db.sale.findUniqueOrThrow({ where: { id: saleId }, include: { listing: true } });
  if (!["REPORTED", "BUYER_CONFIRMED", "UNDER_REVIEW", "MORE_INFO"].includes(sale.status)) throw new Error("Sale already decided.");
  if (decision !== "APPROVE" && !note) throw new Error("A reason is required.");
  await db.$transaction(async (tx) => {
    const status = decision === "APPROVE" ? "APPROVED" : decision === "REJECT" ? "REJECTED" : "MORE_INFO";
    await tx.sale.update({
      where: { id: saleId },
      data: { status, adminNote: note, approvedById: decision === "APPROVE" ? adminId : null, adminApprovedAt: decision === "APPROVE" ? new Date() : null },
    });
    await audit(adminId, `SALE_${status}`, "Sale", saleId, null, tx, note);
    if (decision === "APPROVE") await createCommission(tx, saleId, adminId, false);
    if (decision === "REJECT" && sale.source === "OFFLINE") await tx.listing.update({ where: { id: sale.listingId }, data: { status: "ACTIVE" } });
  });
  await notify(sale.sellerId, {
    type: "SALE_REVIEWED",
    title: `Sale ${sale.saleNumber}: ${decision === "APPROVE" ? "approved" : decision === "REJECT" ? "rejected" : "more information required"}`,
    body: note ?? `Your reported sale of "${sale.listing.title}" was approved.`,
    link: "/seller/sales",
  });
}

/** Only ever called for an APPROVED sale. `autoApprove` = online sales under the auto rule. */
async function createCommission(tx: Tx, saleId: string, actorId: string | null, autoApprove: boolean) {
  const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: { listing: true, commission: true } });
  if (sale.status !== "APPROVED") throw new Error("Commission can only be created for an approved sale.");
  if (sale.commission) return sale.commission;
  const { rateBps, ruleId } = await resolveRate(tx, sale.listing.categoryId, sale.sellerId, sale.createdAt);
  const rec = await tx.commissionRecord.create({
    data: {
      saleId,
      sellerId: sale.sellerId,
      buyerId: sale.buyerId,
      ruleId,
      rateBps,
      baseAmount: sale.salePrice,
      amount: commissionOf(sale.salePrice, rateBps),
      settlement: sale.source === "ONLINE" ? "DEDUCTED" : "INVOICE",
      status: "PENDING_APPROVAL",
    },
  });
  await audit(actorId, "COMMISSION_CALCULATED", "Commission", rec.id, { rateBps, amount: rec.amount }, tx);
  if (autoApprove) await generateCommission(tx, rec.id, null);
  return rec;
}

/** PENDING_APPROVAL → GENERATED, then invoice (offline) or scheduled payout (online). */
async function generateCommission(tx: Tx, commissionId: string, actorId: string | null) {
  const rec = await tx.commissionRecord.update({
    where: { id: commissionId },
    data: { status: "GENERATED", approvedById: actorId, approvedAt: new Date() },
    include: { sale: true },
  });
  await audit(actorId, "COMMISSION_GENERATED", "Commission", rec.id, { amount: rec.amount }, tx);
  if (rec.settlement === "INVOICE") {
    if (rec.amount === 0) return;
    const days = await getNumber("commission_invoice_due_days");
    const inv = await tx.commissionInvoice.create({
      data: { invoiceNumber: code("INV"), sellerId: rec.sellerId, commissionId: rec.id, amount: rec.amount, dueDate: new Date(Date.now() + days * 86400_000) },
    });
    await tx.commissionRecord.update({ where: { id: rec.id }, data: { status: "INVOICED" } });
    await notify(rec.sellerId, { type: "COMMISSION_INVOICE", title: `Commission invoice ${inv.invoiceNumber}`, body: `${money(inv.amount)} due by ${inv.dueDate.toDateString()}.`, link: "/seller/commissions" }, tx);
  } else {
    await schedulePayout(tx, rec.saleId, rec.amount);
  }
}

async function schedulePayout(tx: Tx, saleId: string, commission: number) {
  const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } });
  const seller = await tx.sellerProfile.findUnique({ where: { userId: sale.sellerId }, include: { paymentAccount: true } });
  const acct = seller?.paymentAccount;
  const holdReason = !acct
    ? "Seller has no payout account"
    : acct.restricted
      ? "Payout account restricted"
      : !acct.payoutsEnabled
        ? "Payouts not enabled by provider"
        : acct.payoutsHeld
          ? "Payouts held by admin"
          : null;
  await tx.payout.create({
    data: { sellerId: sale.sellerId, saleId, gross: sale.salePrice, commission, amount: sale.salePrice - commission, status: holdReason ? "HELD" : "SCHEDULED", holdReason },
  });
}

export async function approveCommission(commissionId: string, adminId: string) {
  await db.$transaction(async (tx) => {
    const rec = await tx.commissionRecord.findUniqueOrThrow({ where: { id: commissionId } });
    if (rec.status !== "PENDING_APPROVAL") throw new Error("Commission is not awaiting approval.");
    await generateCommission(tx, commissionId, adminId);
  });
}

export async function adjustCommission(commissionId: string, adminId: string, newRateBps: number, reason: string) {
  if (!reason) throw new Error("A reason is required to adjust commission.");
  if (!Number.isInteger(newRateBps) || newRateBps < 0 || newRateBps > 5000) throw new Error("Invalid rate.");
  await db.$transaction(async (tx) => {
    const rec = await tx.commissionRecord.findUniqueOrThrow({ where: { id: commissionId }, include: { invoice: true } });
    if (!["PENDING_APPROVAL", "GENERATED", "INVOICED", "OVERDUE"].includes(rec.status)) throw new Error("This commission can no longer be adjusted.");
    const amount = commissionOf(rec.baseAmount, newRateBps);
    await tx.commissionRecord.update({ where: { id: rec.id }, data: { rateBps: newRateBps, amount, adjustReason: reason } });
    if (rec.invoice && rec.invoice.status !== "PAID") await tx.commissionInvoice.update({ where: { id: rec.invoice.id }, data: { amount } });
    const payout = await tx.payout.findUnique({ where: { saleId: rec.saleId } });
    if (payout && payout.status !== "PAID") await tx.payout.update({ where: { id: payout.id }, data: { commission: amount, amount: payout.gross - amount } });
    await audit(adminId, "COMMISSION_ADJUSTED", "Commission", rec.id, { from: { rateBps: rec.rateBps, amount: rec.amount }, to: { rateBps: newRateBps, amount } }, tx, reason);
  });
}

export async function waiveCommission(commissionId: string, adminId: string, reason: string) {
  if (!reason) throw new Error("A reason is required to waive commission.");
  await endCommission(commissionId, adminId, "WAIVED", reason);
}

export async function reverseCommission(commissionId: string, adminId: string | null, reason: string) {
  await endCommission(commissionId, adminId, "REVERSED", reason);
}

async function endCommission(commissionId: string, actorId: string | null, status: "WAIVED" | "REVERSED", reason: string, txIn?: Tx) {
  const run = async (tx: Tx) => {
    const rec = await tx.commissionRecord.findUniqueOrThrow({ where: { id: commissionId }, include: { invoice: true } });
    if (["WAIVED", "REVERSED", "REJECTED"].includes(rec.status)) return;
    if (status === "WAIVED" && rec.status === "PAID") throw new Error("Paid commission cannot be waived — reverse it instead.");
    await tx.commissionRecord.update({ where: { id: rec.id }, data: { status, adjustReason: reason } });
    if (rec.invoice && rec.invoice.status !== "PAID") await tx.commissionInvoice.update({ where: { id: rec.invoice.id }, data: { status: "VOID" } });
    const payout = await tx.payout.findUnique({ where: { saleId: rec.saleId } });
    if (status === "WAIVED" && payout && payout.status !== "PAID") await tx.payout.update({ where: { id: payout.id }, data: { commission: 0, amount: payout.gross } });
    await audit(actorId, `COMMISSION_${status}`, "Commission", rec.id, { amount: rec.amount }, tx, reason);
  };
  return txIn ? run(txIn) : db.$transaction(run);
}

/** Refund / cancellation of an online order: reverse sale, commission and unpaid payout. */
export async function reverseForOrder(tx: Tx, orderId: string, reason: string) {
  const sale = await tx.sale.findUnique({ where: { orderId }, include: { commission: true, payout: true } });
  if (!sale) return;
  await tx.sale.update({ where: { id: sale.id }, data: { status: "REVERSED", adminNote: reason } });
  if (sale.commission) await endCommission(sale.commission.id, null, "REVERSED", reason, tx);
  if (sale.payout && sale.payout.status !== "PAID") await tx.payout.update({ where: { id: sale.payout.id }, data: { status: "CANCELLED", holdReason: reason } });
}

/** Sellers can never mark their own invoices paid — admin only, with a payment reference. */
export async function markInvoicePaid(invoiceId: string, adminId: string, reference: string) {
  if (!reference) throw new Error("Enter the payment reference.");
  await db.$transaction(async (tx) => {
    const inv = await tx.commissionInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
    if (!["ISSUED", "OVERDUE"].includes(inv.status)) throw new Error("Invoice is not payable.");
    await tx.commissionInvoice.update({ where: { id: inv.id }, data: { status: "PAID", paidAt: new Date(), markedPaidById: adminId, reference } });
    await tx.commissionRecord.update({ where: { id: inv.commissionId }, data: { status: "PAID" } });
    await audit(adminId, "COMMISSION_INVOICE_PAID", "CommissionInvoice", inv.id, { reference, amount: inv.amount }, tx);
  });
}

export async function markOverdueInvoices() {
  const due = await db.commissionInvoice.findMany({ where: { status: "ISSUED", dueDate: { lt: new Date() } } });
  for (const inv of due)
    await db.$transaction([
      db.commissionInvoice.update({ where: { id: inv.id }, data: { status: "OVERDUE" } }),
      db.commissionRecord.update({ where: { id: inv.commissionId }, data: { status: "OVERDUE" } }),
    ]);
  return due.length;
}
