import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { Badge, Empty, PageHeader, PublicStatusBadge } from "@/components/ui";
import { publicStatus } from "@/lib/campaigns";

export const metadata = { title: "My tickets" };

export default async function TicketsPage() {
  const user = await requireUser();
  const tickets = await db.ticket.findMany({ where: { buyerId: user.id }, include: { campaign: { include: { result: true } }, purchase: true }, orderBy: [{ createdAt: "desc" }, { number: "asc" }] });
  const groups = new Map<string, typeof tickets>();
  for (const t of tickets) groups.set(t.campaignId, [...(groups.get(t.campaignId) ?? []), t]);

  return (
    <div>
      <PageHeader title="My tickets" />
      {groups.size === 0 && <Empty>You have no tickets yet. <Link href="/draws" className="link">Browse promotions</Link>.</Empty>}
      <div className="space-y-4">
        {[...groups.values()].map((ts) => {
          const c = ts[0].campaign;
          const winNo = c.result?.status === "PUBLISHED" ? c.result.winningNumber : null;
          return (
            <div key={c.id} className="card card-pad">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/draws/${c.slug}`} className="font-semibold hover:text-brand-600">{c.title}</Link>
                <PublicStatusBadge status={publicStatus(c)} />
              </div>
              <div className="text-sm text-muted">Draw {dateTime(c.drawAt, c.timezone)}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {ts.map((t) => (
                  <Link key={t.id} href={`/account/tickets/${t.id}`} className={`rounded-lg px-3 py-1 font-mono font-bold ${t.status === "VOID" ? "bg-slate-100 text-slate-400 line-through" : t.ticketNumber === winNo ? "bg-emerald-500 text-white" : "bg-brand-50 text-brand-700"}`}>
                    {t.ticketNumber}{t.ticketNumber === winNo && " 🏆"}
                  </Link>
                ))}
              </div>
              {winNo && <div className="mt-2 text-sm">Winning ticket: <b className="font-mono">{winNo}</b> {ts.some((t) => t.ticketNumber === winNo) && <Badge status="ACTIVE">You won!</Badge>}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
