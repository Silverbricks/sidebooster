import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { money, date } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { FEE_LABELS, type FeeType } from "@/lib/fees";
import { platformFeeAction } from "@/app/actions/admin";

export const metadata = { title: "Platform fees" };

export default async function AdminPlatformFees({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const where: Prisma.PlatformFeeWhereInput = {};
  if (sp.status) where.status = sp.status;
  if (sp.type) where.type = sp.type;
  const [fees, totals, sellers] = await Promise.all([
    db.platformFee.findMany({ where, include: { listing: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 300 }),
    db.platformFee.groupBy({ by: ["status", "type"], _sum: { amount: true }, _count: true }),
    db.sellerProfile.findMany({ select: { userId: true, sellerCode: true } }),
  ]);
  const code = new Map(sellers.map((s) => [s.userId, s.sellerCode]));
  const sum = (status: string) => totals.filter((t) => t.status === status).reduce((a, t) => a + (t._sum.amount ?? 0), 0);
  const backTo = `/admin/commissions/fees${sp.status ? `?status=${sp.status}` : ""}`;
  return (
    <div className="space-y-5">
      <PageHeader title="Platform fees (Pay Per Item)" subtitle="Listing, relist, featured and per-sale fees. Payment-provider processing fees are not included here." actions={<Link href="/admin/commissions" className="btn-secondary">← Commissions</Link>} />
      <Flash sp={sp} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Due" value={money(sum("DUE"))} />
        <Stat label="Paid" value={money(sum("PAID"))} />
        <Stat label="Waived / cancelled" value={money(sum("WAIVED") + sum("CANCELLED"))} />
      </div>
      <form className="flex flex-wrap gap-2">
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-48" aria-label="Status"><option value="">All statuses</option>{["DUE", "PAID", "WAIVED", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}</select>
        <select name="type" defaultValue={sp.type ?? ""} className="input max-w-48" aria-label="Type"><option value="">All types</option>{Object.entries(FEE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className="btn-secondary">Filter</button>
      </form>
      {fees.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Invoice</th><th>Seller</th><th>Type</th><th>Description</th><th>Amount</th><th>Due</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{fees.map((f) => (
              <tr key={f.id}>
                <td className="font-mono text-xs">{f.invoiceNumber}<div className="text-muted">{date(f.createdAt)}</div></td>
                <td className="font-mono text-xs">{code.get(f.sellerId) ?? "—"}</td>
                <td>{FEE_LABELS[f.type as FeeType] ?? f.type}</td>
                <td className="text-xs">{f.description}</td>
                <td>{money(f.amount)}</td>
                <td>{date(f.dueDate)}</td>
                <td><Badge status={f.status} />{f.reference && <div className="text-xs text-muted">Ref {f.reference}</div>}{f.note && <div className="text-xs text-muted">{f.note}</div>}</td>
                <td>
                  {f.status === "DUE" && (
                    <form action={platformFeeAction} className="flex flex-wrap gap-1">
                      <input type="hidden" name="id" value={f.id} /><input type="hidden" name="back" value={backTo} />
                      <input name="reason" className="input w-32 py-1 text-xs" placeholder="Ref / reason" aria-label="Reference or reason" />
                      <SubmitButton name="op" value="paid" className="btn-success btn-sm">Mark paid</SubmitButton>
                      <SubmitButton name="op" value="waive" className="btn-secondary btn-sm">Waive</SubmitButton>
                      <SubmitButton name="op" value="cancel" className="btn-secondary btn-sm">Cancel</SubmitButton>
                    </form>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>No platform fees yet. All fees are currently set to free in Settings unless you&apos;ve changed them.</Empty>}
    </div>
  );
}
