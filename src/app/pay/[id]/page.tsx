import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { money } from "@/lib/format";
import { testGatewayAction } from "@/app/actions/marketplace";
import { SubmitButton } from "@/components/SubmitButton";
import { testPaymentsAllowed } from "@/lib/payment-provider";

export const metadata = { title: "Secure payment (test gateway)", robots: { index: false } };

export default async function TestGatewayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(undefined, `/pay/${id}`);
  const p = await db.payment.findUnique({ where: { id }, include: { order: { include: { items: true } }, ticketPurchase: { include: { campaign: true } } } });
  if (!p || p.userId !== user.id) notFound();
  if (p.status !== "PENDING") redirect(`/pay/${id}/done`);
  if (!testPaymentsAllowed()) notFound();
  const what = p.order ? p.order.items.map((i) => `${i.quantity} × ${i.title}`).join(", ") : `${p.ticketPurchase!.quantity} × ticket — ${p.ticketPurchase!.campaign.title}`;

  return (
    <div className="grid min-h-[70vh] place-items-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="bg-slate-900 px-6 py-4 text-white">
          <div className="text-xs uppercase tracking-widest text-amber-300">Test mode · simulated gateway</div>
          <div className="mt-1 text-sm text-slate-300">Paying SellEasy {p.ledger === "TICKET" ? "(promotions account)" : ""}</div>
          <div className="text-3xl font-bold">{money(p.amount)}</div>
        </div>
        <div className="space-y-4 p-6">
          <div className="text-sm text-muted">{what}</div>
          <div className="text-xs text-muted">Receipt {p.receiptNumber} · expires {p.expiresAt.toLocaleTimeString("en-AU")}</div>
          <form action={testGatewayAction} className="space-y-3">
            <input type="hidden" name="paymentId" value={p.id} />
            <fieldset className="grid grid-cols-3 gap-2 text-sm">
              <legend className="label">Method</legend>
              {[["card", "Card"], ["apple_pay", "Apple Pay"], ["google_pay", "Google Pay"]].map(([v, l], i) => (
                <label key={v} className="flex items-center gap-2 rounded-lg border border-line p-2"><input type="radio" name="method" value={v} defaultChecked={i === 0} />{l}</label>
              ))}
            </fieldset>
            <div className="rounded-lg bg-slate-50 p-3 font-mono text-sm text-muted">4242 4242 4242 4242 · 12/34 · 123</div>
            <SubmitButton name="outcome" value="success" className="btn-primary w-full">Pay {money(p.amount)}</SubmitButton>
            <SubmitButton name="outcome" value="decline" className="btn-secondary w-full">Simulate declined card</SubmitButton>
          </form>
          <p className="text-xs text-muted">This page stands in for the payment provider. It sends a signed webhook to the platform, exactly as Stripe would. Set PAYMENT_PROVIDER=stripe to use real Stripe Checkout.</p>
        </div>
      </div>
    </div>
  );
}
