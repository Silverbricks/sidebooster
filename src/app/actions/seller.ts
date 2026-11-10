"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSeller } from "@/lib/auth";
import { attempt, back } from "@/lib/action-utils";
import { optStr, slugify, str, toCents } from "@/lib/format";
import { audit, drawAudit } from "@/lib/audit";
import { canSubmitListings } from "@/lib/accounts";
import { getBool, getNumber } from "@/lib/settings";
import { chargeOnActivation } from "@/lib/fees";
import { newListingSlug, storeSlugProblem } from "@/lib/urls";
import { readSocialLinks } from "@/lib/social";
import { saveImages, savePrivateDocument, saveVideo, UploadError } from "@/lib/uploads";
import { DOCUMENT_TYPES, TIMEZONES } from "@/lib/constants";
import { zonedToUtc } from "@/lib/time";
import { campaignComplianceProblems } from "@/lib/campaigns";
import { reportOfflineSale } from "@/lib/commission";
import { markOrderFulfilled } from "@/lib/payments";
import { paymentProvider } from "@/lib/payment-provider";
import { notify } from "@/lib/notify";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { rateLimit } from "@/lib/rate-limit";
import { readLocationForm, runBusinessCheck, saveSellerLocation, submissionProblems } from "@/lib/seller-verification";
import { readSellerBusiness } from "@/lib/seller-business-form";

// ---------------------------------------------------------------- verification

export async function uploadDocumentAction(fd: FormData) {
  const user = await requireSeller();
  const sp = user.sellerProfile!;
  const path = "/seller/verification";
  if (!["VERIFICATION_PENDING", "DOCUMENTS_REQUIRED", "REGISTERED", "UNDER_REVIEW"].includes(sp.status)) back(path, { error: "Documents can't be changed in your current status." });
  const type = str(fd.get("documentType"));
  if (!(type in DOCUMENT_TYPES)) back(path, { error: "Choose a document type." });
  await attempt(path, async () => {
    const { key, name } = await savePrivateDocument(fd.get("file"));
    await db.sellerDocument.create({ data: { sellerId: sp.id, documentType: type, fileKey: key, fileName: name } });
    await audit(user.id, "DOCUMENT_UPLOADED", "SellerProfile", sp.id, { type });
    return "Document uploaded.";
  });
}

export async function submitVerificationAction() {
  const user = await requireSeller();
  const sp = await db.sellerProfile.findUniqueOrThrow({ where: { userId: user.id }, include: { documents: true } });
  const path = "/seller/verification";
  if (!["VERIFICATION_PENDING", "DOCUMENTS_REQUIRED", "REGISTERED"].includes(sp.status)) back(path, { error: "Already submitted." });
  const problems = await submissionProblems(user, sp);
  if (problems.length) back(path, { error: `Before submitting: ${problems.join(" ")}` });
  if (user.accountStatus !== "ACTIVE") back(path, { error: "Your account isn't active yet — finish email and mobile verification at /verify." });
  if (await getBool("rule_seller_require_documents")) {
    const types = sp.documents.filter((d) => d.status !== "REJECTED").map((d) => d.documentType);
    if (!types.some((t) => t.startsWith("ID_"))) back(path, { error: "Upload a photo ID (driver licence or passport)." });
    if (sp.sellerType === "BUSINESS" && !types.includes("ABN_CERTIFICATE")) back(path, { error: "Upload your ABN / ASIC registration." });
    if (sp.sellerType === "INDIVIDUAL" && !types.includes("PROOF_OF_ADDRESS")) back(path, { error: "Upload a proof of address." });
  }
  await db.sellerProfile.update({ where: { id: sp.id }, data: { status: "UNDER_REVIEW", statusReason: null } });
  await audit(user.id, "SELLER_SUBMITTED_FOR_REVIEW", "SellerProfile", sp.id);
  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  for (const a of admins) await notify(a.id, { type: "SELLER_REVIEW", title: `Seller ${sp.sellerCode} awaiting verification`, body: sp.legalName, link: `/admin/sellers/${sp.id}`, email: false });
  back(path, { ok: "Submitted for admin review." });
}

const EDITABLE = ["VERIFICATION_PENDING", "DOCUMENTS_REQUIRED", "REGISTERED"];

/** Seller saves / corrects their location while verification is pending (draft). Re-geocodes and re-evaluates. */
export async function updateSellerLocationAction(fd: FormData) {
  const user = await requireSeller();
  const path = "/seller/verification";
  const sp = user.sellerProfile;
  if (!sp) back(path, { error: "No seller profile." });
  if (!EDITABLE.includes(sp.status)) back(path, { error: "Your address can't be changed while under review or after approval. Contact support to update it." });
  if (!rateLimit(`loc:${user.id}`, 10, 3600_000)) back(path, { error: "Too many address changes. Try again later." });
  const loc = readLocationForm(fd);
  if (loc.problem) back(path, { error: loc.problem });
  const r = await saveSellerLocation(sp.id, user.id, loc.form);
  await db.user.update({ where: { id: user.id }, data: { state: loc.form.residential.state, postcode: loc.form.residential.postcode, suburb: loc.form.residential.suburb } });
  back(path, r.status === "MANUAL_REVIEW" ? { ok: "Address saved. Some details need a manual check by our team." } : { ok: "Address saved." });
}

/** Seller corrects business type / ABN / ACN while pending. Re-runs the ABR check. */
export async function updateSellerBusinessAction(fd: FormData) {
  const user = await requireSeller();
  const path = "/seller/verification";
  const sp = user.sellerProfile;
  if (!sp) back(path, { error: "No seller profile." });
  if (!EDITABLE.includes(sp.status)) back(path, { error: "Business details can't be changed while under review or after approval. Contact support." });
  if (!rateLimit(`biz:${user.id}`, 10, 3600_000)) back(path, { error: "Too many changes. Try again later." });
  const biz = readSellerBusiness(fd, path);
  if ((biz.sellerType === "BUSINESS") !== (sp.sellerType === "BUSINESS")) back(path, { error: `Switching between an individual and a business seller changes your Seller ID (${sp.sellerCode}). Contact support to do this.` });
  await db.sellerProfile.update({
    where: { id: sp.id },
    data: {
      businessStructure: biz.structure, legalName: biz.legalName, businessName: biz.businessName, abn: biz.abn, acn: biz.acn, authorisedRep: biz.authorisedRep,
      abnConfirmedAt: biz.abnConfirmed ? new Date() : null, businessCheckStatus: "NOT_CHECKED", businessCheckData: Prisma.DbNull, businessCheckedAt: null, businessVerifiedById: null,
    },
  });
  await audit(user.id, "SELLER_BUSINESS_UPDATED", "SellerProfile", sp.id, { structure: biz.structure });
  if (biz.abn || biz.acn) await runBusinessCheck(sp.id, user.id);
  back(path, { ok: "Business details saved." });
}

export async function startPayoutOnboardingAction() {
  const user = await requireSeller();
  const sp = await db.sellerProfile.findUniqueOrThrow({ where: { userId: user.id }, include: { paymentAccount: true } });
  const provider = paymentProvider();
  let acct = sp.paymentAccount;
  if (!acct) {
    const { providerAccountId } = await provider.createConnectedAccount({ email: user.email, businessType: sp.sellerType === "BUSINESS" ? "company" : "individual", sellerProfileId: sp.id });
    acct = await db.paymentAccount.create({ data: { sellerId: sp.id, provider: provider.name, providerAccountId } });
    await audit(user.id, "PAYOUT_ACCOUNT_CREATED", "PaymentAccount", acct.id);
  }
  redirect(await provider.onboardingLink(acct.providerAccountId, "/seller/payouts"));
}

/** TEST provider only: simulates finishing hosted onboarding (in production the provider's webhook does this). */
export async function completeTestOnboardingAction(fd: FormData) {
  if (!(await import("@/lib/payment-provider")).testPaymentsAllowed()) back("/seller/payouts", { error: "Not available." });
  const user = await requireSeller();
  const acct = await db.paymentAccount.findFirst({ where: { providerAccountId: str(fd.get("account")), seller: { userId: user.id } } });
  if (!acct) back("/seller/payouts", { error: "Account not found." });
  const { handleWebhook } = await import("@/lib/payments");
  const { signTestEvent } = await import("@/lib/payment-provider");
  const body = JSON.stringify({ eventId: `evt_test_${crypto.randomUUID()}`, type: "account.updated", account: { providerAccountId: acct!.providerAccountId, chargesEnabled: true, payoutsEnabled: true, restricted: false } });
  await handleWebhook(body, new Headers({ "x-test-signature": signTestEvent(body) }));
  back("/seller/payouts", { ok: "Payout account verified." });
}

export async function updateSellerProfileAction(fd: FormData) {
  const user = await requireSeller();
  const path = "/seller/profile";
  if (!user.sellerProfile) back(path, { error: "No seller profile." });
  const storeSlug = str(fd.get("storeSlug")).toLowerCase() || user.sellerProfile!.sellerCode.toLowerCase();
  const slugErr = storeSlugProblem(storeSlug);
  if (slugErr) back(path, { error: slugErr });
  const taken = await db.sellerProfile.findFirst({ where: { storeSlug, NOT: { id: user.sellerProfile!.id } }, select: { id: true } });
  if (taken) back(path, { error: "That store address is already taken." });
  const publicLocation = optStr(fd.get("publicLocation"))?.slice(0, 80) ?? null;
  if (publicLocation && /\d{1,5}\s+\w+\s+(st|street|rd|road|ave|avenue|dr|drive|ct|court|pl|place|cres|crescent|hwy|highway|ln|lane|way|tce|terrace|blvd|pde|parade)\b/i.test(publicLocation))
    back(path, { error: "Don't put a street address in your public area — use a suburb, region or service area." });
  const social = readSocialLinks(fd);
  if (social.error) back(path, { error: social.error });
  const businessName = optStr(fd.get("businessName"))?.slice(0, 80) ?? null;
  const bio = optStr(fd.get("bio"))?.slice(0, 2000) ?? null;
  await db.sellerProfile.update({ where: { userId: user.id }, data: { bio, businessName, storeSlug, publicLocation, socialLinks: social.links as Prisma.InputJsonValue } });
  await audit(user.id, "SELLER_PROFILE_UPDATED", "SellerProfile", user.sellerProfile!.id, { storeSlug, socialLinks: Object.keys(social.links) });
  back(path, { ok: "Profile updated." });
}

// ---------------------------------------------------------------- listings

export async function saveListingAction(fd: FormData) {
  const user = await requireSeller();
  const id = str(fd.get("id")) || null;
  const intent = str(fd.get("intent")); // draft | submit
  const path = id ? `/seller/listings/${id}` : "/seller/listings/new";
  const existing = id ? await db.listing.findUnique({ where: { id }, include: { images: true } }) : null;
  if (id && (!existing || (existing.sellerId !== user.id && user.role !== "ADMIN"))) back("/seller/listings", { error: "Listing not found." });
  if (existing && ["SOLD", "SUSPENDED"].includes(existing.status)) back(path, { error: "This listing can no longer be edited." });

  const categoryId = str(fd.get("categoryId"));
  const subcategoryId = optStr(fd.get("subcategoryId"));
  const category = await db.category.findUnique({ where: { id: categoryId }, include: { attributes: true } });
  if (!category || category.parentId) back(path, { error: "Choose a category." });
  const sub = subcategoryId ? await db.category.findFirst({ where: { id: subcategoryId, parentId: categoryId }, include: { attributes: true } }) : null;
  if (subcategoryId && !sub) back(path, { error: "Invalid subcategory." });

  const title = str(fd.get("title"));
  const description = str(fd.get("description"));
  const price = toCents(fd.get("price"));
  const declaredValue = str(fd.get("declaredValue")) ? toCents(fd.get("declaredValue")) : null;
  const deliveryFee = str(fd.get("deliveryFee")) ? toCents(fd.get("deliveryFee")) : 0;
  const quantity = Math.max(1, Math.floor(Number(fd.get("quantity")) || 1));
  const location = str(fd.get("location"));
  if (title.length < 5 || title.length > 120) back(path, { error: "Title must be 5–120 characters." });
  if (isNaN(price) || price <= 0) back(path, { error: "Enter a valid price." });
  if (declaredValue !== null && isNaN(declaredValue)) back(path, { error: "Invalid declared value." });
  if (isNaN(deliveryFee)) back(path, { error: "Invalid delivery fee." });

  const attrs = [...category!.attributes, ...(sub?.attributes ?? [])];
  const attrValues = attrs.map((a) => ({ a, v: str(fd.get(`attr_${a.id}`)) }));
  if (intent === "submit") {
    if (!canSubmitListings(user)) back(path, { error: "Your seller account must be verified and approved before you can submit listings. Save as draft for now." });
    if (description.length < 20) back(path, { error: "Description must be at least 20 characters." });
    if (!location) back(path, { error: "Enter the product location." });
    const missing = attrValues.filter(({ a, v }) => a.required && !v).map(({ a }) => a.label);
    if (missing.length) back(path, { error: `Required: ${missing.join(", ")}.` });
  }
  for (const { a, v } of attrValues) {
    if (!v) continue;
    if (a.type === "number" && isNaN(Number(v))) back(path, { error: `${a.label} must be a number.` });
    if (a.type === "select" && a.options && !a.options.split(",").includes(v)) back(path, { error: `Invalid ${a.label}.` });
  }

  let newImages: string[] = [];
  let videoUrl: string | null = existing?.videoUrl ?? null;
  try {
    newImages = await saveImages(fd.getAll("images"), 12 - (existing?.images.length ?? 0));
    const v = await saveVideo(fd.get("video"));
    if (v) videoUrl = v;
  } catch (e) {
    if (e instanceof UploadError) back(path, { error: e.message });
    throw e;
  }
  if (fd.get("removeVideo") === "on") videoUrl = null;
  const removeIds = fd.getAll("removeImage").map(String);
  const mainImage = str(fd.get("mainImage"));

  let status = existing?.status ?? "DRAFT";
  let publishedAt = existing?.publishedAt ?? null;
  if (intent === "submit") {
    const needApproval = await getBool("rule_listing_require_approval");
    const trustedAuto = (await getBool("rule_trusted_seller_auto_approve")) && !!user.sellerProfile?.trustedSeller;
    status = !needApproval || trustedAuto || user.role === "ADMIN" ? "ACTIVE" : "PENDING";
    if (status === "ACTIVE") publishedAt = new Date();
  } else if (existing && ["ACTIVE", "PAUSED"].includes(existing.status)) {
    // editing a live listing: material edits go back for review
    const needApproval = await getBool("rule_listing_require_approval");
    if (needApproval && !(user.sellerProfile?.trustedSeller && (await getBool("rule_trusted_seller_auto_approve")))) status = "PENDING";
  }

  const data = {
    title, description, price, declaredValue, deliveryFee, quantity, location,
    categoryId, subcategoryId: sub?.id ?? null,
    condition: ["NEW", "USED", "REFURBISHED"].includes(str(fd.get("condition"))) ? str(fd.get("condition")) : "USED",
    brand: optStr(fd.get("brand")) ?? attrValues.find(({ a }) => a.key === "brand" || a.key === "make")?.v ?? null,
    model: optStr(fd.get("model")) ?? attrValues.find(({ a }) => a.key === "model")?.v ?? null,
    state: optStr(fd.get("state")), postcode: optStr(fd.get("postcode")),
    contactPhone: optStr(fd.get("contactPhone")), contactEmail: optStr(fd.get("contactEmail")),
    allowEnquiry: fd.get("allowEnquiry") === "on",
    allowCheckout: !category!.highValue && fd.get("allowCheckout") === "on",
    availability: str(fd.get("availability")) || "AVAILABLE",
    seoTitle: optStr(fd.get("seoTitle")), seoDescription: optStr(fd.get("seoDescription")), keywords: optStr(fd.get("keywords")),
    videoUrl, status, publishedAt,
    expiresAt: status === "ACTIVE" ? new Date(Date.now() + (await getNumber("listing_days_active")) * 86400_000) : existing?.expiresAt ?? null,
    statusReason: intent === "submit" ? null : existing?.statusReason ?? null,
  };

  const listing = await db.$transaction(async (tx) => {
    const l = existing
      ? await tx.listing.update({ where: { id: existing.id }, data: { ...data, ...(existing.slug ? {} : { slug: newListingSlug(title) }) } })
      : await tx.listing.create({ data: { ...data, slug: newListingSlug(title), sellerId: user.id } });
    // Pay Per Item: listing/relist fee when it goes live (auto-approved path); disclosed on the form beforehand
    if (status === "ACTIVE" && existing?.status !== "ACTIVE" && user.role !== "ADMIN") {
      await chargeOnActivation(tx, existing ?? { id: l.id, sellerId: user.id, title, categoryId, publishedAt: null, expiresAt: null }, user.id);
    }
    if (removeIds.length) await tx.listingImage.deleteMany({ where: { listingId: l.id, id: { in: removeIds } } });
    const start = existing ? existing.images.length : 0;
    for (const [i, url] of newImages.entries()) await tx.listingImage.create({ data: { listingId: l.id, url, sortOrder: start + i } });
    if (mainImage) {
      await tx.listingImage.updateMany({ where: { listingId: l.id }, data: { sortOrder: { increment: 1 } } });
      await tx.listingImage.updateMany({ where: { listingId: l.id, id: mainImage }, data: { sortOrder: 0 } });
    }
    await tx.listingAttribute.deleteMany({ where: { listingId: l.id, attributeId: { notIn: attrs.map((a) => a.id) } } });
    for (const { a, v } of attrValues) {
      if (v) await tx.listingAttribute.upsert({ where: { listingId_attributeId: { listingId: l.id, attributeId: a.id } }, create: { listingId: l.id, attributeId: a.id, value: v.slice(0, 200) }, update: { value: v.slice(0, 200) } });
      else await tx.listingAttribute.deleteMany({ where: { listingId: l.id, attributeId: a.id } });
    }
    await audit(user.id, existing ? "LISTING_UPDATED" : "LISTING_CREATED", "Listing", l.id, { status }, tx);
    return l;
  });

  const msg = status === "PENDING" ? "Submitted for approval — you'll be notified once it's reviewed." : status === "ACTIVE" ? "Listing published." : "Draft saved.";
  back(`/seller/listings/${listing.id}`, { ok: msg });
}

/** Seller asks for featured placement; an admin decides (the featured fee, if any, is charged on approval). */
export async function requestFeaturedAction(fd: FormData) {
  const user = await requireSeller();
  const id = str(fd.get("id"));
  const path = `/seller/listings/${id}`;
  const l = await db.listing.findUnique({ where: { id } });
  if (!l || l.sellerId !== user.id) back("/seller/listings", { error: "Not found." });
  if (l!.status !== "ACTIVE") back(path, { error: "Only live listings can be featured." });
  if (l!.featured) back(path, { error: "This listing is already featured." });
  if (!rateLimit(`feat:${id}`, 2, 86_400_000)) back(path, { error: "You've already requested this recently." });
  await audit(user.id, "LISTING_FEATURE_REQUESTED", "Listing", id);
  const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
  for (const a of admins) await notify(a.id, { type: "FEATURE_REQUEST", title: `Featured placement requested: ${l!.title}`, body: `Seller ${user.sellerProfile?.sellerCode ?? user.publicId}`, link: `/admin/listings?q=${encodeURIComponent(l!.title)}`, email: false });
  back(path, { ok: "Request sent. You'll be notified when it's reviewed." });
}

export async function listingStatusAction(fd: FormData) {
  const user = await requireSeller();
  const id = str(fd.get("id"));
  const op = str(fd.get("op"));
  const path = `/seller/listings/${id}`;
  const l = await db.listing.findUnique({ where: { id } });
  if (!l || (l.sellerId !== user.id && user.role !== "ADMIN")) back("/seller/listings", { error: "Not found." });
  const transitions: Record<string, [string[], string]> = { pause: [["ACTIVE"], "PAUSED"], resume: [["PAUSED"], "ACTIVE"], sold: [["ACTIVE", "PAUSED"], "SOLD"], withdraw: [["PENDING"], "DRAFT"], relist: [["EXPIRED"], "PENDING"] };
  if (op === "delete") {
    if (!["DRAFT", "REJECTED", "EXPIRED", "PAUSED"].includes(l!.status)) back(path, { error: "Only drafts, rejected, expired or paused listings can be deleted." });
    if (await db.orderItem.count({ where: { listingId: id } })) back(path, { error: "This listing has orders and can't be deleted — mark it sold instead." });
    if (await db.sale.count({ where: { listingId: id } })) back(path, { error: "This listing has a recorded sale and can't be deleted." });
    await db.listing.delete({ where: { id } });
    await audit(user.id, "LISTING_DELETED", "Listing", id);
    back("/seller/listings", { ok: "Listing deleted." });
  }
  const t = transitions[op];
  if (!t || !t[0].includes(l!.status)) back(path, { error: "That action isn't available." });
  await db.listing.update({ where: { id }, data: { status: t[1], ...(op === "resume" ? {} : {}) } });
  await audit(user.id, `LISTING_${op.toUpperCase()}`, "Listing", id);
  back(path, { ok: `Listing ${t[1].toLowerCase()}.` });
}

// ---------------------------------------------------------------- orders, enquiries, sales

export async function fulfilOrderAction(fd: FormData) {
  const user = await requireSeller();
  await attempt("/seller/orders", async () => {
    await markOrderFulfilled(str(fd.get("orderId")), user.id);
    return "Marked as shipped — the buyer will be asked to confirm receipt.";
  });
}

export async function replyEnquiryAction(fd: FormData) {
  const user = await requireSeller();
  const e = await db.enquiry.findUnique({ where: { id: str(fd.get("id")) }, include: { listing: true } });
  if (!e || e.sellerId !== user.id) back("/seller/enquiries", { error: "Not found." });
  const reply = str(fd.get("reply"));
  if (!reply) back("/seller/enquiries", { error: "Write a reply." });
  await db.enquiry.update({ where: { id: e!.id }, data: { reply: reply.slice(0, 2000), repliedAt: new Date(), status: "REPLIED" } });
  await notify(e!.buyerId, { type: "ENQUIRY_REPLY", title: `Reply about ${e!.listing.title}`, body: reply.slice(0, 500), link: "/account/enquiries" });
  back("/seller/enquiries", { ok: "Reply sent." });
}

export async function reportSaleAction(fd: FormData) {
  const user = await requireSeller();
  await attempt("/seller/sales", async () => {
    const price = toCents(fd.get("salePrice"));
    const s = await reportOfflineSale(user.id, str(fd.get("listingId")), str(fd.get("buyerId")), price, optStr(fd.get("note")));
    return `Sale ${s.saleNumber} reported. The buyer has been asked to confirm.`;
  });
}

// ---------------------------------------------------------------- offers

export async function saveOfferAction(fd: FormData) {
  const user = await requireSeller();
  const path = "/seller/offers";
  if (!canSubmitListings(user)) back(path, { error: "Your seller account must be approved first." });
  const type = str(fd.get("type"));
  if (!["PERCENT", "FIXED", "FREE_DELIVERY"].includes(type)) back(path, { error: "Choose a discount type." });
  const rawValue = Number(fd.get("value"));
  const value = type === "PERCENT" ? Math.round(rawValue * 100) : type === "FIXED" ? toCents(fd.get("value")) : 0;
  if (type === "PERCENT" && (!(rawValue > 0) || rawValue > 90)) back(path, { error: "Percentage must be between 0 and 90." });
  if (type === "FIXED" && !(value > 0)) back(path, { error: "Enter a discount amount." });
  const startsAt = new Date(str(fd.get("startsAt")));
  const endsAt = new Date(str(fd.get("endsAt")));
  if (isNaN(startsAt.getTime()) || isNaN(endsAt.getTime()) || endsAt <= startsAt) back(path, { error: "Check the start and expiry dates." });
  const listingId = optStr(fd.get("listingId"));
  if (listingId && !(await db.listing.findFirst({ where: { id: listingId, sellerId: user.id } }))) back(path, { error: "Invalid product." });
  const coupon = optStr(fd.get("couponCode"))?.toUpperCase().replace(/[^A-Z0-9]/g, "") ?? null;
  const needApproval = await getBool("rule_offer_require_approval");
  await attempt(path, async () => {
    const o = await db.offer.create({
      data: {
        sellerId: user.id, name: str(fd.get("name")) || "Offer", description: optStr(fd.get("description")), listingId, categoryId: optStr(fd.get("categoryId")),
        type, value, minQuantity: Math.max(1, Number(fd.get("minQuantity")) || 1), minSubtotal: str(fd.get("minSubtotal")) ? toCents(fd.get("minSubtotal")) || 0 : 0,
        maxDiscount: str(fd.get("maxDiscount")) ? toCents(fd.get("maxDiscount")) : null, couponCode: coupon, startsAt, endsAt,
        usageLimit: Number(fd.get("usageLimit")) || null, perBuyerLimit: Number(fd.get("perBuyerLimit")) || null,
        status: needApproval ? "PENDING" : "APPROVED",
      },
    });
    await audit(user.id, "OFFER_CREATED", "Offer", o.id);
    return needApproval ? "Offer submitted for approval." : "Offer is live.";
  });
}

export async function offerStatusAction(fd: FormData) {
  const user = await requireSeller();
  const o = await db.offer.findUnique({ where: { id: str(fd.get("id")) } });
  if (!o || o.sellerId !== user.id) back("/seller/offers", { error: "Not found." });
  const op = str(fd.get("op"));
  if (op === "pause" && o!.status === "APPROVED") await db.offer.update({ where: { id: o!.id }, data: { status: "PAUSED" } });
  else if (op === "resume" && o!.status === "PAUSED") await db.offer.update({ where: { id: o!.id }, data: { status: "APPROVED" } });
  else if (op === "delete" && o!.usedCount === 0) await db.offer.delete({ where: { id: o!.id } });
  else back("/seller/offers", { error: "Not available." });
  back("/seller/offers", { ok: "Updated." });
}

// ---------------------------------------------------------------- campaigns

export async function saveCampaignAction(fd: FormData) {
  const user = await requireSeller();
  const id = str(fd.get("id")) || null;
  const intent = str(fd.get("intent"));
  const path = id ? `/seller/campaigns/${id}/edit` : "/seller/campaigns/new";
  const existing = id ? await db.campaign.findUnique({ where: { id }, include: { images: true } }) : null;
  if (id && (!existing || existing.sellerId !== user.id)) back("/seller/campaigns", { error: "Campaign not found." });
  if (existing && !["DRAFT", "REJECTED"].includes(existing.status)) back(`/seller/campaigns/${id}`, { error: "Submitted campaigns can't be edited. Use an extension request to change dates." });

  const sp = user.sellerProfile;
  const ticketType = str(fd.get("ticketType")) === "PAID" ? "PAID" : "FREE";
  if (user.role !== "ADMIN") {
    if (!sp || !canSubmitListings(user)) back(path, { error: "Your seller account must be approved first." });
    if (ticketType === "FREE" && !sp!.canRunFreeDraws) back(path, { error: "You don't have permission to run free-entry campaigns. Contact the platform to request it." });
    if (ticketType === "PAID" && !sp!.canRunPaidDraws) back(path, { error: "You don't have permission to run paid campaigns." });
  }
  const tz = TIMEZONES.includes(str(fd.get("timezone")) as never) ? str(fd.get("timezone")) : "Australia/Sydney";
  const salesOpenAt = zonedToUtc(str(fd.get("salesOpenAt")), tz);
  const salesCloseAt = zonedToUtc(str(fd.get("salesCloseAt")), tz);
  const drawAt = zonedToUtc(str(fd.get("drawAt")), tz);
  if (!salesOpenAt || !salesCloseAt || !drawAt) back(path, { error: "Enter all campaign dates." });
  const listingId = optStr(fd.get("listingId"));
  if (listingId) {
    const l = await db.listing.findFirst({ where: { id: listingId, sellerId: user.id } });
    if (!l || l.status !== "ACTIVE") back(path, { error: "A campaign can only promote one of your approved (published) products." });
  }
  const prizeValue = toCents(fd.get("prizeValue"));
  const ticketPrice = ticketType === "PAID" ? toCents(fd.get("ticketPrice")) : 0;
  const totalTickets = Math.floor(Number(fd.get("totalTickets")));
  const maxPerBuyer = Math.floor(Number(fd.get("maxPerBuyer")));
  const allowedStates = fd.getAll("allowedStates").map(String).join(",") || null;
  const data = {
    title: str(fd.get("title")), description: str(fd.get("description")), prizeName: str(fd.get("prizeName")), prizeValue, prizeDelivery: str(fd.get("prizeDelivery")),
    ticketType, ticketPrice, totalTickets, maxPerBuyer, drawMode: str(fd.get("drawMode")) === "SOLD_OUT" ? "SOLD_OUT" : "FIXED",
    salesOpenAt: salesOpenAt!, salesCloseAt: salesCloseAt!, drawAt: drawAt!, timezone: tz, terms: str(fd.get("terms")), fallbackProcedure: optStr(fd.get("fallbackProcedure")),
    allowedStates, minAge: Math.max(18, Number(fd.get("minAge")) || 18), requireIdVerification: fd.get("requireIdVerification") === "on",
    permitNumber: optStr(fd.get("permitNumber")), legalNotes: optStr(fd.get("legalNotes")), listingId,
  };
  const req = { title: data.title, description: data.description, prizeName: data.prizeName, prizeDelivery: data.prizeDelivery, terms: data.terms };
  for (const [k, v] of Object.entries(req)) if (!v) back(path, { error: `Missing ${k.replace(/([A-Z])/g, " $1").toLowerCase()}.` });
  if (isNaN(prizeValue) || prizeValue <= 0) back(path, { error: "Enter the prize value." });
  if (isNaN(ticketPrice)) back(path, { error: "Invalid ticket price." });
  if (!(totalTickets > 0 && totalTickets <= 1_000_000)) back(path, { error: "Total tickets must be 1–1,000,000." });
  if (intent === "submit") {
    if (salesOpenAt! < new Date(Date.now() - 60_000)) back(path, { error: "Sales opening must be in the future." });
    const problems = await campaignComplianceProblems(data);
    if (problems.length) back(path, { error: problems.join(" ") });
  }

  let images: string[] = [];
  try {
    images = await saveImages(fd.getAll("images"), 8 - (existing?.images.length ?? 0));
  } catch (e) {
    if (e instanceof UploadError) back(path, { error: e.message });
    throw e;
  }

  const status = intent === "submit" ? "PENDING_APPROVAL" : "DRAFT";
  const c = await db.$transaction(async (tx) => {
    const c = existing
      ? await tx.campaign.update({ where: { id: existing.id }, data: { ...data, status, statusReason: null } })
      : await tx.campaign.create({ data: { ...data, status, sellerId: user.id, slug: `${slugify(data.title)}-${crypto.randomBytes(3).toString("hex")}` } });
    for (const [i, url] of images.entries()) await tx.campaignImage.create({ data: { campaignId: c.id, url, sortOrder: (existing?.images.length ?? 0) + i } });
    if (intent === "submit") {
      await tx.drawSchedule.updateMany({ where: { campaignId: c.id, status: "PROPOSED" }, data: { status: "REJECTED", reviewNote: "Superseded by resubmission" } });
      await tx.drawSchedule.create({ data: { campaignId: c.id, kind: "INITIAL", drawAt: c.drawAt, salesCloseAt: c.salesCloseAt, timezone: c.timezone, reason: "Initial schedule", proposedById: user.id } });
      await drawAudit(tx, c.id, "CAMPAIGN_SUBMITTED", user.id, { ticketType, totalTickets, ticketPrice, drawAt: c.drawAt, salesCloseAt: c.salesCloseAt });
    }
    return c;
  });
  if (intent === "submit") {
    const admins = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    for (const a of admins) await notify(a.id, { type: "CAMPAIGN_REVIEW", title: `Campaign awaiting approval: ${c.title}`, body: `${ticketType} · ${totalTickets} tickets`, link: `/admin/campaigns/${c.id}`, email: false });
  }
  back(`/seller/campaigns/${c.id}`, { ok: intent === "submit" ? "Submitted for compliance review and approval." : "Draft saved." });
}

export async function requestExtensionAction(fd: FormData) {
  const user = await requireSeller();
  const id = str(fd.get("campaignId"));
  const path = `/seller/campaigns/${id}`;
  const c = await db.campaign.findUnique({ where: { id }, include: { schedules: { where: { status: "PROPOSED" } } } });
  if (!c || c.sellerId !== user.id) back("/seller/campaigns", { error: "Not found." });
  if (!["APPROVED", "SALES_CLOSED"].includes(c!.status)) back(path, { error: "Date changes can only be requested for approved campaigns before the draw." });
  if (c!.schedules.length) back(path, { error: "You already have a pending date request." });
  const reason = str(fd.get("reason"));
  if (reason.length < 10) back(path, { error: "Explain the reason for the change (10+ characters)." });
  const drawAt = zonedToUtc(str(fd.get("drawAt")), c!.timezone);
  const salesCloseAt = c!.lockedAt ? c!.salesCloseAt : zonedToUtc(str(fd.get("salesCloseAt")), c!.timezone);
  if (!drawAt || !salesCloseAt) back(path, { error: "Enter the requested dates." });
  if (drawAt! < salesCloseAt! || drawAt! < new Date()) back(path, { error: "The draw must be in the future and after sales close." });
  await db.$transaction(async (tx) => {
    const s = await tx.drawSchedule.create({ data: { campaignId: c!.id, kind: "EXTENSION", drawAt: drawAt!, salesCloseAt: salesCloseAt!, timezone: c!.timezone, reason, proposedById: user.id } });
    await drawAudit(tx, c!.id, "EXTENSION_REQUESTED", user.id, { scheduleId: s.id, current: { drawAt: c!.drawAt, salesCloseAt: c!.salesCloseAt }, requested: { drawAt, salesCloseAt }, reason });
  });
  back(path, { ok: "Extension request sent. The published draw date does not change unless an admin approves it." });
}

export async function withdrawCampaignAction(fd: FormData) {
  const user = await requireSeller();
  const id = str(fd.get("campaignId"));
  const c = await db.campaign.findUnique({ where: { id } });
  if (!c || c.sellerId !== user.id || c.status !== "PENDING_APPROVAL") back(`/seller/campaigns/${id}`, { error: "Not available." });
  await db.$transaction(async (tx) => {
    await tx.campaign.update({ where: { id }, data: { status: "DRAFT" } });
    await tx.drawSchedule.updateMany({ where: { campaignId: id, status: "PROPOSED" }, data: { status: "REJECTED", reviewNote: "Withdrawn by seller" } });
    await drawAudit(tx, id, "CAMPAIGN_WITHDRAWN", user.id, {});
  });
  back(`/seller/campaigns/${id}`, { ok: "Withdrawn to draft." });
}

export async function deleteCampaignDraftAction(fd: FormData) {
  const user = await requireSeller();
  const id = str(fd.get("campaignId"));
  const c = await db.campaign.findUnique({ where: { id } });
  if (!c || c.sellerId !== user.id || !["DRAFT", "REJECTED"].includes(c.status) || c.ticketsAllocated > 0) back(`/seller/campaigns/${id}`, { error: "Only unsubmitted drafts can be deleted." });
  if (await db.drawAuditLog.count({ where: { campaignId: id } })) back(`/seller/campaigns/${id}`, { error: "This campaign has audit history and is kept for the record." });
  await db.campaign.delete({ where: { id } });
  back("/seller/campaigns", { ok: "Draft deleted." });
}

