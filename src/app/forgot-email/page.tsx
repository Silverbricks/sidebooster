import Link from "next/link";
import { recoverByMobileAction, requestNewEmailAction, verifyMobileRecoveryAction, verifyNewEmailAction } from "@/app/actions/recovery";
import { SubmitButton } from "@/components/SubmitButton";
import { AuthCard, CodeStep } from "@/components/AuthCard";
import { getFlow } from "@/lib/login-security";
import { maskEmail } from "@/lib/auth-codes";
import { db } from "@/lib/db";
import { brand } from "@/config/brand";

export const metadata = { title: "Recover your account" };
export const dynamic = "force-dynamic";

async function mobileVerifiedUser() {
  const id = await getFlow("MOBILE_FOUND");
  if (!id) return null;
  const row = await db.authCode.findUnique({ where: { id }, include: { user: { select: { email: true, username: true } } } });
  if (!row || row.purpose !== "MOBILE_RECOVERY" || !row.verifiedAt || row.verifiedAt.getTime() < Date.now() - 30 * 60_000) return null;
  return row.user;
}

export default async function ForgotEmailPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const tab = sp.tab === "identity" ? "identity" : "mobile";
  const step = sp.step ?? "";
  const found = step === "found" ? await mobileVerifiedUser() : null;
  const verifyingMobile = step === "verify" && !!(await getFlow("MOBILE_RECOVERY"));
  const confirming = step === "confirm" && !!(await getFlow("NEW_EMAIL"));

  const tabs = (
    <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm" role="tablist">
      <Link href="/forgot-email" role="tab" aria-selected={tab === "mobile"} className={`rounded-md px-3 py-1.5 text-center ${tab === "mobile" ? "bg-white font-semibold shadow-sm" : "text-muted"}`}>I have my mobile</Link>
      <Link href="/forgot-email?tab=identity" role="tab" aria-selected={tab === "identity"} className={`rounded-md px-3 py-1.5 text-center ${tab === "identity" ? "bg-white font-semibold shadow-sm" : "text-muted"}`}>I&apos;ve lost email &amp; mobile</Link>
    </div>
  );

  let body: React.ReactNode;
  let subtitle = "Find the email address on your account, or ask us to change it.";
  if (step === "submitted") {
    subtitle = "Request received.";
    body = (
      <div className="space-y-3 text-sm">
        <p>Your request <span className="font-mono font-semibold">{sp.ref}</span> has been sent to our team. We review every request and may contact you at the email you confirmed to ask for proof of identity.</p>
        <p>We&apos;ve also let the account&apos;s current contact details know, so the real owner can stop a request they didn&apos;t make.</p>
        <p className="text-muted">Most requests are reviewed within 2 business days. Questions: {brand.supportEmail} (quote {sp.ref}).</p>
        <Link href="/" className="btn-secondary w-full">Back to {brand.name}</Link>
      </div>
    );
  } else if (confirming) {
    body = <CodeStep action={verifyNewEmailAction} flow="NEW_EMAIL" step="confirm" sentTo="the new email address you entered" justSent={!!sp.ok} submitLabel="Send request for review" />;
  } else if (found) {
    subtitle = "Mobile number confirmed.";
    body = (
      <div className="space-y-4 text-sm">
        <div className="rounded-lg border border-line bg-slate-50 p-3">
          <div className="text-muted">The email address on your account is</div>
          <div className="mt-1 font-mono text-base font-semibold">{maskEmail(found.email)}</div>
          {found.username && <div className="mt-1 text-muted">Username: <span className="font-mono">{found.username}</span></div>}
        </div>
        <p>Remember it now? <Link href="/login" className="link">Sign in</Link> or <Link href="/forgot-password" className="link">reset your password</Link>.</p>
        <details className="rounded-lg border border-line p-3">
          <summary className="cursor-pointer font-medium">I can&apos;t access that email any more</summary>
          <form action={requestNewEmailAction} className="mt-3 space-y-3">
            <input type="hidden" name="kind" value="MOBILE_VERIFIED" />
            <div>
              <label className="label" htmlFor="newEmail">New email address</label>
              <input id="newEmail" name="newEmail" type="email" className="input" required autoComplete="email" />
              <p className="hint">We&apos;ll email it a code to confirm you can access it. Our team then reviews the change before it applies.</p>
            </div>
            <SubmitButton className="btn-primary w-full">Send code to new email</SubmitButton>
          </form>
        </details>
      </div>
    );
  } else if (verifyingMobile) {
    body = <CodeStep action={verifyMobileRecoveryAction} flow="MOBILE_RECOVERY" sentTo="your registered mobile number" justSent={!!sp.ok} />;
  } else if (tab === "identity") {
    subtitle = "Our team will verify your identity before changing anything.";
    body = (
      <>
        {tabs}
        <form action={requestNewEmailAction} className="space-y-4">
          <input type="hidden" name="kind" value="IDENTITY" />
          <div><label className="label" htmlFor="identifier">Username or account ID</label><input id="identifier" name="identifier" className="input" required placeholder="e.g. BUY-000123" autoCapitalize="none" /></div>
          <div><label className="label" htmlFor="fullName">Full legal name on the account</label><input id="fullName" name="fullName" className="input" required autoComplete="name" /></div>
          <div>
            <label className="label" htmlFor="newEmail">Email address we can reach you at now</label>
            <input id="newEmail" name="newEmail" type="email" className="input" required autoComplete="email" />
            <p className="hint">We&apos;ll email this address a code to confirm you can access it.</p>
          </div>
          <div>
            <label className="label" htmlFor="details">What can you tell us to prove the account is yours?</label>
            <textarea id="details" name="details" className="input" rows={4} maxLength={2000} placeholder="e.g. recent order numbers, listing titles, your old email or mobile, when you joined" />
          </div>
          <SubmitButton className="btn-primary w-full">Continue</SubmitButton>
          <p className="text-xs text-muted">We never change an email based only on details that others could find, like a username or date of birth. Don&apos;t send ID documents unless our team asks, and only through the secure channel we give you.</p>
        </form>
      </>
    );
  } else {
    body = (
      <>
        {tabs}
        <form action={recoverByMobileAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="mobile">Registered mobile number</label>
            <input id="mobile" name="mobile" type="tel" className="input" required autoComplete="tel-national" inputMode="tel" placeholder="04XX XXX XXX" autoFocus />
            <p className="hint">If it matches a verified account, we&apos;ll text it a code and then show you a hint of the email on file.</p>
          </div>
          <SubmitButton className="btn-primary w-full">Text me a code</SubmitButton>
        </form>
      </>
    );
  }

  return (
    <AuthCard title="Forgot your registered email?" subtitle={subtitle} sp={sp} footer={<p><Link href="/login" className="link">← Back to sign in</Link></p>}>
      {body}
    </AuthCard>
  );
}
