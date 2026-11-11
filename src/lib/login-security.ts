import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { brand } from "@/config/brand";
import { db } from "./db";
import { appUrl, sendEmail } from "./notify";
import { lockMinutes, maskIdentifier } from "./auth-codes";
import { dateTime } from "./format";

const DEVICE_COOKIE = "sb_device";

/** IP, user agent and a random first-party device id (set on first sign-in; contains no personal data). */
export async function requestInfo(setDevice = true) {
  const h = await headers();
  const ip = h.get("cf-connecting-ip") || h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || null;
  const userAgent = (h.get("user-agent") ?? "").slice(0, 300) || null;
  const jar = await cookies();
  let deviceId = jar.get(DEVICE_COOKIE)?.value ?? null;
  if (!deviceId && setDevice) {
    deviceId = crypto.randomUUID();
    jar.set(DEVICE_COOKIE, deviceId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 400 * 86400 });
  }
  return { ip, userAgent, deviceId };
}

/** "Chrome on Windows" — good enough for login history; no fingerprinting. */
export function describeDevice(ua: string | null | undefined) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "unknown OS";
  return `${browser} on ${os}`;
}

// ---------------------------------------------------------------- progressive lockout (§8)

export function lockedFor(user: { lockedUntil: Date | null }) {
  if (!user.lockedUntil || user.lockedUntil <= new Date()) return 0;
  return Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
}

export async function registerFailure(userId: string) {
  const u = await db.user.update({ where: { id: userId }, data: { failedLogins: { increment: 1 } } });
  const mins = lockMinutes(u.failedLogins);
  if (mins) await db.user.update({ where: { id: userId }, data: { lockedUntil: new Date(Date.now() + mins * 60_000) } });
  return mins;
}

export async function registerSuccess(userId: string) {
  await db.user.update({ where: { id: userId }, data: { failedLogins: 0, lockedUntil: null } });
}

// ---------------------------------------------------------------- login history + alerts (§11)

export async function recordLogin(o: { userId: string | null; identifier: string; method: "PASSWORD" | "EMAIL_CODE" | "RESET"; success: boolean; reason?: string }) {
  const info = await requestInfo(o.success);
  let newDevice = false;
  if (o.success && o.userId) {
    const [prior, sameDevice] = await Promise.all([
      db.loginEvent.count({ where: { userId: o.userId, success: true } }),
      info.deviceId ? db.loginEvent.count({ where: { userId: o.userId, success: true, deviceId: info.deviceId } }) : Promise.resolve(0),
    ]);
    newDevice = prior > 0 && sameDevice === 0; // first ever sign-in isn't "suspicious"
  }
  await db.loginEvent.create({
    data: { userId: o.userId, identifier: maskIdentifier(o.identifier), method: o.method, success: o.success, reason: o.reason ?? null, ip: info.ip, userAgent: info.userAgent, deviceId: info.deviceId, newDevice },
  });
  return { newDevice, ...info };
}

/** Email after a sign-in from a new device, and after every email-code sign-in (§5 "notify user about successful login"). */
export async function loginAlert(user: { email: string; firstName: string }, o: { method: string; newDevice: boolean; ip: string | null; userAgent: string | null }) {
  if (!o.newDevice && o.method !== "EMAIL_CODE") return;
  const how = o.method === "EMAIL_CODE" ? "with an email code" : "from a new device";
  await sendEmail(
    user.email,
    `New sign-in to your ${brand.name} account`,
    `Hi ${user.firstName},

Your ${brand.name} account was signed in to ${how}.

When: ${dateTime(new Date())} (Sydney time)
Device: ${describeDevice(o.userAgent)}
IP address: ${o.ip ?? "unknown"}

If this was you, there's nothing to do.
If it wasn't, reset your password now: ${appUrl("/forgot-password")}
Then review your devices: ${appUrl("/account/security")}`,
  );
}

// ---------------------------------------------------------------- multi-step flow state

const flowCookie = (purpose: string) => `sb_flow_${purpose.toLowerCase()}`;

/** Remembers which challenge a multi-step form is on. The id alone grants nothing without the code. */
export async function setFlow(purpose: string, id: string) {
  (await cookies()).set(flowCookie(purpose), id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 60 });
}

export async function getFlow(purpose: string) {
  return (await cookies()).get(flowCookie(purpose))?.value ?? null;
}

export async function clearFlow(purpose: string) {
  (await cookies()).delete(flowCookie(purpose));
}
