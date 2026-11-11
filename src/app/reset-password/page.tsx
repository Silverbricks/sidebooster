import Link from "next/link";
import { resetPasswordAction } from "@/app/actions/recovery";
import { SubmitButton } from "@/components/SubmitButton";
import { PasswordInput } from "@/components/PasswordInput";
import { AuthCard } from "@/components/AuthCard";
import { peekLink } from "@/lib/auth-codes";

export const metadata = { title: "Choose a new password", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const token = sp.token ?? "";
  const valid = !!(await peekLink(token, "RESET_LINK"));
  return (
    <AuthCard title="Choose a new password" sp={sp} footer={<p><Link href="/login" className="link">← Back to sign in</Link></p>}>
      {valid ? (
        <form action={resetPasswordAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />
          <div>
            <label className="label" htmlFor="password">New password</label>
            <PasswordInput id="password" name="password" autoComplete="new-password" minLength={10} describedBy="pw-hint" />
            <p id="pw-hint" className="hint">10+ characters, upper &amp; lower case and a number.</p>
          </div>
          <div>
            <label className="label" htmlFor="confirmPassword">Confirm new password</label>
            <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" />
          </div>
          <SubmitButton className="btn-primary w-full">Update password</SubmitButton>
          <p className="text-xs text-muted">You&apos;ll be signed out on every device, and we&apos;ll email you to confirm the change.</p>
        </form>
      ) : (
        <div className="space-y-3 text-sm">
          <p>This reset link has expired or has already been used. Reset links work once and last 20–30 minutes.</p>
          <Link href="/forgot-password" className="btn-primary w-full">Request a new code</Link>
        </div>
      )}
    </AuthCard>
  );
}
