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
import { abnProblem, acnProblem, businessIdProblems, isValidAbn, isValidAcn, parseAuMobile, parseDob, postcodeMatchesState } from "../src/lib/au-validation";
import { evaluateBusiness } from "../src/lib/abr";
import { addressProblem, evaluateLocation } from "../src/lib/seller-location";
import { approvalProblems, readStoredLocation, refreshLocationStatus } from "../src/lib/seller-verification";
import { encrypt } from "../src/lib/crypto";
import { validateMobile } from "../src/lib/phone";
import { chargeOnActivation, describeFees, feeSchedule } from "../src/lib/fees";
import { socialUrlProblem } from "../src/lib/social";
import { storeSlugProblem } from "../src/lib/urls";
import { isAiSource, referralFromParams } from "../src/lib/referrals";
import { backfillPublicUrls } from "../prisma/backfill-urls";
import { checkCode, consumeLink, decoyId, findByIdentifier, issueCode, issueLink, lockMinutes, maskEmail, MAX_CODE_ATTEMPTS, peekLink, resendCode, usernameProblem } from "../src/lib/auth-codes";
import { redactSecrets } from "../src/lib/notify";
import { approveRecovery, rejectRecovery, setUsername, RecoveryError } from "../src/lib/recovery";

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
    const reasons = results.flatMap((r) => (r.status === "rejected" ? [String((r.reason as Error)?.message ?? r.reason).slice(0, 300)] : []));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 3, `rejections: ${JSON.stringify(reasons)}`);
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

  console.log("Seller registration validation");
  await test("mobile: accepts 04…/+614…/61…/(0) formats, strips punctuation", async () => {
    for (const v of ["0412 345 678", "+61 412 345 678", "+61 (0)412-345-678", "61412345678", "0061412345678", "412345678", "(04) 1234 5678"]) {
      const r = parseAuMobile(v);
      assert.ok(r.ok, v);
      assert.equal(r.ok && r.e164, "+61412345678");
    }
  });
  await test("mobile: rejects landlines, wrong lengths, foreign and special numbers", async () => {
    for (const [v, msg] of [["02 9876 5432", /landline/], ["0412 345 67", /10 digits/], ["0412 345 6789", /10 digits/], ["+64 21 123 4567", /Australian/], ["1300 123 456", /1300/], ["0512345678", /start with 04/], ["04abc", /digits/]] as const) {
      const r = parseAuMobile(v);
      assert.ok(!r.ok, v);
      assert.match(!r.ok ? r.error : "", msg, v);
    }
  });
  await test("mobile: duplicate numbers are blocked by a unique constraint", async () => {
    await assert.rejects(db.user.create({ data: { publicId: "BUY-999901", email: "dup@t.test", passwordHash: "x", firstName: "D", lastName: "U", name: "D U", mobile: buyer.mobile! } }));
  });
  await test("ABN/ACN: digit count + official checksum, not just length", async () => {
    assert.ok(isValidAbn("51 824 753 556"));
    assert.ok(!isValidAbn("51 824 753 557"));
    assert.match(abnProblem("5182475355") ?? "", /exactly 11/);
    assert.match(abnProblem("12345678901") ?? "", /checksum/);
    assert.ok(isValidAcn("004 085 616"));
    assert.match(acnProblem("004085617") ?? "", /checksum/);
    assert.match(acnProblem("00408561") ?? "", /exactly 9/);
  });
  await test("business type rules: ACN only for companies, never forced on sole traders", async () => {
    assert.equal(businessIdProblems("INDIVIDUAL", null, null), null);
    assert.match(businessIdProblems("INDIVIDUAL", null, "004085616") ?? "", /isn't used/);
    assert.match(businessIdProblems("REGISTERED_BUSINESS", null, null) ?? "", /ABN is required/);
    assert.match(businessIdProblems("COMPANY", "53004085616", null) ?? "", /ACN is required/);
    assert.equal(businessIdProblems("COMPANY", "53004085616", "004085616"), null);
    assert.match(businessIdProblems("COMPANY", "51824753556", "004085616") ?? "", /doesn't belong/);
  });
  await test("ABR evaluation flags inactive, mismatched and wrong-type ABNs", async () => {
    const rec = { abn: "53004085616", abnStatus: "Active", abnStatusFrom: "2000-01-01", acn: "004085616", entityName: "ACME TRADING PTY LTD", entityTypeCode: "PRV", entityTypeName: "Australian Private Company", gstRegistered: true, gstFrom: "2000-07-01", state: "NSW", postcode: "2000", businessNames: [] };
    const run = (r: Partial<typeof rec>, structure: "COMPANY" | "INDIVIDUAL" = "COMPANY", legalName = "Acme Trading Pty Ltd") =>
      evaluateBusiness({ structure, legalName, abn: "53004085616", acn: structure === "COMPANY" ? "004085616" : null, abnLookup: { found: true, record: { ...rec, ...r } }, acnLookup: null }).status;
    assert.equal(run({}), "VERIFIED");
    assert.equal(run({ abnStatus: "Cancelled" }), "INACTIVE");
    assert.equal(run({}, "COMPANY", "Totally Different Pty Ltd"), "MISMATCH");
    assert.equal(run({ entityTypeCode: "IND", entityTypeName: "Individual/Sole Trader" }), "MISMATCH");
    assert.equal(run({ acn: "010499966" }), "MISMATCH");
    assert.equal(evaluateBusiness({ structure: "COMPANY", legalName: "X", abn: "53004085616", acn: "004085616", abnLookup: null, acnLookup: null }).status, "NOT_CHECKED");
  });
  await test("postcode must match the state (with real cross-border exceptions)", async () => {
    assert.ok(postcodeMatchesState("2000", "NSW"));
    assert.ok(postcodeMatchesState("2600", "ACT"));
    assert.ok(postcodeMatchesState("0800", "NT"));
    assert.ok(postcodeMatchesState("3644", "NSW")); // Barooga
    assert.ok(!postcodeMatchesState("3000", "NSW"));
    assert.ok(!postcodeMatchesState("2000", "VIC"));
    assert.match(addressProblem({ country: "AU", street: "1 George St", unit: null, suburb: "Sydney", state: "QLD", postcode: "2000" }) ?? "", /isn't in QLD/);
    assert.match(addressProblem({ country: "AU", street: "PO Box 12", unit: null, suburb: "Sydney", state: "NSW", postcode: "2000" }) ?? "", /PO Box|street number/);
  });
  await test("date of birth: DD/MM/YYYY, real dates, no future, 18+", async () => {
    const now = new Date(Date.UTC(2026, 10, 11));
    assert.ok(parseDob("15/04/1990", 18, now).ok);
    assert.match((parseDob("31/02/1990", 18, now) as { error: string }).error, /real calendar/);
    assert.match((parseDob("01/01/2030", 18, now) as { error: string }).error, /future/);
    assert.match((parseDob("12/11/2008", 18, now) as { error: string }).error, /18 or older/);
    assert.ok(parseDob("11/11/2008", 18, now).ok); // 18th birthday today
    assert.match((parseDob("1990-04-15x", 18, now) as { error: string }).error, /DD\/MM\/YYYY/);
  });
  await test("location: a random pin is never accepted; consistent address still needs proof", async () => {
    const address = { country: "AU", street: "1 George St", unit: null, suburb: "Sydney", state: "NSW", postcode: "2000" };
    const geocoded = { lat: -33.8651, lng: 151.2099, suburb: "Sydney", postcode: "2000", state: "NSW", formatted: "1 George St, Sydney", precision: "street" as const, provider: "osm" };
    const geo = (pin: { lat: number; lng: number }) => ({ pin, geocoded, distanceM: null, checkedAt: "" });
    assert.equal(evaluateLocation({ address, geo: geo({ lat: -33.8652, lng: 151.21 }), pinConfirmed: false, proofOfAddressAccepted: true }).status, "NOT_VERIFIED");
    assert.equal(evaluateLocation({ address, geo: geo({ lat: -37.81, lng: 144.96 }), pinConfirmed: true, proofOfAddressAccepted: true }).status, "MANUAL_REVIEW"); // Melbourne pin
    assert.equal(evaluateLocation({ address, geo: geo({ lat: 51.5, lng: -0.12 }), pinConfirmed: true, proofOfAddressAccepted: true }).status, "FAILED"); // outside AU
    assert.equal(evaluateLocation({ address, geo: geo({ lat: -33.8652, lng: 151.21 }), pinConfirmed: true, proofOfAddressAccepted: false }).status, "PENDING");
    assert.equal(evaluateLocation({ address, geo: geo({ lat: -33.8652, lng: 151.21 }), pinConfirmed: true, proofOfAddressAccepted: true }).status, "VERIFIED");
    assert.equal(evaluateLocation({ address: { ...address, postcode: "2010" }, geo: geo({ lat: -33.8652, lng: 151.21 }), pinConfirmed: true, proofOfAddressAccepted: true }).status, "MANUAL_REVIEW");
  });
  await test("approval is blocked until every mandatory check passes (backend gate)", async () => {
    const u = await db.user.create({ data: { publicId: "BUS-999901", email: "gate@t.test", passwordHash: "x", firstName: "Gina", lastName: "Gate", name: "Gina Gate", mobile: "+61499999901", role: "SELLER", accountStatus: "ACTIVE", emailVerifiedAt: new Date(), dateOfBirth: new Date("1980-01-01") } });
    const sp = await db.sellerProfile.create({ data: { userId: u.id, sellerCode: "BUS-999901", sellerType: "BUSINESS", businessStructure: "COMPANY", legalName: "Acme Trading Pty Ltd", abn: "53004085616", acn: "004085616", authorisedRep: "Gina Gate", address: "Sydney NSW 2000", status: "UNDER_REVIEW" } });
    const load = () => db.sellerProfile.findUniqueOrThrow({ where: { id: sp.id }, include: { documents: true } });
    const fresh = await approvalProblems(u, await load());
    assert.ok(fresh.some((p) => /Mobile OTP/.test(p)), "mobile");
    assert.ok(fresh.some((p) => /ABN \/ ACN/.test(p)), "business");
    assert.ok(fresh.some((p) => /Location/.test(p)), "location");
    assert.ok(fresh.some((p) => /Terms/.test(p)), "terms");
    // complete every step
    await db.user.update({ where: { id: u.id }, data: { mobileVerifiedAt: new Date() } });
    await db.consentRecord.createMany({ data: [{ userId: u.id, type: "TERMS", version: "v1" }, { userId: u.id, type: "PRIVACY", version: "v1" }] });
    const geo = { pin: { lat: -33.8652, lng: 151.21 }, geocoded: { lat: -33.8651, lng: 151.2099, suburb: "Sydney", postcode: "2000", state: "NSW", formatted: "x", precision: "street", provider: "osm" }, distanceM: 10, checkedAt: "" };
    await db.sellerProfile.update({ where: { id: sp.id }, data: { suburb: "Sydney", state: "NSW", postcode: "2000", streetAddressEnc: encrypt(JSON.stringify({ street: "1 George St", unit: null })), geoEnc: encrypt(JSON.stringify(geo)), pinConfirmedAt: new Date(), locationStatus: "PENDING", businessCheckStatus: "VERIFIED", abnConfirmedAt: new Date() } });
    await db.sellerDocument.createMany({ data: [{ sellerId: sp.id, documentType: "PROOF_OF_ADDRESS", fileKey: "k1", fileName: "bill.pdf", status: "ACCEPTED" }, { sellerId: sp.id, documentType: "ID_PASSPORT", fileKey: "k2", fileName: "id.pdf", status: "ACCEPTED" }] });
    assert.equal(await refreshLocationStatus(sp.id), "VERIFIED");
    const u2 = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    assert.deepEqual(await approvalProblems(u2, await load()), []);
    // the stored street address is encrypted, never plain text
    const raw = await db.sellerProfile.findUniqueOrThrow({ where: { id: sp.id } });
    assert.ok(!raw.streetAddressEnc!.includes("George"));
    assert.equal(readStoredLocation(raw).residential?.street, "1 George St");
  });

  console.log("Pricing, storefronts, sharing & SEO");
  await test("phone library confirms mobile type; sole traders need an ABN but never an ACN", async () => {
    assert.ok(validateMobile("0412 345 678").ok);
    assert.ok(!validateMobile("02 9876 5432").ok);
    assert.match(businessIdProblems("SOLE_TRADER", null, null) ?? "", /ABN is required/);
    assert.equal(businessIdProblems("SOLE_TRADER", "51824753556", null), null);
    assert.match(businessIdProblems("SOLE_TRADER", "51824753556", "004085616") ?? "", /isn't used/);
  });
  await test("Pay Per Item: free by default, no subscription; fees only on first publish and relist", async () => {
    const l = await db.listing.findFirstOrThrow({ where: { status: "ACTIVE", sellerId: seller.id } });
    assert.equal((await feeSchedule(l.categoryId, seller.id)).listingFee, 0);
    assert.equal(await chargeOnActivation(db, { ...l, publishedAt: null }, null), null); // free → no invoice
    await db.setting.upsert({ where: { key: "fee_listing_cents" }, create: { key: "fee_listing_cents", value: "250" }, update: { value: "250" } });
    await db.setting.upsert({ where: { key: "fee_relist_cents" }, create: { key: "fee_relist_cents", value: "100" }, update: { value: "100" } });
    await db.category.update({ where: { id: l.categoryId }, data: { listingFee: 500 } }); // category override
    try {
      const first = await chargeOnActivation(db, { ...l, publishedAt: null, expiresAt: null }, null);
      assert.equal(first?.type, "LISTING");
      assert.equal(first?.amount, 500);
      assert.equal(await chargeOnActivation(db, { ...l, publishedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) }, null), null); // re-approval after edit
      const relist = await chargeOnActivation(db, { ...l, publishedAt: new Date("2026-01-01"), expiresAt: new Date("2026-03-01") }, null);
      assert.equal(relist?.type, "RELIST");
      assert.equal(relist?.amount, 100);
      const lines = describeFees(await feeSchedule(l.categoryId, seller.id));
      assert.equal(lines.find((x) => x.label === "Monthly subscription")?.value, "None");
    } finally {
      await db.setting.deleteMany({ where: { key: { in: ["fee_listing_cents", "fee_relist_cents"] } } });
      await db.category.update({ where: { id: l.categoryId }, data: { listingFee: null } });
      await db.platformFee.deleteMany({ where: { listingId: l.id } });
    }
  });
  await test("social links: https on the platform's own domain only; store addresses validated", async () => {
    assert.equal((socialUrlProblem("instagram", "instagram.com/acme") as { url: string }).url, "https://instagram.com/acme");
    assert.ok("error" in socialUrlProblem("instagram", "https://evil.example/instagram.com"));
    assert.ok("error" in socialUrlProblem("facebook", "javascript:alert(1)"));
    assert.ok("error" in socialUrlProblem("x", "https://user:pw@x.com/acme"));
    assert.ok("error" in socialUrlProblem("tiktok", "https://tiktok.com/"));
    assert.equal(storeSlugProblem("acme-trading"), null);
    assert.ok(storeSlugProblem("admin"));
    assert.ok(storeSlugProblem("Bad Slug"));
    assert.ok(storeSlugProblem("-x"));
  });
  await test("referrals: utm/QR parsed and sanitised; AI search sources recognised", async () => {
    assert.deepEqual(referralFromParams({ utm_source: "Facebook", utm_medium: "social", utm_campaign: "spring<script>" }), { source: "facebook", medium: "social", campaign: "springscript" });
    assert.deepEqual(referralFromParams({ ref: "qr" }), { source: "qr", medium: "offline", campaign: null });
    assert.equal(referralFromParams({}), null);
    assert.ok(isAiSource("chatgpt.com"));
    assert.ok(!isAiSource("facebook"));
  });
  await test("every listing and store gets a clean public URL (backfill is idempotent)", async () => {
    await backfillPublicUrls(db);
    assert.equal(await db.listing.count({ where: { slug: null } }), 0);
    assert.equal(await db.sellerProfile.count({ where: { storeSlug: null } }), 0);
    const again = await backfillPublicUrls(db);
    assert.deepEqual(again, { listings: 0, stores: 0 });
  });

  console.log("Sign-in & account recovery");
  await test("email codes: correct code works once, then never again", async () => {
    const c = await issueCode({ userId: buyer.id, purpose: "LOGIN", channel: "EMAIL", target: buyer.email });
    const wrong = c.code === "000000" ? "111111" : "000000";
    assert.equal((await checkCode(c.id, wrong, "LOGIN")).ok, false);
    assert.equal((await checkCode(c.id, c.code, "RESET")).ok, false, "a code only works for its own purpose");
    assert.equal((await checkCode(c.id, c.code, "LOGIN")).ok, true);
    assert.equal((await checkCode(c.id, c.code, "LOGIN")).ok, false, "single use");
  });
  await test("email codes: a new code invalidates the previous one", async () => {
    const first = await issueCode({ userId: buyer.id, purpose: "RESET", channel: "EMAIL", target: buyer.email });
    const second = await issueCode({ userId: buyer.id, purpose: "RESET", channel: "EMAIL", target: buyer.email });
    assert.equal((await checkCode(first.id, first.code, "RESET")).ok, false);
    assert.equal((await checkCode(second.id, second.code, "RESET")).ok, true);
  });
  await test("email codes: max 5 wrong attempts, then even the right code is refused", async () => {
    const c = await issueCode({ userId: buyer.id, purpose: "USERNAME", channel: "EMAIL", target: buyer.email });
    const wrong = c.code === "000000" ? "111111" : "000000";
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) assert.equal((await checkCode(c.id, wrong, "USERNAME")).ok, false);
    const r = await checkCode(c.id, c.code, "USERNAME");
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, /Too many incorrect attempts/);
  });
  await test("email codes: expired codes are rejected", async () => {
    const c = await issueCode({ userId: buyer.id, purpose: "LOGIN", channel: "EMAIL", target: buyer.email });
    await db.authCode.update({ where: { id: c.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await checkCode(c.id, c.code, "LOGIN")).ok, false);
  });
  await test("email codes: 60-second resend cooldown; resend replaces the code", async () => {
    const c = await issueCode({ userId: buyer.id, purpose: "LOGIN", channel: "EMAIL", target: buyer.email });
    const early = await resendCode(c.id, "LOGIN");
    assert.equal(early.ok, false);
    assert.match((early as { error: string }).error, /wait \d+ seconds/);
    await db.authCode.update({ where: { id: c.id }, data: { lastSentAt: new Date(Date.now() - 61_000) } });
    const r = await resendCode(c.id, "LOGIN");
    assert.equal(r.ok, true);
    assert.equal((await checkCode(c.id, c.code, "LOGIN")).ok, false, "old code stops working after a resend");
    assert.equal((await checkCode(c.id, (r as { code: string }).code, "LOGIN")).ok, true);
  });
  await test("codes are stored only as hashes", async () => {
    const c = await issueCode({ userId: buyer.id, purpose: "LOGIN", channel: "EMAIL", target: buyer.email });
    const row = await db.authCode.findUniqueOrThrow({ where: { id: c.id } });
    assert.ok(!JSON.stringify(row).includes(c.code));
  });
  await test("unknown accounts get a decoy challenge that can never verify (no account enumeration)", async () => {
    const id = decoyId();
    assert.equal((await checkCode(id, "123456", "LOGIN")).ok, false);
    assert.equal((await resendCode(id, "LOGIN")).ok, false);
  });
  await test("reset links: single use and expire", async () => {
    const token = await issueLink({ userId: buyer.id, purpose: "RESET_LINK", target: buyer.email });
    assert.ok(await peekLink(token, "RESET_LINK"));
    assert.equal(await peekLink(token, "EMAIL_CHANGE_LINK"), null);
    assert.ok(await consumeLink(token, "RESET_LINK"));
    assert.equal(await consumeLink(token, "RESET_LINK"), null);
    const t2 = await issueLink({ userId: buyer.id, purpose: "RESET_LINK", target: buyer.email, ttlMs: -1 });
    assert.equal(await peekLink(t2, "RESET_LINK"), null);
  });
  await test("progressive lockout: 5 failures lock for 1 min, doubling to a 60-minute cap", async () => {
    assert.deepEqual([4, 5, 6, 7, 10, 11, 20].map(lockMinutes), [0, 1, 2, 4, 32, 60, 60]);
  });
  await test("usernames: validated, case-insensitive sign-in, unique", async () => {
    assert.equal(usernameProblem("ab"), "Usernames must be 3–30 characters.");
    assert.ok(usernameProblem("admin"));
    assert.ok(usernameProblem("BUY-000001"));
    assert.ok(usernameProblem("9lives"));
    assert.equal(usernameProblem("Bob.Buys"), null);
    await setUsername(buyer.id, "Bob.Buys", buyer.id);
    assert.equal((await findByIdentifier("BOB.buys"))?.id, buyer.id);
    assert.equal((await findByIdentifier(buyer.email.toUpperCase()))?.id, buyer.id);
    assert.equal(await findByIdentifier(buyer.publicId), null, "account IDs are for recovery only");
    assert.equal((await findByIdentifier(buyer.publicId, { allowAccountId: true }))?.id, buyer.id);
    await assert.rejects(setUsername(buyer2.id, "bob.buys", buyer2.id), RecoveryError);
  });
  await test("masking and log redaction", async () => {
    assert.equal(maskEmail("darshan@gmail.com"), "d******@gmail.com");
    const red = redactSecrets("Your code is: 482913\nReset: https://x.test/reset-password?token=abcDEF_123 thanks");
    assert.ok(!red.includes("482913") && !red.includes("abcDEF_123"));
  });
  await test("lost-email recovery: admin approval changes email and signs out everywhere; a note is required", async () => {
    const reqRow = await db.recoveryRequest.create({ data: { reference: "REC-TEST01", kind: "MOBILE_VERIFIED", userId: buyer2.id, identifier: "verified mobile", newEmail: "alice.new@example.com", newEmailVerified: true, mobileVerified: true } });
    await db.session.create({ data: { tokenHash: crypto.randomUUID(), userId: buyer2.id, expiresAt: new Date(Date.now() + 3600_000) } });
    await assert.rejects(approveRecovery(reqRow.id, admin.id, ""), RecoveryError);
    await approveRecovery(reqRow.id, admin.id, "Confirmed recent order numbers by phone");
    const after = await db.user.findUniqueOrThrow({ where: { id: buyer2.id } });
    assert.equal(after.email, "alice.new@example.com");
    assert.equal(await db.session.count({ where: { userId: buyer2.id } }), 0);
    assert.equal((await db.recoveryRequest.findUniqueOrThrow({ where: { id: reqRow.id } })).status, "APPROVED");
    await assert.rejects(rejectRecovery(reqRow.id, admin.id, "late"), RecoveryError, "cannot be decided twice");
    await db.user.update({ where: { id: buyer2.id }, data: { email: "buyer2@sidebooster.test" } });
  });
  await test("audit log is append-only at the database level", async () => {
    const row = await db.auditLog.findFirstOrThrow();
    await assert.rejects(db.auditLog.update({ where: { id: row.id }, data: { action: "TAMPERED" } }));
    await assert.rejects(db.auditLog.delete({ where: { id: row.id } }));
  });

  console.log(`\n${passed} checks passed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
