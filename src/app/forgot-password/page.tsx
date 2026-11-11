import Link from "next/link";
import { forgotPasswordAction, verifyResetCodeAction } from "@/app/actions/recovery";
import { SubmitButton } from "@/components/SubmitButton";
import { AuthCard, CodeStep } from "@/components/AuthCard";
import { getFlow } from "@/lib/login-security";

export const metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const verifying = sp.step === "verify" && !!(await getFlow("RESET"));
  return (
    <AuthCard
      title="Reset your password"
      subtitle={verifying ? "Enter the code we emailed you, then choose a new password." : "Enter your email or username and we'll email a code to the registered address."}
      sp={sp}
      footer={<>
        <p><Link href="/login" className="link">← Back to sign in</Link></p>
        <p>No longer have access to that email? <Link href="/forgot-email" className="link">Recover your account</Link></p>
      </>}
    >
      {verifying ? (
        <CodeStep action={verifyResetCodeAction} flow="RESET" sentTo="your registered email address" justSent={!!sp.ok} />
      ) : (
        <form action={forgotPasswordAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="identifier">Email or username</label>
            <input id="identifier" name="identifier" className="input" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />
          </div>
          <SubmitButton className="btn-primary w-full">Send reset code</SubmitButton>
          <p className="text-xs text-muted">We never email your existing password, and our staff can&apos;t see it.</p>
        </form>
      )}
    </AuthCard>
  );
}
