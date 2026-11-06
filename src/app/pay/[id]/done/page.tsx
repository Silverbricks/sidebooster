import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { Badge } from "@/components/ui";
import { PAYMENT_STATUS } from "@/lib/constants";

export const metadata = { title: "Payment status", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PaymentDonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const p = await db.payment.findUnique({ where: { id }, include: { order: true, ticketPurchase: { include: { tickets: true, campaign: true } }, refunds: true } });
  if (!p || p.userId !== user.id) notFound();
  const pending = p.status === "PENDING" || p.status === "PROCESSING";

  return (
    <div className="container-page max-w-lg py-14 text-center">
      {pending && <meta httpEquiv="refresh" content="3" />}
      <div className="text-5xl">{p.status === "SUCCEEDED" ? "✅" : pending ? "⏳" : "⚠️"}</div>
      <h1 className="h1 mt-3">{p.status === "SUCCEEDED" ? "Payment successful" : pending ? "Waiting for payment confirmation…" : "Payment not completed"}</h1>
      <div className="mt-2"><Badge status={p.status} labels={PAYMENT_STATUS} /></div>
      <p className="mt-3 text-sm text-muted">Receipt {p.receiptNumber} · {money(p.amount)}</p>
      {p.failureReason && <p className="mt-2 text-sm text-red-700">{p.failureReason}</p>}
      {p.refunds.map((r) => <p key={r.id} className="mt-2 text-sm text-amber-800">{r.reason}</p>)}
      {p.status === "SUCCEEDED" && p.ticketPurchase && (
        <div className="card card-pad mt-6">
          <div className="text-sm text-muted">Your ticket numbers for {p.ticketPurchase.campaign.title}</div>
          <div className="mt-2 flex flex-wrap justify-center gap-2">{p.ticketPurchase.tickets.map((t) => <span key={t.id} className="rounded-lg bg-brand-50 px-3 py-1 font-mono text-lg font-bold text-brand-700">{t.ticketNumber}</span>)}</div>
        </div>
      )}
      <div className="mt-8 flex justify-center gap-3">
        {p.order && <Link href={`/account/orders/${p.order.id}`} className="btn-primary">View order</Link>}
        {p.ticketPurchase && <Link href="/account/tickets" className="btn-primary">My tickets</Link>}
        <Link href="/account/payments" className="btn-secondary">Payment history</Link>
      </div>
    </div>
  );
}
