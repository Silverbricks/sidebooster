/**
 * End-to-end business-rule tests against a throwaway database.
 * Run: npm run test:flows   (uses prisma/test.db, reseeded each run)
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { db } from "../src/lib/db";
import { claimFreeTickets, lockCampaign, runDraw, verifyResult, publishResult, campaignComplianceProblems, AllocationError, approveSchedule } from "../src/lib/campaigns";
import { verifyDrawAuditChain } from "../src/lib/audit";
import { startProductCheckout, handleWebhook, completeOrder, requestRefund, processRefund } from "../src/lib/payments";
import { signTestEvent } from "../src/lib/payment-provider";
import { reportOfflineSale, buyerRespondToSale, adminDecideSale, approveCommission, markInvoicePaid } from "../src/lib/commission";
import type { CurrentUser } from "../src/lib/auth";

let passed = 0;
async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    console.error(`  ✘ ${name}`);
    throw e;
  }
}
const user = (email: string) => db.user.findUniqueOrThrow({ where: { email }, include: { sellerProfile: { include: { paymentAccount: true } } } }) as Promise<CurrentUser>;
const signed = (body: object) => {
  const raw = JSON.stringify(body);
  return [raw, new Headers({ "x-test-signature": signTestEvent(raw) })] as const;
};
const pay = (paymentId: string, eventId = `evt_${crypto.randomUUID()}`) => handleWebhook(...signed({ eventId, type: "payment.succeeded", paymentId, providerRef: `pi_${crypto.randomUUID()}`, status: "SUCCEEDED", method: "card" }));

async function main() {
  const buyer = await user("buyer@sidebooster.test");
  const buyer2 = await user("buyer2@sidebooster.test");
  const seller = await user("seller@sidebooster.test");
  const admin = await user("admin@sidebooster.test");

  console.log("Tickets & draws");
  const open = await db.campaign.findUniqueOrThrow({ where: { slug: "win-a-dell-xps-15" } });

  await test("free tickets get sequential unique numbers", async () => {
    const nums = await claimFreeTickets(open.id, buyer2, 2, "k1");
    assert.deepEqual(nums, ["00006", "00007"]);
  });
  await test("same idempotency key does not allocate twice", async () => {
    const nums = await claimFreeTickets(open.id, buyer2, 2, "k1");
    assert.deepEqual(nums, ["00006", "00007"]);
    assert.equal(await db.ticket.count({ where: { campaignId: open.id } }), 7);
  });
  await test("per-buyer maximum is enforced", async () => {
    await assert.rejects(claimFreeTickets(open.id, buyer2, 2, "k2"), AllocationError); // holds 4, max 5
  });
  await test("unverified buyers cannot enter", async () => {
    await assert.rejects(claimFreeTickets(open.id, { ...buyer, accountStatus: "MOBILE_PENDING" }, 1, "k3"), /verified/);
  });
  await test("concurrent claims never over-allocate or duplicate numbers", async () => {
    await db.campaign.update({ where: { id: open.id }, data: { totalTickets: 10 } }); // 3 left
    const people = await Promise.all(Array.from({ length: 6 }, async (_, i) => {
      const publicId = `BUY-9${String(i).padStart(5, "0")}`;
      return db.user.create({ data: { publicId, email: `p${i}@t.test`, passwordHash: "x", firstName: "P", lastName: `${i}`, name: `P ${i}`, accountStatus: "ACTIVE", state: "QLD", dateOfBirth: new Date("1990-01-01") } });
    }));
    const results = await Promise.allSettled(people.map((p, i) => claimFreeTickets(open.id, p, 1, `c${i}`)));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
    const tickets = await db.ticket.findMany({ where: { campaignId: open.id } });
    assert.equal(tickets.length, 10);
    assert.equal(new Set(tickets.map((t) => t.number)).size, 10);
  });

  const due = await db.campaign.findUniqueOrThrow({ where: { slug: "win-a-weekend-getaway" } });
  await test("lock freezes the eligible register and publishes a seed commitment", async () => {
    const c = await lockCampaign(due.id, admin.id);
    assert.equal(c.status, "SALES_CLOSED");
    assert.equal(c.eligibleCount, 6);
    assert.match(c.seedCommitment!, /^[a-f0-9]{64}$/);
  });
  await test("tickets can't be claimed after lock", async () => {
    await assert.rejects(claimFreeTickets(due.id, buyer2, 1, "late"), AllocationError);
  });
  let winning = "";
  await test("draw runs once, result verifies", async () => {
    const r = await runDraw(due.id, admin.id);
    winning = r.winningNumber;
    await assert.rejects(runDraw(due.id, admin.id));
    const v = await verifyResult(due.id);
    assert.ok(v?.ok, JSON.stringify(v?.checks));
  });
  await test("published result is immutable", async () => {
    await publishResult(due.id, admin.id, null);
    await assert.rejects(publishResult(due.id, admin.id, null), /already published/);
    const c = await db.campaign.findUniqueOrThrow({ where: { id: due.id } });
    assert.equal(c.status, "WINNER_ANNOUNCED");
    assert.ok(winning);
  });
  await test("tampering with the audit log or result is detected", async () => {
    const entry = await db.drawAuditLog.findFirstOrThrow({ where: { campaignId: due.id, action: "DRAW_RUN" } });
    await db.drawAuditLog.update({ where: { id: entry.id }, data: { details: entry.details.replace(winning, "99999") } });
    assert.equal((await verifyDrawAuditChain(due.id)).ok, false);
    await db.drawAuditLog.update({ where: { id: entry.id }, data: { details: entry.details } });
    assert.equal((await verifyDrawAuditChain(due.id)).ok, true);
    await db.drawResult.update({ where: { campaignId: due.id }, data: { winningNumber: "TAMPERED" } });
    assert.equal((await verifyResult(due.id))?.checks.resultHashIntact, false);
  });
  await test("extension request updates the date only after admin approval", async () => {
    const before = (await db.campaign.findUniqueOrThrow({ where: { id: open.id } })).drawAt;
    const s = await db.drawSchedule.create({ data: { campaignId: open.id, kind: "EXTENSION", drawAt: new Date(before.getTime() + 30 * 86400_000), salesCloseAt: new Date(before.getTime() + 29 * 86400_000), timezone: open.timezone, reason: "Not enough entries", proposedById: seller.id } });
    assert.equal((await db.campaign.findUniqueOrThrow({ where: { id: open.id } })).drawAt.getTime(), before.getTime());
    await approveSchedule(s.id, admin.id, "Permitted");
    assert.equal((await db.campaign.findUniqueOrThrow({ where: { id: open.id } })).drawAt.getTime(), s.drawAt.getTime());
  });
  await test("paid entry is blocked in VIC/NSW and while paid draws are disabled", async () => {
    const base = { ticketType: "PAID", ticketPrice: 1000, drawMode: "FIXED", salesOpenAt: new Date(), salesCloseAt: new Date(Date.now() + 1e6), drawAt: new Date(Date.now() + 2e6), totalTickets: 100, maxPerBuyer: 5, minAge: 18 };
    const p = await campaignComplianceProblems({ ...base, allowedStates: "QLD,VIC" });
    assert.ok(p.some((x) => x.includes("disabled")));
    assert.ok(p.some((x) => x.includes("VIC")));
  });

  console.log("Payments, sales & commission");
  const s24 = await db.listing.findFirstOrThrow({ where: { title: { contains: "Galaxy S24" } } });
  let orderId = "";
  let paymentId = "";
  await test("checkout applies the best offer (buy 2+ → 10% off)", async () => {
    const r = await startProductCheckout(buyer, { listingId: s24.id, quantity: 2, shippingName: "Bob", shippingAddress: "1 St", notes: null, coupon: null, idempotencyKey: "ord1" });
    paymentId = r.paymentId;
    const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: true } });
    orderId = p.orderId!;
    assert.equal(p.order!.discount, 21980);
    assert.equal(p.amount, 219800 - 21980 + 1000);
    assert.equal(p.status, "PENDING");
  });
  await test("double-submitted checkout is idempotent", async () => {
    const r = await startProductCheckout(buyer, { listingId: s24.id, quantity: 2, shippingName: "Bob", shippingAddress: "1 St", notes: null, coupon: null, idempotencyKey: "ord1" });
    assert.equal(r.paymentId, paymentId);
  });
  await test("webhook with a bad signature is rejected", async () => {
    await assert.rejects(handleWebhook(JSON.stringify({ eventId: "x", paymentId, status: "SUCCEEDED" }), new Headers({ "x-test-signature": "bad" })), /signature/);
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).status, "PENDING");
  });
  await test("only a verified webhook confirms payment; replay is ignored", async () => {
    await pay(paymentId, "evt_same");
    const r = await pay(paymentId, "evt_same");
    assert.equal(r.note, "duplicate event ignored");
    const o = await db.order.findUniqueOrThrow({ where: { id: orderId } });
    assert.equal(o.status, "PAID");
    assert.equal((await db.listing.findUniqueOrThrow({ where: { id: s24.id } })).quantity, 3);
  });
  await test("no commission before the sale is completed", async () => {
    assert.equal(await db.commissionRecord.count(), 0);
  });
  await test("completed online order → approved sale → 5% commission deducted from payout", async () => {
    await completeOrder(orderId, buyer);
    const sale = await db.sale.findUniqueOrThrow({ where: { orderId }, include: { commission: true, payout: true } });
    assert.equal(sale.status, "APPROVED");
    assert.equal(sale.commission!.rateBps, 500);
    assert.equal(sale.commission!.status, "GENERATED");
    assert.equal(sale.payout!.amount, sale.salePrice - sale.commission!.amount);
    assert.equal(sale.payout!.status, "SCHEDULED");
  });
  await test("refund reverses commission and cancels the unpaid payout", async () => {
    // a second order to refund (the first one is completed)
    const r = await startProductCheckout(buyer, { listingId: s24.id, quantity: 1, shippingName: "Bob", shippingAddress: "1 St", notes: null, coupon: null, idempotencyKey: "ord2" });
    await pay(r.paymentId);
    const p = await db.payment.findUniqueOrThrow({ where: { id: r.paymentId } });
    await completeOrder(p.orderId!, buyer);
    await db.payment.update({ where: { id: p.id }, data: { status: "SUCCEEDED" } });
    await requestRefund(buyer.id, p.id, "Changed my mind");
    const refund = await db.refund.findFirstOrThrow({ where: { paymentId: p.id } });
    await processRefund(refund.id, admin.id, true, "ok");
    const sale = await db.sale.findUniqueOrThrow({ where: { orderId: p.orderId! }, include: { commission: true, payout: true } });
    assert.equal(sale.status, "REVERSED");
    assert.equal(sale.commission!.status, "REVERSED");
    assert.equal(sale.payout!.status, "CANCELLED");
  });
  await test("offline car sale: buyer confirm → admin approve → 1% commission invoice → paid", async () => {
    const rav4 = await db.listing.findFirstOrThrow({ where: { title: { contains: "RAV4" } } });
    const sale = await reportOfflineSale(seller.id, rav4.id, "BUY-000001", 4200000, "Contract 12/11");
    assert.equal(await db.commissionRecord.count({ where: { saleId: sale.id } }), 0);
    await buyerRespondToSale(sale.id, buyer.id, true);
    assert.equal((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).status, "UNDER_REVIEW");
    await adminDecideSale(sale.id, admin.id, "APPROVE", null);
    const rec = await db.commissionRecord.findUniqueOrThrow({ where: { saleId: sale.id } });
    assert.equal(rec.status, "PENDING_APPROVAL");
    assert.equal(rec.amount, 42000);
    await approveCommission(rec.id, admin.id);
    const inv = await db.commissionInvoice.findUniqueOrThrow({ where: { commissionId: rec.id } });
    assert.equal(inv.amount, 42000);
    await markInvoicePaid(inv.id, admin.id, "BANK-REF-1");
    assert.equal((await db.commissionRecord.findUniqueOrThrow({ where: { id: rec.id } })).status, "PAID");
  });
  await test("rejected sale never creates commission", async () => {
    const mt07 = await db.listing.findFirstOrThrow({ where: { title: { contains: "MT-07" } } });
    const sale = await reportOfflineSale(seller.id, mt07.id, "BUY-000002", 850000, null);
    await adminDecideSale(sale.id, admin.id, "REJECT", "Buyer denies purchase");
    assert.equal(await db.commissionRecord.count({ where: { saleId: sale.id } }), 0);
  });

  console.log(`\n${passed} checks passed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
