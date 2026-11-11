import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { PasswordInput } from "@/components/PasswordInput";
import { AuthCard, AuthLinks } from "@/components/AuthCard";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const next = sp.next ?? "";
  const codeHref = `/login/code${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your account"
      sp={sp}
      footer={<>
        <AuthLinks />
        <p>Don&apos;t have an account? <Link href="/register" className="link">Register now</Link> · <Link href="/register/seller" className="link">Sell on SideBooster</Link></p>
      </>}
    >
      <form action={loginAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <div>
          <label className="label" htmlFor="identifier">Email or username</label>
          <input id="identifier" name="identifier" className="input" required autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label className="label" htmlFor="password">Password</label>
            <Link href="/forgot-password" className="link text-xs">Forgot password?</Link>
          </div>
          <PasswordInput id="password" name="password" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="remember" />
          <span>Remember me on this device <span className="text-muted">(30 days)</span></span>
        </label>
        <SubmitButton className="btn-primary w-full">Sign in</SubmitButton>
      </form>
      <div className="relative py-1 text-center text-xs uppercase tracking-wide text-muted">
        <span className="bg-white px-2">or</span>
        <span className="absolute inset-x-0 top-1/2 -z-10 border-t border-line" aria-hidden="true" />
      </div>
      <Link href={codeHref} className="btn-secondary w-full">Sign in with an email code</Link>
      <p className="text-center text-xs text-muted">Don&apos;t tick &ldquo;Remember me&rdquo; on shared or public computers.</p>
    </AuthCard>
  );
}
