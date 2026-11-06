import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const [listings, categories, campaigns] = await Promise.all([
    db.listing.findMany({ where: { status: "ACTIVE" }, select: { id: true, updatedAt: true }, take: 45000 }),
    db.category.findMany({ where: { active: true }, select: { slug: true } }),
    db.campaign.findMany({ where: { status: { in: ["APPROVED", "SALES_CLOSED", "WINNER_ANNOUNCED", "COMPLETED"] } }, select: { slug: true, updatedAt: true } }),
  ]);
  const statics = ["", "/marketplace", "/draws", "/results", "/about", "/contact", "/terms", "/privacy", "/refund-policy", "/responsible-participation", "/register", "/register/seller"];
  return [
    ...statics.map((p) => ({ url: `${base}${p}` })),
    ...categories.map((c) => ({ url: `${base}/marketplace/${c.slug}` })),
    ...listings.map((l) => ({ url: `${base}/listing/${l.id}`, lastModified: l.updatedAt })),
    ...campaigns.map((c) => ({ url: `${base}/draws/${c.slug}`, lastModified: c.updatedAt })),
  ];
}
