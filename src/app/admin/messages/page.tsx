import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { Empty, PageHeader } from "@/components/ui";
import { deliveryStatus } from "@/lib/notify";

export const metadata = { title: "Email / SMS outbox" };

export default async function AdminMessages({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const msgs = await db.messageLog.findMany({ where: sp.to ? { to: { contains: sp.to, mode: "insensitive" } } : {}, orderBy: { createdAt: "desc" }, take: 200 });
  const live = deliveryStatus();
  return (
    <div>
      <PageHeader title="Email / SMS outbox" subtitle="Every outbound message is logged here. Once a provider is connected, one-time codes and secret links are hidden in this log." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {([["Email", live.email, "RESEND_API_KEY and EMAIL_FROM"], ["SMS", live.sms, "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM"]] as const).map(([label, provider, vars]) => (
          <div key={label} className={`rounded-lg border px-4 py-3 text-sm ${provider ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            <b>{label}: {provider ? `sending via ${provider}` : "not connected (outbox only)"}</b>
            {!provider && <div className="mt-0.5 text-xs">Nothing reaches users. Set {vars} in .env.production on the server, then restart.</div>}
          </div>
        ))}
      </div>
      <form className="card card-pad mb-4 flex gap-3"><input name="to" defaultValue={sp.to} className="input max-w-xs" placeholder="Recipient contains…" aria-label="Recipient" /><button className="btn-secondary">Filter</button></form>
      {msgs.length ? (
        <ul className="space-y-2">
          {msgs.map((m) => (
            <li key={m.id} className="card card-pad text-sm">
              <div className="flex flex-wrap justify-between gap-2"><span><span className="rounded bg-slate-100 px-1.5 text-xs">{m.channel}</span> <b>{m.subject}</b> → {m.to}</span><span className="text-xs text-muted">{m.status.toLowerCase()} · {dateTime(m.createdAt)}</span></div>
              <pre className="mt-2 whitespace-pre-wrap break-all font-sans text-slate-600">{m.body}</pre>
            </li>
          ))}
        </ul>
      ) : <Empty>No messages.</Empty>}
    </div>
  );
}
