// Australian field validation used by seller registration and verification.
// Pure functions (no I/O) so the same rules run on the server for every request and in tests.

import { AU_STATES } from "./constants";

export type StateCode = (typeof AU_STATES)[number]["code"];
export const STATE_CODES = AU_STATES.map((s) => s.code as string);

// ------------------------------------------------------------------ mobile

export type MobileResult = { ok: true; e164: string } | { ok: false; error: string };

/**
 * Australian mobile → E.164 (+614XXXXXXXX).
 * Accepts 04XXXXXXXX, 4XXXXXXXX, +614XXXXXXXX, 614XXXXXXXX, 00614XXXXXXXX and "+61 (0)4…";
 * spaces, brackets, dots and hyphens are removed first.
 */
export function parseAuMobile(input: string): MobileResult {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, error: "Enter your mobile number." };
  if (/[^\d+\s().-]/.test(raw)) return { ok: false, error: "Mobile number can only contain digits, spaces, brackets, hyphens and +." };
  let d = raw.replace(/[\s().-]/g, "");
  if (d.indexOf("+") > 0 || (d.match(/\+/g)?.length ?? 0) > 1) return { ok: false, error: "That mobile number format isn't valid." };
  if (d.startsWith("+")) {
    if (!d.startsWith("+61")) return { ok: false, error: "Only Australian mobile numbers (+61) are accepted." };
    d = d.slice(3);
  } else if (d.startsWith("0061")) d = d.slice(4);
  else if (d.startsWith("61") && d.length >= 11) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1); // trunk prefix: 04… or +61 (0)4…
  if (/^[2378]/.test(d)) return { ok: false, error: "That looks like a landline. A mobile number (starting 04) is required." };
  if (/^1/.test(d)) return { ok: false, error: "1300/1800 and other special numbers aren't accepted. Use a mobile starting 04." };
  if (!d.startsWith("4")) return { ok: false, error: "Australian mobile numbers start with 04 (or +614)." };
  if (d.length !== 9) return { ok: false, error: `An Australian mobile has 10 digits starting 04 (or +61 and 9 digits) — you entered ${d.length + 1}.` };
  return { ok: true, e164: `+61${d}` };
}

// ------------------------------------------------------------------ ABN / ACN

export const digitsOnly = (s: string | null | undefined) => (s ?? "").replace(/[\s-]/g, "");

/** ABN checksum (ATO): subtract 1 from the first digit, weight, sum must be divisible by 89. */
export function isValidAbn(abn: string) {
  const d = digitsOnly(abn);
  if (!/^\d{11}$/.test(d)) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const n = d.split("").map(Number);
  n[0] -= 1;
  return n.reduce((s, x, i) => s + x * w[i], 0) % 89 === 0;
}

/** ACN checksum (ASIC): weights 8..1 on the first 8 digits; check digit = (10 − sum mod 10) mod 10. */
export function isValidAcn(acn: string) {
  const d = digitsOnly(acn);
  if (!/^\d{9}$/.test(d)) return false;
  const n = d.split("").map(Number);
  const sum = n.slice(0, 8).reduce((s, x, i) => s + x * (8 - i), 0);
  return (10 - (sum % 10)) % 10 === n[8];
}

export function abnProblem(abn: string) {
  const d = digitsOnly(abn);
  if (/[^\d]/.test(d)) return "ABN can only contain digits.";
  if (d.length !== 11) return `ABN must be exactly 11 digits — you entered ${d.length}.`;
  if (!isValidAbn(d)) return "That ABN is not valid (checksum failed). Please check the number.";
  return null;
}

export function acnProblem(acn: string) {
  const d = digitsOnly(acn);
  if (/[^\d]/.test(d)) return "ACN can only contain digits.";
  if (d.length !== 9) return `ACN must be exactly 9 digits — you entered ${d.length}.`;
  if (!isValidAcn(d)) return "That ACN is not valid (checksum failed). Please check the number.";
  return null;
}

export const formatAbn = (abn: string) => digitsOnly(abn).replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3 $4");
export const formatAcn = (acn: string) => digitsOnly(acn).replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");

/** An ABN issued to a company contains its ACN as the last 9 digits. */
export const abnContainsAcn = (abn: string, acn: string) => digitsOnly(abn).slice(2) === digitsOnly(acn);

// ------------------------------------------------------------------ business structure

export const BUSINESS_STRUCTURES = {
  INDIVIDUAL: { label: "Individual / Sole Trader", abn: "optional", acn: "none", business: false },
  REGISTERED_BUSINESS: { label: "Registered Business", abn: "required", acn: "none", business: true },
  COMPANY: { label: "Australian Company (Pty Ltd)", abn: "required", acn: "required", business: true },
  PARTNERSHIP: { label: "Partnership", abn: "required", acn: "none", business: true },
  TRUST: { label: "Trust", abn: "required", acn: "optional", business: true },
  OTHER: { label: "Other", abn: "optional", acn: "optional", business: true },
} as const;
export type BusinessStructure = keyof typeof BUSINESS_STRUCTURES;
export const isStructure = (s: string): s is BusinessStructure => s in BUSINESS_STRUCTURES;

/** Validates the ABN/ACN combination for a structure. Returns the first problem or null. */
export function businessIdProblems(structure: BusinessStructure, abn: string | null, acn: string | null) {
  const rule = BUSINESS_STRUCTURES[structure];
  if (rule.abn === "required" && !abn) return `An ABN is required for ${rule.label}.`;
  if (rule.acn === "required" && !acn) return "An ACN is required for an Australian company.";
  if (rule.acn === "none" && acn) return `An ACN isn't used for ${rule.label} — leave it blank.`;
  if (abn) {
    const p = abnProblem(abn);
    if (p) return p;
  }
  if (acn) {
    const p = acnProblem(acn);
    if (p) return p;
  }
  if (structure === "COMPANY" && abn && acn && !abnContainsAcn(abn, acn)) return "That ABN doesn't belong to that ACN — a company's ABN ends with its 9-digit ACN.";
  return null;
}

// ------------------------------------------------------------------ postcode ↔ state

const RANGES: Record<StateCode, [number, number][]> = {
  NSW: [[1000, 1999], [2000, 2599], [2619, 2899], [2921, 2999]],
  ACT: [[200, 299], [2600, 2618], [2900, 2920]],
  VIC: [[3000, 3999], [8000, 8999]],
  QLD: [[4000, 4999], [9000, 9999]],
  SA: [[5000, 5999]],
  WA: [[6000, 6797], [6800, 6999]],
  TAS: [[7000, 7999]],
  NT: [[800, 999]],
};
// Real localities whose postcode belongs to another state's range (border towns, remote communities).
const CROSS_BORDER: Record<string, StateCode[]> = {
  "2540": ["ACT"], "2620": ["ACT"], "2406": ["QLD"], "2618": ["NSW"],
  "3585": ["NSW"], "3586": ["NSW"], "3644": ["NSW"], "3691": ["NSW"], "3707": ["NSW"],
  "4375": ["NSW"], "4377": ["NSW"], "4380": ["NSW"], "4383": ["NSW"], "4385": ["NSW"],
  "0872": ["SA", "WA"], "6798": ["WA"], "6799": ["WA"],
};

export function postcodeMatchesState(postcode: string, state: string) {
  if (!/^\d{4}$/.test(postcode) || !STATE_CODES.includes(state)) return false;
  const n = Number(postcode);
  if (RANGES[state as StateCode].some(([a, b]) => n >= a && n <= b)) return true;
  return CROSS_BORDER[postcode]?.includes(state as StateCode) ?? false;
}

// ------------------------------------------------------------------ date of birth

export type DobResult = { ok: true; date: Date } | { ok: false; error: string };

/** Parses DD/MM/YYYY (also accepts YYYY-MM-DD from older forms). Real calendar dates only, not in the future. */
export function parseDob(input: string, minAge = 18, now = new Date()): DobResult {
  const s = (input ?? "").trim();
  let y: number, m: number, d: number;
  let mt: RegExpMatchArray | null;
  if ((mt = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [d, m, y] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  else if ((mt = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])];
  else return { ok: false, error: "Enter your date of birth as DD/MM/YYYY." };
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return { ok: false, error: "That date of birth isn't a real calendar date." };
  if (date.getTime() > now.getTime()) return { ok: false, error: "Date of birth can't be in the future." };
  if (y < now.getUTCFullYear() - 120) return { ok: false, error: "Please check the year of your date of birth." };
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() < m - 1 || (now.getUTCMonth() === m - 1 && now.getUTCDate() < d)) age--;
  if (age < minAge) return { ok: false, error: `You must be ${minAge} or older to register as a seller. Under-18 registrations aren't accepted.` };
  return { ok: true, date };
}

export const formatDob = (d: Date | null | undefined) =>
  d ? `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}` : "";

// ------------------------------------------------------------------ names & places

/** Upper-case word tokens without company suffixes/punctuation, for loose name matching. */
export function nameTokens(name: string) {
  return (name ?? "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !["PTY", "LTD", "LIMITED", "PROPRIETARY", "THE", "TRUSTEE", "FOR", "AS", "ATF", "CO", "INC", "INCORPORATED", "TRUST", "AND"].includes(t));
}

/** True when every meaningful token of `a` appears in `b` (order-insensitive), e.g. "John Smith" vs "SMITH, JOHN". */
export function namesMatch(a: string, b: string) {
  const ta = nameTokens(a);
  const tb = new Set(nameTokens(b));
  return ta.length > 0 && ta.every((t) => tb.has(t));
}

export const sameSuburb = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toUpperCase().replace(/[^A-Z]/g, "") === b.trim().toUpperCase().replace(/[^A-Z]/g, "");

/** Great-circle distance in metres. */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rough bounding box of Australia incl. Tasmania and external territories' nearby waters. */
export const insideAustralia = (p: { lat: number; lng: number }) => p.lat <= -9 && p.lat >= -44.5 && p.lng >= 112 && p.lng <= 154.5;
