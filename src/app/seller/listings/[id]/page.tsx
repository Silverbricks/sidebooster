import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth";
import { db } from "@/lib/db";
import { canSubmitListings } from "@/lib/accounts";
import { categoriesForForm } from "@/lib/listing-form-data";
import { ListingForm } from "@/components/ListingForm";
import { Badge, Flash, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { LISTING_STATUS } from "@/lib/constants";
import { dateTime } from "@/lib/format";
import { listingStatusAction, requestFeaturedAction, saveListingAction } from "@/app/actions/seller";
import { feeDisclosure } from "@/lib/fee-disclosure";
import { productPath } from "@/lib/urls";

export const metadata = { title: "Manage product" };

export default async function EditListing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireSeller();
  const l = await db.listing.findUnique({ where: { id }, include: { images: { orderBy: { sortOrder: "asc" } }, attributes: true, category: true } });
  if (!l || (l.sellerId !== user.id && user.role !== "ADMIN")) notFound();
  const history = await db.auditLog.findMany({ where: { entityType: "Listing", entityId: id }, orderBy: { createdAt: "desc" }, take: 20 });
  const ops: [string, string, string[]][] = [["pause", "Pause", ["ACTIVE"]], ["resume", "Resume", ["PAUSED"]], ["sold", "Mark as sold", ["ACTIVE", "PAUSED"]], ["withdraw", "Withdraw from review", ["PENDING"]], ["relist", "Relist", ["EXPIRED"]], ["delete", "Delete", ["DRAFT", "REJECTED", "EXPIRED", "PAUSED"]]];
  const editable = !["SOLD", "SUSPENDED"].includes(l.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={l.title}
        subtitle={<><Badge status={l.status} labels={LISTING_STATUS} /> {l.statusReason && <span className="ml-2">Reason: {l.statusReason}</span>}</>}
        actions={<Link href={productPath(l)} className="btn-secondary">View</Link>}
      />
      <Flash sp={sp} />
      <div className="flex flex-wrap gap-2">
        {ops.filter(([, , from]) => from.includes(l.status)).map(([op, label]) => (
          <form key={op} action={listingStatusAction}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="op" value={op} />
            <SubmitButton className={op === "delete" ? "btn-danger btn-sm" : "btn-secondary btn-sm"} confirm={op === "delete" ? "Delete this listing permanently?" : undefined}>{label}</SubmitButton></form>
        ))}
        {l.category.highValue && ["ACTIVE", "PAUSED"].includes(l.status) && <Link href={`/seller/sales?listing=${l.id}`} className="btn-success btn-sm">Report sale</Link>}
        {l.status === "ACTIVE" && <Link href={`/seller/campaigns/new?listing=${l.id}`} className="btn-secondary btn-sm">🎟️ Request promotion</Link>}
        {l.status === "ACTIVE" && !l.featured && <form action={requestFeaturedAction}><input type="hidden" name="id" value={l.id} /><SubmitButton className="btn-secondary btn-sm">⭐ Request featured placement</SubmitButton></form>}
        {l.featured && <span className="self-center text-xs font-medium text-amber-700">⭐ Featured</span>}
      </div>
      {["ACTIVE", "PAUSED"].includes(l.status) && <p className="text-xs text-muted">Editing a published listing sends it back for approval.</p>}
      {editable ? (
        <ListingForm
          categories={await categoriesForForm()}
          action={saveListingAction}
          canSubmit={canSubmitListings(user)}
          fees={await feeDisclosure(l.sellerId)}
          initial={{ ...l, attrs: Object.fromEntries(l.attributes.map((a) => [a.attributeId, a.value])), images: l.images.map((i) => ({ id: i.id, url: i.url })) }}
        />
      ) : <p className="text-sm text-muted">This listing can no longer be edited.</p>}
      <Section title="Approval & status history">
        <ul className="space-y-1 text-sm">{history.map((h) => <li key={h.id}><span className="text-muted">{dateTime(h.createdAt)}</span> — {h.action.replace(/_/g, " ").toLowerCase()}{h.reason && `: ${h.reason}`}</li>)}</ul>
      </Section>
    </div>
  );
}
