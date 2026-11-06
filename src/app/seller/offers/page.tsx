import { requireSeller } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { describeOffer } from "@/lib/offers";
import { offerStatusAction, saveOfferAction } from "@/app/actions/seller";

export const metadata = { title: "Offers & discounts" };

export default async function SellerOffers({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireSeller();
  const sp = await searchParams;
  const [offers, listings, categories] = await Promise.all([
    db.offer.findMany({ where: { sellerId: user.id }, include: { listing: { select: { title: true } }, category: true, usages: true }, orderBy: { createdAt: "desc" } }),
    db.listing.findMany({ where: { sellerId: user.id, status: { in: ["ACTIVE", "PAUSED", "PENDING", "DRAFT"] } }, select: { id: true, title: true } }),
    db.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" } }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-6">
      <PageHeader title="Offers & discounts" subtitle="Discounts apply to ordinary product purchases only — never to promotion tickets." />
      <Flash sp={sp} />
      <Section title="Create an offer">
        <form action={saveOfferAction} className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2"><label className="label" htmlFor="name">Offer name</label><input id="name" name="name" className="input" placeholder="Buy 2 or more — 10% off" required /></div>
          <div><label className="label" htmlFor="type">Discount type</label><select id="type" name="type" className="input"><option value="PERCENT">Percentage</option><option value="FIXED">Fixed amount ($)</option><option value="FREE_DELIVERY">Free delivery</option></select></div>
          <div><label className="label" htmlFor="value">Value (% or $)</label><input id="value" name="value" className="input" inputMode="decimal" placeholder="10" /></div>
          <div><label className="label" htmlFor="minQuantity">Minimum quantity</label><input id="minQuantity" name="minQuantity" type="number" min={1} defaultValue={1} className="input" /></div>
          <div><label className="label" htmlFor="minSubtotal">Minimum spend ($)</label><input id="minSubtotal" name="minSubtotal" className="input" inputMode="decimal" /></div>
          <div><label className="label" htmlFor="maxDiscount">Maximum discount ($)</label><input id="maxDiscount" name="maxDiscount" className="input" inputMode="decimal" /></div>
          <div><label className="label" htmlFor="listingId">Product</label><select id="listingId" name="listingId" className="input"><option value="">All my products</option>{listings.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}</select></div>
          <div><label className="label" htmlFor="categoryId">…or category</label><select id="categoryId" name="categoryId" className="input"><option value="">Any</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label className="label" htmlFor="couponCode">Coupon code (optional)</label><input id="couponCode" name="couponCode" className="input uppercase" placeholder="SAVE10" /></div>
          <div><label className="label" htmlFor="startsAt">Starts</label><input id="startsAt" name="startsAt" type="date" defaultValue={today} className="input" required /></div>
          <div><label className="label" htmlFor="endsAt">Expires</label><input id="endsAt" name="endsAt" type="date" className="input" required /></div>
          <div><label className="label" htmlFor="usageLimit">Total usage limit</label><input id="usageLimit" name="usageLimit" type="number" min={1} className="input" /></div>
          <div><label className="label" htmlFor="perBuyerLimit">Per-buyer limit</label><input id="perBuyerLimit" name="perBuyerLimit" type="number" min={1} className="input" /></div>
          <div className="sm:col-span-3"><label className="label" htmlFor="description">Description</label><input id="description" name="description" className="input" /></div>
          <div className="sm:col-span-3"><SubmitButton>Create offer</SubmitButton></div>
        </form>
      </Section>
      <Section title="My offers">
        {offers.length ? (
          <div className="overflow-x-auto"><table className="table"><thead><tr><th>Offer</th><th>Applies to</th><th>Dates</th><th>Used</th><th>Discount given</th><th>Status</th><th></th></tr></thead>
            <tbody>{offers.map((o) => (
              <tr key={o.id}>
                <td><b>{o.name}</b><div className="text-xs text-muted">{describeOffer(o)}</div></td>
                <td>{o.listing?.title ?? o.category?.name ?? "All products"}</td>
                <td className="text-xs">{date(o.startsAt)} – {date(o.endsAt)}</td>
                <td>{o.usedCount}{o.usageLimit ? ` / ${o.usageLimit}` : ""}</td>
                <td>{money(o.usages.reduce((a, u) => a + u.discount, 0))}</td>
                <td><Badge status={o.status} />{o.statusReason && <div className="text-xs text-muted">{o.statusReason}</div>}</td>
                <td className="flex gap-1">
                  {o.status === "APPROVED" && <form action={offerStatusAction}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="op" value="pause" /><SubmitButton className="btn-secondary btn-sm">Pause</SubmitButton></form>}
                  {o.status === "PAUSED" && <form action={offerStatusAction}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="op" value="resume" /><SubmitButton className="btn-secondary btn-sm">Resume</SubmitButton></form>}
                  {o.usedCount === 0 && <form action={offerStatusAction}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="op" value="delete" /><SubmitButton className="btn-secondary btn-sm">Delete</SubmitButton></form>}
                </td>
              </tr>
            ))}</tbody></table></div>
        ) : <Empty>No offers yet.</Empty>}
      </Section>
    </div>
  );
}
