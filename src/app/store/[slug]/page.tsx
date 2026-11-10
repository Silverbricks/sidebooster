import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { date } from "@/lib/format";
import { brand } from "@/config/brand";
import { ListingCard } from "@/components/Cards";
import { ShareBar } from "@/components/ShareBar";
import { JsonLd } from "@/components/JsonLd";
import { Empty } from "@/components/ui";
import { visibleSocialLinks } from "@/lib/social";
import { absoluteUrl, storePath } from "@/lib/urls";
import { recordReferral, referralFromParams } from "@/lib/referrals";
import { AU_STATES } from "@/lib/constants";

type P = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> };

/** Only approved sellers have a public store, and only public, seller-approved information is loaded. */
async function load(slug: string) {
  const s = slug.toLowerCase();
  return db.sellerProfile.findFirst({
    where: { OR: [{ storeSlug: s }, { sellerCode: s.toUpperCase() }], status: { in: ["APPROVED", "ACTIVE"] } },
    select: {
      userId: true, sellerCode: true, storeSlug: true, sellerType: true, businessName: true, bio: true, publicLocation: true, state: true, socialLinks: true, approvedAt: true, createdAt: true,
      user: { select: { firstName: true, createdAt: true } },
    },
  });
}

const storeName = (s: NonNullable<Awaited<ReturnType<typeof load>>>) => s.businessName ?? `${s.user.firstName}'s store`;
const area = (s: NonNullable<Awaited<ReturnType<typeof load>>>) => s.publicLocation ?? AU_STATES.find((x) => x.code === s.state)?.name ?? null;

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const s = await load((await params).slug);
  if (!s) return { title: "Store", robots: { index: false, follow: false } };
  const url = absoluteUrl(storePath(s));
  const name = storeName(s);
  const count = await db.listing.count({ where: { sellerId: s.userId, status: "ACTIVE" } });
  const description = (s.bio?.replace(/\s+/g, " ") ?? `Shop products from ${name}${area(s) ? ` in ${area(s)}` : ""}, a verified seller on ${brand.name}.`).slice(0, 160);
  return {
    title: { absolute: `${name} – Verified Seller Store | ${brand.name}` },
    description,
    alternates: { canonical: url },
    robots: count === 0 ? { index: false, follow: true } : undefined, // empty stores are thin content
    openGraph: { type: "profile", title: `${name} on ${brand.name}`, description, url, siteName: brand.name, locale: "en_AU" },
    twitter: { card: "summary", title: `${name} on ${brand.name}`, description },
  };
}

export default async function StorePage({ params, searchParams }: P) {
  const { slug } = await params;
  const sp = await searchParams;
  const s = await load(slug);
  if (!s) notFound();
  const listings = await db.listing.findMany({ where: { sellerId: s.userId, status: "ACTIVE" }, include: { images: { orderBy: { sortOrder: "asc" } }, category: true }, orderBy: [{ featured: "desc" }, { publishedAt: "desc" }], take: 60 });
  const ref = referralFromParams(sp);
  if (ref) await recordReferral("VISIT", ref, { sellerId: s.userId, path: storePath(s) });
  const name = storeName(s);
  const url = absoluteUrl(storePath(s));
  const socials = visibleSocialLinks(s.socialLinks);
  const where = area(s);

  return (
    <div className="container-page space-y-6 py-8">
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "Organization",
        name,
        url,
        ...(s.bio ? { description: s.bio.slice(0, 500) } : {}),
        ...(where ? { areaServed: where } : {}),
        ...(socials.length ? { sameAs: socials.map((x) => x.url) } : {}),
      }} />
      <nav className="text-sm text-muted" aria-label="Breadcrumb"><Link href="/marketplace" className="hover:text-ink">Marketplace</Link> / Stores / {name}</nav>
      <header className="card card-pad grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-2">
          <h1 className="h1">{name}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="font-medium text-emerald-700">✅ Verified {s.sellerType === "BUSINESS" ? "business" : "seller"}</span>
            <span>Seller ID <span className="font-mono">{s.sellerCode}</span></span>
            {where && <span>📍 {where}</span>}
            <span>Member since {date(s.user.createdAt)}</span>
            <span>{listings.length} product{listings.length === 1 ? "" : "s"}</span>
          </div>
          {s.bio && <p className="max-w-2xl whitespace-pre-line pt-2 text-sm leading-relaxed">{s.bio}</p>}
          {socials.length > 0 && (
            <ul className="flex flex-wrap gap-2 pt-2">
              {socials.map((x) => <li key={x.platform}><a href={x.url} target="_blank" rel="noopener nofollow ugc" className="btn-secondary btn-sm">{x.label} ↗</a></li>)}
            </ul>
          )}
        </div>
        <ShareBar url={url} title={`${name} on ${brand.name}`} kind="store" id={s.storeSlug ?? s.sellerCode.toLowerCase()} />
      </header>
      <section>
        <h2 className="h2 mb-3">Products</h2>
        {listings.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{listings.map((l) => <ListingCard key={l.id} l={l} />)}</div>
        ) : <Empty>This store has no live products right now.</Empty>}
      </section>
    </div>
  );
}
