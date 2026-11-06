import { requireSeller } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ORDER_STATUS } from "@/lib/constants";
import { fulfilOrderAction } from "@/app/actions/seller";

export const metadata = { title: "Orders" };

export default async function SellerOrders({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireSeller();
  const sp = await searchParams;
  const orders = await db.order.findMany({ where: { sellerId: user.id, status: { not: "PENDING_PAYMENT" } }, include: { items: true, buyer: { select: { publicId: true, name: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader title="Orders" subtitle="Only orders with a verified payment appear here." />
      <Flash sp={sp} />
      {orders.length ? (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.id} className="card card-pad text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-semibold">{o.orderNumber}</span>
                <Badge status={o.status} labels={ORDER_STATUS} />
              </div>
              <div className="mt-1 text-muted">{dateTime(o.createdAt)} · Buyer {o.buyer.name} ({o.buyer.publicId})</div>
              <div className="mt-2">{o.items.map((i) => `${i.quantity} × ${i.title}`).join(", ")} — <b>{money(o.total)}</b>{o.discount > 0 && <span className="text-muted"> (incl. −{money(o.discount)} offer)</span>}</div>
              {o.shippingAddress && <div className="mt-1 whitespace-pre-line text-muted">Ship to: {o.shippingName}, {o.shippingAddress}</div>}
              {o.notes && <div className="mt-1 text-muted">Note: {o.notes}</div>}
              {o.status === "PAID" && (
                <form action={fulfilOrderAction} className="mt-3"><input type="hidden" name="orderId" value={o.id} /><SubmitButton className="btn-primary btn-sm">Mark shipped / handed over</SubmitButton></form>
              )}
            </div>
          ))}
        </div>
      ) : <Empty>No orders yet.</Empty>}
    </div>
  );
}
