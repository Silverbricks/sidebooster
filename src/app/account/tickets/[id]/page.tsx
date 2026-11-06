import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Badge, Flash, KV, PageHeader, PublicStatusBadge, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { publicStatus } from "@/lib/campaigns";
import { PAYMENT_STATUS } from "@/lib/constants";
import { requestRefundAction } from "@/app/actions/marketplace";

export const metadata = { title: "Ticket" };

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const t = await db.ticket.findUnique({ where: { id }, include: { campaign: { include: { result: true } }, purchase: { include: { payment: true, tickets: true } } } });
  if (!t || t.buyerId !== user.id) notFound();
  const c = t.campaign;
  const pay = t.purchase.payment;
  const won = c.result?.status === "PUBLISHED" && c.result.winningTicketId === t.id;

  return (
    <div className="space-y-6">
      <PageHeader title={`Ticket ${t.ticketNumber}`} subtitle={<Link className="link" href={`/draws/${c.slug}`}>{c.title}</Link>} />
      <Flash sp={sp} />
      {won && <div className="rounded-xl bg-emerald-600 p-5 text-white"><div className="text-2xl font-bold">🎉 This ticket won!</div><div>Prize: {c.prizeName}. {c.prizeDelivery}</div></div>}
      <Section title="Ticket details">
        <KV rows={[
          ["Ticket number", <span key="n" className="font-mono text-lg font-bold">{t.ticketNumber}</span>],
          ["Ticket status", <Badge key="s" status={t.status} />],
          ["Campaign", c.title],
          ["Campaign status", <PublicStatusBadge key="c" status={publicStatus(c)} />],
          ["Prize", `${c.prizeName} (${money(c.prizeValue)})`],
          ["Allocated", dateTime(t.createdAt)],
          ["Type", t.allocationType === "FREE" ? "Free ticket" : "Paid ticket"],
          ["Payment", pay ? <span key="p">{money(pay.amount)} for {t.purchase.quantity} ticket(s) · <Badge status={pay.status} labels={PAYMENT_STATUS} /> · <span className="font-mono text-xs">{pay.receiptNumber}</span></span> : "Free allocation"],
          ["Draw", dateTime(c.drawAt, c.timezone)],
          ["Tickets in this purchase", t.purchase.tickets.map((x) => x.ticketNumber).join(", ")],
        ]} />
      </Section>
      {pay?.status === "SUCCEEDED" && !c.lockedAt && (
        <Section title="Request a refund">
          <p className="mb-3 text-sm text-muted">Refunds cover the whole purchase ({t.purchase.quantity} tickets) and are only possible before ticket sales close.</p>
          <form action={requestRefundAction} className="space-y-3">
            <input type="hidden" name="paymentId" value={pay.id} />
            <input type="hidden" name="back" value={`/account/tickets/${t.id}`} />
            <textarea name="reason" className="input" rows={2} required aria-label="Refund reason" />
            <SubmitButton className="btn-secondary">Request refund</SubmitButton>
          </form>
        </Section>
      )}
    </div>
  );
}
