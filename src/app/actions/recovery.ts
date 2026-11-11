"use server";
// Passwordless sign-in and account recovery (SRS §2–§6).
// Every response for "send me a code" is identical whether or not an account matches (no account enumeration).
import { redirect } from "next/navigation";
import { brand } from "@/config/brand";
import { db } from "@/lib/db";
import { back } from "@/lib/action-utils";
import { str } from "@/lib/format";
import { hashPassword, revokeSessions } from "@/lib/auth";
import { passwordProblems } from "@/lib/ids";
import { validateMobile } from "@/lib/phone";
import { audit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { appUrl, sendEmail, sendSms } from "@/lib/notify";
import { notifyAdmins } from "@/lib/recovery";
import { checkCode, consumeLink, decoyId, findByIdentifier, issueCode, issueLink, maskEmail, resendCode, type CodePurpose } from "@/lib/auth-codes";
import { deliverCode } from "@/lib/code-delivery";
import { clearFlow, getFlow, recordLogin, setFlow } from "@/lib/login-security";
import { finishCodeLogin } from "@/lib/sign-in";

const SENT = "If an account matches those details, we've sent a 6-digit code to its registered email address. It expires in 10 minutes.";
const BLOCKED = ["SUSPENDED", "CLOSED"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shared throttle for every "send a code" form: per IP and per identifier. */
async function throttle(path: string, scope: string, identifier: string) {
  const ip = await clientIp();
  if (!rateLimit(`${scope}:ip:${ip}`, 10, 15 * 60_000) || !rateLimit(`${scope}:id:${identifier.toLowerCase()}`, 5, 15 * 60_000)) {
    back(path, { error: "Too many requests. Please wait 15 minutes and try again." });
  }
}

const qs = (o: Record<string, string>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();

// ---------------------------------------------------------------- §5 passwordless sign-in

export async function sendLoginCodeAction(fd: FormData) {
  const identifier = str(fd.get("identifier"));
  const next = str(fd.get("next"));
  const remember = fd.get("remember") === "on" ? "1" : "";
  const base = `/login/code?${qs({ next })}`;
  if (!identifier) back(base, { error: "Enter your email address or username." });
  await throttle(base, "login-code", identifier);
  const user = await findByIdentifier(identifier);
  let id: string;
  if (user && !BLOCKED.includes(user.accountStatus)) {
    const c = await issueCode({ userId: user.id, purpose: "LOGIN", channel: "EMAIL", target: user.email, meta: { identifier } });
    await deliverCode("EMAIL", user.email, "LOGIN", c.code);
    id = c.id;
  } else id = decoyId();
  await setFlow("LOGIN", id);
  back(`/login/code?${qs({ step: "verify", next, remember })}`, { ok: SENT });
}

export async function verifyLoginCodeAction(fd: FormData) {
  const next = str(fd.get("next"));
  const remember = fd.get("remember") === "on";
  const path = `/login/code?${qs({ step: "verify", next, remember: remember ? "1" : "" })}`;
  const id = await getFlow("LOGIN");
  if (!id) back(`/login/code?${qs({ next })}`, { error: "Your code request has expired. Request a new code." });
  if (!rateLimit(`login-code-verify:${await clientIp()}`, 30, 15 * 60_000)) back(path, { error: "Too many attempts. Please wait 15 minutes." });
  const r = await checkCode(id!, str(fd.get("code")), "LOGIN");
  if (!r.ok) {
    await recordLogin({ userId: r.userId ?? null, identifier: "email code", method: "EMAIL_CODE", success: false, reason: "BAD_CODE" });
    back(path, { error: r.error });
  }
  await clearFlow("LOGIN");
  const identifier = ((r.row.meta as { identifier?: string } | null)?.identifier) ?? r.row.target;
  await finishCodeLogin(r.row.userId!, remember, next, identifier);
}

// ---------------------------------------------------------------- resend / start over (all flows)

const FLOW_PAGES: Record<string, { purpose: CodePurpose; page: string }> = {
  LOGIN: { purpose: "LOGIN", page: "/login/code" },
  RESET: { purpose: "RESET", page: "/forgot-password" },
  USERNAME: { purpose: "USERNAME", page: "/forgot-username" },
  MOBILE_RECOVERY: { purpose: "MOBILE_RECOVERY", page: "/forgot-email" },
  NEW_EMAIL: { purpose: "NEW_EMAIL", page: "/forgot-email" },
};

export async function resendCodeAction(fd: FormData) {
  const flow = FLOW_PAGES[str(fd.get("flow"))];
  if (!flow) redirect("/login");
  const step = str(fd.get("step")) || "verify";
  const path = `${flow.page}?${qs({ step, next: str(fd.get("next")), remember: str(fd.get("remember")) })}`;
  const id = await getFlow(flow.purpose);
  if (!id) back(flow.page, { error: "Your request has expired. Start again." });
  const r = await resendCode(id!, flow.purpose);
  if (!r.ok && r.decoy) back(path, { ok: "If an account matches, a new code is on its way." });
  if (!r.ok) back(path, { error: r.error });
  if (r.ok) await deliverCode(r.channel, r.target, flow.purpose, r.code);
  back(path, { ok: flow.purpose === "MOBILE_RECOVERY" ? "A new code is on its way by SMS." : "If an account matches, a new code is on its way." });
}

export async function startOverAction(fd: FormData) {
  const flow = FLOW_PAGES[str(fd.get("flow"))];
  if (!flow) redirect("/login");
  await clearFlow(flow.purpose);
  if (flow.page === "/forgot-email") { await clearFlow("MOBILE_FOUND"); await clearFlow("NEW_EMAIL"); await clearFlow("MOBILE_RECOVERY"); }
  redirect(flow.page);
}

// ---------------------------------------------------------------- §2 forgot password

export async function forgotPasswordAction(fd: FormData) {
  const identifier = str(fd.get("identifier"));
  if (!identifier) back("/forgot-password", { error: "Enter your email address or username." });
  await throttle("/forgot-password", "reset", identifier);
  const user = await findByIdentifier(identifier);
  let id: string;
  if (user && !BLOCKED.includes(user.accountStatus)) {
    const c = await issueCode({ userId: user.id, purpose: "RESET", channel: "EMAIL", target: user.email });
    await deliverCode("EMAIL", user.email, "RESET", c.code);
    id = c.id;
  } else id = decoyId();
  await setFlow("RESET", id);
  back("/forgot-password?step=verify", { ok: SENT });
}

export async function verifyResetCodeAction(fd: FormData) {
  const id = await getFlow("RESET");
  if (!id) back("/forgot-password", { error: "Your request has expired. Start again." });
  if (!rateLimit(`reset-verify:${await clientIp()}`, 30, 15 * 60_000)) back("/forgot-password?step=verify", { error: "Too many attempts. Please wait 15 minutes." });
  const r = await checkCode(id!, str(fd.get("code")), "RESET");
  if (!r.ok) back("/forgot-password?step=verify", { error: r.error });
  await clearFlow("RESET");
  const token = await issueLink({ userId: r.row.userId!, purpose: "RESET_LINK", target: r.row.target });
  redirect(`/reset-password?token=${token}`);
}

/** Sets a new password from a single-use reset token (from the code flow or an emailed link). */
export async function resetPasswordAction(fd: FormData) {
  const token = str(fd.get("token"));
  const password = str(fd.get("password"));
  const path = `/reset-password?token=${encodeURIComponent(token)}`;
  const problems = passwordProblems(password);
  if (problems.length) back(path, { error: `Password needs ${problems.join(", ")}.` });
  if (password !== str(fd.get("confirmPassword"))) back(path, { error: "Passwords do not match." });
  const row = await consumeLink(token, "RESET_LINK");
  if (!row) back("/forgot-password", { error: "This reset link has expired or was already used. Request a new code." });
  const user = await db.user.update({
    where: { id: row!.userId! },
    data: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null },
  });
  // §2.9: sign out everywhere; any other outstanding reset codes/links stop working.
  const revoked = await revokeSessions(user.id);
  await db.authCode.updateMany({ where: { userId: user.id, purpose: { in: ["RESET", "RESET_LINK"] }, consumedAt: null }, data: { expiresAt: new Date() } });
  await audit(user.id, "PASSWORD_RESET", "User", user.id, { sessionsRevoked: revoked, via: (row!.meta as { via?: string } | null)?.via ?? "code" });
  await recordLogin({ userId: user.id, identifier: user.email, method: "RESET", success: true, reason: "PASSWORD_RESET" });
  await sendEmail(
    user.email,
    `Your ${brand.name} password was changed`,
    `Hi ${user.firstName},

The password for your ${brand.name} account was just changed, and you've been signed out on all devices.

If you did this, there's nothing else to do.
If you didn't, reset it again straight away: ${appUrl("/forgot-password")} and contact ${brand.supportEmail}.`,
  );
  back("/login", { ok: "Password updated. Sign in with your new password." });
}

// ---------------------------------------------------------------- §3 forgot username

export async function forgotUsernameAction(fd: FormData) {
  const email = str(fd.get("email")).toLowerCase();
  if (!EMAIL_RE.test(email)) back("/forgot-username", { error: "Enter the email address registered to your account." });
  await throttle("/forgot-username", "username", email);
  const user = await db.user.findUnique({ where: { email } });
  let id: string;
  if (user && !BLOCKED.includes(user.accountStatus)) {
    const c = await issueCode({ userId: user.id, purpose: "USERNAME", channel: "EMAIL", target: user.email });
    await deliverCode("EMAIL", user.email, "USERNAME", c.code);
    id = c.id;
  } else id = decoyId();
  await setFlow("USERNAME", id);
  back("/forgot-username?step=verify", { ok: SENT });
}

export async function verifyUsernameCodeAction(fd: FormData) {
  const id = await getFlow("USERNAME");
  if (!id) back("/forgot-username", { error: "Your request has expired. Start again." });
  const r = await checkCode(id!, str(fd.get("code")), "USERNAME");
  if (!r.ok) back("/forgot-username?step=verify", { error: r.error });
  await audit(r.row.userId, "USERNAME_RECOVERED", "User", r.row.userId);
  // The verified (consumed) code row is the proof; the page shows the username for 10 minutes.
  redirect("/forgot-username?step=done");
}

// ---------------------------------------------------------------- §4 forgot registered email

/** Option A, step 1: prove you own the registered mobile. */
export async function recoverByMobileAction(fd: FormData) {
  const m = validateMobile(str(fd.get("mobile")));
  if (!m.ok) back("/forgot-email", { error: m.error });
  const mobile = (m as { e164: string }).e164;
  await throttle("/forgot-email", "mobile-recovery", mobile);
  const user = await db.user.findUnique({ where: { mobile } });
  let id: string;
  if (user && user.mobileVerifiedAt && !BLOCKED.includes(user.accountStatus)) {
    const c = await issueCode({ userId: user.id, purpose: "MOBILE_RECOVERY", channel: "SMS", target: mobile });
    await deliverCode("SMS", mobile, "MOBILE_RECOVERY", c.code);
    id = c.id;
  } else id = decoyId();
  await setFlow("MOBILE_RECOVERY", id);
  back("/forgot-email?step=verify", { ok: "If that mobile number is registered and verified, we've texted it a 6-digit code. It expires in 10 minutes." });
}

export async function verifyMobileRecoveryAction(fd: FormData) {
  const id = await getFlow("MOBILE_RECOVERY");
  if (!id) back("/forgot-email", { error: "Your request has expired. Start again." });
  const r = await checkCode(id!, str(fd.get("code")), "MOBILE_RECOVERY");
  if (!r.ok) back("/forgot-email?step=verify", { error: r.error });
  await clearFlow("MOBILE_RECOVERY");
  await setFlow("MOBILE_FOUND", r.row.id);
  await audit(r.row.userId, "EMAIL_HINT_SHOWN", "User", r.row.userId, { via: "mobile" });
  redirect("/forgot-email?step=found");
}

/** The verified mobile-recovery row, if it was verified in the last 30 minutes. */
async function mobileProof() {
  const id = await getFlow("MOBILE_FOUND");
  if (!id) return null;
  const row = await db.authCode.findUnique({ where: { id } });
  if (!row || row.purpose !== "MOBILE_RECOVERY" || !row.verifiedAt || row.verifiedAt.getTime() < Date.now() - 30 * 60_000) return null;
  return row;
}

/** Step 2 (both options): confirm the new email address the person can access, before an admin reviews. */
export async function requestNewEmailAction(fd: FormData) {
  const kind = str(fd.get("kind")) === "IDENTITY" ? "IDENTITY" : "MOBILE_VERIFIED";
  const newEmail = str(fd.get("newEmail")).toLowerCase();
  const path = kind === "IDENTITY" ? "/forgot-email?tab=identity" : "/forgot-email?step=found";
  if (!EMAIL_RE.test(newEmail)) back(path, { error: "Enter an email address you can access now." });
  await throttle(path, "new-email", newEmail);
  let meta: Record<string, unknown>;
  if (kind === "MOBILE_VERIFIED") {
    const proof = await mobileProof();
    if (!proof) back("/forgot-email", { error: "Your mobile verification has expired. Start again." });
    meta = { kind, userId: proof!.userId, mobileCodeId: proof!.id };
  } else {
    const identifier = str(fd.get("identifier"));
    const fullName = str(fd.get("fullName"));
    const details = str(fd.get("details")).slice(0, 2000);
    if (!identifier || !fullName) back(path, { error: "Enter your username or account ID and your full name." });
    meta = { kind, identifier, fullName, details };
  }
  if (await db.user.findUnique({ where: { email: newEmail } })) back(path, { error: "That email address can't be used. Enter a different one." });
  const c = await issueCode({ userId: null, purpose: "NEW_EMAIL", channel: "EMAIL", target: newEmail, meta });
  await deliverCode("EMAIL", newEmail, "NEW_EMAIL", c.code);
  await setFlow("NEW_EMAIL", c.id);
  back("/forgot-email?step=confirm", { ok: `We've emailed a code to ${newEmail}. Enter it to send your request for review.` });
}

export async function verifyNewEmailAction(fd: FormData) {
  const id = await getFlow("NEW_EMAIL");
  if (!id) back("/forgot-email", { error: "Your request has expired. Start again." });
  const r = await checkCode(id!, str(fd.get("code")), "NEW_EMAIL");
  if (!r.ok) back("/forgot-email?step=confirm", { error: r.error });
  const meta = r.row.meta as { kind: string; userId?: string; identifier?: string; fullName?: string; details?: string };
  let userId: string | null = meta.userId ?? null;
  if (meta.kind === "IDENTITY" && meta.identifier) userId = (await findByIdentifier(meta.identifier, { allowAccountId: true }))?.id ?? null;
  const ip = await clientIp();
  const req = await db.$transaction(async (tx) => {
    const c = await tx.counter.upsert({ where: { key: "REC" }, create: { key: "REC", value: 1 }, update: { value: { increment: 1 } } });
    return tx.recoveryRequest.create({
      data: {
        reference: `REC-${String(c.value).padStart(6, "0")}`, kind: meta.kind, userId, identifier: meta.identifier ?? "verified mobile",
        fullName: meta.fullName ?? null, newEmail: r.row.target, newEmailVerified: true, mobileVerified: meta.kind === "MOBILE_VERIFIED", details: meta.details ?? null, ip,
      },
    });
  });
  await audit(userId, "RECOVERY_REQUESTED", "RecoveryRequest", req.id, { kind: req.kind, reference: req.reference });
  // Warn the current owner through the channels already on file, so a hijack attempt can be stopped.
  if (userId) {
    const u = await db.user.findUnique({ where: { id: userId } });
    if (u) {
      await sendEmail(u.email, `Email change requested on your ${brand.name} account`, `Hi ${u.firstName},

We received a request (${req.reference}) to change the email address on your account to ${maskEmail(req.newEmail)}. Our team reviews every request before anything changes.

If this wasn't you, reply to ${brand.supportEmail} quoting ${req.reference} and we'll stop it.`);
      if (u.mobile && meta.kind === "IDENTITY") await sendSms(u.mobile, `${brand.name}: a request to change your account email was received (${req.reference}). If this wasn't you, contact ${brand.supportEmail}.`);
    }
  }
  await notifyAdmins("Account recovery request", `${req.reference}: ${req.kind === "IDENTITY" ? "identity review" : "verified mobile"} — new email change to review.`, "/admin/recovery");
  await clearFlow("NEW_EMAIL");
  await clearFlow("MOBILE_FOUND");
  redirect(`/forgot-email?step=submitted&ref=${req.reference}`);
}
