import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { MarketplaceView } from "@/components/MarketplaceView";

type P = { params: Promise<{ category: string }>; searchParams: Promise<Record<string, string>> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const c = await db.category.findUnique({ where: { slug: (await params).category } });
  return c ? { title: `${c.name} for sale`, description: `Buy and sell ${c.name.toLowerCase()} from verified Australian sellers.` } : {};
}

export default async function CategoryPage({ params, searchParams }: P) {
  const { category } = await params;
  if (!(await db.category.findUnique({ where: { slug: category } }))) notFound();
  return <MarketplaceView categorySlug={category} sp={await searchParams} />;
}
