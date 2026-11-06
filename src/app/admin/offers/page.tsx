import { db } from "@/lib/db";
import { date } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { DecisionForm } from "@/components/DecisionForm";
import { describeOffer } from "@/lib/offers";
import { offerDecisionAction } from "@/app/actions/admin";

export const metadata = { title: "Offers" };

export default async function AdminOffers({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const offers = await db.offer.findMany({ include: { listing: { select: { title: true } }, category: true }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 });
  const sellers = new Map((await db.user.findMany({ where: { id: { in: offers.map((o) => o.sellerId) } }, select: { id: true, publicId: true } })).map((u) => [u.id, u.publicId]));
  return (
    <div>
      <PageHeader title="Offers & discounts" />
      <Flash sp={sp} />
      {offers.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Offer</th><th>Seller</th><th>Applies to</th><th>Dates</th><th>Used</th><th>Status</th><th>Decision</th></tr></thead>
            <tbody>{offers.map((o) => (
              <tr key={o.id}>
                <td><b>{o.name}</b><div className="text-xs text-muted">{describeOffer(o)}{o.maxDiscount ? ` · max $${o.maxDiscount / 100}` : ""}</div></td>
                <td className="font-mono text-xs">{sellers.get(o.sellerId)}</td>
                <td>{o.listing?.title ?? o.category?.name ?? "All seller products"}</td>
                <td className="text-xs">{date(o.startsAt)} – {date(o.endsAt)}</td>
                <td>{o.usedCount}{o.usageLimit ? `/${o.usageLimit}` : ""}</td>
                <td><Badge status={o.status} /></td>
                <td>{o.status === "PENDING" ? <DecisionForm action={offerDecisionAction} hidden={{ id: o.id }} buttons={[{ value: "APPROVE", label: "Approve", className: "btn-success btn-sm" }, { value: "REJECT", label: "Reject", className: "btn-danger btn-sm" }]} /> : o.status === "APPROVED" ? <DecisionForm action={offerDecisionAction} hidden={{ id: o.id }} buttons={[{ value: "REJECT", label: "Withdraw approval", className: "btn-danger btn-sm" }]} /> : null}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>No offers.</Empty>}
    </div>
  );
}
