"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { back } from "@/lib/action-utils";
import { ageOn, optStr, str } from "@/lib/format";
import { AU_STATES } from "@/lib/constants";
import { audit } from "@/lib/audit";

export async function updateProfileAction(fd: FormData) {
  const user = await requireUser();
  const state = str(fd.get("state"));
  const postcode = str(fd.get("postcode"));
  const dobRaw = str(fd.get("dateOfBirth"));
  if (state && !AU_STATES.some((s) => s.code === state)) back("/account", { error: "Invalid state." });
  if (postcode && !/^\d{4}$/.test(postcode)) back("/account", { error: "Postcode must be 4 digits." });
  const data: Record<string, unknown> = { displayName: optStr(fd.get("displayName")), suburb: optStr(fd.get("suburb")), state: state || null, postcode: postcode || null };
  // date of birth can be set once by the user; later corrections go through support (eligibility integrity)
  if (dobRaw && !user.dateOfBirth) {
    const dob = new Date(`${dobRaw}T00:00:00Z`);
    if (isNaN(dob.getTime()) || ageOn(dob) < 18) back("/account", { error: "You must be 18 or older." });
    data.dateOfBirth = dob;
  }
  await db.user.update({ where: { id: user.id }, data });
  await audit(user.id, "PROFILE_UPDATED", "User", user.id, { fields: Object.keys(data) });
  back("/account", { ok: "Profile updated." });
}

export async function markAllReadAction() {
  const user = await requireUser();
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/account/notifications");
}

/** Save this browser's Firebase Cloud Messaging token so the user gets push notifications here. */
export async function savePushTokenAction(token: string, userAgent?: string) {
  const user = await requireUser();
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) return { ok: false };
  await db.pushToken.upsert({
    where: { token },
    create: { token, userId: user.id, userAgent: userAgent?.slice(0, 300) ?? null },
    update: { userId: user.id, userAgent: userAgent?.slice(0, 300) ?? null },
  });
  return { ok: true };
}

/** Stop push notifications on this browser. */
export async function removePushTokenAction(token: string) {
  const user = await requireUser();
  if (typeof token !== "string") return { ok: false };
  await db.pushToken.deleteMany({ where: { token, userId: user.id } });
  return { ok: true };
}
