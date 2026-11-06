import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ORDER_STATUS } from "@/lib/constants";
import { adminCompleteOrderAction } from "@/app/actions/admin";

export const metadata = { title: "Product orders" };

export default async function AdminOrders({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const where: Prisma.OrderWhereInput = {};
  if (sp.status) where.status = sp.status;
  if (sp.q) where.OR = [{ orderNumber: { contains: sp.q.toUpperCase(), mode: "insensitive" } }, { buyer: { publicId: sp.q.toUpperCase() } }, { seller: { publicId: sp.q.toUpperCase() } }];
  const orders = await db.order.findMany({ where, include: { items: true, buyer: { select: { publicId: true } }, seller: { select: { publicId: true, sellerProfile: { select: { sellerCode: true } } } }, payments: true, sale: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <div>
      <PageHeader title="Product orders" />
      <Flash sp={sp} />
      <form className="card card-pad mb-4 flex flex-wrap gap-3">
        <input name="q" defaultValue={sp.q} className="input max-w-xs" placeholder="Order no, buyer or seller ID" aria-label="Search" />
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-52" aria-label="Status"><option value="">All</option>{Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className="btn-secondary">Filter</button>
      </form>
      {orders.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Order</th><th>Buyer</th><th>Seller</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Sale</th><th></th></tr></thead>
            <tbody>{orders.map((o) => (
              <tr key={o.id}>
                <td className="font-mono text-xs">{o.orderNumber}<div className="text-muted">{dateTime(o.createdAt)}</div></td>
                <td className="font-mono text-xs">{o.buyer.publicId}</td>
                <td className="font-mono text-xs">{o.seller.sellerProfile?.sellerCode ?? o.seller.publicId}</td>
                <td>{o.items.map((i) => `${i.quantity}× ${i.title}`).join(", ")}</td>
                <td>{money(o.total)}{o.discount > 0 && <div className="text-xs text-muted">−{money(o.discount)} offer</div>}</td>
                <td>{o.payments.map((p) => <Badge key={p.id} status={p.status} />)}</td>
                <td><Badge status={o.status} labels={ORDER_STATUS} /></td>
                <td className="font-mono text-xs">{o.sale?.saleNumber ?? "—"}</td>
                <td>{["PAID", "FULFILLED"].includes(o.status) && <form action={adminCompleteOrderAction}><input type="hidden" name="orderId" value={o.id} /><SubmitButton className="btn-secondary btn-sm" confirm="Mark this order completed on the buyer's behalf? This approves the sale for commission.">Complete</SubmitButton></form>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>No orders.</Empty>}
    </div>
  );
}
