import Link from "next/link";
import { forgotUsernameAction, verifyUsernameCodeAction } from "@/app/actions/recovery";
import { SubmitButton } from "@/components/SubmitButton";
import { AuthCard, CodeStep } from "@/components/AuthCard";
import { getFlow } from "@/lib/login-security";
import { db } from "@/lib/db";

export const metadata = { title: "Find your username" };
export const dynamic = "force-dynamic";

/** The account whose USERNAME code was verified in the last 10 minutes on this browser. */
async function verifiedAccount() {
  const id = await getFlow("USERNAME");
  if (!id || id.startsWith("decoy_")) return null;
  const row = await db.authCode.findUnique({ where: { id }, include: { user: { select: { username: true, publicId: true, email: true } } } });
  if (!row || row.purpose !== "USERNAME" || !row.verifiedAt || row.verifiedAt.getTime() < Date.now() - 10 * 60_000) return null;
  return row.user;
}

export default async function ForgotUsernamePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const flow = await getFlow("USERNAME");
  const found = sp.step === "done" ? await verifiedAccount() : null;
  const verifying = sp.step === "verify" && !!flow;
  return (
    <AuthCard
      title="Find your username"
      subtitle={found ? "Here are your sign-in details." : verifying ? "Enter the code we emailed you." : "Enter your registered email address. We'll email a code to confirm it's you."}
      sp={sp}
      footer={<>
        <p><Link href="/login" className="link">← Back to sign in</Link></p>
        <p>Forgot your email too? <Link href="/forgot-email" className="link">Recover with your mobile number</Link></p>
      </>}
    >
      {found ? (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-muted">Username</dt><dd className="font-mono font-semibold">{found.username ?? "Not set"}</dd>
            <dt className="text-muted">Account ID</dt><dd className="font-mono">{found.publicId}</dd>
          </dl>
          {!found.username && <p className="text-muted">You haven&apos;t chosen a username. Sign in with your email address, then add one under Account → Security.</p>}
          <Link href="/login" className="btn-primary w-full">Sign in</Link>
        </div>
      ) : verifying ? (
        <CodeStep action={verifyUsernameCodeAction} flow="USERNAME" sentTo="your registered email address" justSent={!!sp.ok} />
      ) : (
        <form action={forgotUsernameAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">Registered email address</label>
            <input id="email" name="email" type="email" className="input" required autoComplete="email" autoFocus />
          </div>
          <SubmitButton className="btn-primary w-full">Email me a code</SubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
