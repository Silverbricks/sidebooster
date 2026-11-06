import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { PAYMENT_STATUS } from "@/lib/constants";

export const metadata = { title: "Payments & refunds" };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const payments = await db.payment.findMany({
    where: { userId: user.id },
    include: { refunds: true, order: { select: { id: true, orderNumber: true } }, ticketPurchase: { include: { campaign: { select: { title: true, slug: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageHeader title="Payments & refunds" subtitle="Product orders and promotion tickets are recorded in separate ledgers." />
      <Flash sp={sp} />
      {payments.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Receipt</th><th>Type</th><th>For</th><th>Date</th><th>Amount</th><th>Status</th><th>Refunds</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.receiptNumber}</td>
                  <td>{p.ledger === "TICKET" ? "Promotion" : "Product"}</td>
                  <td>{p.order ? <Link className="link" href={`/account/orders/${p.order.id}`}>{p.order.orderNumber}</Link> : p.ticketPurchase ? <Link className="link" href={`/draws/${p.ticketPurchase.campaign.slug}`}>{p.ticketPurchase.quantity} × {p.ticketPurchase.campaign.title}</Link> : "—"}</td>
                  <td>{dateTime(p.createdAt)}</td>
                  <td>{money(p.amount)}</td>
                  <td><Badge status={p.status} labels={PAYMENT_STATUS} />{p.status === "PENDING" && <Link href={`/pay/${p.id}`} className="link ml-2 text-xs">Pay</Link>}</td>
                  <td className="text-xs">{p.refunds.map((r) => <div key={r.id}>{money(r.amount)} — {r.status.toLowerCase()}<div className="text-muted">{r.reason}</div></div>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>No payments yet.</Empty>}
      <p className="mt-4 text-xs text-muted">To request a refund for a product order, open the order. Ticket refunds are available until ticket sales close; open the ticket to request one.</p>
    </div>
  );
}
