import "server-only";
// Australian Business Register (ABR) lookups — free JSON web service.
// Register for a GUID at https://abr.business.gov.au/Tools/WebServices and set ABR_GUID.
// Without ABR_GUID, lookups return null and the business check is "Not checked" (admin reviews manually).

import { abnContainsAcn, digitsOnly, isValidAbn, isValidAcn, namesMatch, type BusinessStructure } from "./au-validation";

export type AbrRecord = {
  abn: string;
  abnStatus: "Active" | "Cancelled" | string;
  abnStatusFrom: string | null;
  acn: string | null;
  entityName: string;
  entityTypeCode: string;
  entityTypeName: string;
  gstRegistered: boolean;
  gstFrom: string | null;
  state: string | null;
  postcode: string | null;
  businessNames: string[];
};

export type AbrLookup = { found: true; record: AbrRecord } | { found: false; message: string };

export const abrConfigured = () => Boolean(process.env.ABR_GUID?.trim());

async function call(kind: "AbnDetails" | "AcnDetails", param: "abn" | "acn", value: string): Promise<AbrLookup | null> {
  const guid = process.env.ABR_GUID?.trim();
  if (!guid) return null;
  const url = `https://abr.business.gov.au/json/${kind}.aspx?${param}=${encodeURIComponent(value)}&callback=c&guid=${encodeURIComponent(guid)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) throw new Error(`ABR lookup failed (HTTP ${res.status})`);
  const text = await res.text();
  const json = JSON.parse(text.replace(/^\s*c\(/, "").replace(/\)\s*;?\s*$/, "")) as Record<string, unknown>;
  const message = String(json.Message ?? "");
  const abn = digitsOnly(String(json.Abn ?? ""));
  if (!abn) return { found: false, message: message || "No ABN record found." };
  return {
    found: true,
    record: {
      abn,
      abnStatus: String(json.AbnStatus ?? ""),
      abnStatusFrom: (json.AbnStatusEffectiveFrom as string) || null,
      acn: digitsOnly(String(json.Acn ?? "")) || null,
      entityName: String(json.EntityName ?? ""),
      entityTypeCode: String(json.EntityTypeCode ?? ""),
      entityTypeName: String(json.EntityTypeName ?? ""),
      gstRegistered: Boolean(json.Gst),
      gstFrom: (json.Gst as string) || null,
      state: (json.AddressState as string) || null,
      postcode: (json.AddressPostcode as string) || null,
      businessNames: Array.isArray(json.BusinessName) ? (json.BusinessName as unknown[]).map(String) : [],
    },
  };
}

export const lookupAbn = (abn: string) => (isValidAbn(abn) ? call("AbnDetails", "abn", digitsOnly(abn)) : Promise.resolve({ found: false, message: "Invalid ABN." } as AbrLookup));
export const lookupAcn = (acn: string) => (isValidAcn(acn) ? call("AcnDetails", "acn", digitsOnly(acn)) : Promise.resolve({ found: false, message: "Invalid ACN." } as AbrLookup));

// ------------------------------------------------------------------ evaluation

export type BusinessCheckStatus = "NOT_CHECKED" | "VERIFIED" | "MISMATCH" | "INACTIVE" | "NOT_FOUND" | "MANUAL_REVIEW";

export type BusinessCheck = {
  status: BusinessCheckStatus;
  problems: string[];
  checkedAt: string;
  abn?: AbrRecord | null;
  acnRecord?: AbrRecord | null;
  lookupError?: string;
};

const COMPANY_TYPES = new Set(["PRV", "PUB"]); // Australian private / public company
const PARTNERSHIP_TYPES = new Set(["PTR", "LPT", "FPT", "CGP", "SGP", "LGP"]);

/** Pure: decides the business-check status from ABR data. Exported for tests. */
export function evaluateBusiness(input: {
  structure: BusinessStructure;
  legalName: string;
  businessName?: string | null;
  abn: string | null;
  acn: string | null;
  abnLookup: AbrLookup | null;
  acnLookup: AbrLookup | null;
}): Omit<BusinessCheck, "checkedAt"> {
  const { structure, legalName, businessName, abn, acn, abnLookup, acnLookup } = input;
  if (!abn && !acn) return { status: "NOT_CHECKED", problems: ["No ABN or ACN supplied."] };
  if ((abn && !abnLookup) || (acn && !abn && !acnLookup)) return { status: "NOT_CHECKED", problems: ["ABR lookup is not configured — verify manually on abr.business.gov.au."] };

  const problems: string[] = [];
  let status: BusinessCheckStatus = "VERIFIED";
  const worse = (s: BusinessCheckStatus) => {
    const rank: BusinessCheckStatus[] = ["VERIFIED", "MANUAL_REVIEW", "MISMATCH", "NOT_FOUND", "INACTIVE"];
    if (rank.indexOf(s) > rank.indexOf(status)) status = s;
  };
  const rec = abnLookup?.found ? abnLookup.record : null;
  const acnRec = acnLookup?.found ? acnLookup.record : null;

  if (abn) {
    if (!rec) {
      worse("NOT_FOUND");
      problems.push(`ABN not found on the Australian Business Register${abnLookup && !abnLookup.found && abnLookup.message ? ` (${abnLookup.message})` : ""}.`);
    } else {
      if (rec.abnStatus.toLowerCase() !== "active") {
        worse("INACTIVE");
        problems.push(`ABN status is ${rec.abnStatus || "unknown"}${rec.abnStatusFrom ? ` since ${rec.abnStatusFrom}` : ""}.`);
      }
      const names = [rec.entityName, ...rec.businessNames];
      const named = [legalName, businessName].filter(Boolean) as string[];
      if (!named.some((n) => names.some((r) => namesMatch(n, r) || namesMatch(r, n)))) {
        worse("MISMATCH");
        problems.push(`Name "${legalName}" doesn't match the ABR entity "${rec.entityName}".`);
      }
      if (structure === "COMPANY" && !COMPANY_TYPES.has(rec.entityTypeCode)) {
        worse("MISMATCH");
        problems.push(`Registered as "${rec.entityTypeName}", not a company.`);
      }
      if (structure === "PARTNERSHIP" && !PARTNERSHIP_TYPES.has(rec.entityTypeCode)) {
        worse("MANUAL_REVIEW");
        problems.push(`Registered as "${rec.entityTypeName}", not a partnership.`);
      }
      if (structure === "TRUST" && !/trust/i.test(rec.entityTypeName)) {
        worse("MANUAL_REVIEW");
        problems.push(`Registered as "${rec.entityTypeName}", not a trust.`);
      }
      if ((structure === "INDIVIDUAL" || structure === "SOLE_TRADER") && rec.entityTypeCode !== "IND") {
        worse("MANUAL_REVIEW");
        problems.push(`ABN belongs to "${rec.entityTypeName}", not an individual / sole trader.`);
      }
      if (acn && rec.acn && rec.acn !== digitsOnly(acn)) {
        worse("MISMATCH");
        problems.push(`ACN ${acn} doesn't match the ACN on this ABN (${rec.acn}).`);
      } else if (acn && !rec.acn && !abnContainsAcn(abn, acn)) {
        worse("MANUAL_REVIEW");
        problems.push("ABR has no ACN linked to this ABN.");
      }
    }
  }
  if (acn && !abn) {
    if (!acnRec) {
      worse("NOT_FOUND");
      problems.push("ACN not found on the Australian Business Register.");
    } else if (!named(legalName, acnRec)) {
      worse("MISMATCH");
      problems.push(`Name "${legalName}" doesn't match the company "${acnRec.entityName}".`);
    }
  }
  return { status, problems, abn: rec, acnRecord: acnRec };
}

const named = (legalName: string, r: AbrRecord) => [r.entityName, ...r.businessNames].some((n) => namesMatch(legalName, n) || namesMatch(n, legalName));

/** Looks up ABN/ACN on the ABR and evaluates the result. Network errors become MANUAL_REVIEW, never a crash. */
export async function checkBusiness(input: { structure: BusinessStructure; legalName: string; businessName?: string | null; abn: string | null; acn: string | null }): Promise<BusinessCheck> {
  const checkedAt = new Date().toISOString();
  try {
    const [abnLookup, acnLookup] = await Promise.all([input.abn ? lookupAbn(input.abn) : null, input.acn && !input.abn ? lookupAcn(input.acn) : null]);
    return { ...evaluateBusiness({ ...input, abnLookup, acnLookup }), checkedAt };
  } catch (e) {
    return { status: "MANUAL_REVIEW", problems: ["The ABR lookup service couldn't be reached — check manually."], checkedAt, lookupError: e instanceof Error ? e.message : String(e) };
  }
}
