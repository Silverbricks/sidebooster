import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateTime, money } from "@/lib/format";
import { Empty, PageHeader, PublicStatusBadge, Section } from "@/components/ui";
import { publicStatus } from "@/lib/campaigns";

export const metadata = { title: "Draws & winnings" };

export default async function MyDrawsPage() {
  const user = await requireUser();
  const campaigns = await db.campaign.findMany({
    where: { tickets: { some: { buyerId: user.id } } },
    include: { result: true, _count: { select: { tickets: { where: { buyerId: user.id, status: "VALID" } } } } },
    orderBy: { drawAt: "asc" },
  });
  const upcoming = campaigns.filter((c) => ["APPROVED", "SALES_CLOSED", "DRAW_COMPLETED"].includes(c.status));
  const previous = campaigns.filter((c) => !upcoming.includes(c));
  const wins = await db.drawResult.findMany({ where: { winnerUserId: user.id, status: "PUBLISHED" }, include: { campaign: true } });

  const Row = ({ c }: { c: (typeof campaigns)[number] }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div><Link className="link font-medium" href={`/draws/${c.slug}`}>{c.title}</Link><div className="text-xs text-muted">Draw {dateTime(c.drawAt, c.timezone)} · {c._count.tickets} ticket(s)</div></div>
      <div className="flex items-center gap-2"><PublicStatusBadge status={publicStatus(c)} />{c.result?.status === "PUBLISHED" && <Link href={`/results/${c.slug}`} className="link text-xs">Result</Link>}</div>
    </li>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Draws & winnings" />
      <Section title="🏆 Winning tickets">
        {wins.length ? (
          <ul className="space-y-2">{wins.map((w) => <li key={w.id} className="rounded-lg bg-emerald-50 p-3 text-sm"><b className="font-mono">#{w.winningNumber}</b> — {w.campaign.prizeName} ({money(w.campaign.prizeValue)}) · {w.campaign.prizeDeliveredAt ? "Delivered" : w.campaign.prizeDelivery}</li>)}</ul>
        ) : <p className="text-sm text-muted">No wins yet — good luck!</p>}
      </Section>
      <Section title="Upcoming draws">{upcoming.length ? <ul className="divide-y divide-line">{upcoming.map((c) => <Row key={c.id} c={c} />)}</ul> : <Empty>No upcoming draws.</Empty>}</Section>
      <Section title="Previous draws">{previous.length ? <ul className="divide-y divide-line">{previous.map((c) => <Row key={c.id} c={c} />)}</ul> : <p className="text-sm text-muted">None yet.</p>}</Section>
    </div>
  );
}
