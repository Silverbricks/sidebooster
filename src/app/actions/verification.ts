"use server";
// Live checks used by the seller registration / verification forms. They only *preview* —
// every value is validated again by the action that actually saves it.

import { clientIp, rateLimit } from "@/lib/rate-limit";
import { addressProblem, type AddressFields } from "@/lib/seller-location";
import { geocodeAddress } from "@/lib/geocode";
import { abrConfigured, checkBusiness } from "@/lib/abr";
import { businessIdProblems, digitsOnly, formatAbn, formatAcn, isStructure } from "@/lib/au-validation";

export type AddressPreview =
  | { ok: true; lat: number; lng: number; precision: "street" | "suburb" | "approximate"; formatted: string; warnings: string[] }
  | { ok: false; error: string };

export async function previewAddressAction(a: AddressFields): Promise<AddressPreview> {
  if (!rateLimit(`geo:${await clientIp()}`, 30, 3600_000)) return { ok: false, error: "Too many address lookups. Please wait a few minutes." };
  const clean: AddressFields = {
    country: String(a?.country ?? "AU"), street: String(a?.street ?? "").trim().slice(0, 200), unit: a?.unit ? String(a.unit).trim().slice(0, 30) : null,
    suburb: String(a?.suburb ?? "").trim().slice(0, 80), state: String(a?.state ?? ""), postcode: String(a?.postcode ?? "").trim(),
  };
  const problem = addressProblem(clean);
  if (problem) return { ok: false, error: problem };
  try {
    const g = await geocodeAddress(clean);
    if (!g) return { ok: false, error: "We couldn't find that address. Check the street, suburb and postcode." };
    const warnings: string[] = [];
    if (g.postcode && g.postcode !== clean.postcode) warnings.push(`The map service lists this address under postcode ${g.postcode}.`);
    if (g.state && g.state !== clean.state) warnings.push(`The map service places this address in ${g.state}.`);
    if (g.precision !== "street") warnings.push("Only the suburb was found — drag the pin onto your exact address.");
    return { ok: true, lat: g.lat, lng: g.lng, precision: g.precision, formatted: g.formatted, warnings };
  } catch {
    return { ok: false, error: "The map service is unavailable right now. Try again in a minute." };
  }
}

export type BusinessPreview =
  | { ok: true; configured: boolean; status: string; problems: string[]; entityName?: string; entityType?: string; abnStatus?: string; gst?: string; location?: string; acn?: string | null; abn?: string; businessNames?: string[] }
  | { ok: false; error: string };

export async function previewBusinessAction(input: { structure: string; legalName: string; businessName?: string; abn?: string; acn?: string }): Promise<BusinessPreview> {
  if (!rateLimit(`abr:${await clientIp()}`, 30, 3600_000)) return { ok: false, error: "Too many ABN lookups. Please wait a few minutes." };
  const structure = String(input?.structure ?? "");
  if (!isStructure(structure)) return { ok: false, error: "Choose a business registration type." };
  const abn = digitsOnly(String(input?.abn ?? "")) || null;
  const acn = digitsOnly(String(input?.acn ?? "")) || null;
  const problem = businessIdProblems(structure, abn, acn);
  if (problem) return { ok: false, error: problem };
  if (!abn && !acn) return { ok: false, error: "Enter an ABN or ACN to check." };
  if (!abrConfigured()) return { ok: true, configured: false, status: "NOT_CHECKED", problems: ["Format and checksum are valid. Live ABR lookup isn't enabled yet — an admin will verify it."] };
  const r = await checkBusiness({ structure, legalName: String(input?.legalName ?? "").slice(0, 200), businessName: input?.businessName ? String(input.businessName).slice(0, 200) : null, abn, acn });
  const rec = r.abn ?? r.acnRecord ?? null;
  return {
    ok: true, configured: true, status: r.status, problems: r.problems,
    ...(rec ? {
      entityName: rec.entityName, entityType: rec.entityTypeName, abnStatus: `${rec.abnStatus}${rec.abnStatusFrom ? ` (from ${rec.abnStatusFrom})` : ""}`,
      gst: rec.gstRegistered ? `Registered${rec.gstFrom ? ` from ${rec.gstFrom}` : ""}` : "Not registered",
      location: [rec.state, rec.postcode].filter(Boolean).join(" ") || undefined, acn: rec.acn ? formatAcn(rec.acn) : null, abn: formatAbn(rec.abn), businessNames: rec.businessNames.slice(0, 5),
    } : {}),
  };
}
