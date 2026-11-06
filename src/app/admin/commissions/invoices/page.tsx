import { db } from "@/lib/db";
import { money, date } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { invoicePaidAction } from "@/app/actions/admin";

export const metadata = { title: "Commission invoices" };

export default async function AdminInvoices({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const invoices = await db.commissionInvoice.findMany({ where: sp.status ? { status: sp.status } : {}, include: { commission: { include: { sale: { include: { listing: { select: { title: true } } } } } } }, orderBy: [{ status: "asc" }, { dueDate: "asc" }] });
  const sellers = new Map((await db.sellerProfile.findMany({ where: { userId: { in: invoices.map((i) => i.sellerId) } }, select: { userId: true, sellerCode: true, legalName: true } })).map((s) => [s.userId, s]));
  return (
    <div>
      <PageHeader title="Commission invoices" subtitle="Issued to sellers for reported (offline) sales. Only admins can mark invoices paid, after reconciling the payment." />
      <Flash sp={sp} />
      {invoices.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Invoice</th><th>Seller</th><th>Sale</th><th>Issued</th><th>Due</th><th>Amount</th><th>Status</th><th>Reconcile</th></tr></thead>
            <tbody>{invoices.map((i) => (
              <tr key={i.id}>
                <td className="font-mono">{i.invoiceNumber}</td>
                <td>{sellers.get(i.sellerId)?.legalName}<div className="font-mono text-xs">{sellers.get(i.sellerId)?.sellerCode}</div></td>
                <td>{i.commission.sale.listing.title}<div className="font-mono text-xs text-muted">{i.commission.sale.saleNumber}</div></td>
                <td>{date(i.createdAt)}</td><td>{date(i.dueDate)}</td><td><b>{money(i.amount)}</b></td>
                <td><Badge status={i.status} />{i.reference && <div className="text-xs text-muted">Ref {i.reference}</div>}</td>
                <td>{["ISSUED", "OVERDUE"].includes(i.status) && (
                  <form action={invoicePaidAction} className="flex gap-1"><input type="hidden" name="id" value={i.id} /><input name="reference" className="input py-1 text-xs" placeholder="Bank ref" required aria-label="Payment reference" /><SubmitButton className="btn-success btn-sm">Mark paid</SubmitButton></form>
                )}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>No invoices.</Empty>}
    </div>
  );
}
