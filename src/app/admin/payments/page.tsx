import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Badge, Empty, PageHeader, Section } from "@/components/ui";
import { PAYMENT_STATUS } from "@/lib/constants";

export const metadata = { title: "Payments & reconciliation" };

export default async function AdminPayments({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const where: Prisma.PaymentWhereInput = {};
  if (sp.ledger) where.ledger = sp.ledger;
  if (sp.status) where.status = sp.status;
  if (sp.q) where.OR = [{ receiptNumber: { contains: sp.q.toUpperCase(), mode: "insensitive" } }, { providerRef: { contains: sp.q, mode: "insensitive" } }, { user: { publicId: sp.q.toUpperCase() } }];
  if (sp.from) where.createdAt = { gte: new Date(sp.from), ...(sp.to ? { lte: new Date(`${sp.to}T23:59:59`) } : {}) };
  const [payments, summary, webhooks] = await Promise.all([
    db.payment.findMany({ where, include: { user: { select: { publicId: true } }, refunds: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.payment.groupBy({ by: ["ledger", "status"], _sum: { amount: true }, _count: true }),
    db.webhookEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 15 }),
  ]);
  const qs = new URLSearchParams(sp).toString();
  return (
    <div className="space-y-5">
      <PageHeader title="Payments & reconciliation" actions={<a href={`/api/admin/export/payments?${qs}`} className="btn-secondary">⬇ Export CSV</a>} />
      <Section title="Ledger summary">
        <div className="grid gap-4 md:grid-cols-2">
          {["PRODUCT", "TICKET"].map((l) => (
            <div key={l}>
              <div className="mb-1 font-semibold">{l === "PRODUCT" ? "Marketplace (products)" : "Promotions (tickets)"}</div>
              <table className="table"><tbody>{summary.filter((s) => s.ledger === l).map((s) => <tr key={s.status}><td><Badge status={s.status} labels={PAYMENT_STATUS} /></td><td>{s._count}</td><td className="text-right">{money(s._sum.amount ?? 0)}</td></tr>)}</tbody></table>
            </div>
          ))}
        </div>
      </Section>
      <form className="card card-pad flex flex-wrap gap-3">
        <input name="q" defaultValue={sp.q} className="input max-w-56" placeholder="Receipt, provider ref, user ID" aria-label="Search" />
        <select name="ledger" defaultValue={sp.ledger ?? ""} className="input max-w-40" aria-label="Ledger"><option value="">Both ledgers</option><option value="PRODUCT">Product</option><option value="TICKET">Ticket</option></select>
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-48" aria-label="Status"><option value="">All statuses</option>{Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <input name="from" type="date" defaultValue={sp.from} className="input max-w-40" aria-label="From" /><input name="to" type="date" defaultValue={sp.to} className="input max-w-40" aria-label="To" />
        <button className="btn-secondary">Filter</button>
      </form>
      {payments.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Receipt</th><th>Ledger</th><th>User</th><th>Amount</th><th>Provider ref</th><th>Created</th><th>Paid</th><th>Status</th></tr></thead>
            <tbody>{payments.map((p) => (
              <tr key={p.id}>
                <td className="font-mono text-xs">{p.receiptNumber}</td><td>{p.ledger}</td><td className="font-mono text-xs">{p.user.publicId}</td><td>{money(p.amount)}</td>
                <td className="max-w-40 truncate font-mono text-xs" title={p.providerRef ?? ""}>{p.provider}:{p.providerRef ?? "—"}</td>
                <td className="text-xs">{dateTime(p.createdAt)}</td><td className="text-xs">{dateTime(p.paidAt)}</td>
                <td><Badge status={p.status} labels={PAYMENT_STATUS} />{p.failureReason && <div className="text-xs text-muted">{p.failureReason}</div>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>No payments.</Empty>}
      <Section title="Recent webhook events">
        <ul className="space-y-1 font-mono text-xs">{webhooks.map((w) => <li key={w.id}>{dateTime(w.receivedAt)} · {w.provider} · {w.type} · {w.id} → {w.result}</li>)}</ul>
      </Section>
    </div>
  );
}
