// Account recovery operations used by admin actions and the email-change link (SRS §4, §7).
// Plain functions (not server actions) so they can be unit-tested; callers do the permission checks.
import { brand } from "@/config/brand";
import { db } from "./db";
import { audit } from "./audit";
import { appUrl, notify, sendEmail, sendSms } from "./notify";
import { ACCOUNT_ID_RE, consumeLink, issueLink, maskEmail, normaliseUsername, usernameProblem } from "./auth-codes";

export class RecoveryError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function notifyAdmins(title: string, body: string, link: string) {
  const admins = await db.user.findMany({ where: { role: "ADMIN", accountStatus: { notIn: ["SUSPENDED", "CLOSED"] } }, select: { id: true } });
  for (const a of admins) await notify(a.id, { type: "ADMIN_RECOVERY", title, body, link, email: false });
}

/** Changes a user's email (after verification), signs them out everywhere and tells both addresses + the mobile. */
async function applyEmailChange(userId: string, newEmail: string, actorId: string | null, action: string, reason: string, details: object = {}, keepSessionId?: string | null) {
  const email = newEmail.toLowerCase();
  if (!EMAIL_RE.test(email)) throw new RecoveryError("Enter a valid email address.");
  const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (before.email === email) throw new RecoveryError("That is already the account's email address.");
  if (await db.user.findUnique({ where: { email } })) throw new RecoveryError("Another account already uses that email address.");
  await db.user.update({ where: { id: userId }, data: { email, emailVerifiedAt: new Date(), emailVerifyToken: null } });
  const revoked = await db.session.deleteMany({ where: { userId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } });
  await audit(actorId, action, "User", userId, { from: maskEmail(before.email), to: maskEmail(email), sessionsRevoked: revoked.count, ...details }, db, reason);
  await sendEmail(before.email, `The email on your ${brand.name} account was changed`, `Hi ${before.firstName},

The email address on your ${brand.name} account was changed to ${maskEmail(email)} and you were signed out on ${keepSessionId ? "your other" : "all"} devices.

If you didn't ask for this, contact ${brand.supportEmail} immediately.`);
  await sendEmail(email, `Your ${brand.name} email address was updated`, `Hi ${before.firstName},

This is now the email address for your ${brand.name} account. Sign in: ${appUrl("/login")}`);
  if (before.mobile) await sendSms(before.mobile, `${brand.name}: the email address on your account was changed. If this wasn't you, contact ${brand.supportEmail}.`);
}

/** Admin approves a lost-email recovery request. `accountId` links a request that didn't match an account automatically. */
export async function approveRecovery(requestId: string, adminId: string, note: string, accountId?: string) {
  if (!note.trim()) throw new RecoveryError("Record what evidence you checked before approving.");
  const req = await db.recoveryRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (req.status !== "PENDING") throw new RecoveryError("This request has already been decided.");
  let userId = req.userId;
  if (!userId && accountId) {
    const id = accountId.trim();
    const u = ACCOUNT_ID_RE.test(id) ? await db.user.findUnique({ where: { publicId: id.toUpperCase() } }) : await db.user.findUnique({ where: { username: normaliseUsername(id) } });
    if (!u) throw new RecoveryError("No account has that ID or username.");
    userId = u.id;
  }
  if (!userId) throw new RecoveryError("Link this request to an account (account ID or username) before approving.");
  if (!req.newEmailVerified) throw new RecoveryError("The new email address hasn't been verified.");
  await applyEmailChange(userId, req.newEmail, adminId, "EMAIL_CHANGED_BY_RECOVERY", note, { reference: req.reference, kind: req.kind });
  await db.recoveryRequest.update({ where: { id: req.id }, data: { status: "APPROVED", userId, decisionNote: note, reviewedById: adminId, reviewedAt: new Date() } });
  await audit(adminId, "RECOVERY_APPROVED", "RecoveryRequest", req.id, { reference: req.reference }, db, note);
}

export async function rejectRecovery(requestId: string, adminId: string, note: string) {
  if (!note.trim()) throw new RecoveryError("A reason is required to reject a request.");
  const req = await db.recoveryRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (req.status !== "PENDING") throw new RecoveryError("This request has already been decided.");
  await db.recoveryRequest.update({ where: { id: req.id }, data: { status: "REJECTED", decisionNote: note, reviewedById: adminId, reviewedAt: new Date() } });
  await audit(adminId, "RECOVERY_REJECTED", "RecoveryRequest", req.id, { reference: req.reference }, db, note);
  await sendEmail(req.newEmail, `Your ${brand.name} recovery request ${req.reference}`, `We couldn't verify your account recovery request ${req.reference}, so no changes were made.

If you need help, reply to ${brand.supportEmail} quoting ${req.reference}.`);
}

/** §7 "Reset password: send secure reset link" — admins never see or set the password. */
export async function adminSendResetLink(userId: string, adminId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const token = await issueLink({ userId, purpose: "RESET_LINK", target: u.email, ttlMs: 30 * 60_000, meta: { via: "admin" } });
  await sendEmail(u.email, `Reset your ${brand.name} password`, `Hi ${u.firstName},

Our support team sent you this link to reset your password. It works once and expires in 30 minutes:
${appUrl(`/reset-password?token=${token}`)}

If you didn't contact us, ignore this email — your password stays the same.`, db, { sensitive: true });
  await audit(adminId, "ADMIN_SENT_RESET_LINK", "User", userId);
}

export async function adminUnlock(userId: string, adminId: string, reason: string) {
  if (!reason.trim()) throw new RecoveryError("A reason is required.");
  await db.user.update({ where: { id: userId }, data: { failedLogins: 0, lockedUntil: null } });
  await audit(adminId, "ADMIN_UNLOCKED_ACCOUNT", "User", userId, {}, db, reason);
}

export async function adminRevokeSessions(userId: string, adminId: string, reason: string) {
  if (!reason.trim()) throw new RecoveryError("A reason is required.");
  const r = await db.session.deleteMany({ where: { userId } });
  await audit(adminId, "ADMIN_REVOKED_SESSIONS", "User", userId, { count: r.count }, db, reason);
  return r.count;
}

export async function setUsername(userId: string, raw: string, actorId: string | null, reason?: string) {
  const username = raw.trim() ? normaliseUsername(raw) : null;
  if (username) {
    const p = usernameProblem(username);
    if (p) throw new RecoveryError(p);
    const taken = await db.user.findUnique({ where: { username } });
    if (taken && taken.id !== userId) throw new RecoveryError("That username is taken.");
  }
  const before = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.user.update({ where: { id: userId }, data: { username } });
  await audit(actorId, actorId === userId ? "USERNAME_CHANGED" : "ADMIN_CHANGED_USERNAME", "User", userId, { from: before.username, to: username }, db, reason ?? null);
  if (actorId !== userId) await sendEmail(before.email, `Your ${brand.name} username was changed`, `Hi ${before.firstName},\n\nOur support team changed your username to ${username ?? "(none — sign in with your email)"}.\n\nIf you didn't ask for this, contact ${brand.supportEmail}.`);
}

/** Admin-initiated email change: emails a single-use link to the NEW address; the change applies only when it's opened. */
export async function adminStartEmailChange(userId: string, newEmail: string, adminId: string, reason: string) {
  if (!reason.trim()) throw new RecoveryError("A reason is required.");
  const email = newEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new RecoveryError("Enter a valid email address.");
  if (await db.user.findUnique({ where: { email } })) throw new RecoveryError("Another account already uses that email address.");
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const token = await issueLink({ userId, purpose: "EMAIL_CHANGE_LINK", target: email, ttlMs: 24 * 3600_000, meta: { adminId, reason } });
  await sendEmail(email, `Confirm your new ${brand.name} email address`, `Hi ${u.firstName},

Confirm this as the new email address for your ${brand.name} account (link works once, expires in 24 hours):
${appUrl(`/verify-email-change?token=${token}`)}`, db, { sensitive: true });
  await sendEmail(u.email, `Email change started on your ${brand.name} account`, `Hi ${u.firstName},

Our support team started changing your account email to ${maskEmail(email)}. It only takes effect once confirmed from that address.

If you didn't ask for this, contact ${brand.supportEmail}.`);
  await audit(adminId, "ADMIN_STARTED_EMAIL_CHANGE", "User", userId, { to: maskEmail(email) }, db, reason);
}

/** Applies an admin-initiated email change when the link from the new address is opened. */
export async function confirmEmailChangeLink(token: string) {
  const row = await consumeLink(token, "EMAIL_CHANGE_LINK");
  if (!row) return { ok: false as const };
  const meta = (row.meta ?? {}) as { adminId?: string; reason?: string };
  try {
    await applyEmailChange(row.userId!, row.target, meta.adminId ?? null, "EMAIL_CHANGED_BY_ADMIN", meta.reason ?? "Admin-initiated change");
  } catch (e) {
    if (e instanceof RecoveryError) return { ok: false as const, error: e.message };
    throw e;
  }
  return { ok: true as const };
}

/** User changes their own email after confirming codes sent to BOTH the old and new address (§11). */
export async function selfChangeEmail(userId: string, newEmail: string, keepSessionId: string | null) {
  await applyEmailChange(userId, newEmail, userId, "EMAIL_CHANGED", "Confirmed by codes to old and new address", {}, keepSessionId);
}
