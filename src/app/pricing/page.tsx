import Link from "next/link";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { brand } from "@/config/brand";
import { describeFees, feeSchedule } from "@/lib/fees";
import { JsonLd } from "@/components/JsonLd";
import { absoluteUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Seller Pricing – Sell Online Without Monthly Fees",
  description: `Sell products online in Australia with ${brand.name}. Pay Per Item pricing — no subscription, clear fees shown before you publish.`,
  alternates: { canonical: "/pricing" },
};

const FAQ = [
  ["Do I need a subscription to sell?", `No. ${brand.name} uses Pay Per Item pricing by default. You only pay the fees shown below, and only when they apply.`],
  ["When will I see the fees?", "Before you submit every listing, the fees for that listing's category are shown on the form. Nothing is charged for rejected listings."],
  ["Does it cost anything to share my products?", "No. Share buttons, QR codes and your public store page are free for every seller."],
  ["Are payment-processing fees included?", "No. Card/payment-provider processing fees are separate from platform fees and are shown at checkout or in your payout statement."],
] as const;

export default async function PricingPage() {
  const base = await feeSchedule(null, null);
  const lines = describeFees(base);
  const cats = await db.category.findMany({ where: { active: true, parentId: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, icon: true, listingFee: true } });
  const perCat = await Promise.all(cats.map(async (c) => ({ c, f: await feeSchedule(c.id, null) })));
  const fmtPct = (bps: number) => `${(bps / 100).toFixed(bps % 100 ? 2 : 0)}%`;

  return (
    <div className="container-page max-w-4xl space-y-8 py-10">
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })), url: absoluteUrl("/pricing") }} />
      <header className="space-y-2 text-center">
        <h1 className="h1">Sell online without monthly fees</h1>
        <p className="text-muted">Pay Per Item is the default for every {brand.name} seller. No subscription, no lock-in — fees are shown before you publish.</p>
      </header>

      <section className="card card-pad">
        <h2 className="h2 mb-1">Pay Per Item <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Default</span></h2>
        <p className="mb-4 text-sm text-muted">Standard fees. Some categories have their own listing fee or commission — see the table below.</p>
        <dl className="divide-y divide-line text-sm">
          {lines.map((l) => (
            <div key={l.label} className="flex flex-wrap items-baseline justify-between gap-2 py-2"><dt><b>{l.label}</b> <span className="block text-xs text-muted">{l.note}</span></dt><dd className="text-base font-semibold">{l.value}</dd></div>
          ))}
        </dl>
      </section>

      <section className="card card-pad overflow-x-auto">
        <h2 className="h2 mb-3">Fees by category</h2>
        <table className="table">
          <thead><tr><th>Category</th><th>Listing fee</th><th>Commission on sale</th></tr></thead>
          <tbody>{perCat.map(({ c, f }) => <tr key={c.id}><td>{c.icon} {c.name}</td><td>{f.listingFee > 0 ? money(f.listingFee) : "Free"}</td><td>{fmtPct(f.commissionBps)}</td></tr>)}</tbody>
        </table>
        <p className="mt-2 text-xs text-muted">Individual seller agreements can set a different commission rate; yours is shown in your seller dashboard. All amounts in AUD.</p>
      </section>

      <section className="card card-pad">
        <h2 className="h2 mb-2">Optional plans</h2>
        <p className="text-sm text-muted">Optional subscription plans with extra tools or reduced fees may be offered in future. They will always be optional — Pay Per Item stays available and your products and orders are never removed if you change plan.</p>
      </section>

      <section className="space-y-3">
        <h2 className="h2">Questions</h2>
        {FAQ.map(([q, a]) => <details key={q} className="card card-pad"><summary className="cursor-pointer font-medium">{q}</summary><p className="mt-2 text-sm text-muted">{a}</p></details>)}
      </section>

      <div className="text-center"><Link href="/register/seller" className="btn-primary">Start selling</Link></div>
    </div>
  );
}
