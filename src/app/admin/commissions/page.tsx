import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { money, date } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { COMMISSION_STATUS } from "@/lib/constants";
import { pct } from "@/lib/commission";
import { commissionAction } from "@/app/actions/admin";

export const metadata = { title: "Commissions" };

export default async function AdminCommissions({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const where: Prisma.CommissionRecordWhereInput = {};
  if (sp.status) where.status = sp.status;
  if (sp.seller) where.sale = { seller: { sellerProfile: { sellerCode: sp.seller.toUpperCase() } } };
  if (sp.buyer) where.sale = { ...(where.sale as object), buyer: { publicId: sp.buyer.toUpperCase() } };
  if (sp.from) where.createdAt = { gte: new Date(sp.from) };
  if (sp.category) where.sale = { ...(where.sale as object), listing: { categoryId: sp.category } };
  const [records, categories, totals] = await Promise.all([
    db.commissionRecord.findMany({ where, include: { sale: { include: { listing: { include: { category: true } }, buyer: { select: { publicId: true } }, seller: { select: { sellerProfile: { select: { sellerCode: true } } } } } }, invoice: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" } }),
    db.commissionRecord.groupBy({ by: ["status"], _sum: { amount: true }, _count: true }),
  ]);
  const t = (s: string[]) => totals.filter((x) => s.includes(x.status)).reduce((a, x) => a + (x._sum.amount ?? 0), 0);
  const backTo = `/admin/commissions${sp.status ? `?status=${sp.status}` : ""}`;
  return (
    <div className="space-y-5">
      <PageHeader title="Commissions" subtitle="Only approved sales generate commission. Every adjustment, waiver and reversal requires a reason and is audit-logged." actions={<><Link href="/admin/commissions/invoices" className="btn-secondary">Invoices</Link><Link href="/admin/commissions/rules" className="btn-secondary">Rates</Link></>} />
      <Flash sp={sp} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Pending approval" value={money(t(["PENDING_APPROVAL"]))} />
        <Stat label="Generated / invoiced" value={money(t(["GENERATED", "INVOICED", "OVERDUE"]))} />
        <Stat label="Paid" value={money(t(["PAID"]))} />
        <Stat label="Reversed / waived" value={money(t(["REVERSED", "WAIVED"]))} />
      </div>
      <form className="card card-pad flex flex-wrap gap-3">
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-48" aria-label="Status"><option value="">All statuses</option>{Object.entries(COMMISSION_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select name="category" defaultValue={sp.category ?? ""} className="input max-w-48" aria-label="Category"><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <input name="seller" defaultValue={sp.seller} className="input max-w-36" placeholder="Seller ID" aria-label="Seller ID" />
        <input name="buyer" defaultValue={sp.buyer} className="input max-w-36" placeholder="Buyer ID" aria-label="Buyer ID" />
        <input name="from" type="date" defaultValue={sp.from} className="input max-w-40" aria-label="From date" />
        <button className="btn-secondary">Filter</button>
      </form>
      {records.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>Sale</th><th>Seller / Buyer</th><th>Base</th><th>Rate</th><th>Commission</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{records.map((r) => (
              <tr key={r.id}>
                <td>{date(r.createdAt)}</td>
                <td>{r.sale.listing.title}<div className="font-mono text-xs text-muted">{r.sale.saleNumber} · {r.sale.listing.category.name} · {r.settlement === "DEDUCTED" ? "deducted" : "invoiced"}</div></td>
                <td className="font-mono text-xs">{r.sale.seller.sellerProfile?.sellerCode}<div>{r.sale.buyer.publicId}</div></td>
                <td>{money(r.baseAmount)}</td><td>{pct(r.rateBps)}</td><td><b>{money(r.amount)}</b></td>
                <td><Badge status={r.status} labels={COMMISSION_STATUS} />{r.invoice && <div className="font-mono text-xs">{r.invoice.invoiceNumber}</div>}{r.adjustReason && <div className="text-xs text-muted">{r.adjustReason}</div>}</td>
                <td className="min-w-72">
                  {!["REVERSED", "WAIVED", "REJECTED"].includes(r.status) && (
                    <form action={commissionAction} className="flex flex-wrap gap-1">
                      <input type="hidden" name="id" value={r.id} /><input type="hidden" name="back" value={backTo} />
                      <input name="reason" className="input py-1 text-xs" placeholder="Reason" aria-label="Reason" />
                      {r.status === "PENDING_APPROVAL" && <SubmitButton name="op" value="approve" className="btn-success btn-sm">Approve</SubmitButton>}
                      {r.status === "PENDING_APPROVAL" && <SubmitButton name="op" value="reject" className="btn-secondary btn-sm">Reject</SubmitButton>}
                      {r.status !== "PAID" && <><input name="rate" className="input w-16 py-1 text-xs" placeholder="%" aria-label="New rate" /><SubmitButton name="op" value="adjust" className="btn-secondary btn-sm">Adjust</SubmitButton></>}
                      {r.status !== "PAID" && <SubmitButton name="op" value="waive" className="btn-secondary btn-sm">Waive</SubmitButton>}
                      <SubmitButton name="op" value="reverse" className="btn-danger btn-sm" confirm="Reverse this commission?">Reverse</SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>No commission records.</Empty>}
    </div>
  );
}
