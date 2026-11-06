import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { contactAction } from "@/app/actions/marketplace";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash } from "@/components/ui";

const CMS = ["about", "contact", "terms", "privacy", "refund-policy", "responsible-participation"];

export async function generateMetadata({ params }: { params: Promise<{ page: string }> }) {
  const p = await db.page.findUnique({ where: { slug: (await params).page } });
  return p ? { title: p.title } : {};
}

export default async function CmsPage({ params, searchParams }: { params: Promise<{ page: string }>; searchParams: Promise<Record<string, string>> }) {
  const { page } = await params;
  if (!CMS.includes(page)) notFound();
  const p = await db.page.findUnique({ where: { slug: page } });
  if (!p) notFound();
  const sp = await searchParams;
  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="h1">{p.title}</h1>
      <div className="card card-pad mt-6 whitespace-pre-line text-sm leading-relaxed">{p.content}</div>
      {page === "contact" && (
        <form action={contactAction} className="card card-pad mt-6 space-y-4">
          <Flash sp={sp} />
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" className="input" required /></div>
            <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" required /></div>
          </div>
          <div><label className="label" htmlFor="message">Message</label><textarea id="message" name="message" rows={5} className="input" required minLength={10} /></div>
          <SubmitButton>Send message</SubmitButton>
        </form>
      )}
    </div>
  );
}
