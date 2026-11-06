import { brand } from "@/config/brand";
import { requireSeller } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { SALE_STATUS, COMMISSION_STATUS } from "@/lib/constants";
import { reportSaleAction } from "@/app/actions/seller";
import { pct } from "@/lib/commission";

export const metadata = { title: "Completed sales" };

export default async function SellerSales({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireSeller();
  const sp = await searchParams;
  const [sales, reportable] = await Promise.all([
    db.sale.findMany({ where: { sellerId: user.id }, include: { listing: { select: { title: true } }, buyer: { select: { publicId: true } }, commission: true, payout: true }, orderBy: { createdAt: "desc" } }),
    db.listing.findMany({ where: { sellerId: user.id, status: { in: ["ACTIVE", "PAUSED"] } }, select: { id: true, title: true, price: true }, orderBy: { title: "asc" } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Completed sales" subtitle="Commission is only calculated on approved, completed sales." />
      <Flash sp={sp} />
      <Section title="Report a sale arranged directly with a buyer">
        <p className="mb-3 text-sm text-muted">For cars, property and other enquiry-based sales. The buyer confirms the sale in their account, then {brand.name} reviews it and issues a commission invoice.</p>
        {reportable.length ? (
          <form action={reportSaleAction} className="grid gap-3 sm:grid-cols-2">
            <div><label className="label" htmlFor="listingId">Product</label>
              <select id="listingId" name="listingId" className="input" defaultValue={sp.listing ?? ""} required>{reportable.map((l) => <option key={l.id} value={l.id}>{l.title} ({money(l.price)})</option>)}</select>
            </div>
            <div><label className="label" htmlFor="buyerId">Buyer ID</label><input id="buyerId" name="buyerId" className="input font-mono uppercase" placeholder="BUY-000123" required /><p className="hint">Ask the buyer for the ID shown in their account.</p></div>
            <div><label className="label" htmlFor="salePrice">Final sale price (AUD)</label><input id="salePrice" name="salePrice" className="input" inputMode="decimal" required /></div>
            <div><label className="label" htmlFor="note">Note / evidence reference</label><input id="note" name="note" className="input" placeholder="e.g. contract of sale date, rego transfer no." /></div>
            <div className="sm:col-span-2"><SubmitButton>Report sale</SubmitButton></div>
          </form>
        ) : <p className="text-sm text-muted">No published products to report.</p>}
      </Section>
      <Section title="Sales">
        {sales.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Sale</th><th>Product</th><th>Buyer</th><th>Source</th><th>Price</th><th>Status</th><th>Commission</th><th>Payout</th></tr></thead>
              <tbody>{sales.map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-xs">{s.saleNumber}<div className="text-muted">{dateTime(s.createdAt)}</div></td>
                  <td>{s.listing.title}</td><td className="font-mono text-xs">{s.buyer.publicId}</td><td>{s.source === "ONLINE" ? "Online checkout" : "Reported"}</td>
                  <td>{money(s.salePrice)}</td>
                  <td><Badge status={s.status} labels={SALE_STATUS} />{s.adminNote && <div className="text-xs text-muted">{s.adminNote}</div>}</td>
                  <td>{s.commission ? <>{money(s.commission.amount)} <span className="text-xs text-muted">({pct(s.commission.rateBps)})</span><div><Badge status={s.commission.status} labels={COMMISSION_STATUS} /></div></> : "—"}</td>
                  <td>{s.payout ? <>{money(s.payout.amount)} <Badge status={s.payout.status} /></> : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty>No sales yet.</Empty>}
      </Section>
    </div>
  );
}
