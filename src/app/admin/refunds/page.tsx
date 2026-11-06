import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { DecisionForm } from "@/components/DecisionForm";
import { refundDecisionAction } from "@/app/actions/admin";

export const metadata = { title: "Refunds" };

export default async function AdminRefunds({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const refunds = await db.refund.findMany({ include: { payment: { include: { user: { select: { publicId: true } }, order: { select: { orderNumber: true, status: true } }, ticketPurchase: { include: { campaign: { select: { title: true, lockedAt: true } } } } } } }, orderBy: [{ status: "desc" }, { createdAt: "desc" }], take: 200 });
  return (
    <div>
      <PageHeader title="Refunds" subtitle="Approving a product refund reverses the related sale, commission and unpaid payout. Ticket refunds void the tickets." />
      <Flash sp={sp} />
      {refunds.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Requested</th><th>Payment</th><th>For</th><th>Amount</th><th>Reason</th><th>Status</th><th>Decision</th></tr></thead>
            <tbody>{refunds.map((r) => (
              <tr key={r.id}>
                <td className="text-xs">{dateTime(r.createdAt)}<div className="font-mono">{r.payment.user.publicId}</div></td>
                <td className="font-mono text-xs">{r.payment.receiptNumber}<div>{r.payment.ledger}</div></td>
                <td>{r.payment.order?.orderNumber ?? r.payment.ticketPurchase?.campaign.title}{r.payment.ticketPurchase?.campaign.lockedAt && <div className="text-xs text-red-700">Entries locked</div>}</td>
                <td>{money(r.amount)}</td><td className="max-w-60">{r.reason}</td>
                <td><Badge status={r.status} />{r.adminNote && <div className="text-xs text-muted">{r.adminNote}</div>}</td>
                <td>{r.status === "REQUESTED" && <DecisionForm action={refundDecisionAction} hidden={{ id: r.id }} buttons={[{ value: "APPROVE", label: "Refund", className: "btn-success btn-sm", confirm: `Refund ${money(r.amount)}?` }, { value: "REJECT", label: "Decline", className: "btn-danger btn-sm" }]} reasonPlaceholder="Note / reason" />}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>No refund requests.</Empty>}
    </div>
  );
}
