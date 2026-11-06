import { brand } from "@/config/brand";
import "server-only";
import crypto from "node:crypto";
import type { SellerProfile, User } from "@prisma/client";
import { db, type Tx } from "./db";
import { sha256 } from "./crypto";
import { getBool } from "./settings";
import { sendSms } from "./notify";
import { audit } from "./audit";

const LOCKED_STATUSES = ["SUSPENDED", "CLOSED", "RESTRICTED", "VERIFICATION_REQUIRED"];

/**
 * Recalculate a user's account status from their verification state.
 * Buyers are auto-approved (ACTIVE) once email (+ mobile, if the rule is on) is verified.
 * Admin-imposed statuses (suspended, restricted, …) are never overridden here.
 */
export async function refreshAccountStatus(userId: string, tx: Tx = db) {
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId } });
  if (LOCKED_STATUSES.includes(u.accountStatus)) return u.accountStatus;
  const needMobile = await getBool("rule_buyer_require_mobile");
  let status = "ACTIVE";
  if (!u.emailVerifiedAt) status = "EMAIL_PENDING";
  else if (needMobile && !u.mobileVerifiedAt) status = "MOBILE_PENDING";
  if (status !== u.accountStatus) await tx.user.update({ where: { id: userId }, data: { accountStatus: status } });
  return status;
}

/** Basic duplicate-account risk screening at registration. */
export async function riskScreen(input: { firstName: string; lastName: string; dateOfBirth: Date | null; postcode: string | null }, tx: Tx = db) {
  const flags: string[] = [];
  if (input.dateOfBirth) {
    const dup = await tx.user.findFirst({
      where: {
        firstName: input.firstName,
        lastName: input.lastName,
        dateOfBirth: input.dateOfBirth,
        ...(input.postcode ? { postcode: input.postcode } : {}),
      },
      select: { id: true },
    });
    if (dup) flags.push("POSSIBLE_DUPLICATE");
  }
  return flags;
}

export async function sendMobileOtp(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!u.mobile) throw new Error("No mobile number on file.");
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await db.user.update({
    where: { id: userId },
    data: { mobileOtpHash: sha256(`${userId}:${code}`), mobileOtpExpires: new Date(Date.now() + 10 * 60_000), mobileOtpTries: 0 },
  });
  await sendSms(u.mobile, `Your ${brand.name} verification code is ${code}. It expires in 10 minutes.`);
}

export async function verifyMobileOtp(userId: string, code: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!u.mobileOtpHash || !u.mobileOtpExpires || u.mobileOtpExpires < new Date()) return "Code expired — request a new one.";
  if (u.mobileOtpTries >= 5) return "Too many attempts — request a new code.";
  if (sha256(`${userId}:${code.trim()}`) !== u.mobileOtpHash) {
    await db.user.update({ where: { id: userId }, data: { mobileOtpTries: { increment: 1 } } });
    return "Incorrect code.";
  }
  await db.user.update({ where: { id: userId }, data: { mobileVerifiedAt: new Date(), mobileOtpHash: null, mobileOtpExpires: null } });
  await refreshAccountStatus(userId);
  await audit(userId, "MOBILE_VERIFIED", "User", userId);
  return null;
}

/** APPROVED → ACTIVE once the payout account is enabled (if the rule requires it). */
export async function refreshSellerStatus(sellerProfileId: string, tx: Tx = db) {
  const s = await tx.sellerProfile.findUniqueOrThrow({ where: { id: sellerProfileId }, include: { paymentAccount: true } });
  if (!["APPROVED", "ACTIVE"].includes(s.status)) return s.status;
  const needPayout = await getBool("rule_seller_require_payout_account");
  const payoutOk = !!s.paymentAccount?.payoutsEnabled && !s.paymentAccount.restricted;
  const status = !needPayout || payoutOk ? "ACTIVE" : "APPROVED";
  if (status !== s.status) await tx.sellerProfile.update({ where: { id: s.id }, data: { status } });
  return status;
}

type U = Pick<User, "role" | "accountStatus"> & { sellerProfile: SellerProfile | null };

/** "No verification = No selling." */
export function canSubmitListings(u: U) {
  if (u.role === "ADMIN") return true;
  return u.accountStatus === "ACTIVE" && !!u.sellerProfile && ["APPROVED", "ACTIVE"].includes(u.sellerProfile.status);
}

export function canSell(u: U) {
  if (u.role === "ADMIN") return true;
  return u.accountStatus === "ACTIVE" && u.sellerProfile?.status === "ACTIVE";
}

export function canTransact(u: Pick<User, "accountStatus">) {
  return u.accountStatus === "ACTIVE";
}
