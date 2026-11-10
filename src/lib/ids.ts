import type { Tx } from "./db";
import { parseAuMobile } from "./au-validation";

export type IdPrefix = "BUY" | "SEL" | "BUS" | "ADM";

/** Allocates the next permanent platform ID, e.g. BUY-000001. Call inside a transaction. */
export async function nextPublicId(tx: Tx, prefix: IdPrefix) {
  const c = await tx.counter.upsert({
    where: { key: prefix },
    create: { key: prefix, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${String(c.value).padStart(6, "0")}`;
}

export function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Normalise an Australian mobile to E.164 (+614XXXXXXXX). Returns null if invalid (see parseAuMobile for the reason). */
export function normaliseMobile(input: string) {
  const r = parseAuMobile(input);
  return r.ok ? r.e164 : null;
}

export function passwordProblems(pw: string) {
  const p: string[] = [];
  if (pw.length < 10) p.push("at least 10 characters");
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) p.push("upper and lower case letters");
  if (!/\d/.test(pw)) p.push("a number");
  return p;
}

export { isValidAbn, isValidAcn } from "./au-validation";
