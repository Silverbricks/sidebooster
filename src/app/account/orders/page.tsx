import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, date } from "@/lib/format";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { ORDER_STATUS } from "@/lib/constants";

export const metadata = { title: "My orders" };

export default async function OrdersPage() {
  const user = await requireUser();
  const orders = await db.order.findMany({ where: { buyerId: user.id }, include: { items: true }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader title="My orders" />
      {orders.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Order</th><th>Items</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><Link className="link font-mono" href={`/account/orders/${o.id}`}>{o.orderNumber}</Link></td>
                  <td>{o.items.map((i) => `${i.quantity} × ${i.title}`).join(", ")}</td>
                  <td>{date(o.createdAt)}</td>
                  <td>{money(o.total)}</td>
                  <td><Badge status={o.status} labels={ORDER_STATUS} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>No orders yet. <Link href="/marketplace" className="link">Browse the marketplace</Link>.</Empty>}
    </div>
  );
}
