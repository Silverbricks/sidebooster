"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { attempt, back } from "@/lib/action-utils";
import { optStr, str } from "@/lib/format";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { CheckoutError, startProductCheckout, startTicketCheckout, completeOrder, requestRefund, cancelUnpaidOrder } from "@/lib/payments";
import { AllocationError, claimFreeTickets } from "@/lib/campaigns";
import { buyerRespondToSale } from "@/lib/commission";
import { signTestEvent, testPaymentsAllowed } from "@/lib/payment-provider";
import { handleWebhook } from "@/lib/payments";
import { randomToken } from "@/lib/crypto";
import { cookies } from "next/headers";
import { referralFromCookie } from "@/lib/referrals";

export async function enquiryAction(fd: FormData) {
  const listingId = str(fd.get("listingId"));
  const path = `/listing/${listingId}`;
  const user = await requireUser(undefined, path);
  const message = str(fd.get("message"));
  if (message.length < 5) back(path, { error: "Please write a longer message." });
  if (!rateLimit(`enq:${user.id}`, 10, 3600_000)) back(path, { error: "You've sent a lot of enquiries — please try again later." });
  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "ACTIVE" || !listing.allowEnquiry) back(path, { error: "This listing is not accepting enquiries." });
  if (listing!.sellerId === user.id) back(path, { error: "This is your own listing." });
  await db.enquiry.create({ data: { listingId, buyerId: user.id, sellerId: listing!.sellerId, message: message.slice(0, 2000) } });
  await notify(listing!.sellerId, { type: "NEW_ENQUIRY", title: `New enquiry: ${listing!.title}`, body: `${user.firstName} (${user.publicId}) wrote: ${message.slice(0, 300)}`, link: "/seller/enquiries" });
  back(path, { ok: "Enquiry sent — the seller will reply in your dashboard." });
}

export async function toggleWishlistAction(fd: FormData) {
  const listingId = str(fd.get("listingId"));
  const user = await requireUser(undefined, `/listing/${listingId}`);
  const key = { userId_listingId: { userId: user.id, listingId } };
  if (await db.wishlistItem.findUnique({ where: key })) await db.wishlistItem.delete({ where: key });
  else await db.wishlistItem.create({ data: { userId: user.id, listingId } });
  revalidatePath(`/listing/${listingId}`);
  revalidatePath("/account/wishlist");
}

export async function checkoutAction(fd: FormData) {
  const listingId = str(fd.get("listingId"));
  const path = `/checkout/${listingId}`;
  const user = await requireUser(undefined, path);
  if (!rateLimit(`checkout:${user.id}`, 10, 10 * 60_000)) back(path, { error: "Too many checkout attempts. Please wait a few minutes." });
  let url = "";
  try {
    const r = await startProductCheckout(user, {
      listingId,
      quantity: Number(fd.get("quantity")),
      shippingName: str(fd.get("shippingName")) || user.name,
      shippingAddress: str(fd.get("shippingAddress")),
      notes: optStr(fd.get("notes")),
      coupon: optStr(fd.get("coupon")),
      idempotencyKey: str(fd.get("idempotencyKey")) || randomToken(),
    });
    url = r.redirectUrl;
    // first-touch referral attribution (first-party cookie set by ReferralCapture; no personal data)
    const ref = referralFromCookie((await cookies()).get("sb_ref")?.value);
    if (ref) await db.order.updateMany({ where: { payments: { some: { id: r.paymentId } }, referralSource: null }, data: { referralSource: ref.source, referralMedium: ref.medium, referralCampaign: ref.campaign } });
  } catch (e) {
    if (e instanceof CheckoutError) back(path, { error: e.message });
    throw e;
  }
  redirect(url);
}

export async function buyTicketsAction(fd: FormData) {
  const campaignId = str(fd.get("campaignId"));
  const slug = str(fd.get("slug"));
  const path = `/draws/${slug}`;
  const user = await requireUser(undefined, path);
  const quantity = Number(fd.get("quantity"));
  const idempotencyKey = str(fd.get("idempotencyKey")) || randomToken();
  // bot protection: per-user and per-campaign throttles plus a honeypot
  if (str(fd.get("website"))) back(path, { error: "Request blocked." });
  if (!rateLimit(`tickets:${user.id}`, 6, 10 * 60_000)) back(path, { error: "Too many ticket requests. Please wait a few minutes." });
  const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (c.ticketType === "FREE") {
    let numbers: string[] = [];
    try {
      numbers = await claimFreeTickets(campaignId, user, quantity, idempotencyKey);
    } catch (e) {
      if (e instanceof AllocationError) back(path, { error: e.message });
      throw e;
    }
    back(path, { ok: `Ticket${numbers.length > 1 ? "s" : ""} claimed: ${numbers.join(", ")}. A confirmation has been emailed to you.` });
  }
  let url = "";
  try {
    url = (await startTicketCheckout(user, { campaignId, quantity, idempotencyKey })).redirectUrl;
  } catch (e) {
    if (e instanceof CheckoutError) back(path, { error: e.message });
    throw e;
  }
  redirect(url);
}

/**
 * Built-in TEST gateway. Simulates what a real provider does: it signs an event and delivers it
 * to the webhook handler. The buyer's browser never marks a payment as paid directly.
 */
export async function testGatewayAction(fd: FormData) {
  const paymentId = str(fd.get("paymentId"));
  const user = await requireUser();
  if (!testPaymentsAllowed()) back(`/account/payments`, { error: "Test gateway is disabled." });
  const p = await db.payment.findUnique({ where: { id: paymentId } });
  if (!p || p.userId !== user.id) back("/account/payments", { error: "Payment not found." });
  const outcome = str(fd.get("outcome"));
  const body = JSON.stringify({
    eventId: `evt_test_${randomToken(12)}`,
    type: outcome === "decline" ? "payment.failed" : "payment.succeeded",
    paymentId,
    providerRef: outcome === "decline" ? undefined : `test_pi_${randomToken(12)}`,
    status: outcome === "decline" ? "FAILED" : "SUCCEEDED",
    method: str(fd.get("method")) || "card",
    failureReason: outcome === "decline" ? "Card declined (test)" : undefined,
  });
  await handleWebhook(body, new Headers({ "x-test-signature": signTestEvent(body) }));
  redirect(`/pay/${paymentId}/done`);
}

export async function completeOrderAction(fd: FormData) {
  const id = str(fd.get("orderId"));
  const user = await requireUser();
  await attempt(`/account/orders/${id}`, async () => {
    await completeOrder(id, user);
    return "Thanks — order completed.";
  });
}

export async function cancelOrderAction(fd: FormData) {
  const id = str(fd.get("orderId"));
  const user = await requireUser();
  await attempt(`/account/orders/${id}`, async () => {
    await cancelUnpaidOrder(id, user.id);
    return "Order cancelled.";
  });
}

export async function requestRefundAction(fd: FormData) {
  const paymentId = str(fd.get("paymentId"));
  const back_ = str(fd.get("back")) || "/account/payments";
  const user = await requireUser();
  await attempt(back_, async () => {
    await requestRefund(user.id, paymentId, str(fd.get("reason")));
    return "Refund requested. We'll review it shortly.";
  });
}

export async function respondSaleAction(fd: FormData) {
  const user = await requireUser();
  await attempt("/account/sales", async () => {
    const confirm = str(fd.get("decision")) === "confirm";
    await buyerRespondToSale(str(fd.get("saleId")), user.id, confirm);
    return confirm ? "Purchase confirmed." : "Thanks — our team will review this sale.";
  });
}

export async function contactAction(fd: FormData) {
  const name = str(fd.get("name"));
  const email = str(fd.get("email"));
  const message = str(fd.get("message"));
  if (str(fd.get("website"))) back("/contact", { ok: "Thanks!" });
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || message.length < 10) back("/contact", { error: "Please complete all fields." });
  await db.contactMessage.create({ data: { name, email, message: message.slice(0, 5000) } });
  back("/contact", { ok: "Thanks — we'll be in touch." });
}
