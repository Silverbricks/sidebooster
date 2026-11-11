import Link from "next/link";
import { sendLoginCodeAction, verifyLoginCodeAction } from "@/app/actions/recovery";
import { SubmitButton } from "@/components/SubmitButton";
import { AuthCard, CodeStep } from "@/components/AuthCard";
import { getFlow } from "@/lib/login-security";

export const metadata = { title: "Sign in with an email code" };

export default async function CodeLoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const next = sp.next ?? "";
  const verifying = sp.step === "verify" && !!(await getFlow("LOGIN"));
  const back = `/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <AuthCard
      title="Sign in with an email code"
      subtitle={verifying ? "Enter the code from your email." : "No password needed. We'll email you a one-time code."}
      sp={sp}
      footer={<p><Link href={back} className="link">← Back to sign in with password</Link></p>}
    >
      {verifying ? (
        <CodeStep
          action={verifyLoginCodeAction} flow="LOGIN" sentTo="your registered email address" justSent={!!sp.ok} submitLabel="Sign in"
          hidden={{ next }} keep={{ next, remember: sp.remember ?? "" }}
          extra={<label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remember" defaultChecked={sp.remember === "1"} /> Remember me on this device</label>}
        />
      ) : (
        <form action={sendLoginCodeAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="label" htmlFor="identifier">Email or username</label>
            <input id="identifier" name="identifier" className="input" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />
            <p className="hint">The code always goes to the email address registered on the account.</p>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remember" /> Remember me on this device</label>
          <SubmitButton className="btn-primary w-full">Email me a code</SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
