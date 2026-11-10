import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/lib/db";
import { newListingSlug, productPath } from "@/lib/urls";

// Old product URLs (/listing/<id>) permanently redirect to the canonical /product/<slug>,
// keeping the query string (flash messages, utm parameters).
export default async function LegacyListingRedirect({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[]>> }) {
  const { id } = await params;
  const sp = await searchParams;
  let l = await db.listing.findUnique({ where: { id }, select: { id: true, slug: true, title: true } });
  if (!l) notFound();
  if (!l.slug) l = await db.listing.update({ where: { id }, data: { slug: newListingSlug(l.title) }, select: { id: true, slug: true, title: true } });
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]]))).toString();
  permanentRedirect(`${productPath(l)}${qs ? `?${qs}` : ""}`);
}
