import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Email / SMS outbox" };

export default async function AdminMessages({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const msgs = await db.messageLog.findMany({ where: sp.to ? { to: { contains: sp.to, mode: "insensitive" } } : {}, orderBy: { createdAt: "desc" }, take: 200 });
  return (
    <div>
      <PageHeader title="Email / SMS outbox" subtitle="Every outbound message is logged here. In development nothing is actually sent — connect an email/SMS provider in src/lib/notify.ts for production." />
      <form className="card card-pad mb-4 flex gap-3"><input name="to" defaultValue={sp.to} className="input max-w-xs" placeholder="Recipient contains…" aria-label="Recipient" /><button className="btn-secondary">Filter</button></form>
      {msgs.length ? (
        <ul className="space-y-2">
          {msgs.map((m) => (
            <li key={m.id} className="card card-pad text-sm">
              <div className="flex flex-wrap justify-between gap-2"><span><span className="rounded bg-slate-100 px-1.5 text-xs">{m.channel}</span> <b>{m.subject}</b> → {m.to}</span><span className="text-xs text-muted">{dateTime(m.createdAt)}</span></div>
              <pre className="mt-2 whitespace-pre-wrap break-all font-sans text-slate-600">{m.body}</pre>
            </li>
          ))}
        </ul>
      ) : <Empty>No messages.</Empty>}
    </div>
  );
}
