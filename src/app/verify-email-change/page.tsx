import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { peekLink } from "@/lib/auth-codes";
import { confirmEmailChangeAction } from "@/app/actions/recovery-link";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Confirm your new email", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

// The change is applied by a button press (POST), not by merely opening the link — mail scanners prefetch links.
export default async function VerifyEmailChangePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const token = sp.token ?? "";
  const row = token ? await peekLink(token, "EMAIL_CHANGE_LINK") : null;
  return (
    <AuthCard title="Confirm your new email" sp={sp} footer={<p><Link href="/login" className="link">Go to sign in</Link></p>}>
      {row ? (
        <form action={confirmEmailChangeAction} className="space-y-3 text-sm">
          <input type="hidden" name="token" value={token} />
          <p>Make <span className="font-semibold">{row.target}</span> the email address for your account? You&apos;ll be signed out on all devices and can sign in again with this address.</p>
          <SubmitButton className="btn-primary w-full">Confirm new email</SubmitButton>
        </form>
      ) : sp.ok ? (
        <p className="text-sm">All done. Sign in with your new email address.</p>
      ) : (
        <p className="text-sm">This link has expired or was already used. Contact support if you still need to change your email.</p>
      )}
    </AuthCard>
  );
}
