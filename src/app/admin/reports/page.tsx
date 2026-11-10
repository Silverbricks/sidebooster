import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { PageHeader, Section, Stat } from "@/components/ui";
import { isAiSource } from "@/lib/referrals";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function AdminReports({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const from = sp.from ? new Date(sp.from) : new Date(Date.now() - 30 * 86400_000);
  const to = sp.to ? new Date(`${sp.to}T23:59:59`) : new Date();
  const range = { gte: from, lte: to };
  const [productPay, ticketPay, refunds, commission, sales, byCategory, newUsers, newListings, topSellers] = await Promise.all([
    db.payment.aggregate({ where: { ledger: "PRODUCT", status: "SUCCEEDED", paidAt: range }, _sum: { amount: true }, _count: true }),
    db.payment.aggregate({ where: { ledger: "TICKET", status: "SUCCEEDED", paidAt: range }, _sum: { amount: true }, _count: true }),
    db.refund.aggregate({ where: { status: "PROCESSED", processedAt: range }, _sum: { amount: true }, _count: true }),
    db.commissionRecord.aggregate({ where: { status: { in: ["GENERATED", "INVOICED", "PAID", "OVERDUE"] }, createdAt: range }, _sum: { amount: true }, _count: true }),
    db.sale.findMany({ where: { status: "APPROVED", createdAt: range }, include: { listing: { include: { category: true } }, commission: true } }),
    db.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" } }),
    db.user.count({ where: { createdAt: range } }),
    db.listing.count({ where: { createdAt: range } }),
    db.sale.groupBy({ by: ["sellerId"], where: { status: "APPROVED", createdAt: range }, _sum: { salePrice: true }, _count: true, orderBy: { _sum: { salePrice: "desc" } }, take: 10 }),
  ]);
  const catRows = byCategory.map((c) => {
    const s = sales.filter((x) => x.listing.categoryId === c.id);
    return { c, n: s.length, gmv: s.reduce((a, x) => a + x.salePrice, 0), comm: s.reduce((a, x) => a + (x.commission?.amount ?? 0), 0) };
  });
  const [feeRows, visitRows, shareRows, attributed, sellerStatus, locationStatus, businessStatus, approvedSellers] = await Promise.all([
    db.platformFee.groupBy({ by: ["type", "status"], where: { createdAt: range }, _sum: { amount: true }, _count: true }),
    db.referralEvent.groupBy({ by: ["source"], where: { kind: "VISIT", createdAt: range }, _count: true, orderBy: { _count: { source: "desc" } }, take: 25 }),
    db.referralEvent.groupBy({ by: ["source"], where: { kind: "SHARE", createdAt: range }, _count: true, orderBy: { _count: { source: "desc" } } }),
    db.order.groupBy({ by: ["referralSource"], where: { referralSource: { not: null }, status: { in: ["PAID", "FULFILLED", "COMPLETED"] }, createdAt: range }, _sum: { total: true }, _count: true }),
    db.sellerProfile.groupBy({ by: ["status"], _count: true }),
    db.sellerProfile.groupBy({ by: ["locationStatus"], _count: true }),
    db.sellerProfile.groupBy({ by: ["businessCheckStatus"], where: { OR: [{ abn: { not: null } }, { acn: { not: null } }] }, _count: true }),
    db.sellerProfile.findMany({ where: { approvedAt: range }, select: { createdAt: true, approvedAt: true } }),
  ]);
  const feeSum = (types: string[], statuses = ["DUE", "PAID"]) => feeRows.filter((f) => types.includes(f.type) && statuses.includes(f.status)).reduce((a, f) => a + (f._sum.amount ?? 0), 0);
  const ai = (src: string | null) => !!src && isAiSource(src);
  const reviewHours = approvedSellers.length ? approvedSellers.reduce((a, x) => a + (x.approvedAt!.getTime() - x.createdAt.getTime()), 0) / approvedSellers.length / 3_600_000 : null;
  const count = (rows: { _count: number }[], pick: (r: never) => boolean) => rows.filter((r) => pick(r as never)).reduce((a, r) => a + r._count, 0);
  const codes = new Map((await db.sellerProfile.findMany({ where: { userId: { in: topSellers.map((t) => t.sellerId) } } })).map((s) => [s.userId, s]));
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" actions={<><a className="btn-secondary" href="/api/admin/export/payments">⬇ Payments CSV</a><a className="btn-secondary" href="/api/admin/export/commissions">⬇ Commissions CSV</a></>} />
      <form className="card card-pad flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="from">From</label><input id="from" name="from" type="date" defaultValue={from.toISOString().slice(0, 10)} className="input" /></div>
        <div><label className="label" htmlFor="to">To</label><input id="to" name="to" type="date" defaultValue={to.toISOString().slice(0, 10)} className="input" /></div>
        <button className="btn-secondary">Run report</button>
      </form>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Product payments" value={money(productPay._sum.amount ?? 0)} sub={`${productPay._count} transactions`} />
        <Stat label="Ticket payments" value={money(ticketPay._sum.amount ?? 0)} sub={`${ticketPay._count} transactions · separate ledger`} />
        <Stat label="Refunds processed" value={money(refunds._sum.amount ?? 0)} sub={`${refunds._count} refunds`} />
        <Stat label="Approved sales (GMV)" value={money(sales.reduce((a, s) => a + s.salePrice, 0))} sub={`${sales.length} sales`} />
        <Stat label="Commission generated" value={money(commission._sum.amount ?? 0)} sub={`${commission._count} records`} />
        <Stat label="New users / listings" value={`${newUsers} / ${newListings}`} />
      </div>
      <Section title="Platform revenue">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Stat label="Sales commission" value={money(commission._sum.amount ?? 0)} sub="generated in period" />
          <Stat label="Listing & relist fees" value={money(feeSum(["LISTING", "RELIST"]))} sub={`paid ${money(feeSum(["LISTING", "RELIST"], ["PAID"]))}`} />
          <Stat label="Featured placement fees" value={money(feeSum(["FEATURED"]))} sub={`paid ${money(feeSum(["FEATURED"], ["PAID"]))}`} />
          <Stat label="Per-sale fixed fees" value={money(feeSum(["SALE_FIXED"]))} />
          <Stat label="Subscriptions" value="Not offered" sub="Pay Per Item only" />
          <Stat label="Promotion ticket revenue" value={money(ticketPay._sum.amount ?? 0)} sub="separate ledger" />
        </div>
        <p className="mt-2 text-xs text-muted">Platform fees exclude payment-provider processing fees. Waived/cancelled fees aren&apos;t counted. Fee invoices: <a href="/admin/commissions/fees" className="link">Platform fees</a>.</p>
      </Section>
      <Section title="Marketing & AI discovery (SideBooster-tracked)">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Tracked visits" value={visitRows.reduce((a, r) => a + r._count, 0)} sub="utm-tagged links, QR codes" />
          <Stat label="Share-button clicks" value={shareRows.reduce((a, r) => a + r._count, 0)} />
          <Stat label="Attributed orders" value={attributed.reduce((a, r) => a + r._count, 0)} sub={money(attributed.reduce((a, r) => a + (r._sum.total ?? 0), 0))} />
          <Stat label="AI-search referrals" value={visitRows.filter((r) => ai(r.source)).reduce((a, r) => a + r._count, 0)} sub={`${attributed.filter((r) => ai(r.referralSource)).reduce((a, r) => a + r._count, 0)} orders`} />
        </div>
        <table className="table mt-3"><thead><tr><th>Source</th><th>Visits</th><th>Orders</th><th>Revenue</th></tr></thead>
          <tbody>{visitRows.map((v) => { const o = attributed.find((a) => a.referralSource === v.source); return <tr key={v.source}><td>{v.source}{ai(v.source) && " · AI search"}</td><td>{v._count}</td><td>{o?._count ?? 0}</td><td>{money(o?._sum.total ?? 0)}</td></tr>; })}</tbody></table>
        <p className="mt-2 text-xs text-muted">Only visits that arrive with tracking parameters (or an identifiable AI referrer such as utm_source=chatgpt.com) are counted, so this undercounts real discovery. Search impressions, clicks and positions are in Google Search Console and Bing Webmaster Tools.</p>
      </Section>
      <Section title="Seller verification">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Awaiting admin review" value={count(sellerStatus, (r: { status: string }) => r.status === "UNDER_REVIEW")} />
          <Stat label="Location: needs manual review" value={count(locationStatus, (r: { locationStatus: string }) => r.locationStatus === "MANUAL_REVIEW")} sub={`${count(locationStatus, (r: { locationStatus: string }) => r.locationStatus === "VERIFIED")} verified · ${count(locationStatus, (r: { locationStatus: string }) => r.locationStatus === "FAILED")} failed`} />
          <Stat label="ABN/ACN flagged" value={count(businessStatus, (r: { businessCheckStatus: string }) => ["MISMATCH", "INACTIVE", "NOT_FOUND", "MANUAL_REVIEW"].includes(r.businessCheckStatus))} sub={`${count(businessStatus, (r: { businessCheckStatus: string }) => r.businessCheckStatus === "VERIFIED")} verified`} />
          <Stat label="Avg. time to approval" value={reviewHours == null ? "—" : reviewHours < 48 ? `${reviewHours.toFixed(1)} h` : `${(reviewHours / 24).toFixed(1)} days`} sub={`${approvedSellers.length} approved in period`} />
        </div>
      </Section>
      <Section title="By category">
        <table className="table"><thead><tr><th>Category</th><th>Sales</th><th>GMV</th><th>Commission</th></tr></thead>
          <tbody>{catRows.map((r) => <tr key={r.c.id}><td>{r.c.icon} {r.c.name}</td><td>{r.n}</td><td>{money(r.gmv)}</td><td>{money(r.comm)}</td></tr>)}</tbody></table>
      </Section>
      <Section title="Top sellers">
        <table className="table"><thead><tr><th>Seller</th><th>Sales</th><th>GMV</th></tr></thead>
          <tbody>{topSellers.map((t) => <tr key={t.sellerId}><td><span className="font-mono">{codes.get(t.sellerId)?.sellerCode}</span> {codes.get(t.sellerId)?.legalName}</td><td>{t._count}</td><td>{money(t._sum.salePrice ?? 0)}</td></tr>)}</tbody></table>
      </Section>
    </div>
  );
}
