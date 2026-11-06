import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ListingCard } from "@/components/Cards";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Wishlist" };

export default async function WishlistPage() {
  const user = await requireUser();
  const items = await db.wishlistItem.findMany({ where: { userId: user.id }, include: { listing: { include: { images: { orderBy: { sortOrder: "asc" } }, category: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader title="Wishlist" />
      {items.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{items.map((i) => <ListingCard key={i.listingId} l={i.listing} />)}</div> : <Empty>Save listings to find them here.</Empty>}
    </div>
  );
}
