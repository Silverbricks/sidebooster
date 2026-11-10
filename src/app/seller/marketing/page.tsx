import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { Empty, PageHeader, Section, Stat } from "@/components/ui";
import { ShareBar } from "@/components/ShareBar";
import { absoluteUrl, productPath, storePath } from "@/lib/urls";
import { isAiSource } from "@/lib/referrals";

export const metadata = { title: "Marketing & sharing" };

export default async function SellerMarketing({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireSeller();
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const since = new Date(Date.now() - days * 86_400_000);
  const p = user.sellerProfile;
  const [visits, shares, orders, listings] = await Promise.all([
    db.referralEvent.groupBy({ by: ["source"], where: { sellerId: user.id, kind: "VISIT", createdAt: { gte: since } }, _count: true, orderBy: { _count: { source: "desc" } } }),
    db.referralEvent.groupBy({ by: ["source"], where: { sellerId: user.id, kind: "SHARE", createdAt: { gte: since } }, _count: true, orderBy: { _count: { source: "desc" } } }),
    db.order.findMany({ where: { sellerId: user.id, referralSource: { not: null }, status: { in: ["PAID", "FULFILLED", "COMPLETED"] }, createdAt: { gte: since } }, select: { referralSource: true, total: true } }),
    db.listing.findMany({ where: { sellerId: user.id, status: "ACTIVE" }, select: { id: true, slug: true, title: true, views: true, _count: { select: { referrals: { where: { kind: "VISIT", createdAt: { gte: since } } } } } }, orderBy: { views: "desc" }, take: 10 }),
  ]);
  const bySource = new Map<string, { visits: number; shares: number; orders: number; revenue: number }>();
  const row = (s: string) => bySource.get(s) ?? (bySource.set(s, { visits: 0, shares: 0, orders: 0, revenue: 0 }), bySource.get(s)!);
  for (const v of visits) row(v.source).visits = v._count;
  for (const v of shares) row(v.source).shares = v._count;
  for (const o of orders) { const r = row(o.referralSource!); r.orders++; r.revenue += o.total; }
  const rows = [...bySource.entries()].sort((a, b) => b[1].visits + b[1].orders * 10 - (a[1].visits + a[1].orders * 10));
  const totalVisits = visits.reduce((a, v) => a + v._count, 0);
  const totalShares = shares.reduce((a, v) => a + v._count, 0);
  const revenue = orders.reduce((a, o) => a + o.total, 0);
  const live = p && ["APPROVED", "ACTIVE"].includes(p.status);

  return (
    <div className="space-y-6">
      <PageHeader title="Marketing & sharing" subtitle="Share your store and products for free. Numbers below are tracked by SideBooster from tagged links — platform-reported views/likes aren't included." />
      <div className="flex gap-2 text-sm">{[7, 30, 90].map((d) => <Link key={d} href={`/seller/marketing?days=${d}`} className={d === days ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{d} days</Link>)}</div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Tracked visits" value={totalVisits} sub="from share links, QR codes & AI search" />
        <Stat label="Share-button clicks" value={totalShares} sub="on your products & store" />
        <Stat label="Attributed orders" value={orders.length} sub="first-touch, paid orders" />
        <Stat label="Attributed revenue" value={money(revenue)} />
      </div>

      {live && p && (
        <Section title="Share your store">
          <ShareBar url={absoluteUrl(storePath(p))} title={`${p.businessName ?? `${user.firstName}'s store`}`} kind="store" id={p.storeSlug ?? p.sellerCode.toLowerCase()} />
          <p className="mt-3 text-xs text-muted">Add your social profile links under <Link href="/seller/profile" className="link">Profile &amp; storefront</Link> so buyers can follow you.</p>
        </Section>
      )}

      <Section title="By source">
        {rows.length ? (
          <table className="table">
            <thead><tr><th>Source</th><th>Visits</th><th>Share clicks</th><th>Orders</th><th>Revenue</th></tr></thead>
            <tbody>{rows.map(([s, r]) => <tr key={s}><td>{s}{isAiSource(s) && <span className="ml-1 rounded bg-brand-50 px-1 text-xs text-brand-700">AI search</span>}{s === "qr" && <span className="ml-1 text-xs text-muted">(QR code)</span>}</td><td>{r.visits}</td><td>{r.shares}</td><td>{r.orders}</td><td>{money(r.revenue)}</td></tr>)}</tbody>
          </table>
        ) : <Empty>No tracked activity yet. Share a product or your store to get started.</Empty>}
        <p className="mt-3 text-xs text-muted">A visit or click isn&apos;t a sale. Orders are attributed to the first tracked source a buyer arrived from in the last 30 days. Some visits (e.g. links pasted without tags, private browsing) can&apos;t be attributed.</p>
      </Section>

      <Section title="Your live products">
        {listings.length ? (
          <table className="table"><thead><tr><th>Product</th><th>Total views</th><th>Tracked visits ({days}d)</th><th /></tr></thead>
            <tbody>{listings.map((l) => <tr key={l.id}><td>{l.title}</td><td>{l.views}</td><td>{l._count.referrals}</td><td><Link href={productPath(l)} className="link text-xs" target="_blank">Open &amp; share ↗</Link></td></tr>)}</tbody></table>
        ) : <Empty>No live products.</Empty>}
      </Section>
    </div>
  );
}
