import "server-only";
// Seller verification service: consent records, location module, ABN/ACN checks and the activation checklist.
// Every gate here is enforced server-side; the UI only displays it.

import type { Prisma, SellerDocument, SellerProfile, User } from "@prisma/client";
import { db, type Tx } from "./db";
import { decrypt, encrypt } from "./crypto";
import { audit } from "./audit";
import { str, optStr } from "./format";
import { distanceMetres, isStructure, BUSINESS_STRUCTURES, type BusinessStructure } from "./au-validation";
import { addressProblem, evaluateLocation, type AddressFields, type LocationStatus, type StoredGeo } from "./seller-location";
import { geocodeAddress } from "./geocode";
import { checkBusiness, type BusinessCheck } from "./abr";
import { getBool } from "./settings";

export const MIN_SELLER_AGE = 18;

// ------------------------------------------------------------------ consent

/** Current legal document versions = last-updated time of the CMS pages (changes whenever an admin edits them). */
export async function legalVersions(tx: Tx = db) {
  const pages = await tx.page.findMany({ where: { slug: { in: ["terms", "privacy"] } }, select: { slug: true, updatedAt: true } });
  const v = (slug: string) => pages.find((p) => p.slug === slug)?.updatedAt.toISOString() ?? "unversioned";
  return { TERMS: v("terms"), PRIVACY: v("privacy") };
}

export async function requestMeta() {
  const { headers } = await import("next/headers");
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

/** Reads the consent checkboxes. Terms and Privacy are mandatory and separate; marketing is optional. */
export function readConsent(fd: FormData) {
  return { terms: fd.get("acceptTerms") === "on", privacy: fd.get("acceptPrivacy") === "on", marketing: fd.get("marketingOptIn") === "on" };
}
export const consentProblem = (c: ReturnType<typeof readConsent>) =>
  !c.terms ? "You must accept the Terms & Conditions." : !c.privacy ? "You must accept the Privacy Policy." : null;

export async function recordConsents(userId: string, c: ReturnType<typeof readConsent>, meta: { ip: string | null; userAgent: string | null }, tx: Tx = db) {
  const v = await legalVersions(tx);
  const rows: Prisma.ConsentRecordCreateManyInput[] = [
    { userId, type: "TERMS", version: v.TERMS, ip: meta.ip, userAgent: meta.userAgent },
    { userId, type: "PRIVACY", version: v.PRIVACY, ip: meta.ip, userAgent: meta.userAgent },
  ];
  if (c.marketing) rows.push({ userId, type: "MARKETING", version: "opt-in", ip: meta.ip, userAgent: meta.userAgent });
  await tx.consentRecord.createMany({ data: rows });
  await tx.user.update({ where: { id: userId }, data: { termsAcceptedAt: new Date(), ...(c.marketing ? { marketingOptIn: true, marketingOptInAt: new Date() } : {}) } });
}

// ------------------------------------------------------------------ location: form, storage, evaluation

export type ResidentialAddress = AddressFields;
export type LocationForm = { residential: AddressFields; business: AddressFields | null; pin: { lat: number; lng: number } | null; pinConfirmed: boolean };

function readAddress(fd: FormData, p: string): AddressFields {
  return {
    country: str(fd.get(`${p}country`)) || "AU",
    street: str(fd.get(`${p}street`)).replace(/\s+/g, " "),
    unit: optStr(fd.get(`${p}unit`)),
    suburb: str(fd.get(`${p}suburb`)).replace(/\s+/g, " "),
    state: str(fd.get(`${p}state`)),
    postcode: str(fd.get(`${p}postcode`)),
  };
}

export function readLocationForm(fd: FormData): { form: LocationForm; problem: string | null } {
  const residential = readAddress(fd, "res_");
  const differs = fd.get("businessAddressDifferent") === "on";
  const business = differs ? readAddress(fd, "bus_") : null;
  const lat = Number(fd.get("pinLat"));
  const lng = Number(fd.get("pinLng"));
  const pin = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
  const pinConfirmed = fd.get("pinConfirmed") === "on";
  const problem =
    addressProblem(residential, "Residential address") ??
    (business ? addressProblem(business, "Business address") : null) ??
    (!pin ? "Find your address on the map, then confirm the pin." : !pinConfirmed ? "Confirm that the map pin shows your address." : null);
  return { form: { residential, business, pin, pinConfirmed }, problem };
}

export type DecryptedLocation = { residential: AddressFields | null; business: AddressFields | null; geo: StoredGeo | null };

export function readStoredLocation(sp: Pick<SellerProfile, "streetAddressEnc" | "businessAddressEnc" | "geoEnc" | "country" | "suburb" | "state" | "postcode">): DecryptedLocation {
  const dec = <T,>(v: string | null): T | null => {
    if (!v) return null;
    try { return JSON.parse(decrypt(v)) as T; } catch { return null; }
  };
  const street = dec<{ street: string; unit: string | null }>(sp.streetAddressEnc);
  return {
    residential: street && sp.suburb && sp.state && sp.postcode ? { country: sp.country, street: street.street, unit: street.unit, suburb: sp.suburb, state: sp.state, postcode: sp.postcode } : null,
    business: dec<AddressFields>(sp.businessAddressEnc),
    geo: dec<StoredGeo>(sp.geoEnc),
  };
}

export const oneLine = (a: AddressFields | null) => (a ? `${a.unit ? `${a.unit}/` : ""}${a.street}, ${a.suburb} ${a.state} ${a.postcode}` : "—");
export const localityOnly = (a: Pick<AddressFields, "suburb" | "state" | "postcode">) => `${a.suburb} ${a.state} ${a.postcode}`;

const proofAccepted = (docs: Pick<SellerDocument, "documentType" | "status">[]) => docs.some((d) => d.documentType === "PROOF_OF_ADDRESS" && d.status === "ACCEPTED");

/** Geocodes and stores the seller's location (encrypted), then evaluates it. Geocoder outages never block saving. */
export async function saveSellerLocation(sellerId: string, actorId: string, form: LocationForm) {
  const sp = await db.sellerProfile.findUniqueOrThrow({ where: { id: sellerId }, include: { documents: true } });
  let geocoded: StoredGeo["geocoded"] = null;
  let geocodeError: string | null = null;
  try {
    const g = await geocodeAddress(form.residential);
    if (g) geocoded = { lat: g.lat, lng: g.lng, suburb: g.suburb, postcode: g.postcode, state: g.state, formatted: g.formatted, precision: g.precision, provider: g.provider };
  } catch (e) {
    geocodeError = e instanceof Error ? e.message : String(e);
  }
  const geo: StoredGeo = { pin: form.pin, geocoded, distanceM: geocoded && form.pin ? Math.round(distanceMetres(geocoded, form.pin)) : null, checkedAt: new Date().toISOString() };
  const ev = evaluateLocation({ address: form.residential, geo, pinConfirmed: form.pinConfirmed, proofOfAddressAccepted: proofAccepted(sp.documents) });
  const problems = geocodeError ? ["The geocoding service was unavailable — an admin will check the address.", ...ev.problems] : ev.problems;
  const status: LocationStatus = geocodeError && ev.status !== "FAILED" ? "MANUAL_REVIEW" : ev.status;
  const r = form.residential;
  await db.sellerProfile.update({
    where: { id: sellerId },
    data: {
      country: r.country, suburb: r.suburb, state: r.state, postcode: r.postcode,
      address: localityOnly(r), // non-sensitive summary; street address is only stored encrypted
      streetAddressEnc: encrypt(JSON.stringify({ street: r.street, unit: r.unit })),
      businessAddressEnc: form.business ? encrypt(JSON.stringify(form.business)) : null,
      geoEnc: encrypt(JSON.stringify(geo)),
      pinConfirmedAt: form.pinConfirmed ? new Date() : null,
      locationStatus: status, locationNotes: problems.join(" ") || null, locationCheckedAt: new Date(),
      locationVerifiedById: null, locationVerifiedAt: status === "VERIFIED" ? new Date() : null, locationMethod: status === "VERIFIED" ? "AUTO_DOCUMENT" : null,
    },
  });
  await audit(actorId, "SELLER_LOCATION_SAVED", "SellerProfile", sellerId, { status, distanceM: geo.distanceM, precision: geocoded?.precision ?? null, provider: geocoded?.provider ?? null, problems });
  return { status, problems };
}

/** Re-evaluates after a document decision. Never overrides an admin's manual VERIFIED/FAILED decision. */
export async function refreshLocationStatus(sellerId: string, tx: Tx = db) {
  const sp = await tx.sellerProfile.findUniqueOrThrow({ where: { id: sellerId }, include: { documents: true } });
  if (sp.locationMethod === "MANUAL") return sp.locationStatus;
  const loc = readStoredLocation(sp);
  if (!loc.residential || !loc.geo) return sp.locationStatus;
  if (sp.locationStatus === "MANUAL_REVIEW" || sp.locationStatus === "FAILED") return sp.locationStatus; // needs an admin
  const ev = evaluateLocation({ address: loc.residential, geo: loc.geo, pinConfirmed: !!sp.pinConfirmedAt, proofOfAddressAccepted: proofAccepted(sp.documents) });
  if (ev.status !== sp.locationStatus) {
    await tx.sellerProfile.update({
      where: { id: sellerId },
      data: { locationStatus: ev.status, locationNotes: ev.problems.join(" ") || null, locationCheckedAt: new Date(), locationVerifiedAt: ev.status === "VERIFIED" ? new Date() : null, locationMethod: ev.status === "VERIFIED" ? "AUTO_DOCUMENT" : null },
    });
  }
  return ev.status;
}

// ------------------------------------------------------------------ business (ABN / ACN)

export function structureOf(sp: Pick<SellerProfile, "businessStructure" | "sellerType">): BusinessStructure {
  if (sp.businessStructure && isStructure(sp.businessStructure)) return sp.businessStructure;
  return sp.sellerType === "BUSINESS" ? "REGISTERED_BUSINESS" : "INDIVIDUAL"; // records created before the 6-type form
}

export async function runBusinessCheck(sellerId: string, actorId: string | null) {
  const sp = await db.sellerProfile.findUniqueOrThrow({ where: { id: sellerId } });
  const result: BusinessCheck = await checkBusiness({ structure: structureOf(sp), legalName: sp.legalName, businessName: sp.businessName, abn: sp.abn, acn: sp.acn });
  await db.sellerProfile.update({
    where: { id: sellerId },
    data: { businessCheckStatus: result.status, businessCheckData: result as unknown as Prisma.InputJsonValue, businessCheckedAt: new Date(), businessVerifiedById: null },
  });
  await audit(actorId, "SELLER_BUSINESS_CHECKED", "SellerProfile", sellerId, { status: result.status, problems: result.problems });
  return result;
}

// ------------------------------------------------------------------ activation checklist

export type CheckState = "done" | "pending" | "problem" | "na";
export type CheckItem = { key: string; label: string; state: CheckState; detail: string };

type SellerWithDocs = SellerProfile & { documents: Pick<SellerDocument, "documentType" | "status">[] };
type UserLite = Pick<User, "emailVerifiedAt" | "mobileVerifiedAt" | "mobile" | "dateOfBirth" | "termsAcceptedAt" | "accountStatus">;

export async function sellerChecklist(user: UserLite & { id: string }, sp: SellerWithDocs, tx: Tx = db): Promise<CheckItem[]> {
  const structure = structureOf(sp);
  const rule = BUSINESS_STRUCTURES[structure];
  const consents = await tx.consentRecord.findMany({ where: { userId: user.id, type: { in: ["TERMS", "PRIVACY"] } }, select: { type: true } });
  const hasConsent = (consents.some((c) => c.type === "TERMS") && consents.some((c) => c.type === "PRIVACY")) || !!user.termsAcceptedAt;
  const docs = sp.documents.filter((d) => d.status !== "REJECTED");
  const idDoc = docs.find((d) => d.documentType.startsWith("ID_"));
  const age = user.dateOfBirth ? Math.floor((Date.now() - user.dateOfBirth.getTime()) / (365.2425 * 86_400_000)) : null;
  const requireDocs = await getBool("rule_seller_require_documents", tx);
  const needsBusinessCheck = rule.abn === "required" || !!sp.abn || !!sp.acn; // ACN-required structures also require an ABN
  const bizDone = sp.businessCheckStatus === "VERIFIED";
  const bizProblem = ["MISMATCH", "INACTIVE", "NOT_FOUND"].includes(sp.businessCheckStatus);
  return [
    { key: "email", label: "Email verified", state: user.emailVerifiedAt ? "done" : "pending", detail: user.emailVerifiedAt ? "Verified" : "Open the link we emailed you" },
    { key: "mobile", label: "Mobile OTP verified", state: user.mobileVerifiedAt ? "done" : "pending", detail: user.mobileVerifiedAt ? `Verified (${user.mobile})` : "Enter the SMS code at /verify" },
    {
      key: "business", label: "ABN / ACN validation",
      state: !needsBusinessCheck ? "na" : bizDone ? "done" : bizProblem ? "problem" : "pending",
      detail: !needsBusinessCheck ? "Not required for individuals without an ABN" : `${sp.abn ? `ABN ${sp.abn}` : ""}${sp.acn ? ` ACN ${sp.acn}` : ""} — ${({ NOT_CHECKED: "awaiting check", VERIFIED: "verified", MISMATCH: "details don't match the ABR", INACTIVE: "ABN inactive", NOT_FOUND: "not found on the ABR", MANUAL_REVIEW: "under manual review" } as Record<string, string>)[sp.businessCheckStatus] ?? sp.businessCheckStatus}${needsBusinessCheck && !sp.abnConfirmedAt ? " · ownership not confirmed" : ""}`,
    },
    {
      key: "location", label: "Location verification",
      state: sp.locationStatus === "VERIFIED" ? "done" : sp.locationStatus === "FAILED" ? "problem" : "pending",
      detail: sp.locationStatus === "NOT_VERIFIED" ? "Enter your address and confirm the map pin" : sp.locationNotes ?? sp.locationStatus.replace(/_/g, " ").toLowerCase(),
    },
    {
      key: "identity", label: "Identity & age",
      state: !user.dateOfBirth ? "pending" : age !== null && age < MIN_SELLER_AGE ? "problem" : idDoc?.status === "ACCEPTED" || !requireDocs ? "done" : "pending",
      detail: !user.dateOfBirth ? "Date of birth missing" : age !== null && age < MIN_SELLER_AGE ? `Must be ${MIN_SELLER_AGE}+` : !requireDocs && !idDoc ? "Date of birth confirmed (photo ID not required by current rules)" : idDoc ? (idDoc.status === "ACCEPTED" ? "Photo ID accepted" : "Photo ID uploaded — awaiting review") : "Upload a driver licence or passport",
    },
    { key: "terms", label: "Terms & Privacy accepted", state: hasConsent ? "done" : "pending", detail: hasConsent ? "Accepted" : "Accept the Terms and Privacy Policy" },
    {
      key: "admin", label: "Admin review",
      state: ["APPROVED", "ACTIVE"].includes(sp.status) ? "done" : sp.status === "REJECTED" || sp.status === "SUSPENDED" ? "problem" : "pending",
      detail: ({ UNDER_REVIEW: "In review", APPROVED: "Approved — connect payouts", ACTIVE: "Approved", REJECTED: "Rejected", SUSPENDED: "Suspended", DOCUMENTS_REQUIRED: "More information requested" } as Record<string, string>)[sp.status] ?? "Submit when the steps above are complete",
    },
  ];
}

/** Problems that stop a seller submitting for review (backend gate). */
export async function submissionProblems(user: UserLite & { id: string }, sp: SellerWithDocs) {
  const items = await sellerChecklist(user, sp);
  const get = (k: string) => items.find((i) => i.key === k)!;
  const p: string[] = [];
  if (!user.emailVerifiedAt) p.push("Verify your email address.");
  if (!user.mobileVerifiedAt) p.push("Verify your mobile number with the SMS code.");
  if (!user.dateOfBirth) p.push("Add your date of birth.");
  if (get("identity").state === "problem") p.push(get("identity").detail);
  if (sp.locationStatus === "NOT_VERIFIED" || !sp.pinConfirmedAt) p.push("Complete your location: enter your address and confirm the map pin.");
  if (sp.locationStatus === "FAILED") p.push("Your location verification failed — correct your address.");
  const rule = BUSINESS_STRUCTURES[structureOf(sp)];
  if ((rule.abn === "required" || sp.abn || sp.acn) && !sp.abnConfirmedAt) p.push("Confirm that the ABN/ACN belongs to your business.");
  if (get("terms").state !== "done") p.push("Accept the Terms & Conditions and Privacy Policy.");
  return p;
}

/** Problems that stop an admin approving (backend gate — cannot be bypassed from the browser). */
export async function approvalProblems(user: UserLite & { id: string }, sp: SellerWithDocs) {
  const items = await sellerChecklist(user, sp);
  const p: string[] = [];
  for (const i of items) {
    if (i.key === "admin" || i.state === "done" || i.state === "na") continue;
    p.push(`${i.label}: ${i.detail}`);
  }
  if (user.accountStatus !== "ACTIVE") p.push("Account is not active (email/mobile verification incomplete, or restricted).");
  return p;
}
