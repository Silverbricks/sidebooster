"use server";
import { brand } from "@/config/brand";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { attempt, back } from "@/lib/action-utils";
import { optStr, slugify, str } from "@/lib/format";
import { audit, drawAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { refreshAccountStatus, refreshSellerStatus } from "@/lib/accounts";
import { DEFAULT_SETTINGS, type SettingKey } from "@/lib/settings";
import { LISTING_DAYS_ACTIVE } from "@/lib/constants";
import { approveSchedule, campaignComplianceProblems, cancelCampaign, lockCampaign, markPrizeDelivered, publishResult, rejectSchedule, runDraw } from "@/lib/campaigns";
import { adjustCommission, adminDecideSale, approveCommission, markInvoicePaid, reverseCommission, waiveCommission } from "@/lib/commission";
import { completeOrder, processRefund } from "@/lib/payments";
import { paymentProvider } from "@/lib/payment-provider";

const reasonOf = (fd: FormData) => optStr(fd.get("reason"));
function needReason(r: string | null, path: string): asserts r is string {
  if (!r) back(path, { error: "A reason is required for this action." });
}

// ---------------------------------------------------------------- users & sellers

export async function userStatusAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd.get("id"));
  const status = str(fd.get("status"));
  const path = str(fd.get("back")) || "/admin/users";
  const reason = reasonOf(fd);
  if (!["ACTIVE", "RESTRICTED", "SUSPENDED", "CLOSED", "VERIFICATION_REQUIRED"].includes(status)) back(path, { error: "Invalid status." });
  if (status !== "ACTIVE") needReason(reason, path);
  if (id === admin.id) back(path, { error: "You can't change your own status." });
  const u = await db.user.update({ where: { id }, data: { accountStatus: status === "ACTIVE" ? "REGISTERED" : status, statusReason: reason, ...(status === "ACTIVE" ? { riskFlags: null } : {}) } });
  if (status === "ACTIVE") await refreshAccountStatus(id);
  if (["SUSPENDED", "CLOSED"].includes(status)) {
    await db.session.deleteMany({ where: { userId: id } });
    await db.listing.updateMany({ where: { sellerId: id, status: { in: ["ACTIVE", "PENDING"] } }, data: { status: "SUSPENDED", statusReason: `Account ${status.toLowerCase()}` } });
    await db.sellerProfile.updateMany({ where: { userId: id }, data: { status: "SUSPENDED", statusReason: reason } });
  }
  await audit(admin.id, `USER_${status}`, "User", id, { publicId: u.publicId }, db, reason);
  await notify(id, { type: "ACCOUNT_STATUS", title: `Your account status: ${status.toLowerCase().replace("_", " ")}`, body: reason ?? "Your account is active." });
  back(path, { ok: "Account updated." });
}

export async function verifyIdentityAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd.get("id"));
  await db.user.update({ where: { id }, data: { idVerifiedAt: new Date() } });
  await audit(admin.id, "IDENTITY_VERIFIED", "User", id);
  back(str(fd.get("back")) || "/admin/users", { ok: "Identity marked verified." });
}

export async function sellerDecisionAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd.get("id"));
  const decision = str(fd.get("decision")); // APPROVE | REJECT | DOCUMENTS_REQUIRED | SUSPEND | REINSTATE
  const path = `/admin/sellers/${id}`;
  const reason = reasonOf(fd);
  const sp = await db.sellerProfile.findUniqueOrThrow({ where: { id }, include: { user: true } });
  if (decision !== "APPROVE" && decision !== "REINSTATE") needReason(reason, path);
  if (decision === "APPROVE" && sp.user.accountStatus !== "ACTIVE") back(path, { error: "The seller's email/mobile verification is not complete (or the account is restricted)." });
  const status = { APPROVE: "APPROVED", REJECT: "REJECTED", DOCUMENTS_REQUIRED: "DOCUMENTS_REQUIRED", SUSPEND: "SUSPENDED", REINSTATE: "APPROVED" }[decision];
  if (!status) back(path, { error: "Invalid decision." });
  await db.sellerProfile.update({ where: { id }, data: { status, statusReason: reason, ...(status === "APPROVED" ? { approvedById: admin.id, approvedAt: new Date() } : {}) } });
  if (status === "APPROVED") await refreshSellerStatus(id);
  if (status === "SUSPENDED") await db.listing.updateMany({ where: { sellerId: sp.userId, status: { in: ["ACTIVE", "PENDING"] } }, data: { status: "SUSPENDED", statusReason: "Seller suspended" } });
  if (decision === "REINSTATE") await db.listing.updateMany({ where: { sellerId: sp.userId, status: "SUSPENDED", statusReason: "Seller suspended" }, data: { status: "PAUSED", statusReason: null } });
  await audit(admin.id, `SELLER_${decision}`, "SellerProfile", id, { sellerCode: sp.sellerCode }, db, reason);
  const msgs: Record<string, string> = {
    APPROVED: "Your seller account has been approved. Connect your payout account to start selling.",
    REJECTED: `Your seller application was not approved: ${reason}`,
    DOCUMENTS_REQUIRED: `More information is required: ${reason}`,
    SUSPENDED: `Your seller account has been suspended: ${reason}`,
  };
  await notify(sp.userId, { type: "SELLER_STATUS", title: `Seller account ${sp.sellerCode}: ${status!.toLowerCase().replace("_", " ")}`, body: msgs[status!] ?? "Updated.", link: "/seller/verification" });
  back(path, { ok: "Seller updated." });
}

export async function documentDecisionAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd.get("id"));
  const status = str(fd.get("status")) === "ACCEPTED" ? "ACCEPTED" : "REJECTED";
  const d = await db.sellerDocument.update({ where: { id }, data: { status, reviewedById: admin.id, reviewNote: reasonOf(fd) } });
  await audit(admin.id, `DOCUMENT_${status}`, "SellerDocument", id, null, db, reasonOf(fd));
  back(`/admin/sellers/${d.sellerId}`, { ok: `Document ${status.toLowerCase()}.` });
}

export async function sellerPermissionsAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd.get("id"));
  const data = { canRunFreeDraws: fd.get("canRunFreeDraws") === "on", canRunPaidDraws: fd.get("canRunPaidDraws") === "on", trustedSeller: fd.get("trustedSeller") === "on" };
  await db.sellerProfile.update({ where: { id }, data });
  const acct = await db.paymentAccount.findUnique({ where: { sellerId: id } });
  if (acct) {
    const held = fd.get("payoutsHeld") === "on";
    if (held !== acct.payoutsHeld) {
      await db.paymentAccount.update({ where: { id: acct.id }, data: { payoutsHeld: held } });
      const sp = await db.sellerProfile.findUniqueOrThrow({ where: { id } });
      if (held) await db.payout.updateMany({ where: { sellerId: sp.userId, status: "SCHEDULED" }, data: { status: "HELD", holdReason: "Payouts held by admin" } });
      else await db.payout.updateMany({ where: { sellerId: sp.userId, status: "HELD", holdReason: "Payouts held by admin" }, data: { status: "SCHEDULED", holdReason: null } });
    }
  }
  await audit(admin.id, "SELLER_PERMISSIONS_UPDATED", "SellerProfile", id, { ...data, payoutsHeld: fd.get("payoutsHeld") === "on" }, db, reasonOf(fd));
  back(`/admin/sellers/${id}`, { ok: "Permissions saved." });
}

export async function sellerCommissionRateAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd.get("id"));
  const sp = await db.sellerProfile.findUniqueOrThrow({ where: { id } });
  const raw = str(fd.get("rate"));
  const path = `/admin/sellers/${id}`;
  const reason = reasonOf(fd);
  needReason(reason, path);
  await db.commissionRule.updateMany({ where: { sellerId: sp.userId, effectiveTo: null }, data: { effectiveTo: new Date() } });
  if (raw) {
    const bps = Math.round(Number(raw) * 100);
    if (!(bps >= 0 && bps <= 5000)) back(path, { error: "Rate must be 0–50%." });
    await db.commissionRule.create({ data: { sellerId: sp.userId, rateBps: bps, createdById: admin.id } });
  }
  await audit(admin.id, "SELLER_COMMISSION_RATE_SET", "SellerProfile", id, { rate: raw || "category default" }, db, reason);
  back(path, { ok: "Commission rate updated." });
}

// ---------------------------------------------------------------- listings & offers

export async function listingDecisionAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd.get("id"));
  const decision = str(fd.get("decision")); // APPROVE | REJECT | SUSPEND | FEATURE | UNFEATURE | REINSTATE
  const path = str(fd.get("back")) || "/admin/listings";
  const reason = reasonOf(fd);
  const l = await db.listing.findUniqueOrThrow({ where: { id }, include: { seller: { include: { sellerProfile: true } } } });
  if (["REJECT", "SUSPEND"].includes(decision)) needReason(reason, path);
  if (decision === "APPROVE") {
    if (!["APPROVED", "ACTIVE"].includes(l.seller.sellerProfile?.status ?? "") && l.seller.role !== "ADMIN") back(path, { error: "The seller is not approved — listings can't be published." });
    await db.listing.update({ where: { id }, data: { status: "ACTIVE", statusReason: null, publishedAt: l.publishedAt ?? new Date(), expiresAt: new Date(Date.now() + LISTING_DAYS_ACTIVE * 86400_000) } });
    await notify(l.sellerId, { type: "LISTING_APPROVED", title: `Listing approved: ${l.title}`, body: `Your listing is now live on ${brand.name}.`, link: `/listing/${l.id}` });
  } else if (decision === "REJECT") {
    await db.listing.update({ where: { id }, data: { status: "REJECTED", statusReason: reason } });
    await notify(l.sellerId, { type: "LISTING_REJECTED", title: `Listing not approved: ${l.title}`, body: reason!, link: `/seller/listings/${l.id}` });
  } else if (decision === "SUSPEND") {
    await db.listing.update({ where: { id }, data: { status: "SUSPENDED", statusReason: reason } });
    await notify(l.sellerId, { type: "LISTING_SUSPENDED", title: `Listing suspended: ${l.title}`, body: reason!, link: `/seller/listings/${l.id}` });
  } else if (decision === "REINSTATE") {
    await db.listing.update({ where: { id }, data: { status: "PAUSED", statusReason: null } });
  } else if (decision === "FEATURE" || decision === "UNFEATURE") {
    await db.listing.update({ where: { id }, data: { featured: decision === "FEATURE" } });
  } else back(path, { error: "Invalid decision." });
  await audit(admin.id, `LISTING_${decision}`, "Listing", id, null, db, reason);
  back(path, { ok: "Listing updated." });
}

export async function offerDecisionAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd.get("id"));
  const approve = str(fd.get("decision")) === "APPROVE";
  const reason = reasonOf(fd);
  if (!approve) needReason(reason, "/admin/offers");
  const o = await db.offer.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", statusReason: reason } });
  await audit(admin.id, approve ? "OFFER_APPROVED" : "OFFER_REJECTED", "Offer", id, null, db, reason);
  await notify(o.sellerId, { type: "OFFER_REVIEWED", title: `Offer ${approve ? "approved" : "rejected"}: ${o.name}`, body: reason ?? "Your offer is live.", link: "/seller/offers" });
  back("/admin/offers", { ok: "Offer updated." });
}

// ---------------------------------------------------------------- categories

export async function saveCategoryAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = optStr(fd.get("id"));
  const name = str(fd.get("name"));
  if (!name) back("/admin/categories", { error: "Name required." });
  const data = { name, slug: str(fd.get("slug")) || slugify(name), icon: optStr(fd.get("icon")), parentId: optStr(fd.get("parentId")), sortOrder: Number(fd.get("sortOrder")) || 0, active: fd.get("active") === "on", highValue: fd.get("highValue") === "on" };
  await attempt("/admin/categories", async () => {
    const c = id ? await db.category.update({ where: { id }, data }) : await db.category.create({ data });
    await audit(admin.id, id ? "CATEGORY_UPDATED" : "CATEGORY_CREATED", "Category", c.id, data);
    return "Category saved.";
  });
}

export async function saveAttributeAction(fd: FormData) {
  const admin = await requireAdmin();
  const categoryId = str(fd.get("categoryId"));
  const path = `/admin/categories?edit=${categoryId}`;
  const label = str(fd.get("label"));
  if (!label) back(path, { error: "Label required." });
  const type = str(fd.get("type"));
  if (!["text", "number", "select", "boolean", "date"].includes(type)) back(path, { error: "Invalid type." });
  const key = str(fd.get("key")) || slugify(label).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const data = { categoryId, key, label, type, options: optStr(fd.get("options")), unit: optStr(fd.get("unit")), required: fd.get("required") === "on", isPrivate: fd.get("isPrivate") === "on", filterable: fd.get("filterable") === "on", sortOrder: Number(fd.get("sortOrder")) || 0 };
  const id = optStr(fd.get("id"));
  await attempt(path, async () => {
    if (id) await db.categoryAttribute.update({ where: { id }, data });
    else await db.categoryAttribute.create({ data });
    await audit(admin.id, "CATEGORY_ATTRIBUTE_SAVED", "Category", categoryId, data);
    return "Field saved.";
  });
}

export async function deleteAttributeAction(fd: FormData) {
  const admin = await requireAdmin();
  const a = await db.categoryAttribute.delete({ where: { id: str(fd.get("id")) } });
  await audit(admin.id, "CATEGORY_ATTRIBUTE_DELETED", "Category", a.categoryId, { key: a.key });
  back(`/admin/categories?edit=${a.categoryId}`, { ok: "Field removed." });
}

export async function saveCommissionRuleAction(fd: FormData) {
  const admin = await requireAdmin();
  const categoryId = str(fd.get("categoryId"));
  const reason = reasonOf(fd);
  needReason(reason, "/admin/commissions/rules");
  const bps = Math.round(Number(fd.get("rate")) * 100);
  if (!(bps >= 0 && bps <= 5000)) back("/admin/commissions/rules", { error: "Rate must be 0–50%." });
  const from = str(fd.get("effectiveFrom")) ? new Date(str(fd.get("effectiveFrom"))) : new Date();
  await db.$transaction([
    db.commissionRule.updateMany({ where: { categoryId, sellerId: null, effectiveTo: null }, data: { effectiveTo: from } }),
    db.commissionRule.create({ data: { categoryId, rateBps: bps, effectiveFrom: from, createdById: admin.id } }),
  ]);
  await audit(admin.id, "COMMISSION_RULE_SET", "Category", categoryId, { bps, from }, db, reason);
  back("/admin/commissions/rules", { ok: "Commission rule saved. Existing commission records are unchanged." });
}

// ---------------------------------------------------------------- orders, sales, commission, payouts, refunds

export async function adminCompleteOrderAction(fd: FormData) {
  const admin = await requireAdmin();
  await attempt("/admin/orders", async () => {
    await completeOrder(str(fd.get("orderId")), admin);
    return "Order completed.";
  });
}

export async function saleDecisionAction(fd: FormData) {
  const admin = await requireAdmin();
  await attempt("/admin/sales", async () => {
    await adminDecideSale(str(fd.get("id")), admin.id, str(fd.get("decision")) as "APPROVE" | "REJECT" | "MORE_INFO", reasonOf(fd));
    return "Sale updated.";
  });
}

export async function commissionAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd.get("id"));
  const op = str(fd.get("op"));
  const reason = reasonOf(fd) ?? "";
  await attempt(str(fd.get("back")) || "/admin/commissions", async () => {
    if (op === "approve") await approveCommission(id, admin.id);
    else if (op === "adjust") await adjustCommission(id, admin.id, Math.round(Number(fd.get("rate")) * 100), reason);
    else if (op === "waive") await waiveCommission(id, admin.id, reason);
    else if (op === "reverse") { if (!reason) throw new Error("A reason is required."); await reverseCommission(id, admin.id, reason); }
    else if (op === "reject") {
      if (!reason) throw new Error("A reason is required.");
      await db.commissionRecord.update({ where: { id }, data: { status: "REJECTED", adjustReason: reason } });
      await audit(admin.id, "COMMISSION_REJECTED", "Commission", id, null, db, reason);
    } else throw new Error("Unknown action.");
    return "Commission updated.";
  });
}

export async function invoicePaidAction(fd: FormData) {
  const admin = await requireAdmin();
  await attempt("/admin/commissions/invoices", async () => {
    await markInvoicePaid(str(fd.get("id")), admin.id, str(fd.get("reference")));
    return "Invoice marked paid.";
  });
}

export async function payoutAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd.get("id"));
  const op = str(fd.get("op"));
  await attempt("/admin/payouts", async () => {
    const p = await db.payout.findUniqueOrThrow({ where: { id } });
    const sp = await db.sellerProfile.findUnique({ where: { userId: p.sellerId }, include: { paymentAccount: true } });
    if (op === "pay") {
      if (p.status !== "SCHEDULED") throw new Error("Only scheduled payouts can be released.");
      const a = sp?.paymentAccount;
      if (!a || !a.payoutsEnabled || a.restricted || a.payoutsHeld) throw new Error("Seller's payout account is not eligible.");
      const { transferRef } = await paymentProvider().transfer(a.providerAccountId, p.amount, p.id);
      await db.payout.update({ where: { id }, data: { status: "PAID", paidAt: new Date(), holdReason: null } });
      await audit(admin.id, "PAYOUT_RELEASED", "Payout", id, { transferRef, amount: p.amount });
      await notify(p.sellerId, { type: "PAYOUT", title: "Payout sent", body: `A payout of $${(p.amount / 100).toFixed(2)} has been sent to your account.`, link: "/seller/commissions" });
    } else if (op === "hold") {
      const reason = reasonOf(fd);
      if (!reason) throw new Error("A reason is required.");
      await db.payout.update({ where: { id }, data: { status: "HELD", holdReason: reason } });
      await audit(admin.id, "PAYOUT_HELD", "Payout", id, null, db, reason);
    } else if (op === "release") {
      await db.payout.update({ where: { id }, data: { status: "SCHEDULED", holdReason: null } });
      await audit(admin.id, "PAYOUT_RELEASED_FROM_HOLD", "Payout", id);
    }
    return "Payout updated.";
  });
}

export async function refundDecisionAction(fd: FormData) {
  const admin = await requireAdmin();
  await attempt("/admin/refunds", async () => {
    const approve = str(fd.get("decision")) === "APPROVE";
    await processRefund(str(fd.get("id")), admin.id, approve, reasonOf(fd));
    return approve ? "Refund processed." : "Refund declined.";
  });
}

// ---------------------------------------------------------------- campaigns & draws

export async function campaignDecisionAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd.get("id"));
  const decision = str(fd.get("decision"));
  const path = `/admin/campaigns/${id}`;
  const reason = reasonOf(fd);
  const c = await db.campaign.findUniqueOrThrow({ where: { id } });
  await attempt(path, async () => {
    if (decision === "APPROVE") {
      if (c.status !== "PENDING_APPROVAL") throw new Error("Campaign is not awaiting approval.");
      if (fd.get("legalReviewConfirmed") !== "on") throw new Error("Confirm the legal/compliance review before approving.");
      const problems = await campaignComplianceProblems(c);
      if (problems.length) throw new Error(problems.join(" "));
      const maxCap = Number(fd.get("totalTickets")) || c.totalTickets;
      if (maxCap > c.totalTickets || maxCap < 1) throw new Error("Approved capacity can only reduce the requested capacity.");
      const initial = await db.drawSchedule.findFirst({ where: { campaignId: id, status: "PROPOSED", kind: "INITIAL" } });
      await db.$transaction(async (tx) => {
        await tx.campaign.update({ where: { id }, data: { status: "APPROVED", statusReason: null, legalReviewConfirmed: true, totalTickets: maxCap, scheduleApproved: true } });
        if (initial) await tx.drawSchedule.update({ where: { id: initial.id }, data: { status: "APPROVED", reviewedById: admin.id, reviewedAt: new Date(), reviewNote: reason } });
        await drawAudit(tx, id, "CAMPAIGN_APPROVED", admin.id, { totalTickets: maxCap, drawAt: c.drawAt, salesCloseAt: c.salesCloseAt, note: reason });
      });
      await notify(c.sellerId, { type: "CAMPAIGN_APPROVED", title: `Campaign approved: ${c.title}`, body: "Your campaign is approved and will open on its published sales date.", link: `/seller/campaigns/${id}` });
      return "Campaign approved.";
    }
    if (!reason) throw new Error("A reason is required.");
    if (decision === "REJECT") {
      if (c.status !== "PENDING_APPROVAL") throw new Error("Campaign is not awaiting approval.");
      await db.$transaction(async (tx) => {
        await tx.campaign.update({ where: { id }, data: { status: "REJECTED", statusReason: reason } });
        await tx.drawSchedule.updateMany({ where: { campaignId: id, status: "PROPOSED" }, data: { status: "REJECTED", reviewedById: admin.id, reviewNote: reason, reviewedAt: new Date() } });
        await drawAudit(tx, id, "CAMPAIGN_REJECTED", admin.id, { reason });
      });
      await notify(c.sellerId, { type: "CAMPAIGN_REJECTED", title: `Campaign not approved: ${c.title}`, body: reason, link: `/seller/campaigns/${id}` });
      return "Campaign rejected.";
    }
    if (decision === "SUSPEND") {
      if (c.status !== "APPROVED") throw new Error("Only live campaigns can be suspended.");
      await db.$transaction(async (tx) => {
        await tx.campaign.update({ where: { id }, data: { status: "SUSPENDED", statusReason: reason } });
        await drawAudit(tx, id, "CAMPAIGN_SUSPENDED", admin.id, { reason });
      });
      return "Campaign suspended — ticket sales are paused.";
    }
    if (decision === "RESUME") {
      if (c.status !== "SUSPENDED") throw new Error("Campaign is not suspended.");
      await db.$transaction(async (tx) => {
        await tx.campaign.update({ where: { id }, data: { status: "APPROVED", statusReason: null } });
        await drawAudit(tx, id, "CAMPAIGN_RESUMED", admin.id, { reason });
      });
      return "Campaign resumed.";
    }
    if (decision === "CANCEL") {
      await cancelCampaign(id, admin.id, reason);
      return "Campaign cancelled and paid tickets refunded.";
    }
    throw new Error("Unknown decision.");
  });
}

export async function scheduleDecisionAction(fd: FormData) {
  const admin = await requireAdmin();
  const s = await db.drawSchedule.findUniqueOrThrow({ where: { id: str(fd.get("id")) } });
  const back_ = str(fd.get("back")) || `/admin/campaigns/${s.campaignId}`;
  await attempt(back_, async () => {
    if (str(fd.get("decision")) === "APPROVE") {
      if (fd.get("legalChecked") !== "on") throw new Error("Confirm the change is permitted under the campaign terms and applicable rules.");
      await approveSchedule(s.id, admin.id, reasonOf(fd));
      return "Schedule approved and participants notified.";
    }
    await rejectSchedule(s.id, admin.id, reasonOf(fd) ?? "");
    return "Request rejected.";
  });
}

export async function drawStepAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd.get("id"));
  const step = str(fd.get("step"));
  const path = `/admin/campaigns/${id}`;
  await attempt(path, async () => {
    if (step === "lock") {
      await lockCampaign(id, admin.id, { force: fd.get("force") === "on" });
      return "Entry register locked and seed commitment published.";
    }
    if (step === "draw") {
      const r = await runDraw(id, admin.id);
      const c = await db.campaign.findUniqueOrThrow({ where: { id } });
      const holders = await db.ticket.findMany({ where: { campaignId: id, status: "VALID" }, distinct: ["buyerId"], select: { buyerId: true } });
      for (const h of holders) await notify(h.buyerId, { type: "DRAW_COMPLETED", title: `Draw completed: ${c.title}`, body: "The draw has been conducted. The result will be published once verified.", link: `/draws/${c.slug}` });
      return `Draw complete — winning ticket ${r.winningNumber}. Verify and publish below.`;
    }
    if (step === "publish") {
      await publishResult(id, admin.id, optStr(fd.get("videoUrl")));
      return "Result verified and published. Participants notified.";
    }
    if (step === "delivered") {
      await markPrizeDelivered(id, admin.id, optStr(fd.get("note")));
      return "Prize delivery recorded; campaign completed.";
    }
    throw new Error("Unknown step.");
  });
}

// ---------------------------------------------------------------- platform

export async function saveSettingsAction(fd: FormData) {
  const admin = await requireAdmin();
  const changes: Record<string, string> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
    const isBool = DEFAULT_SETTINGS[key] === "true" || DEFAULT_SETTINGS[key] === "false";
    const v = isBool ? (fd.get(key) === "on" ? "true" : "false") : fd.get(key) == null ? null : str(fd.get(key));
    if (v === null) continue;
    const cur = (await db.setting.findUnique({ where: { key } }))?.value ?? DEFAULT_SETTINGS[key];
    if (cur !== v) {
      await db.setting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
      changes[key] = `${cur} → ${v}`;
    }
  }
  if (Object.keys(changes).length) await audit(admin.id, "SETTINGS_UPDATED", "Setting", null, changes, db, reasonOf(fd));
  back("/admin/settings", { ok: Object.keys(changes).length ? `Saved ${Object.keys(changes).length} change(s).` : "No changes." });
}

export async function savePageAction(fd: FormData) {
  const admin = await requireAdmin();
  const slug = str(fd.get("slug"));
  await db.page.update({ where: { slug }, data: { title: str(fd.get("title")), content: str(fd.get("content")) } });
  await audit(admin.id, "PAGE_UPDATED", "Page", slug);
  revalidatePath(`/${slug}`);
  back("/admin/cms", { ok: "Page saved." });
}

export async function saveBannerAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = optStr(fd.get("id"));
  const data = { title: str(fd.get("title")), subtitle: optStr(fd.get("subtitle")), link: optStr(fd.get("link")), imageUrl: optStr(fd.get("imageUrl")), active: fd.get("active") === "on", sortOrder: Number(fd.get("sortOrder")) || 0 };
  if (fd.get("delete") === "on" && id) await db.banner.delete({ where: { id } });
  else if (id) await db.banner.update({ where: { id }, data });
  else await db.banner.create({ data });
  await audit(admin.id, "BANNER_SAVED", "Banner", id);
  back("/admin/cms", { ok: "Banner saved." });
}

