import "server-only";
import { brand } from "@/config/brand";
import { sendEmail, sendSms } from "./notify";
import type { CodePurpose } from "./auth-codes";

const SUBJECT: Record<CodePurpose, string> = {
  LOGIN: `Your ${brand.name} sign-in code`,
  RESET: `Your ${brand.name} password reset code`,
  USERNAME: `Your ${brand.name} username recovery code`,
  MOBILE_RECOVERY: "Account recovery code",
  NEW_EMAIL: `Confirm your email for ${brand.name} account recovery`,
  EMAIL_CHANGE_OLD: `Confirm your ${brand.name} email change`,
  EMAIL_CHANGE_NEW: `Confirm your new ${brand.name} email address`,
};

const WHY: Record<CodePurpose, string> = {
  LOGIN: "Use it to sign in.",
  RESET: "Use it to reset your password.",
  USERNAME: "Use it to see your username.",
  MOBILE_RECOVERY: "Use it to recover your account.",
  NEW_EMAIL: "Use it to confirm this address for your account recovery request.",
  EMAIL_CHANGE_OLD: "Someone (hopefully you) asked to change the email address on your account. Enter this code to approve the change.",
  EMAIL_CHANGE_NEW: "Enter this code to confirm this is your new email address.",
};

/** Sends a one-time code. Messages are marked sensitive so the code is redacted from logs once a provider is live. */
export async function deliverCode(channel: string, target: string, purpose: CodePurpose, code: string) {
  if (channel === "SMS") {
    await sendSms(target, `${brand.name} code: ${code}. ${WHY[purpose]} Expires in 10 minutes. Never share this code.`, undefined, { sensitive: true });
    return;
  }
  await sendEmail(
    target,
    SUBJECT[purpose],
    `Your code is: ${code}

${WHY[purpose]} It expires in 10 minutes and can be used once.

${brand.name} will never ask you for this code by phone, chat or text. If you didn't request it, ignore this email — nothing changes on your account without the code.`,
    undefined,
    { sensitive: true },
  );
}
