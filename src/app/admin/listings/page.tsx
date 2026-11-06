import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { DecisionForm } from "@/components/DecisionForm";
import { LISTING_STATUS, SELLER_STATUS } from "@/lib/constants";
import { listingDecisionAction } from "@/app/actions/admin";

export const metadata = { title: "Product listings" };

export default async function AdminListings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const status = sp.status ?? "PENDING";
  const where: Prisma.ListingWhereInput = status === "ALL" ? {} : { status };
  if (sp.q) where.OR = [{ title: { contains: sp.q, mode: "insensitive" } }, { seller: { publicId: { contains: sp.q.toUpperCase(), mode: "insensitive" } } }];
  const listings = await db.listing.findMany({
    where,
    include: { category: true, images: { take: 3, orderBy: { sortOrder: "asc" } }, attributes: { include: { attribute: true } }, seller: { select: { publicId: true, sellerProfile: { select: { sellerCode: true, status: true, trustedSeller: true } } } } },
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  const backTo = `/admin/listings?status=${status}`;
  return (
    <div>
      <PageHeader title="Product listings" />
      <Flash sp={sp} />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {["PENDING", "ACTIVE", "REJECTED", "SUSPENDED", "SOLD", "EXPIRED", "DRAFT", "ALL"].map((s) => <Link key={s} href={`/admin/listings?status=${s}`} className={`rounded-full px-3 py-1 ${status === s ? "bg-brand-600 text-white" : "bg-white ring-1 ring-line"}`}>{LISTING_STATUS[s] ?? "All"}</Link>)}
      </div>
      {listings.length ? (
        <div className="space-y-3">
          {listings.map((l) => (
            <div key={l.id} id={l.id} className="card card-pad">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3">
                  {l.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.images[0].url} alt="" className="h-20 w-28 rounded-lg object-cover" />
                  ) : <div className="grid h-20 w-28 place-items-center rounded-lg bg-slate-100 text-3xl">{l.category.icon}</div>}
                  <div>
                    <Link href={`/listing/${l.id}`} className="link font-semibold" target="_blank">{l.title}</Link>
                    <div className="text-sm">{money(l.price)} · {l.category.name} · {l.condition.toLowerCase()} · {l.location} {l.state}</div>
                    <div className="text-xs text-muted">Seller {l.seller.sellerProfile?.sellerCode ?? l.seller.publicId} <Badge status={l.seller.sellerProfile?.status ?? "ACTIVE"} labels={SELLER_STATUS} />{l.seller.sellerProfile?.trustedSeller && " · trusted"} · {l.images.length} photo(s) · updated {dateTime(l.updatedAt)}</div>
                  </div>
                </div>
                <Badge status={l.status} labels={LISTING_STATUS} />
              </div>
              <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted">Description & specifications</summary>
                <p className="mt-2 whitespace-pre-line">{l.description}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">{l.attributes.map((a) => <span key={a.id} className="rounded bg-slate-100 px-2 py-0.5">{a.attribute.label}: {a.value}</span>)}</div>
              </details>
              <div className="mt-3">
                <DecisionForm action={listingDecisionAction} hidden={{ id: l.id, back: backTo }} buttons={[
                  ...(l.status === "PENDING" ? [{ value: "APPROVE", label: "Approve & publish", className: "btn-success btn-sm" }, { value: "REJECT", label: "Reject", className: "btn-danger btn-sm" }] : []),
                  ...(l.status === "ACTIVE" ? [{ value: l.featured ? "UNFEATURE" : "FEATURE", label: l.featured ? "Unfeature" : "Feature" }, { value: "SUSPEND", label: "Suspend", className: "btn-danger btn-sm" }] : []),
                  ...(l.status === "SUSPENDED" ? [{ value: "REINSTATE", label: "Reinstate (paused)" }] : []),
                ]} />
              </div>
            </div>
          ))}
        </div>
      ) : <Empty>No listings in this state.</Empty>}
    </div>
  );
}
