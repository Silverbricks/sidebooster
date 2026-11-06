import { brand } from "@/config/brand";
import { requireSeller } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, date } from "@/lib/format";
import { Badge, Empty, PageHeader, Section, Stat } from "@/components/ui";
import { COMMISSION_STATUS } from "@/lib/constants";
import { pct } from "@/lib/commission";
import { getNumber } from "@/lib/settings";

export const metadata = { title: "Payments & commission" };

export default async function SellerCommissions() {
  const user = await requireSeller();
  const [records, invoices, payouts, rules, categories, def, ticketPayments] = await Promise.all([
    db.commissionRecord.findMany({ where: { sellerId: user.id }, include: { sale: { include: { listing: { select: { title: true } } } } }, orderBy: { createdAt: "desc" } }),
    db.commissionInvoice.findMany({ where: { sellerId: user.id }, orderBy: { createdAt: "desc" } }),
    db.payout.findMany({ where: { sellerId: user.id }, include: { sale: { select: { saleNumber: true } } }, orderBy: { createdAt: "desc" } }),
    db.commissionRule.findMany({ where: { OR: [{ sellerId: user.id }, { sellerId: null }], effectiveFrom: { lte: new Date() }, AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] }] }, include: { category: true } }),
    db.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" } }),
    getNumber("default_commission_bps"),
    db.payment.aggregate({ where: { ledger: "TICKET", sellerId: user.id, status: "SUCCEEDED" }, _sum: { amount: true } }),
  ]);
  const sum = (s: string[]) => records.filter((r) => s.includes(r.status)).reduce((a, r) => a + r.amount, 0);
  const sellerRule = rules.find((r) => r.sellerId === user.id);
  const months = [...new Set(records.map((r) => r.createdAt.toISOString().slice(0, 7)))];

  return (
    <div className="space-y-6">
      <PageHeader title="Payments & commission" subtitle={`Rates are set by ${brand.name} and agreed in your seller agreement. Invoices are marked paid by ${brand.name} once payment is reconciled.`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Commission generated" value={money(sum(["GENERATED", "INVOICED", "PAID", "OVERDUE"]))} />
        <Stat label="Commission paid" value={money(sum(["PAID"]) + payouts.filter((p) => p.status === "PAID").reduce((a, p) => a + p.commission, 0))} />
        <Stat label="Outstanding invoices" value={money(invoices.filter((i) => ["ISSUED", "OVERDUE"].includes(i.status)).reduce((a, i) => a + i.amount, 0))} />
        <Stat label="Payouts" value={money(payouts.filter((p) => p.status === "PAID").reduce((a, p) => a + p.amount, 0))} sub={`${money(payouts.filter((p) => ["SCHEDULED", "HELD"].includes(p.status)).reduce((a, p) => a + p.amount, 0))} pending`} />
      </div>
      <Section title="My commission rates">
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {sellerRule && <li className="sm:col-span-2"><b>Your agreed rate: {pct(sellerRule.rateBps)}</b> (applies to all categories)</li>}
          {categories.map((c) => { const r = rules.find((x) => x.categoryId === c.id && !x.sellerId); return <li key={c.id}>{c.icon} {c.name}: <b>{pct(r?.rateBps ?? def)}</b></li>; })}
        </ul>
      </Section>
      <Section title="Commission invoices">
        {invoices.length ? (
          <table className="table"><thead><tr><th>Invoice</th><th>Issued</th><th>Due</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>{invoices.map((i) => <tr key={i.id}><td className="font-mono">{i.invoiceNumber}</td><td>{date(i.createdAt)}</td><td>{date(i.dueDate)}</td><td>{money(i.amount)}</td><td><Badge status={i.status} />{i.reference && <div className="text-xs text-muted">Ref {i.reference}</div>}</td></tr>)}</tbody></table>
        ) : <Empty>No invoices.</Empty>}
        <p className="mt-3 text-xs text-muted">Pay invoices by bank transfer quoting the invoice number. Payment details are on each emailed invoice.</p>
      </Section>
      <Section title="Commission records">
        {records.length ? (
          <div className="overflow-x-auto"><table className="table"><thead><tr><th>Date</th><th>Sale</th><th>Base</th><th>Rate</th><th>Commission</th><th>Settlement</th><th>Status</th></tr></thead>
            <tbody>{records.map((r) => <tr key={r.id}><td>{date(r.createdAt)}</td><td>{r.sale.listing.title}<div className="font-mono text-xs text-muted">{r.sale.saleNumber}</div></td><td>{money(r.baseAmount)}</td><td>{pct(r.rateBps)}</td><td>{money(r.amount)}</td><td>{r.settlement === "DEDUCTED" ? "Deducted from payout" : "Invoiced"}</td><td><Badge status={r.status} labels={COMMISSION_STATUS} />{r.adjustReason && <div className="text-xs text-muted">{r.adjustReason}</div>}</td></tr>)}</tbody></table></div>
        ) : <Empty>No commission yet.</Empty>}
      </Section>
      <Section title="Payout history">
        {payouts.length ? (
          <table className="table"><thead><tr><th>Sale</th><th>Gross</th><th>Commission</th><th>Net payout</th><th>Status</th></tr></thead>
            <tbody>{payouts.map((p) => <tr key={p.id}><td className="font-mono text-xs">{p.sale.saleNumber}</td><td>{money(p.gross)}</td><td>−{money(p.commission)}</td><td><b>{money(p.amount)}</b></td><td><Badge status={p.status} />{p.holdReason && <div className="text-xs text-muted">{p.holdReason}</div>}</td></tr>)}</tbody></table>
        ) : <Empty>No payouts yet.</Empty>}
      </Section>
      <Section title="Promotion ticket revenue (separate ledger)">
        <p className="text-sm">Confirmed ticket payments: <b>{money(ticketPayments._sum.amount ?? 0)}</b>. Promotion funds are accounted separately from marketplace sales.</p>
      </Section>
      <Section title="Monthly statements">
        {months.length ? <ul className="flex flex-wrap gap-2 text-sm">{months.map((m) => <li key={m}><a className="btn-secondary btn-sm" href={`/api/seller/statement?month=${m}`}>⬇ {m}.csv</a></li>)}</ul> : <p className="text-sm text-muted">Statements appear once you have sales.</p>}
      </Section>
    </div>
  );
}
