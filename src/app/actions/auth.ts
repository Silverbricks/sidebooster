"use server";
import { brand } from "@/config/brand";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { burnPasswordCheck, createSession, destroySession, getCurrentUser, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { findByIdentifier } from "@/lib/auth-codes";
import { lockedFor, loginAlert, recordLogin, registerFailure, registerSuccess } from "@/lib/login-security";
import { landing } from "@/lib/sign-in";
import { back, attempt } from "@/lib/action-utils";
import { nextPublicId, normaliseEmail, passwordProblems } from "@/lib/ids";
import { validateMobile } from "@/lib/phone";
import { parseDob, postcodeMatchesState, STATE_CODES } from "@/lib/au-validation";
import { readSellerBusiness } from "@/lib/seller-business-form";
import { consentProblem, localityOnly, MIN_SELLER_AGE, readConsent, readLocationForm, recordConsents, requestMeta, runBusinessCheck, saveSellerLocation } from "@/lib/seller-verification";
import { optStr, str, ageOn } from "@/lib/format";
import { randomToken } from "@/lib/crypto";
import { appUrl, sendEmail } from "@/lib/notify";
import { refreshAccountStatus, riskScreen, sendMobileOtp, verifyMobileOtp } from "@/lib/accounts";
import { audit } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";

type Identity = { firstName: string; lastName: string; email: string; mobile: string; password: string; state: string | null; postcode: string | null; dob: Date | null };

function readIdentity(fd: FormData, path: string, opts: { requireDob: boolean; seller?: boolean }): Identity {
  if (str(fd.get("website"))) back(path, { error: "Registration failed." }); // honeypot
  const firstName = str(fd.get("firstName"));
  const lastName = str(fd.get("lastName"));
  const email = normaliseEmail(str(fd.get("email")));
  const mobile = validateMobile(str(fd.get("mobile")));
  const password = str(fd.get("password"));
  const dobRaw = str(fd.get("dateOfBirth"));

  if (!firstName || !lastName) back(path, { error: "Enter your first and last name." });
  if (firstName.length > 60 || lastName.length > 60) back(path, { error: "Names must be 60 characters or fewer." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back(path, { error: "Enter a valid email address." });
  if (!mobile.ok) back(path, { error: mobile.error });
  const pw = passwordProblems(password);
  if (pw.length) back(path, { error: `Password needs ${pw.join(", ")}.` });
  if (password !== str(fd.get("confirmPassword"))) back(path, { error: "Passwords do not match." });
  let state: string | null = null;
  let postcode: string | null = null;
  if (!opts.seller) {
    state = str(fd.get("state"));
    postcode = str(fd.get("postcode"));
    if (!STATE_CODES.includes(state)) back(path, { error: "Choose your state or territory." });
    if (!/^\d{4}$/.test(postcode)) back(path, { error: "Enter a 4-digit postcode." });
    if (!postcodeMatchesState(postcode, state)) back(path, { error: `Postcode ${postcode} isn't in ${state}. Check the postcode and state.` });
  }
  if (opts.requireDob && !dobRaw) back(path, { error: "Date of birth is required (DD/MM/YYYY)." });
  let dob: Date | null = null;
  if (dobRaw) {
    const r = parseDob(dobRaw, MIN_SELLER_AGE);
    if (!r.ok) back(path, { error: opts.seller ? r.error : r.error.replace("to register as a seller. Under-18 registrations aren't accepted.", "to register.") });
    dob = r.date;
  }
  const cp = consentProblem(readConsent(fd));
  if (cp) back(path, { error: cp });
  return { firstName, lastName, email, mobile: (mobile as { e164: string }).e164, password, state, postcode, dob };
}

async function assertUnique(email: string, mobile: string, path: string) {
  if (await db.user.findUnique({ where: { email } })) back(path, { error: "An account with this email already exists. Try logging in." });
  if (await db.user.findUnique({ where: { mobile } })) back(path, { error: "This mobile number is already registered to another account." });
}

async function sendVerificationEmail(userId: string, email: string) {
  const token = randomToken();
  await db.user.update({ where: { id: userId }, data: { emailVerifyToken: token } });
  await sendEmail(email, `Verify your ${brand.name} email`, `Welcome to ${brand.name}!\n\nVerify your email address:\n${appUrl(`/verify-email?token=${token}`)}`, db, { sensitive: true });
}

export async function registerBuyerAction(fd: FormData) {
  const path = "/register";
  if (!rateLimit(`reg:${await clientIp()}`, 5, 3600_000)) back(path, { error: "Too many registrations from this network. Try again later." });
  const id = readIdentity(fd, path, { requireDob: false });
  await assertUnique(id.email, id.mobile, path);
  const flags = await riskScreen({ firstName: id.firstName, lastName: id.lastName, dateOfBirth: id.dob, postcode: id.postcode });
  const meta = await requestMeta();

  const user = await db.$transaction(async (tx) => {
    const publicId = await nextPublicId(tx, "BUY");
    const u = await tx.user.create({
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
    await recordConsents(u.id, readConsent(fd), meta, tx);
    return u;
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
  const biz = readSellerBusiness(fd, path);
  const loc = readLocationForm(fd);
  if (loc.problem) back(path, { error: loc.problem });
  const r = loc.form.residential;
  const profileData = {
    sellerType: biz.sellerType, businessStructure: biz.structure, legalName: biz.legalName, businessName: biz.businessName, abn: biz.abn, acn: biz.acn,
    authorisedRep: biz.authorisedRep, abnConfirmedAt: biz.abnConfirmed ? new Date() : null, bio: biz.bio,
    address: localityOnly(r), country: r.country, suburb: r.suburb, state: r.state, postcode: r.postcode,
  };
  const meta = await requestMeta();

  if (current) {
    // existing buyer upgrades to seller: keeps their Buyer ID, gets a Seller ID
    if (current.sellerProfile) redirect("/seller");
    if (current.role === "ADMIN") back(path, { error: "Admins cannot register as sellers." });
    let dob = current.dateOfBirth;
    if (!dob) {
      const d = parseDob(str(fd.get("dateOfBirth")), MIN_SELLER_AGE);
      if (!d.ok) back(path, { error: d.error });
      dob = (d as { date: Date }).date;
    } else if (ageOn(dob) < MIN_SELLER_AGE) back(path, { error: `You must be ${MIN_SELLER_AGE} or older to register as a seller.` });
    const consent = readConsent(fd);
    const cp = consentProblem(consent);
    if (cp) back(path, { error: cp });
    const sp = await db.$transaction(async (tx) => {
      const sellerCode = await nextPublicId(tx, biz.sellerType === "BUSINESS" ? "BUS" : "SEL");
      const created = await tx.sellerProfile.create({ data: { userId: current.id, sellerCode, storeSlug: sellerCode.toLowerCase(), ...profileData } });
      await tx.user.update({ where: { id: current.id }, data: { role: "SELLER", dateOfBirth: dob } });
      await recordConsents(current.id, consent, meta, tx);
      await audit(current.id, "SELLER_REGISTERED", "SellerProfile", sellerCode, { structure: biz.structure }, tx);
      return created;
    });
    await saveSellerLocation(sp.id, current.id, loc.form);
    if (biz.abn || biz.acn) await runBusinessCheck(sp.id, current.id);
    redirect("/seller/verification");
  }

  if (!rateLimit(`reg:${await clientIp()}`, 5, 3600_000)) back(path, { error: "Too many registrations from this network. Try again later." });
  const id = readIdentity(fd, path, { requireDob: true, seller: true });
  await assertUnique(id.email, id.mobile, path);
  const flags = await riskScreen({ firstName: id.firstName, lastName: id.lastName, dateOfBirth: id.dob, postcode: r.postcode });
  const { user, sp } = await db.$transaction(async (tx) => {
    const sellerCode = await nextPublicId(tx, biz.sellerType === "BUSINESS" ? "BUS" : "SEL");
    const u = await tx.user.create({
      data: {
        publicId: sellerCode,
        email: id.email,
        passwordHash: await hashPassword(id.password),
        firstName: id.firstName,
        lastName: id.lastName,
        name: `${id.firstName} ${id.lastName}`,
        mobile: id.mobile,
        state: r.state,
        postcode: r.postcode,
        suburb: r.suburb,
        dateOfBirth: id.dob,
        termsAcceptedAt: new Date(),
        role: "SELLER",
        accountStatus: flags.length ? "VERIFICATION_REQUIRED" : "EMAIL_PENDING",
        riskFlags: flags.join(",") || null,
      },
    });
    const created = await tx.sellerProfile.create({ data: { userId: u.id, sellerCode, storeSlug: sellerCode.toLowerCase(), ...profileData } });
    await recordConsents(u.id, readConsent(fd), meta, tx);
    return { user: u, sp: created };
  });
  await audit(user.id, "SELLER_REGISTERED", "User", user.id, { publicId: user.publicId, structure: biz.structure, flags });
  await saveSellerLocation(sp.id, user.id, loc.form);
  if (biz.abn || biz.acn) await runBusinessCheck(sp.id, user.id);
  await sendVerificationEmail(user.id, user.email);
  await sendMobileOtp(user.id);
  await createSession(user.id);
  redirect("/verify");
}

const LOGIN_FAILED = "Incorrect email/username or password.";

export async function loginAction(fd: FormData) {
  const identifier = str(fd.get("identifier") ?? fd.get("email"));
  const password = str(fd.get("password"));
  const remember = fd.get("remember") === "on";
  const next = str(fd.get("next"));
  const path = `/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  const ip = await clientIp();
  const key = identifier.toLowerCase();
  if (!rateLimit(`login:${ip}`, 20, 15 * 60_000) || !rateLimit(`login:${key}`, 10, 15 * 60_000))
    back(path, { error: "Too many sign-in attempts. Please wait 15 minutes, or sign in with an email code." });
  if (!identifier || !password) back(path, { error: "Enter your email or username and your password." });

  const user = await findByIdentifier(identifier);
  if (!user) {
    await burnPasswordCheck(password); // same timing as a real check
    await recordLogin({ userId: null, identifier, method: "PASSWORD", success: false, reason: "UNKNOWN" });
    back(path, { error: LOGIN_FAILED });
  }
  const u = user!;
  const locked = lockedFor(u);
  if (locked) {
    await recordLogin({ userId: u.id, identifier, method: "PASSWORD", success: false, reason: "LOCKED" });
    back(path, { error: `Too many failed attempts. Try again in ${locked} minute${locked === 1 ? "" : "s"}, or reset your password.` });
  }
  if (!(await verifyPassword(password, u.passwordHash))) {
    const mins = await registerFailure(u.id);
    await recordLogin({ userId: u.id, identifier, method: "PASSWORD", success: false, reason: "BAD_PASSWORD" });
    back(path, { error: mins ? `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or reset your password.` : LOGIN_FAILED });
  }
  if (["SUSPENDED", "CLOSED"].includes(u.accountStatus)) {
    await recordLogin({ userId: u.id, identifier, method: "PASSWORD", success: false, reason: "BLOCKED" });
    back(path, { error: `This account is ${u.accountStatus.toLowerCase()}. Contact support.` });
  }
  await registerSuccess(u.id);
  await createSession(u.id, { persistent: remember, method: "PASSWORD" });
  const ev = await recordLogin({ userId: u.id, identifier, method: "PASSWORD", success: true });
  await audit(u.id, "LOGIN", "User", u.id, { ip, method: "PASSWORD" });
  await loginAlert(u, { method: "PASSWORD", ...ev });
  redirect(landing(u, next));
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
