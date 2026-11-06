import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { money, date } from "@/lib/format";
import { liveOffersFor, describeOffer } from "@/lib/offers";
import { enquiryAction, toggleWishlistAction } from "@/app/actions/marketplace";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Flash } from "@/components/ui";
import { Gallery } from "@/components/Gallery";
import { LISTING_STATUS } from "@/lib/constants";

type P = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> };

async function load(id: string) {
  return db.listing.findUnique({
    where: { id },
    include: {
      images: { orderBy: { sortOrder: "asc" } },
      category: true,
      subcategory: true,
      attributes: { include: { attribute: true }, orderBy: { attribute: { sortOrder: "asc" } } },
      seller: { select: { id: true, firstName: true, createdAt: true, sellerProfile: { select: { sellerCode: true, businessName: true, sellerType: true, status: true } } } },
      campaigns: { where: { status: { in: ["APPROVED", "SALES_CLOSED"] } }, select: { slug: true, title: true } },
    },
  });
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const l = await load((await params).id);
  if (!l || l.status !== "ACTIVE") return { title: "Listing" };
  return {
    title: l.seoTitle ?? l.title,
    description: l.seoDescription ?? l.description.slice(0, 155),
    openGraph: { images: l.images[0] ? [l.images[0].url] : [] },
  };
}

export default async function ListingPage({ params, searchParams }: P) {
  const { id } = await params;
  const sp = await searchParams;
  const [l, user] = await Promise.all([load(id), getCurrentUser()]);
  if (!l) notFound();
  const isOwner = user?.id === l.sellerId;
  const isAdmin = user?.role === "ADMIN";
  if (!["ACTIVE", "SOLD"].includes(l.status) && !isOwner && !isAdmin) notFound();
  if (l.status === "ACTIVE" && !isOwner) await db.listing.update({ where: { id }, data: { views: { increment: 1 } } });

  const offers = l.status === "ACTIVE" ? await liveOffersFor(l) : [];
  const wished = user ? !!(await db.wishlistItem.findUnique({ where: { userId_listingId: { userId: user.id, listingId: id } } })) : false;
  const canBuy = l.status === "ACTIVE" && l.allowCheckout && !l.category.highValue && l.quantity > 0 && l.seller.sellerProfile?.status === "ACTIVE";
  const sellerName = l.seller.sellerProfile?.businessName ?? l.seller.firstName;
  const attrs = l.attributes.filter((a) => !a.attribute.isPrivate || isOwner || isAdmin);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: l.title,
    description: l.description,
    image: l.images.map((i) => i.url),
    brand: l.brand ?? undefined,
    offers: { "@type": "Offer", priceCurrency: "AUD", price: (l.price / 100).toFixed(2), availability: l.status === "ACTIVE" ? "https://schema.org/InStock" : "https://schema.org/SoldOut", itemCondition: l.condition === "NEW" ? "https://schema.org/NewCondition" : "https://schema.org/UsedCondition" },
  };

  return (
    <div className="container-page py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav className="mb-3 text-sm text-muted" aria-label="Breadcrumb">
        <Link href="/marketplace" className="hover:text-ink">Marketplace</Link> / <Link href={`/marketplace/${l.category.slug}`} className="hover:text-ink">{l.category.name}</Link>
        {l.subcategory && <> / <Link href={`/marketplace/${l.subcategory.slug}`} className="hover:text-ink">{l.subcategory.name}</Link></>}
      </nav>
      <Flash sp={sp} />
      {(isOwner || isAdmin) && l.status !== "ACTIVE" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">This listing is <Badge status={l.status} labels={LISTING_STATUS} /> and not visible to the public. {l.statusReason && <>Reason: {l.statusReason}</>}</div>
      )}
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Gallery images={l.images.map((i) => i.url)} icon={l.category.icon} alt={l.title} />
          {l.videoUrl && <video src={l.videoUrl} controls className="w-full rounded-xl bg-black" />}
          <section className="card card-pad">
            <h2 className="h2 mb-3">Description</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed">{l.description}</p>
          </section>
          {attrs.length > 0 && (
            <section className="card card-pad">
              <h2 className="h2 mb-3">Specifications</h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <div><dt className="text-muted">Condition</dt><dd className="font-medium">{l.condition.charAt(0) + l.condition.slice(1).toLowerCase()}</dd></div>
                {attrs.map((a) => (
                  <div key={a.id}><dt className="text-muted">{a.attribute.label}{a.attribute.isPrivate && " 🔒"}</dt><dd className="font-medium">{a.attribute.type === "boolean" ? (a.value === "true" ? "Yes" : "No") : a.value}{a.attribute.unit ? ` ${a.attribute.unit}` : ""}</dd></div>
                ))}
              </dl>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card card-pad space-y-3">
            <h1 className="text-xl font-bold">{l.title}</h1>
            <div className="text-3xl font-extrabold">{money(l.price)}</div>
            <div className="text-sm text-muted">📍 {l.location}{l.state ? `, ${l.state}` : ""} {l.postcode} · Listed {date(l.publishedAt ?? l.createdAt)}</div>
            {l.status === "SOLD" && <Badge status="SOLD">Sold</Badge>}
            {offers.length > 0 && (
              <ul className="space-y-1">{offers.map((o) => <li key={o.id} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">🏷️ <b>{o.name}</b> — {describeOffer(o)}</li>)}</ul>
            )}
            {canBuy && !isOwner && (
              <Link href={`/checkout/${l.id}`} className="btn-primary w-full">Buy now{l.deliveryFee ? ` · + ${money(l.deliveryFee)} delivery` : ""}</Link>
            )}
            {l.category.highValue && <p className="rounded-lg bg-slate-50 p-3 text-xs text-muted">High-value item: contact the seller to arrange inspection and purchase. The final sale is confirmed through the platform.</p>}
            {user && !isOwner && (
              <form action={toggleWishlistAction}><input type="hidden" name="listingId" value={l.id} /><SubmitButton className="btn-secondary w-full">{wished ? "♥ Saved to wishlist" : "♡ Save to wishlist"}</SubmitButton></form>
            )}
            {isOwner && <Link href={`/seller/listings/${l.id}`} className="btn-secondary w-full">Manage listing</Link>}
            {l.campaigns.map((c) => <Link key={c.slug} href={`/draws/${c.slug}`} className="block rounded-lg bg-brand-50 p-3 text-sm text-brand-700">🎟️ Promotion: {c.title} →</Link>)}
          </div>

          <div className="card card-pad text-sm">
            <div className="font-semibold">{sellerName}</div>
            <div className="text-muted">Seller ID <span className="font-mono">{l.seller.sellerProfile?.sellerCode}</span></div>
            <div className="mt-1 flex items-center gap-2 text-emerald-700">✅ Verified {l.seller.sellerProfile?.sellerType === "BUSINESS" ? "business" : "seller"}</div>
            <div className="text-muted">Member since {date(l.seller.createdAt)}</div>
            {l.contactPhone && user && <div className="mt-2">📞 {l.contactPhone}</div>}
          </div>

          {l.allowEnquiry && l.status === "ACTIVE" && !isOwner && (
            <div className="card card-pad">
              <h2 className="h2 mb-3">Contact the seller</h2>
              {user ? (
                <form action={enquiryAction} className="space-y-3">
                  <input type="hidden" name="listingId" value={l.id} />
                  <textarea name="message" rows={4} className="input" required minLength={5} maxLength={2000} defaultValue={`Hi, is "${l.title}" still available?`} aria-label="Message" />
                  <SubmitButton className="btn-primary w-full">Send enquiry</SubmitButton>
                </form>
              ) : <Link href={`/login?next=/listing/${l.id}`} className="btn-secondary w-full">Log in to contact seller</Link>}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
