import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { resendEmailAction, sendOtpAction, verifyOtpAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Flash } from "@/components/ui";
import { ACCOUNT_STATUS } from "@/lib/constants";

export const metadata = { title: "Verify your account" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser(undefined, "/verify");
  const sp = await searchParams;
  const done = user.accountStatus === "ACTIVE";
  const next = user.role === "SELLER" ? "/seller/verification" : "/account";
  return (
    <div className="container-page max-w-xl py-10">
      <h1 className="h1">Verify your account</h1>
      <p className="mt-1 text-sm text-muted">
        Your ID: <span className="font-mono font-semibold text-ink">{user.publicId}</span> · Status <Badge status={user.accountStatus} labels={ACCOUNT_STATUS} />
      </p>
      <div className="mt-6"><Flash sp={sp} /></div>
      <div className="space-y-4">
        <div className="card card-pad flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold">1. Email address</div>
            <div className="text-sm text-muted">{user.email}</div>
          </div>
          {user.emailVerifiedAt ? <Badge status="ACTIVE">Verified</Badge> : (
            <form action={resendEmailAction}><SubmitButton className="btn-secondary btn-sm">Resend link</SubmitButton></form>
          )}
        </div>
        <div className="card card-pad">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="font-semibold">2. Mobile number</div>
              <div className="text-sm text-muted">{user.mobile}</div>
            </div>
            {user.mobileVerifiedAt ? <Badge status="ACTIVE">Verified</Badge> : (
              <form action={sendOtpAction}><SubmitButton className="btn-secondary btn-sm">Send new code</SubmitButton></form>
            )}
          </div>
          {!user.mobileVerifiedAt && (
            <form action={verifyOtpAction} className="mt-4 flex gap-2">
              <input name="code" className="input max-w-40 font-mono tracking-widest" inputMode="numeric" maxLength={6} placeholder="6-digit code" required aria-label="Verification code" />
              <SubmitButton>Verify</SubmitButton>
            </form>
          )}
        </div>
        {user.accountStatus === "VERIFICATION_REQUIRED" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Our risk checks need to review your account before it can be activated. We&apos;ll email you once it&apos;s done.
          </div>
        )}
        {done && <Link href={next} className="btn-primary">Continue</Link>}
        {process.env.NODE_ENV !== "production" && (
          <p className="text-xs text-muted">Development: verification emails and SMS codes are printed in the server console and listed at /admin/messages.</p>
        )}
      </div>
    </div>
  );
}
