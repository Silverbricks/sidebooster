import "server-only";
// Reads the seller business-details form (registration + verification page). Redirects back with the first problem.

import { back } from "./action-utils";
import { optStr, str } from "./format";
import { BUSINESS_STRUCTURES, businessIdProblems, digitsOnly, isStructure, type BusinessStructure } from "./au-validation";

export type SellerBusiness = {
  structure: BusinessStructure; sellerType: "INDIVIDUAL" | "BUSINESS"; legalName: string; businessName: string | null;
  abn: string | null; acn: string | null; authorisedRep: string | null; abnConfirmed: boolean; bio: string | null;
};

/** Business registration type + ABN/ACN: digit count, checksum, structure rules and ABN↔ACN. Redirects back with the error. */
export function readSellerBusiness(fd: FormData, path: string): SellerBusiness {
  const structureRaw = str(fd.get("businessStructure")) || (str(fd.get("sellerType")) === "BUSINESS" ? "REGISTERED_BUSINESS" : "INDIVIDUAL");
  if (!isStructure(structureRaw)) back(path, { error: "Choose a business registration type." });
  const structure = structureRaw as BusinessStructure;
  const rule = BUSINESS_STRUCTURES[structure];
  const legalName = str(fd.get("legalName")).replace(/\s+/g, " ");
  const abn = digitsOnly(optStr(fd.get("abn"))) || null;
  const acn = rule.acn === "none" ? null : digitsOnly(optStr(fd.get("acn"))) || null;
  const authorisedRep = optStr(fd.get("authorisedRep"));
  if (!legalName) back(path, { error: rule.business ? "Enter the legal entity name." : "Enter your full legal name." });
  if (legalName.length > 200) back(path, { error: "Legal name is too long." });
  const idProblem = businessIdProblems(structure, abn, acn);
  if (idProblem) back(path, { error: idProblem });
  if (rule.business && !authorisedRep) back(path, { error: "Enter the authorised representative." });
  const abnConfirmed = fd.get("abnConfirmed") === "on";
  if ((abn || acn) && !abnConfirmed) back(path, { error: "Confirm that the ABN/ACN belongs to your business." });
  return {
    structure, sellerType: rule.business ? "BUSINESS" : "INDIVIDUAL", legalName, businessName: rule.business ? optStr(fd.get("businessName")) : null,
    abn, acn, authorisedRep: rule.business ? authorisedRep : null, abnConfirmed, bio: optStr(fd.get("bio")),
  };
}
