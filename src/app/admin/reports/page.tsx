import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { PageHeader, Section, Stat } from "@/components/ui";

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
