import Link from "next/link";
import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { brand } from "@/config/brand";
import { absoluteUrl } from "@/lib/urls";
import { db } from "@/lib/db";
import { ListingCard, CampaignCard } from "@/components/Cards";
import { autoLockDue } from "@/lib/campaigns";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function Home() {
  await autoLockDue();
  const [banners, categories, featured, latest, campaigns, results] = await Promise.all([
    db.banner.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.category.findMany({ where: { parentId: null, active: true }, orderBy: { sortOrder: "asc" } }),
    db.listing.findMany({ where: { status: "ACTIVE", featured: true }, include: { images: { orderBy: { sortOrder: "asc" } }, category: true }, take: 4, orderBy: { publishedAt: "desc" } }),
    db.listing.findMany({ where: { status: "ACTIVE" }, include: { images: { orderBy: { sortOrder: "asc" } }, category: true }, take: 8, orderBy: { publishedAt: "desc" } }),
    db.campaign.findMany({ where: { status: "APPROVED" }, include: { images: true, listing: { include: { images: true } } }, take: 3, orderBy: { drawAt: "asc" } }),
    db.drawResult.findMany({ where: { status: "PUBLISHED" }, include: { campaign: true }, take: 3, orderBy: { publishedAt: "desc" } }),
  ]);
  const hero = banners[0];

  return (
    <div>
      <JsonLd data={[
        { "@context": "https://schema.org", "@type": "WebSite", name: brand.name, url: absoluteUrl("/"), potentialAction: { "@type": "SearchAction", target: `${absoluteUrl("/marketplace")}?q={search_term_string}`, "query-input": "required name=search_term_string" } },
        { "@context": "https://schema.org", "@type": "Organization", name: brand.name, url: absoluteUrl("/"), logo: absoluteUrl("/logo.svg"), email: brand.supportEmail },
      ]} />
      <section className="bg-gradient-to-br from-brand-700 to-brand-500 text-white">
        <div className="container-page grid gap-8 py-14 md:grid-cols-2 md:items-center">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{hero?.title ?? "Buy, Sell and Discover Great Deals on SideBooster"}</h1>
            <p className="mt-3 text-lg text-blue-100">{hero?.subtitle ?? "Every seller is ID-checked. Every listing is reviewed."}</p>
            <form action="/marketplace" className="mt-6 flex max-w-lg gap-2">
              <input name="q" className="input text-ink" placeholder="What are you looking for?" aria-label="Search" />
              <button className="btn bg-white text-brand-700 hover:bg-blue-50">Search</button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <Link href="/register/seller" className="rounded-full bg-white/15 px-3 py-1 hover:bg-white/25">Become a verified seller →</Link>
              <Link href="/draws" className="rounded-full bg-white/15 px-3 py-1 hover:bg-white/25">Browse promotions →</Link>
            </div>
          </div>
          <ul className="grid grid-cols-2 gap-3 text-sm">
            {[["✅", "Verified sellers", "Identity & business checks before anyone can sell"], ["🔍", "Reviewed listings", "Every listing is approved before it goes live"], ["🔒", "Secure payments", "Payment is confirmed by the gateway — never the browser"], ["🎲", "Auditable draws", "Commit-reveal randomness anyone can verify"]].map(([i, t, d]) => (
              <li key={t} className="rounded-xl bg-white/10 p-4"><div className="text-2xl">{i}</div><div className="mt-1 font-semibold">{t}</div><div className="text-blue-100">{d}</div></li>
            ))}
          </ul>
        </div>
      </section>

      <div className="container-page space-y-12 py-10">
        <section>
          <h2 className="h2 mb-4">Browse categories</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {categories.map((c) => (
              <Link key={c.id} href={`/marketplace/${c.slug}`} className="card flex flex-col items-center gap-2 p-4 text-center text-sm font-medium hover:shadow-md">
                <span className="text-3xl" aria-hidden="true">{c.icon}</span>{c.name}
              </Link>
            ))}
          </div>
        </section>

        {featured.length > 0 && (
          <section>
            <h2 className="h2 mb-4">Featured listings</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{featured.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          </section>
        )}

        {campaigns.length > 0 && (
          <section>
            <div className="mb-4 flex items-end justify-between"><h2 className="h2">Promotions & draws</h2><Link href="/draws" className="link text-sm">All promotions →</Link></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{campaigns.map((c) => <CampaignCard key={c.id} c={c} />)}</div>
          </section>
        )}

        <section>
          <div className="mb-4 flex items-end justify-between"><h2 className="h2">Latest listings</h2><Link href="/marketplace" className="link text-sm">View all →</Link></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{latest.map((l) => <ListingCard key={l.id} l={l} />)}</div>
        </section>

        {results.length > 0 && (
          <section>
            <h2 className="h2 mb-4">Recent winners</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {results.map((r) => (
                <Link key={r.id} href={`/results/${r.campaign.slug}`} className="card card-pad hover:shadow-md">
                  <div className="text-sm text-muted">{r.campaign.prizeName}</div>
                  <div className="mt-1 font-mono text-2xl font-bold">#{r.winningNumber}</div>
                  <div className="text-sm">{r.winnerDisplayName}</div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
