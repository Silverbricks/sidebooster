import { brand } from "@/config/brand";
import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import { Flash, KV, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { updateSellerProfileAction } from "@/app/actions/seller";
import { SOCIAL_PLATFORMS, type SocialLinks, type SocialPlatform } from "@/lib/social";
import { absoluteUrl, storePath } from "@/lib/urls";

export const metadata = { title: "Seller profile" };

const PLACEHOLDER: Record<SocialPlatform, string> = {
  facebook: "facebook.com/yourpage", instagram: "instagram.com/yourname", tiktok: "tiktok.com/@yourname", youtube: "youtube.com/@yourchannel",
  linkedin: "linkedin.com/company/yourbusiness", pinterest: "pinterest.com.au/yourname", x: "x.com/yourname", whatsapp: "wa.me/614XXXXXXXX",
};

export default async function SellerProfile({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireSeller();
  const sp = await searchParams;
  const p = user.sellerProfile;
  if (!p) return <PageHeader title="Profile" />;
  const links = (p.socialLinks ?? {}) as SocialLinks;
  const storeUrl = absoluteUrl(storePath(p));
  const live = ["APPROVED", "ACTIVE"].includes(p.status);
  return (
    <div className="space-y-6">
      <PageHeader title="Profile & storefront" actions={live ? <Link href={storePath(p)} className="btn-secondary" target="_blank">View my store ↗</Link> : undefined} />
      <Flash sp={sp} />
      <form action={updateSellerProfileAction} className="space-y-6">
        <Section title="Public storefront">
          <p className="mb-3 text-sm text-muted">
            Buyers see your store name, about text, public area, Seller ID, verified badge and the social links you choose — never your documents, date of birth, mobile or street address.
            {!live && " Your store goes live once your seller account is approved."}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="businessName">Store / trading name</label><input id="businessName" name="businessName" defaultValue={p.businessName ?? ""} className="input" maxLength={80} placeholder={`${user.firstName}'s store`} /></div>
            <div>
              <label className="label" htmlFor="storeSlug">Store address</label>
              <div className="flex"><span className="inline-flex items-center rounded-l-lg border border-r-0 border-line bg-slate-50 px-2 text-xs text-muted">{brand.domain}/store/</span><input id="storeSlug" name="storeSlug" defaultValue={p.storeSlug ?? ""} className="input rounded-l-none" pattern="[a-z0-9-]{3,40}" maxLength={40} /></div>
              <p className="hint">Lower-case letters, numbers and hyphens. Changing it breaks links you&apos;ve already shared.</p>
            </div>
            <div className="sm:col-span-2"><label className="label" htmlFor="publicLocation">Public area shown on your store</label><input id="publicLocation" name="publicLocation" defaultValue={p.publicLocation ?? ""} className="input" maxLength={80} placeholder={`e.g. ${p.suburb ? `${p.suburb} ` : ""}${p.state ?? "NSW"} — or a service area like "Ships Australia-wide"`} /><p className="hint">Optional. Never enter your street address here. If blank, only your state is shown.</p></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="bio">About your store</label><textarea id="bio" name="bio" rows={4} defaultValue={p.bio ?? ""} className="input" maxLength={2000} /><p className="hint">Shown on your store and used for its Google description. Keep it accurate.</p></div>
          </div>
          {live && <p className="mt-3 text-xs text-muted">Your store link: <a href={storeUrl} className="link" target="_blank">{storeUrl}</a></p>}
        </Section>

        <Section title="Social media links">
          <p className="mb-3 text-sm text-muted">Add the public profile links you want buyers to see. We never ask for social media passwords. Tick <b>Show</b> to display a link on your store.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {(Object.keys(SOCIAL_PLATFORMS) as SocialPlatform[]).map((k) => (
              <div key={k}>
                <label className="label" htmlFor={`social_${k}`}>{SOCIAL_PLATFORMS[k].label}</label>
                <div className="flex items-center gap-2">
                  <input id={`social_${k}`} name={`social_${k}`} defaultValue={links[k]?.url ?? ""} className="input" placeholder={PLACEHOLDER[k]} inputMode="url" maxLength={300} />
                  <label className="flex shrink-0 items-center gap-1 text-xs"><input type="checkbox" name={`social_${k}_show`} defaultChecked={links[k]?.show ?? true} /> Show</label>
                </div>
              </div>
            ))}
          </div>
        </Section>
        <SubmitButton>Save profile</SubmitButton>
      </form>
      <Section title={`Permissions granted by ${brand.name}`}>
        <KV rows={[["Free-entry campaigns", p.canRunFreeDraws ? "Allowed" : "Not allowed"], ["Paid-ticket campaigns", p.canRunPaidDraws ? "Allowed" : "Not allowed"], ["Trusted seller", p.trustedSeller ? "Yes" : "No"]]} />
        <p className="mt-3 text-xs text-muted">Legal identity details can only be changed by contacting <Link href="/contact" className="link">support</Link>, as they require re-verification.</p>
      </Section>
    </div>
  );
}
