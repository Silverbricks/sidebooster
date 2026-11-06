import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ListingCard } from "./Cards";
import { Empty, Pager } from "./ui";
import { AU_STATES } from "@/lib/constants";
import { toCents } from "@/lib/format";

const PER_PAGE = 24;

export async function MarketplaceView({ categorySlug, sp }: { categorySlug?: string; sp: Record<string, string | undefined> }) {
  const category = categorySlug
    ? await db.category.findUnique({ where: { slug: categorySlug }, include: { children: { orderBy: { sortOrder: "asc" } }, parent: true, attributes: { where: { filterable: true, isPrivate: false } } } })
    : null;
  const roots = await db.category.findMany({ where: { parentId: null, active: true }, orderBy: { sortOrder: "asc" } });

  const where: Prisma.ListingWhereInput = { status: { in: sp.sold === "1" ? ["ACTIVE", "SOLD"] : ["ACTIVE"] } };
  const and: Prisma.ListingWhereInput[] = [];
  if (category) and.push(category.parentId ? { subcategoryId: category.id } : { categoryId: category.id });
  if (sp.q) {
    const q = sp.q.slice(0, 80);
    and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { brand: { contains: q, mode: "insensitive" } }, { model: { contains: q, mode: "insensitive" } }, { keywords: { contains: q, mode: "insensitive" } }] });
  }
  if (sp.condition) and.push({ condition: sp.condition });
  if (sp.state) and.push({ state: sp.state });
  if (sp.location) and.push({ OR: [{ location: { contains: sp.location, mode: "insensitive" } }, { postcode: sp.location }] });
  const min = sp.min ? toCents(sp.min) : NaN;
  const max = sp.max ? toCents(sp.max) : NaN;
  if (!isNaN(min)) and.push({ price: { gte: min } });
  if (!isNaN(max)) and.push({ price: { lte: max } });
  if (sp.buynow === "1") and.push({ allowCheckout: true });
  for (const a of category?.attributes ?? []) {
    const v = sp[`a_${a.key}`];
    if (v) and.push({ attributes: { some: { attributeId: a.id, value: a.type === "text" ? { contains: v, mode: "insensitive" } : v } } });
  }
  if (and.length) where.AND = and;

  const orderBy: Prisma.ListingOrderByWithRelationInput[] =
    sp.sort === "price_asc" ? [{ price: "asc" }] : sp.sort === "price_desc" ? [{ price: "desc" }] : [{ featured: "desc" }, { publishedAt: "desc" }];
  const page = Math.max(1, Number(sp.page) || 1);
  const [total, listings] = await Promise.all([
    db.listing.count({ where }),
    db.listing.findMany({ where, orderBy, include: { images: { orderBy: { sortOrder: "asc" } }, category: true }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
  ]);

  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]).toString();
  const base = `/marketplace${categorySlug ? `/${categorySlug}` : ""}${qs ? `?${qs}` : ""}`;
  const title = category ? category.name : sp.q ? `Results for “${sp.q}”` : "Marketplace";

  return (
    <div className="container-page py-8">
      <nav className="mb-2 text-sm text-muted" aria-label="Breadcrumb">
        <Link href="/marketplace" className="hover:text-ink">Marketplace</Link>
        {category?.parent && <> / <Link href={`/marketplace/${category.parent.slug}`} className="hover:text-ink">{category.parent.name}</Link></>}
        {category && <> / <span className="text-ink">{category.name}</span></>}
      </nav>
      <h1 className="h1">{title}</h1>
      <p className="mt-1 text-sm text-muted">{total.toLocaleString()} listing{total === 1 ? "" : "s"}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside>
          <form className="card card-pad space-y-4" action={`/marketplace${categorySlug ? `/${categorySlug}` : ""}`}>
            <div><label className="label" htmlFor="q">Keyword</label><input id="q" name="q" defaultValue={sp.q} className="input" /></div>
            {!category && (
              <div><label className="label">Category</label>
                <ul className="space-y-1 text-sm">{roots.map((c) => <li key={c.id}><Link className="link" href={`/marketplace/${c.slug}`}>{c.icon} {c.name}</Link></li>)}</ul>
              </div>
            )}
            {category && category.children.length > 0 && (
              <div><label className="label">Subcategory</label>
                <ul className="space-y-1 text-sm">{category.children.map((c) => <li key={c.id}><Link className="link" href={`/marketplace/${c.slug}`}>{c.name}</Link></li>)}</ul>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label" htmlFor="min">Min $</label><input id="min" name="min" defaultValue={sp.min} className="input" inputMode="numeric" /></div>
              <div><label className="label" htmlFor="max">Max $</label><input id="max" name="max" defaultValue={sp.max} className="input" inputMode="numeric" /></div>
            </div>
            <div><label className="label" htmlFor="condition">Condition</label>
              <select id="condition" name="condition" defaultValue={sp.condition ?? ""} className="input"><option value="">Any</option><option value="NEW">New</option><option value="USED">Used</option><option value="REFURBISHED">Refurbished</option></select>
            </div>
            <div><label className="label" htmlFor="state">State</label>
              <select id="state" name="state" defaultValue={sp.state ?? ""} className="input"><option value="">All of Australia</option>{AU_STATES.map((s) => <option key={s.code} value={s.code}>{s.code}</option>)}</select>
            </div>
            <div><label className="label" htmlFor="location">Suburb / postcode</label><input id="location" name="location" defaultValue={sp.location} className="input" /></div>
            {category?.attributes.map((a) => (
              <div key={a.id}><label className="label" htmlFor={`a_${a.key}`}>{a.label}</label>
                {a.type === "select" ? (
                  <select id={`a_${a.key}`} name={`a_${a.key}`} defaultValue={sp[`a_${a.key}`] ?? ""} className="input"><option value="">Any</option>{a.options?.split(",").map((o) => <option key={o}>{o}</option>)}</select>
                ) : <input id={`a_${a.key}`} name={`a_${a.key}`} defaultValue={sp[`a_${a.key}`]} className="input" />}
              </div>
            ))}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="buynow" value="1" defaultChecked={sp.buynow === "1"} /> Buy-now only</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="sold" value="1" defaultChecked={sp.sold === "1"} /> Include sold</label>
            <div><label className="label" htmlFor="sort">Sort</label>
              <select id="sort" name="sort" defaultValue={sp.sort ?? ""} className="input"><option value="">Featured & newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select>
            </div>
            <button className="btn-primary w-full">Apply filters</button>
          </form>
        </aside>
        <div>
          {listings.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{listings.map((l) => <ListingCard key={l.id} l={l} />)}</div>
          ) : <Empty>No listings match your search.</Empty>}
          <Pager page={page} pages={Math.ceil(total / PER_PAGE)} base={base} />
        </div>
      </div>
    </div>
  );
}
