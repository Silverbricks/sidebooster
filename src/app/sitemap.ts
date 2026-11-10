import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { productPath, storePath } from "@/lib/urls";

export const dynamic = "force-dynamic";

/** Only canonical, public, indexable URLs. lastModified comes from real content changes. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const [listings, categories, campaigns, stores, pages, results] = await Promise.all([
    db.listing.findMany({ where: { status: "ACTIVE" }, select: { id: true, slug: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 45000 }),
    db.category.findMany({ where: { active: true, OR: [{ listings: { some: { status: "ACTIVE" } } }, { subListings: { some: { status: "ACTIVE" } } }] }, select: { slug: true } }),
    db.campaign.findMany({ where: { status: { in: ["APPROVED", "SALES_CLOSED", "WINNER_ANNOUNCED", "COMPLETED"] } }, select: { slug: true, updatedAt: true } }),
    // stores with at least one live product (empty stores are noindex)
    db.sellerProfile.findMany({ where: { status: { in: ["APPROVED", "ACTIVE"] }, user: { listings: { some: { status: "ACTIVE" } } } }, select: { storeSlug: true, sellerCode: true, updatedAt: true } }),
    db.page.findMany({ select: { slug: true, updatedAt: true } }),
    db.drawResult.findMany({ where: { status: "PUBLISHED" }, select: { publishedAt: true, campaign: { select: { slug: true } } } }),
  ]);
  const statics = ["", "/marketplace", "/draws", "/results", "/pricing", "/register/seller"];
  return [
    ...statics.map((p) => ({ url: `${base}${p}` })),
    ...pages.map((p) => ({ url: `${base}/${p.slug}`, lastModified: p.updatedAt })),
    ...categories.map((c) => ({ url: `${base}/marketplace/${c.slug}` })),
    ...listings.map((l) => ({ url: `${base}${productPath(l)}`, lastModified: l.updatedAt })),
    ...stores.map((s) => ({ url: `${base}${storePath(s)}`, lastModified: s.updatedAt })),
    ...campaigns.map((c) => ({ url: `${base}/draws/${c.slug}`, lastModified: c.updatedAt })),
    ...results.map((r) => ({ url: `${base}/results/${r.campaign.slug}`, lastModified: r.publishedAt ?? undefined })),
  ];
}
