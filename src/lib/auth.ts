import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";
import type { Role } from "./constants";

const COOKIE = "se_session";
const SESSION_DAYS = 30;
const BLOCKED = ["SUSPENDED", "CLOSED"];

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.session.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
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
