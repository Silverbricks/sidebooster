"use server";
import { brand } from "@/config/brand";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, destroySession, getCurrentUser, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { back, attempt } from "@/lib/action-utils";
import { nextPublicId, normaliseEmail, normaliseMobile, passwordProblems, isValidAbn, isValidAcn } from "@/lib/ids";
import { optStr, str, ageOn } from "@/lib/format";
import { randomToken } from "@/lib/crypto";
import { appUrl, sendEmail } from "@/lib/notify";
import { refreshAccountStatus, riskScreen, sendMobileOtp, verifyMobileOtp } from "@/lib/accounts";
import { audit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { AU_STATES } from "@/lib/constants";

const STATE_CODES = AU_STATES.map((s) => s.code as string);

type Identity = { firstName: string; lastName: string; email: string; mobile: string; password: string; state: string; postcode: string; dob: Date | null };

function readIdentity(fd: FormData, path: string, requireDob: boolean): Identity {
  if (str(fd.get("website"))) back(path, { error: "Registration failed." }); // honeypot
  const firstName = str(fd.get("firstName"));
  const lastName = str(fd.get("lastName"));
  const email = normaliseEmail(str(fd.get("email")));
  const mobile = normaliseMobile(str(fd.get("mobile")));
  const password = str(fd.get("password"));
  const state = str(fd.get("state"));
  const postcode = str(fd.get("postcode"));
  const dobRaw = str(fd.get("dateOfBirth"));
  const dob = dobRaw ? new Date(`${dobRaw}T00:00:00Z`) : null;

  if (!firstName || !lastName) back(path, { error: "Enter your first and last name." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back(path, { error: "Enter a valid email address." });
  if (!mobile) back(path, { error: "Enter a valid Australian mobile number (04xx xxx xxx)." });
  const pw = passwordProblems(password);
  if (pw.length) back(path, { error: `Password needs ${pw.join(", ")}.` });
  if (password !== str(fd.get("confirmPassword"))) back(path, { error: "Passwords do not match." });
  if (!STATE_CODES.includes(state)) back(path, { error: "Choose your state or territory." });
  if (!/^\d{4}$/.test(postcode)) back(path, { error: "Enter a 4-digit postcode." });
  if (requireDob && !dob) back(path, { error: "Date of birth is required." });
  if (dob && (isNaN(dob.getTime()) || ageOn(dob) < 18)) back(path, { error: "You must be 18 or older to register." });
  if (fd.get("terms") !== "on") back(path, { error: "You must accept the Terms & Conditions and Privacy Policy." });
  return { firstName, lastName, email, mobile: mobile!, password, state, postcode, dob };
}

async function assertUnique(email: string, mobile: string, path: string) {
  if (await db.user.findUnique({ where: { email } })) back(path, { error: "An account with this email already exists. Try logging in." });
  if (await db.user.findUnique({ where: { mobile } })) back(path, { error: "This mobile number is already registered to another account." });
}

async function sendVerificationEmail(userId: string, email: string) {
  const token = randomToken();
  await db.user.update({ where: { id: userId }, data: { emailVerifyToken: token } });
  await sendEmail(email, `Verify your ${brand.name} email`, `Welcome to ${brand.name}!\n\nVerify your email address:\n${appUrl(`/verify-email?token=${token}`)}`);
}

export async function registerBuyerAction(fd: FormData) {
  const path = "/register";
  if (!rateLimit(`reg:${await clientIp()}`, 5, 3600_000)) back(path, { error: "Too many registrations from this network. Try again later." });
  const id = readIdentity(fd, path, false);
  await assertUnique(id.email, id.mobile, path);
  const flags = await riskScreen({ firstName: id.firstName, lastName: id.lastName, dateOfBirth: id.dob, postcode: id.postcode });

  const user = await db.$transaction(async (tx) => {
    const publicId = await nextPublicId(tx, "BUY");
    return tx.user.create({
      data: {
        publicId,
        email: id.email,
        passwordHash: await hashPassword(id.password),
        firstName: id.firstName,
        lastName: id.lastName,
        name: `${id.firstName} ${id.lastName}`,
        mobile: id.mobile,
        state: id.state,
        postcode: id.postcode,
        suburb: optStr(fd.get("suburb")),
        dateOfBirth: id.dob,
        termsAcceptedAt: new Date(),
        role: "BUYER",
        accountStatus: flags.length ? "VERIFICATION_REQUIRED" : "EMAIL_PENDING",
        riskFlags: flags.join(",") || null,
      },
    });
  });
  await audit(user.id, "USER_REGISTERED", "User", user.id, { publicId: user.publicId, flags });
  await sendVerificationEmail(user.id, user.email);
  await sendMobileOtp(user.id);
  await createSession(user.id);
  redirect("/verify");
}

export async function registerSellerAction(fd: FormData) {
  const path = "/register/seller";
  const current = await getCurrentUser();
  const sellerType = str(fd.get("sellerType")) === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL";
  const legalName = str(fd.get("legalName"));
  const address = str(fd.get("address"));
  const businessName = optStr(fd.get("businessName"));
  const abn = optStr(fd.get("abn"))?.replace(/\s/g, "") ?? null;
  const acn = optStr(fd.get("acn"))?.replace(/\s/g, "") ?? null;
  const authorisedRep = optStr(fd.get("authorisedRep"));
  if (!legalName) back(path, { error: sellerType === "BUSINESS" ? "Enter the legal business name." : "Enter your full legal name." });
  if (!address) back(path, { error: "Enter your address." });
  if (sellerType === "BUSINESS") {
    if (!abn && !acn) back(path, { error: "Business sellers must provide an ABN or ACN." });
    if (abn && !isValidAbn(abn)) back(path, { error: "That ABN is not valid." });
    if (acn && !isValidAcn(acn)) back(path, { error: "That ACN is not valid." });
    if (!authorisedRep) back(path, { error: "Enter the authorised representative." });
  }

  if (current) {
    // existing buyer upgrades to seller: keeps their Buyer ID, gets a Seller ID
    if (current.sellerProfile) redirect("/seller");
    if (current.role === "ADMIN") back(path, { error: "Admins cannot register as sellers." });
    if (!current.dateOfBirth && sellerType === "INDIVIDUAL") back(path, { error: "Add your date of birth in your profile first." });
    await db.$transaction(async (tx) => {
      const sellerCode = await nextPublicId(tx, sellerType === "BUSINESS" ? "BUS" : "SEL");
      await tx.sellerProfile.create({
        data: { userId: current.id, sellerCode, sellerType, legalName, businessName, abn, acn, authorisedRep, address, state: current.state, postcode: current.postcode, bio: optStr(fd.get("bio")) },
      });
      await tx.user.update({ where: { id: current.id }, data: { role: "SELLER" } });
      await audit(current.id, "SELLER_REGISTERED", "SellerProfile", sellerCode, { sellerType }, tx);
    });
    redirect("/seller/verification");
  }

  if (!rateLimit(`reg:${await clientIp()}`, 5, 3600_000)) back(path, { error: "Too many registrations from this network. Try again later." });
  const id = readIdentity(fd, path, sellerType === "INDIVIDUAL");
  await assertUnique(id.email, id.mobile, path);
  const flags = await riskScreen({ firstName: id.firstName, lastName: id.lastName, dateOfBirth: id.dob, postcode: id.postcode });
  const user = await db.$transaction(async (tx) => {
    const sellerCode = await nextPublicId(tx, sellerType === "BUSINESS" ? "BUS" : "SEL");
    const u = await tx.user.create({
      data: {
        publicId: sellerCode,
        email: id.email,
        passwordHash: await hashPassword(id.password),
        firstName: id.firstName,
        lastName: id.lastName,
        name: `${id.firstName} ${id.lastName}`,
        mobile: id.mobile,
        state: id.state,
        postcode: id.postcode,
        dateOfBirth: id.dob,
        termsAcceptedAt: new Date(),
        role: "SELLER",
        accountStatus: flags.length ? "VERIFICATION_REQUIRED" : "EMAIL_PENDING",
        riskFlags: flags.join(",") || null,
      },
    });
    await tx.sellerProfile.create({
      data: { userId: u.id, sellerCode, sellerType, legalName, businessName, abn, acn, authorisedRep, address, state: id.state, postcode: id.postcode, bio: optStr(fd.get("bio")) },
    });
    return u;
  });
  await audit(user.id, "SELLER_REGISTERED", "User", user.id, { publicId: user.publicId, sellerType, flags });
  await sendVerificationEmail(user.id, user.email);
  await sendMobileOtp(user.id);
  await createSession(user.id);
  redirect("/verify");
}

export async function loginAction(fd: FormData) {
  const email = normaliseEmail(str(fd.get("email")));
  const password = str(fd.get("password"));
  const next = str(fd.get("next"));
  const path = `/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  const ip = await clientIp();
  if (!rateLimit(`login:${ip}`, 20, 15 * 60_000) || !rateLimit(`login:${email}`, 8, 15 * 60_000))
    back(path, { error: "Too many attempts. Please wait 15 minutes." });
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) back(path, { error: "Incorrect email or password." });
  if (["SUSPENDED", "CLOSED"].includes(user!.accountStatus)) back(path, { error: `This account is ${user!.accountStatus.toLowerCase()}. Contact support.` });
  await createSession(user!.id);
  await audit(user!.id, "LOGIN", "User", user!.id, { ip });
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : null;
  if (user!.accountStatus === "EMAIL_PENDING" || user!.accountStatus === "MOBILE_PENDING") redirect("/verify");
  redirect(safeNext ?? (user!.role === "ADMIN" ? "/admin" : user!.role === "SELLER" ? "/seller" : "/account"));
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function resendEmailAction() {
  const user = await requireUser();
  if (user.emailVerifiedAt) back("/verify", { ok: "Email already verified." });
  if (!rateLimit(`resend:${user.id}`, 3, 3600_000)) back("/verify", { error: "Please wait before requesting another email." });
  await sendVerificationEmail(user.id, user.email);
  back("/verify", { ok: "Verification email sent." });
}

export async function sendOtpAction() {
  const user = await requireUser();
  if (!rateLimit(`otp:${user.id}`, 3, 15 * 60_000)) back("/verify", { error: "Please wait before requesting another code." });
  await attempt("/verify", async () => {
    await sendMobileOtp(user.id);
    return "Code sent to your mobile.";
  });
}

export async function verifyOtpAction(fd: FormData) {
  const user = await requireUser();
  const err = await verifyMobileOtp(user.id, str(fd.get("code")));
  if (err) back("/verify", { error: err });
  back("/verify", { ok: "Mobile number verified." });
}

export async function verifyEmailToken(token: string) {
  const user = await db.user.findUnique({ where: { emailVerifyToken: token } });
  if (!user) return false;
  await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date(), emailVerifyToken: null } });
  await refreshAccountStatus(user.id);
  await audit(user.id, "EMAIL_VERIFIED", "User", user.id);
  return true;
}
