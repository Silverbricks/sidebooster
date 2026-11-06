import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Badge, Flash, KV, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { ORDER_STATUS, PAYMENT_STATUS } from "@/lib/constants";
import { cancelOrderAction, completeOrderAction, requestRefundAction } from "@/app/actions/marketplace";

export const metadata = { title: "Order details" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const o = await db.order.findUnique({
    where: { id },
    include: { items: { include: { listing: { select: { id: true } } } }, payments: { include: { refunds: true }, orderBy: { createdAt: "desc" } }, seller: { select: { sellerProfile: { select: { sellerCode: true, businessName: true, legalName: true } } } } },
  });
  if (!o || o.buyerId !== user.id) notFound();
  const paid = o.payments.find((p) => ["SUCCEEDED", "REFUND_REQUESTED"].includes(p.status));
  const pending = o.payments.find((p) => p.status === "PENDING");

  return (
    <div className="space-y-6">
      <PageHeader title={`Order ${o.orderNumber}`} subtitle={<Badge status={o.status} labels={ORDER_STATUS} />} />
      <Flash sp={sp} />
      <Section title="Items">
        <table className="table">
          <tbody>
            {o.items.map((i) => <tr key={i.id}><td><Link href={`/listing/${i.listing.id}`} className="link">{i.title}</Link></td><td>{i.quantity} × {money(i.unitPrice)}</td><td className="text-right">{money(i.quantity * i.unitPrice)}</td></tr>)}
            {o.discount > 0 && <tr><td colSpan={2}>Discount</td><td className="text-right text-emerald-700">−{money(o.discount)}</td></tr>}
            <tr><td colSpan={2}>Delivery</td><td className="text-right">{money(o.deliveryFee)}</td></tr>
            <tr><td colSpan={2} className="font-bold">Total</td><td className="text-right font-bold">{money(o.total)}</td></tr>
          </tbody>
        </table>
      </Section>
      <Section title="Details">
        <KV rows={[["Seller", `${o.seller.sellerProfile?.businessName ?? o.seller.sellerProfile?.legalName} (${o.seller.sellerProfile?.sellerCode})`], ["Placed", dateTime(o.createdAt)], ["Deliver to", `${o.shippingName ?? ""}\n${o.shippingAddress ?? ""}`], ["Shipped", dateTime(o.fulfilledAt)], ["Completed", dateTime(o.completedAt)]]} />
      </Section>
      <Section title="Payments">
        <ul className="space-y-2 text-sm">
          {o.payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3">
              <span className="font-mono">{p.receiptNumber}</span><span>{money(p.amount)}</span><Badge status={p.status} labels={PAYMENT_STATUS} />
              {p.refunds.map((r) => <span key={r.id} className="text-muted">Refund {r.status.toLowerCase()}: {r.reason}</span>)}
            </li>
          ))}
        </ul>
      </Section>
      <div className="flex flex-wrap gap-3">
        {pending && <Link href={`/pay/${pending.id}`} className="btn-primary">Complete payment</Link>}
        {o.status === "PENDING_PAYMENT" && <form action={cancelOrderAction}><input type="hidden" name="orderId" value={o.id} /><SubmitButton className="btn-secondary" confirm="Cancel this order?">Cancel order</SubmitButton></form>}
        {["PAID", "FULFILLED"].includes(o.status) && paid?.status === "SUCCEEDED" && (
          <form action={completeOrderAction}><input type="hidden" name="orderId" value={o.id} /><SubmitButton className="btn-success" confirm="Confirm you have received this item in the described condition?">I received my item</SubmitButton></form>
        )}
      </div>
      {paid?.status === "SUCCEEDED" && o.status !== "COMPLETED" && (
        <Section title="Request a refund">
          <form action={requestRefundAction} className="space-y-3">
            <input type="hidden" name="paymentId" value={paid.id} />
            <input type="hidden" name="back" value={`/account/orders/${o.id}`} />
            <textarea name="reason" className="input" rows={3} required placeholder="Tell us what went wrong" aria-label="Refund reason" />
            <SubmitButton className="btn-secondary">Request refund</SubmitButton>
          </form>
        </Section>
      )}
    </div>
  );
}
