import { brand } from "@/config/brand";
import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import { Flash, KV, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { updateSellerProfileAction } from "@/app/actions/seller";

export const metadata = { title: "Seller profile" };

export default async function SellerProfile({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireSeller();
  const sp = await searchParams;
  const p = user.sellerProfile;
  if (!p) return <PageHeader title="Profile" />;
  return (
    <div className="space-y-6">
      <PageHeader title="Profile & settings" />
      <Flash sp={sp} />
      <Section title="Public profile">
        <p className="mb-3 text-sm text-muted">Buyers see your Seller ID, trading name and verified badge — never your documents or full identity details.</p>
        <form action={updateSellerProfileAction} className="space-y-3">
          <div><label className="label" htmlFor="businessName">Trading / display name</label><input id="businessName" name="businessName" defaultValue={p.businessName ?? ""} className="input" /></div>
          <div><label className="label" htmlFor="bio">About</label><textarea id="bio" name="bio" rows={4} defaultValue={p.bio ?? ""} className="input" /></div>
          <SubmitButton>Save</SubmitButton>
        </form>
      </Section>
      <Section title={`Permissions granted by ${brand.name}`}>
        <KV rows={[["Free-entry campaigns", p.canRunFreeDraws ? "Allowed" : "Not allowed"], ["Paid-ticket campaigns", p.canRunPaidDraws ? "Allowed" : "Not allowed"], ["Trusted seller", p.trustedSeller ? "Yes" : "No"]]} />
        <p className="mt-3 text-xs text-muted">Legal identity details can only be changed by contacting <Link href="/contact" className="link">support</Link>, as they require re-verification.</p>
      </Section>
    </div>
  );
}
