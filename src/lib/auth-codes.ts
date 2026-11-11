// One-time codes (6 digits, emailed or texted) and single-use links for sign-in, recovery and email changes.
// Only HMAC/SHA-256 hashes are stored; codes are never logged (see notify.ts redaction).
import crypto from "node:crypto";
import { db } from "./db";
import { sha256, randomToken } from "./crypto";

export const CODE_TTL_MS = 10 * 60_000; // §5: codes expire after 10 minutes
export const RESEND_COOLDOWN_MS = 60_000; // §5: 60-second resend cooldown
export const MAX_CODE_ATTEMPTS = 5; // §5: max 5 incorrect attempts per code
export const MAX_SENDS = 5; // resends per challenge before the user must start again
export const RESET_LINK_TTL_MS = 20 * 60_000; // §8: reset token expiry 15–30 minutes

export type CodePurpose = "LOGIN" | "RESET" | "USERNAME" | "MOBILE_RECOVERY" | "NEW_EMAIL" | "EMAIL_CHANGE_OLD" | "EMAIL_CHANGE_NEW";
export type LinkPurpose = "RESET_LINK" | "EMAIL_CHANGE_LINK";

const pepper = () => process.env.ENCRYPTION_KEY || process.env.CRON_SECRET || "sidebooster-dev-pepper";
export const hashCode = (id: string, code: string) => crypto.createHmac("sha256", pepper()).update(`${id}:${code}`).digest("hex");
export const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
/** An unguessable challenge id that matches no row — returned for unknown accounts so responses look identical. */
export const decoyId = () => `decoy_${crypto.randomUUID()}`;

/** Issues a fresh code. Any earlier unused code for the same user + purpose stops working (§5 "invalidate previous OTP"). */
export async function issueCode(o: { userId: string | null; purpose: CodePurpose; channel: "EMAIL" | "SMS"; target: string; meta?: object }) {
  const now = new Date();
  if (o.userId) {
    await db.authCode.updateMany({ where: { userId: o.userId, purpose: o.purpose, consumedAt: null, expiresAt: { gt: now } }, data: { expiresAt: now } });
  }
  const id = crypto.randomUUID();
  const code = newCode();
  await db.authCode.create({
    data: { id, userId: o.userId, purpose: o.purpose, channel: o.channel, target: o.target, codeHash: hashCode(id, code), expiresAt: new Date(now.getTime() + CODE_TTL_MS), meta: o.meta ?? undefined },
  });
  return { id, code };
}

export type ResendResult = { ok: true; code: string; target: string; channel: string; userId: string | null } | { ok: false; error: string; decoy?: boolean };

/** New code for an existing challenge, honouring the cooldown and the resend cap. */
export async function resendCode(id: string, purpose: CodePurpose): Promise<ResendResult> {
  if (id.startsWith("decoy_")) return { ok: false, decoy: true, error: "" };
  const row = await db.authCode.findUnique({ where: { id } });
  if (!row || row.purpose !== purpose || row.consumedAt) return { ok: false, error: "This request has finished. Start again." };
  const wait = row.lastSentAt.getTime() + RESEND_COOLDOWN_MS - Date.now();
  if (wait > 0) return { ok: false, error: `Please wait ${Math.ceil(wait / 1000)} seconds before requesting another code.` };
  if (row.sends >= MAX_SENDS) return { ok: false, error: "Too many codes requested. Wait a while, then start again." };
  const code = newCode();
  const now = new Date();
  await db.authCode.update({
    where: { id },
    data: { codeHash: hashCode(id, code), attempts: 0, sends: { increment: 1 }, lastSentAt: now, expiresAt: new Date(now.getTime() + CODE_TTL_MS) },
  });
  return { ok: true, code, target: row.target, channel: row.channel, userId: row.userId };
}

export const BAD_CODE = "That code is incorrect or has expired.";

/** Checks a code. Wrong codes count towards the per-code limit; a correct code is single-use. */
export async function checkCode(id: string, code: string, purpose: CodePurpose) {
  const clean = code.replace(/\s/g, "");
  if (id.startsWith("decoy_") || !/^\d{6}$/.test(clean)) return { ok: false as const, error: BAD_CODE };
  const row = await db.authCode.findUnique({ where: { id } });
  if (!row || row.purpose !== purpose || row.consumedAt || row.expiresAt < new Date()) return { ok: false as const, error: BAD_CODE };
  if (row.attempts >= MAX_CODE_ATTEMPTS) return { ok: false as const, error: "Too many incorrect attempts. Request a new code." };
  const expected = Buffer.from(row.codeHash, "hex");
  const given = Buffer.from(hashCode(id, clean), "hex");
  if (!crypto.timingSafeEqual(expected, given)) {
    const updated = await db.authCode.update({ where: { id }, data: { attempts: { increment: 1 } } });
    const left = MAX_CODE_ATTEMPTS - updated.attempts;
    return { ok: false as const, userId: row.userId, error: left > 0 ? `${BAD_CODE} ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many incorrect attempts. Request a new code." };
  }
  // Single use: only one concurrent request can flip consumedAt.
  const claimed = await db.authCode.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date(), verifiedAt: new Date() } });
  if (claimed.count !== 1) return { ok: false as const, error: BAD_CODE };
  return { ok: true as const, row };
}

/** Single-use secret link (password reset, admin-initiated email change). */
export async function issueLink(o: { userId: string; purpose: LinkPurpose; target: string; ttlMs?: number; meta?: object }) {
  await db.authCode.updateMany({ where: { userId: o.userId, purpose: o.purpose, consumedAt: null, expiresAt: { gt: new Date() } }, data: { expiresAt: new Date() } });
  const token = randomToken();
  await db.authCode.create({
    data: { userId: o.userId, purpose: o.purpose, channel: "LINK", target: o.target, codeHash: sha256(token), expiresAt: new Date(Date.now() + (o.ttlMs ?? RESET_LINK_TTL_MS)), meta: o.meta ?? undefined },
  });
  return token;
}

export async function peekLink(token: string, purpose: LinkPurpose) {
  if (!token) return null;
  const row = await db.authCode.findUnique({ where: { codeHash: sha256(token) } });
  if (!row || row.purpose !== purpose || row.consumedAt || row.expiresAt < new Date()) return null;
  return row;
}

export async function consumeLink(token: string, purpose: LinkPurpose) {
  const row = await peekLink(token, purpose);
  if (!row) return null;
  const claimed = await db.authCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date(), verifiedAt: new Date() } });
  return claimed.count === 1 ? row : null;
}

// ---------------------------------------------------------------- lockout (§8 progressive delays)

export const LOCK_AFTER = 5;

/** 5 failures → 1 min, then 2, 4, 8, 16, 32, capped at 60 minutes. */
export function lockMinutes(failures: number) {
  if (failures < LOCK_AFTER) return 0;
  return Math.min(60, 2 ** (failures - LOCK_AFTER));
}

// ---------------------------------------------------------------- masking & identifiers

/** d*****@gmail.com */
export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  return `${local[0] ?? ""}${"*".repeat(Math.max(3, local.length - 1))}@${domain}`;
}

/** +61 4•• ••• •78 */
export function maskMobile(e164: string | null | undefined) {
  if (!e164) return "—";
  return `${e164.slice(0, 4)} ${e164[4] ?? ""}•• ••• •${e164.slice(-2)}`;
}

/** What we keep in login history for the identifier the person typed (never the full email). */
export function maskIdentifier(identifier: string) {
  return identifier.includes("@") ? maskEmail(identifier) : identifier.slice(0, 40);
}

const RESERVED = new Set(["admin", "administrator", "root", "support", "help", "sidebooster", "staff", "moderator", "system", "security", "billing", "seller", "buyer", "account", "login", "null", "undefined"]);

export function normaliseUsername(u: string) {
  return u.trim().toLowerCase();
}

export function usernameProblem(raw: string): string | null {
  const u = normaliseUsername(raw);
  if (u.length < 3 || u.length > 30) return "Usernames must be 3–30 characters.";
  if (!/^[a-z][a-z0-9._-]*$/.test(u)) return "Start with a letter and use only letters, numbers, dots, dashes or underscores.";
  if (/[._-]{2}/.test(u) || /[._-]$/.test(u)) return "Don't end with, or repeat, dots, dashes or underscores.";
  if (/^(buy|sel|bus|adm)-?\d+$/.test(u)) return "That looks like an account ID. Choose a different username.";
  if (RESERVED.has(u)) return "That username is reserved. Choose another.";
  return null;
}

export const ACCOUNT_ID_RE = /^(BUY|SEL|BUS|ADM)-\d{6}$/i;

/** Finds the account for an email address or username (sign-in). Account IDs are accepted for recovery only. */
export async function findByIdentifier(identifier: string, opts: { allowAccountId?: boolean } = {}) {
  const id = identifier.trim();
  if (!id) return null;
  if (id.includes("@")) return db.user.findUnique({ where: { email: id.toLowerCase() } });
  if (opts.allowAccountId && ACCOUNT_ID_RE.test(id)) return db.user.findUnique({ where: { publicId: id.toUpperCase() } });
  return db.user.findUnique({ where: { username: normaliseUsername(id) } });
}
