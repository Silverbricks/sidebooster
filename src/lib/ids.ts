import type { Tx } from "./db";

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

/** Normalise an Australian mobile to E.164 (+614XXXXXXXX). Returns null if invalid. */
export function normaliseMobile(input: string) {
  const digits = input.replace(/[^\d+]/g, "");
  let d = digits.startsWith("+61") ? digits.slice(3) : digits.startsWith("61") ? digits.slice(2) : digits.replace(/^0/, "");
  d = d.replace(/\D/g, "");
  if (!/^4\d{8}$/.test(d)) return null;
  return `+61${d}`;
}

export function passwordProblems(pw: string) {
  const p: string[] = [];
  if (pw.length < 10) p.push("at least 10 characters");
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) p.push("upper and lower case letters");
  if (!/\d/.test(pw)) p.push("a number");
  return p;
}

/** ABN checksum validation (ATO algorithm). */
export function isValidAbn(abn: string) {
  const d = abn.replace(/\s/g, "");
  if (!/^\d{11}$/.test(d)) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const nums = d.split("").map(Number);
  nums[0] -= 1;
  return nums.reduce((s, n, i) => s + n * w[i], 0) % 89 === 0;
}

export function isValidAcn(acn: string) {
  const d = acn.replace(/\s/g, "");
  if (!/^\d{9}$/.test(d)) return false;
  const nums = d.split("").map(Number);
  const sum = nums.slice(0, 8).reduce((s, n, i) => s + n * (8 - i), 0);
  return (10 - (sum % 10)) % 10 === nums[8];
}
