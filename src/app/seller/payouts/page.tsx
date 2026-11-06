import { requireSeller } from "@/lib/auth";
import { Badge, Flash, KV, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { startPayoutOnboardingAction } from "@/app/actions/seller";

export const metadata = { title: "Payout account" };

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireSeller();
  const sp = await searchParams;
  const acct = user.sellerProfile?.paymentAccount;
  const yes = (v?: boolean) => (v ? <Badge status="ACTIVE">Yes</Badge> : <Badge status="PENDING">No</Badge>);
  return (
    <div className="space-y-6">
      <PageHeader title="Payout account" subtitle="Identity and bank verification for payouts is handled securely by our payment provider (Stripe Connect)." />
      <Flash sp={sp} />
      <Section title="Status">
        {acct ? (
          <KV rows={[["Provider", acct.provider], ["Account", <span key="a" className="font-mono text-xs">{acct.providerAccountId}</span>], ["Charges enabled", yes(acct.chargesEnabled)], ["Payouts enabled", yes(acct.payoutsEnabled)], ["Restricted", acct.restricted ? <Badge status="RESTRICTED">Restricted</Badge> : "No"], ["Admin hold", acct.payoutsHeld ? <Badge status="HELD">Payouts held</Badge> : "No"]]} />
        ) : <p className="text-sm text-muted">No payout account connected yet.</p>}
        {!acct?.payoutsEnabled && (
          <form action={startPayoutOnboardingAction} className="mt-4"><SubmitButton>{acct ? "Continue onboarding" : "Connect payout account"}</SubmitButton></form>
        )}
      </Section>
      <p className="text-xs text-muted">Payouts are released only for approved sales, after commission is deducted, and only while your account is verified and unrestricted.</p>
    </div>
  );
}
