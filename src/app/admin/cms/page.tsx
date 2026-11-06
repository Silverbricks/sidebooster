import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { Flash, PageHeader, Section } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { saveBannerAction, savePageAction } from "@/app/actions/admin";

export const metadata = { title: "CMS" };

export default async function AdminCms({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const [pages, banners, messages] = await Promise.all([db.page.findMany({ orderBy: { slug: "asc" } }), db.banner.findMany({ orderBy: { sortOrder: "asc" } }), db.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 20 })]);
  return (
    <div className="space-y-6">
      <PageHeader title="CMS / website pages" />
      <Flash sp={sp} />
      <Section title="Home page banners">
        <div className="space-y-3">
          {[...banners, null].map((b) => (
            <form key={b?.id ?? "new"} action={saveBannerAction} className="grid gap-2 rounded-lg border border-line p-3 text-sm sm:grid-cols-[1fr_1fr_1fr_70px_auto] sm:items-end">
              {b && <input type="hidden" name="id" value={b.id} />}
              <div><label className="label">Title</label><input name="title" defaultValue={b?.title} className="input" required placeholder={b ? undefined : "New banner"} /></div>
              <div><label className="label">Subtitle</label><input name="subtitle" defaultValue={b?.subtitle ?? ""} className="input" /></div>
              <div><label className="label">Link</label><input name="link" defaultValue={b?.link ?? ""} className="input" /></div>
              <div><label className="label">Order</label><input name="sortOrder" type="number" defaultValue={b?.sortOrder ?? 0} className="input" /></div>
              <div className="flex items-center gap-2"><label className="flex items-center gap-1"><input type="checkbox" name="active" defaultChecked={b?.active ?? true} />Active</label>{b && <label className="flex items-center gap-1 text-red-700"><input type="checkbox" name="delete" />Delete</label>}<SubmitButton className="btn-secondary btn-sm">Save</SubmitButton></div>
            </form>
          ))}
        </div>
      </Section>
      {pages.map((p) => (
        <Section key={p.slug} title={`/${p.slug}`} actions={<span className="text-xs text-muted">Updated {dateTime(p.updatedAt)}</span>}>
          <form action={savePageAction} className="space-y-2">
            <input type="hidden" name="slug" value={p.slug} />
            <input name="title" defaultValue={p.title} className="input" aria-label="Title" />
            <textarea name="content" defaultValue={p.content} rows={6} className="input font-mono text-xs" aria-label="Content" />
            <SubmitButton className="btn-secondary btn-sm">Save page</SubmitButton>
          </form>
        </Section>
      ))}
      <Section title="Contact form messages">
        <ul className="space-y-2 text-sm">{messages.map((m) => <li key={m.id} className="rounded-lg border border-line p-2"><b>{m.name}</b> &lt;{m.email}&gt; · {dateTime(m.createdAt)}<p className="whitespace-pre-line">{m.message}</p></li>)}</ul>
      </Section>
    </div>
  );
}
