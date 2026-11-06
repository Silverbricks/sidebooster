import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, date } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { LISTING_STATUS } from "@/lib/constants";

export const metadata = { title: "My products" };

export default async function SellerListings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireSeller();
  const sp = await searchParams;
  const status = sp.status;
  const listings = await db.listing.findMany({ where: { sellerId: user.id, ...(status ? { status } : {}) }, include: { category: true, _count: { select: { enquiries: true, wishlistedBy: true } } }, orderBy: { updatedAt: "desc" } });
  return (
    <div>
      <PageHeader title="Products" actions={<Link href="/seller/listings/new" className="btn-primary">+ Add product</Link>} />
      <Flash sp={sp} />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/seller/listings" className={`rounded-full px-3 py-1 ${!status ? "bg-brand-600 text-white" : "bg-white ring-1 ring-line"}`}>All</Link>
        {Object.entries(LISTING_STATUS).map(([k, v]) => <Link key={k} href={`/seller/listings?status=${k}`} className={`rounded-full px-3 py-1 ${status === k ? "bg-brand-600 text-white" : "bg-white ring-1 ring-line"}`}>{v}</Link>)}
      </div>
      {listings.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Title</th><th>Category</th><th>Price</th><th>Qty</th><th>Views</th><th>Enquiries</th><th>Updated</th><th>Status</th></tr></thead>
            <tbody>{listings.map((l) => (
              <tr key={l.id}>
                <td><Link href={`/seller/listings/${l.id}`} className="link font-medium">{l.title}</Link></td>
                <td>{l.category.name}</td><td>{money(l.price)}</td><td>{l.quantity}</td><td>{l.views}</td><td>{l._count.enquiries}</td><td>{date(l.updatedAt)}</td>
                <td><Badge status={l.status} labels={LISTING_STATUS} />{l.statusReason && <div className="text-xs text-muted">{l.statusReason}</div>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>No products yet.</Empty>}
    </div>
  );
}
