import Link from "next/link";
import { db } from "@/lib/db";
import { Flash, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { deleteAttributeAction, saveAttributeAction, saveCategoryAction } from "@/app/actions/admin";

export const metadata = { title: "Categories & fields" };

export default async function AdminCategories({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const roots = await db.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: "asc" }, include: { children: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { attributes: true, subListings: true } } } }, _count: { select: { attributes: true, listings: true } } } });
  const editing = sp.edit ? await db.category.findUnique({ where: { id: sp.edit }, include: { attributes: { orderBy: { sortOrder: "asc" } } } }) : null;
  const CatForm = ({ c }: { c?: { id: string; name: string; slug: string; icon: string | null; parentId: string | null; sortOrder: number; active: boolean; highValue: boolean; listingFee: number | null } }) => (
    <form action={saveCategoryAction} className="grid gap-2 sm:grid-cols-[1fr_1fr_70px_1fr_70px_100px_auto] sm:items-end">
      {c && <input type="hidden" name="id" value={c.id} />}
      <div><label className="label">Name</label><input name="name" defaultValue={c?.name} className="input" required /></div>
      <div><label className="label">Slug</label><input name="slug" defaultValue={c?.slug} className="input" /></div>
      <div><label className="label">Icon</label><input name="icon" defaultValue={c?.icon ?? ""} className="input" /></div>
      <div><label className="label">Parent</label><select name="parentId" defaultValue={c?.parentId ?? ""} className="input"><option value="">— top level —</option>{roots.filter((r) => r.id !== c?.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
      <div><label className="label">Order</label><input name="sortOrder" type="number" defaultValue={c?.sortOrder ?? 0} className="input" /></div>
      <div><label className="label" title="Pay Per Item listing fee for this category. Blank = platform default (Settings).">Listing fee $</label><input name="listingFee" defaultValue={c?.listingFee != null ? (c.listingFee / 100).toFixed(2) : ""} className="input" placeholder="default" inputMode="decimal" /></div>
      <div className="flex items-center gap-3 text-xs">
        <label className="flex items-center gap-1"><input type="checkbox" name="active" defaultChecked={c?.active ?? true} />Active</label>
        <label className="flex items-center gap-1" title="Enquiry + reported sale only"><input type="checkbox" name="highValue" defaultChecked={c?.highValue} />High value</label>
        <SubmitButton className="btn-primary btn-sm">{c ? "Save" : "Add"}</SubmitButton>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Categories & listing fields" subtitle="Add categories and their specification fields — the seller listing form updates automatically." />
      <Flash sp={sp} />
      <Section title="Add category"><CatForm /></Section>
      <Section title="Categories">
        <ul className="divide-y divide-line text-sm">
          {roots.map((r) => (
            <li key={r.id} className="py-2">
              <div className="flex items-center justify-between"><span><b>{r.icon} {r.name}</b> <span className="text-muted">/{r.slug} · {r._count.listings} listings · {r._count.attributes} fields {r.highValue && "· high value"} {!r.active && "· inactive"}</span></span><Link href={`/admin/categories?edit=${r.id}`} className="link">Edit fields</Link></div>
              {r.children.length > 0 && <ul className="ml-6 mt-1 space-y-1">{r.children.map((c) => <li key={c.id} className="flex justify-between"><span>↳ {c.name} <span className="text-muted">· {c._count.subListings} listings · {c._count.attributes} fields</span></span><Link href={`/admin/categories?edit=${c.id}`} className="link">Edit fields</Link></li>)}</ul>}
            </li>
          ))}
        </ul>
      </Section>
      {editing && (
        <Section title={`Edit: ${editing.name}`}>
          <CatForm c={editing} />
          <h3 className="mb-2 mt-6 font-semibold">Specification fields</h3>
          <div className="space-y-2">
            {[...editing.attributes, null].map((a, i) => (
              <form key={a?.id ?? "new"} action={saveAttributeAction} className="grid gap-2 rounded-lg border border-line p-3 text-sm sm:grid-cols-[1fr_1fr_110px_1fr_70px_60px] sm:items-end">
                <input type="hidden" name="categoryId" value={editing.id} />
                {a && <input type="hidden" name="id" value={a.id} />}
                <div><label className="label">Label</label><input name="label" defaultValue={a?.label} className="input" required placeholder={a ? undefined : "New field"} /></div>
                <div><label className="label">Key</label><input name="key" defaultValue={a?.key} className="input" /></div>
                <div><label className="label">Type</label><select name="type" defaultValue={a?.type ?? "text"} className="input">{["text", "number", "select", "boolean", "date"].map((t) => <option key={t}>{t}</option>)}</select></div>
                <div><label className="label">Options (comma separated)</label><input name="options" defaultValue={a?.options ?? ""} className="input" /></div>
                <div><label className="label">Unit</label><input name="unit" defaultValue={a?.unit ?? ""} className="input" /></div>
                <div><label className="label">Order</label><input name="sortOrder" type="number" defaultValue={a?.sortOrder ?? i} className="input" /></div>
                <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
                  <label className="flex items-center gap-1"><input type="checkbox" name="required" defaultChecked={a?.required} />Required</label>
                  <label className="flex items-center gap-1"><input type="checkbox" name="filterable" defaultChecked={a?.filterable} />Search filter</label>
                  <label className="flex items-center gap-1"><input type="checkbox" name="isPrivate" defaultChecked={a?.isPrivate} />Private (seller & admin only)</label>
                  <SubmitButton className="btn-secondary btn-sm">{a ? "Save field" : "Add field"}</SubmitButton>
                </div>
              </form>
            ))}
            {editing.attributes.map((a) => (
              <form key={`del-${a.id}`} action={deleteAttributeAction} className="inline-block mr-2"><input type="hidden" name="id" value={a.id} /><SubmitButton className="btn-sm btn text-red-700" confirm={`Delete field "${a.label}"? Existing values will be removed.`}>Delete “{a.label}”</SubmitButton></form>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
