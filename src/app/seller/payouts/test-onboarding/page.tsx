import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth";
import { SubmitButton } from "@/components/SubmitButton";
import { completeTestOnboardingAction } from "@/app/actions/seller";
import { testPaymentsAllowed } from "@/lib/payment-provider";

export const metadata = { title: "Payout onboarding (test)", robots: { index: false } };

export default async function TestOnboarding({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  if (!testPaymentsAllowed()) notFound();
  const user = await requireSeller();
  const { account } = await searchParams;
  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card card-pad space-y-4">
        <div className="text-xs uppercase tracking-widest text-amber-700">Test mode · simulated provider onboarding</div>
        <h1 className="h2">Verify payout details for {user.sellerProfile?.legalName}</h1>
        <p className="text-sm text-muted">In production this is Stripe&apos;s hosted onboarding, where the seller verifies identity and bank details. Stripe then sends an <code>account.updated</code> webhook.</p>
        <div className="rounded-lg bg-slate-50 p-3 font-mono text-sm">BSB 000-000 · Account 000123456</div>
        <form action={completeTestOnboardingAction}><input type="hidden" name="account" value={account ?? ""} /><SubmitButton className="btn-primary w-full">Complete verification</SubmitButton></form>
      </div>
    </div>
  );
}
