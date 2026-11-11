"use server";
// Signed-in account security: password, username, email change, devices (SRS §11).
import { brand } from "@/config/brand";
import { db } from "@/lib/db";
import { attempt, back } from "@/lib/action-utils";
import { str } from "@/lib/format";
import { currentSessionId, hashPassword, requireUser, revokeSessions, verifyPassword } from "@/lib/auth";
import { passwordProblems } from "@/lib/ids";
import { audit } from "@/lib/audit";
import { appUrl, sendEmail } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { checkCode, issueCode } from "@/lib/auth-codes";
import { deliverCode } from "@/lib/code-delivery";
import { clearFlow, getFlow, setFlow } from "@/lib/login-security";
import { RecoveryError, selfChangeEmail, setUsername } from "@/lib/recovery";

const PATH = "/account/security";

async function requirePassword(userId: string, password: string, path = PATH) {
  if (!rateLimit(`reauth:${userId}`, 8, 15 * 60_000)) back(path, { error: "Too many attempts. Please wait 15 minutes." });
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(password, u.passwordHash))) back(path, { error: "Your current password is incorrect." });
  return u;
}

export async function changePasswordAction(fd: FormData) {
  const user = await requireUser();
  const current = str(fd.get("currentPassword"));
  const password = str(fd.get("password"));
  await requirePassword(user.id, current);
  const problems = passwordProblems(password);
  if (problems.length) back(PATH, { error: `New password needs ${problems.join(", ")}.` });
  if (password !== str(fd.get("confirmPassword"))) back(PATH, { error: "New passwords do not match." });
  if (password === current) back(PATH, { error: "Choose a password you haven't used here before." });
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null } });
  const revoked = await revokeSessions(user.id, await currentSessionId());
  await audit(user.id, "PASSWORD_CHANGED", "User", user.id, { otherSessionsRevoked: revoked });
  await sendEmail(user.email, `Your ${brand.name} password was changed`, `Hi ${user.firstName},

Your password was changed and your other devices were signed out.

If you didn't do this, reset your password now: ${appUrl("/forgot-password")} and contact ${brand.supportEmail}.`);
  back(PATH, { ok: `Password changed.${revoked ? ` Signed out ${revoked} other device${revoked === 1 ? "" : "s"}.` : ""}` });
}

export async function setUsernameAction(fd: FormData) {
  const user = await requireUser();
  await attempt(PATH, async () => {
    try {
      await setUsername(user.id, str(fd.get("username")), user.id);
    } catch (e) {
      if (e instanceof RecoveryError) throw new Error(e.message);
      throw e;
    }
    return str(fd.get("username")) ? "Username saved. You can now sign in with it." : "Username removed.";
  });
}

/** Step 1: confirm password, then send codes to the current AND the new address. */
export async function startEmailChangeAction(fd: FormData) {
  const user = await requireUser();
  const newEmail = str(fd.get("newEmail")).toLowerCase();
  await requirePassword(user.id, str(fd.get("currentPassword")));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) back(PATH, { error: "Enter a valid new email address." });
  if (newEmail === user.email) back(PATH, { error: "That's already your email address." });
  if (await db.user.findUnique({ where: { email: newEmail } })) back(PATH, { error: "That email address can't be used. Enter a different one." });
  if (!rateLimit(`email-change:${user.id}`, 3, 3600_000)) back(PATH, { error: "Too many email change requests. Try again in an hour." });
  const oldCode = await issueCode({ userId: user.id, purpose: "EMAIL_CHANGE_OLD", channel: "EMAIL", target: user.email });
  const newCode = await issueCode({ userId: user.id, purpose: "EMAIL_CHANGE_NEW", channel: "EMAIL", target: newEmail, meta: { oldId: oldCode.id } });
  await deliverCode("EMAIL", user.email, "EMAIL_CHANGE_OLD", oldCode.code);
  await deliverCode("EMAIL", newEmail, "EMAIL_CHANGE_NEW", newCode.code);
  await setFlow("EMAIL_CHANGE", newCode.id);
  back(`${PATH}?change=verify`, { ok: `We've sent one code to ${user.email} and another to ${newEmail}.` });
}

export async function confirmEmailChangeAction(fd: FormData) {
  const user = await requireUser();
  const path = `${PATH}?change=verify`;
  const newId = await getFlow("EMAIL_CHANGE");
  const newRow = newId ? await db.authCode.findUnique({ where: { id: newId } }) : null;
  if (!newRow || newRow.userId !== user.id) back(PATH, { error: "Your email change request has expired. Start again." });
  const oldId = (newRow!.meta as { oldId?: string } | null)?.oldId ?? "";
  const a = await checkCode(oldId, str(fd.get("codeOld")), "EMAIL_CHANGE_OLD");
  if (!a.ok) back(path, { error: `Code sent to your current address: ${a.error}` });
  const b = await checkCode(newRow!.id, str(fd.get("codeNew")), "EMAIL_CHANGE_NEW");
  if (!b.ok) back(PATH, { error: `Code sent to your new address: ${b.error} Start the change again.` });
  try {
    await selfChangeEmail(user.id, newRow!.target, await currentSessionId());
  } catch (e) {
    if (e instanceof RecoveryError) back(PATH, { error: e.message });
    throw e;
  }
  await clearFlow("EMAIL_CHANGE");
  back(PATH, { ok: `Email changed to ${newRow!.target}. Other devices were signed out.` });
}

export async function cancelEmailChangeAction() {
  await requireUser();
  await clearFlow("EMAIL_CHANGE");
  back(PATH, { ok: "Email change cancelled." });
}

export async function revokeSessionAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd.get("sessionId"));
  const r = await db.session.deleteMany({ where: { id, userId: user.id } }); // own sessions only
  if (r.count) await audit(user.id, "SESSION_REVOKED", "User", user.id);
  back(PATH, { ok: r.count ? "Device signed out." : "That device was already signed out." });
}

export async function revokeOtherSessionsAction() {
  const user = await requireUser();
  const n = await revokeSessions(user.id, await currentSessionId());
  await audit(user.id, "SESSIONS_REVOKED", "User", user.id, { count: n });
  back(PATH, { ok: n ? `Signed out ${n} other device${n === 1 ? "" : "s"}.` : "No other devices were signed in." });
}
