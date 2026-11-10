import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { MarketplaceView } from "@/components/MarketplaceView";
import { brand } from "@/config/brand";

type P = { params: Promise<{ category: string }>; searchParams: Promise<Record<string, string>> };

export async function generateMetadata({ params, searchParams }: P): Promise<Metadata> {
  const c = await db.category.findUnique({ where: { slug: (await params).category } });
  if (!c) return {};
  const sp = await searchParams;
  const filtered = Object.keys(sp).some((k) => k !== "page");
  return {
    title: `${c.name} for sale in Australia`,
    description: `Buy and sell ${c.name.toLowerCase()} from verified Australian sellers on ${brand.name}. Browse new and used listings, deals and offers.`,
    alternates: { canonical: `/marketplace/${c.slug}` },
    robots: filtered ? { index: false, follow: true } : undefined, // filter/sort combinations are duplicates of the canonical page
  };
}

export default async function CategoryPage({ params, searchParams }: P) {
  const { category } = await params;
  if (!(await db.category.findUnique({ where: { slug: category } }))) notFound();
  return <MarketplaceView categorySlug={category} sp={await searchParams} />;
}
