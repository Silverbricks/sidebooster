import "server-only";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";
import type { Role } from "./constants";

const COOKIE = "se_session";
const SESSION_DAYS = 30; // "Remember me"
const SHORT_SESSION_HOURS = 12; // without "Remember me": browser-session cookie, 12h server limit
const TOUCH_EVERY_MS = 5 * 60_000;
const BLOCKED = ["SUSPENDED", "CLOSED"];

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

/** Bcrypt hash of a random string: compared against when no account matches, so timing doesn't reveal which emails exist. */
const DUMMY_HASH = "$2b$12$4HH09ywc3N/nK8uex4bC6OfdhrJfHoHlRMH8Ca4Mk1MnDMzB.9d5a";
export async function burnPasswordCheck(pw: string) {
  await bcrypt.compare(pw, DUMMY_HASH).catch(() => false);
}

export async function createSession(userId: string, opts: { persistent?: boolean; method?: "PASSWORD" | "EMAIL_CODE" | "RESET" } = {}) {
  const persistent = opts.persistent ?? true;
  const token = randomToken();
  const expiresAt = new Date(Date.now() + (persistent ? SESSION_DAYS * 86400_000 : SHORT_SESSION_HOURS * 3600_000));
  const h = await headers();
  await db.session.create({
    data: {
      tokenHash: sha256(token), userId, expiresAt, persistent, method: opts.method ?? "PASSWORD",
      ip: h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(persistent ? { expires: expiresAt } : {}), // no expiry = cleared when the browser closes
  });
}

/** Id of the session making this request (to mark "this device" and keep it when revoking others). */
export async function currentSessionId() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  return (await db.session.findUnique({ where: { tokenHash: sha256(token) }, select: { id: true } }))?.id ?? null;
}

/** Signs the user out everywhere (optionally keeping the current device). */
export async function revokeSessions(userId: string, keepSessionId?: string | null) {
  const r = await db.session.deleteMany({ where: { userId, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) } });
  return r.count;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(COOKIE);
}

export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { sellerProfile: { include: { paymentAccount: true } } } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (BLOCKED.includes(session.user.accountStatus)) return null;
  if (Date.now() - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.session.updateMany({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return session.user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser(roles?: Role[], next?: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  if (roles && !roles.includes(user.role as Role)) redirect("/?denied=1");
  return user;
}

export async function requireAdmin() {
  return requireUser(["ADMIN"]);
}

/** Any seller with a profile, whatever their verification state. */
export async function requireSeller() {
  const user = await requireUser(["SELLER", "ADMIN"], "/seller");
  if (user.role === "SELLER" && !user.sellerProfile) redirect("/register/seller");
  return user;
}
