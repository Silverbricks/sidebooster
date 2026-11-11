import "server-only";
import { redirect } from "next/navigation";
import { db } from "./db";
import { createSession } from "./auth";
import { audit } from "./audit";
import { back } from "./action-utils";
import { loginAlert, recordLogin, registerSuccess } from "./login-security";

/** Where a signed-in user lands: a safe same-site `next`, else their dashboard. */
export function landing(user: { role: string; accountStatus: string }, next: string) {
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : null;
  if (user.accountStatus === "EMAIL_PENDING" || user.accountStatus === "MOBILE_PENDING") return "/verify";
  return safeNext ?? (user.role === "ADMIN" ? "/admin" : user.role === "SELLER" ? "/seller" : "/account");
}

/**
 * Completes a sign-in once an email code has been verified. NOT a server action — only call it
 * after checkCode() succeeded for this user.
 */
export async function finishCodeLogin(userId: string, remember: boolean, next: string, identifier: string): Promise<never> {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (["SUSPENDED", "CLOSED"].includes(u.accountStatus)) back("/login", { error: `This account is ${u.accountStatus.toLowerCase()}. Contact support.` });
  await registerSuccess(u.id);
  await createSession(u.id, { persistent: remember, method: "EMAIL_CODE" });
  const ev = await recordLogin({ userId: u.id, identifier, method: "EMAIL_CODE", success: true });
  await audit(u.id, "LOGIN", "User", u.id, { method: "EMAIL_CODE" });
  await loginAlert(u, { method: "EMAIL_CODE", ...ev });
  redirect(landing(u, next));
}
