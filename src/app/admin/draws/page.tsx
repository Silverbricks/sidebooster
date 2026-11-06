import Link from "next/link";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader, Section } from "@/components/ui";
import { DecisionForm } from "@/components/DecisionForm";
import { CAMPAIGN_STATUS } from "@/lib/constants";
import { autoLockDue } from "@/lib/campaigns";
import { scheduleDecisionAction } from "@/app/actions/admin";

export const metadata = { title: "Draw management" };
export const dynamic = "force-dynamic";

export default async function AdminDraws({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await autoLockDue();
  const sp = await searchParams;
  const now = new Date();
  const [extensions, toDraw, toPublish, upcoming, results] = await Promise.all([
    db.drawSchedule.findMany({ where: { status: "PROPOSED", kind: "EXTENSION" }, include: { campaign: true }, orderBy: { createdAt: "asc" } }),
    db.campaign.findMany({ where: { status: "SALES_CLOSED" }, orderBy: { drawAt: "asc" } }),
    db.campaign.findMany({ where: { status: "DRAW_COMPLETED" }, include: { result: true } }),
    db.campaign.findMany({ where: { status: "APPROVED" }, orderBy: { salesCloseAt: "asc" }, take: 20 }),
    db.drawResult.findMany({ where: { status: "PUBLISHED" }, include: { campaign: true }, orderBy: { publishedAt: "desc" }, take: 20 }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Draw management" />
      <Flash sp={sp} />
      <Section title={`Extension requests (${extensions.length})`}>
        {extensions.length ? extensions.map((s) => (
          <div key={s.id} className="mb-3 rounded-lg border border-line p-3 text-sm">
            <Link href={`/admin/campaigns/${s.campaignId}`} className="link font-semibold">{s.campaign.title}</Link>
            <div>Current draw {dateTime(s.campaign.drawAt, s.timezone)} → requested <b>{dateTime(s.drawAt, s.timezone)}</b> (close {dateTime(s.salesCloseAt, s.timezone)})</div>
            <div className="text-muted">Reason: {s.reason} · {s.campaign.ticketsAllocated}/{s.campaign.totalTickets} entries</div>
            <div className="mt-2"><DecisionForm action={scheduleDecisionAction} hidden={{ id: s.id, back: "/admin/draws" }} buttons={[{ value: "APPROVE", label: "Approve", className: "btn-success btn-sm" }, { value: "REJECT", label: "Reject", className: "btn-danger btn-sm" }]} reasonPlaceholder="Decision reason">
              <label className="flex items-center gap-1"><input type="checkbox" name="legalChecked" /> Permitted by terms / regulator</label>
            </DecisionForm></div>
          </div>
        )) : <Empty>No extension requests.</Empty>}
      </Section>
      <Section title="Locked — awaiting draw">
        {toDraw.length ? <ul className="divide-y divide-line text-sm">{toDraw.map((c) => <li key={c.id} className="flex justify-between py-2"><Link className="link" href={`/admin/campaigns/${c.id}`}>{c.title}</Link><span>{c.eligibleCount} eligible · draw {dateTime(c.drawAt, c.timezone)} {now >= c.drawAt && <Badge status="PENDING">Due</Badge>}</span></li>)}</ul> : <Empty>None.</Empty>}
      </Section>
      <Section title="Drawn — awaiting verification & publication">
        {toPublish.length ? <ul className="divide-y divide-line text-sm">{toPublish.map((c) => <li key={c.id} className="flex justify-between py-2"><Link className="link" href={`/admin/campaigns/${c.id}`}>{c.title}</Link><span>#{c.result?.winningNumber}</span></li>)}</ul> : <Empty>None.</Empty>}
      </Section>
      <Section title="Open campaigns (sales close soonest first)">
        {upcoming.length ? <ul className="divide-y divide-line text-sm">{upcoming.map((c) => <li key={c.id} className="flex justify-between py-2"><Link className="link" href={`/admin/campaigns/${c.id}`}>{c.title}</Link><span>{c.ticketsAllocated}/{c.totalTickets} · closes {dateTime(c.salesCloseAt, c.timezone)}</span></li>)}</ul> : <Empty>None.</Empty>}
      </Section>
      <Section title="Published results">
        {results.length ? <ul className="divide-y divide-line text-sm">{results.map((r) => <li key={r.id} className="flex justify-between py-2"><Link className="link" href={`/results/${r.campaign.slug}`}>{r.campaign.title}</Link><span>#{r.winningNumber} · {r.winnerDisplayName} · <Badge status={r.campaign.status} labels={CAMPAIGN_STATUS} /></span></li>)}</ul> : <Empty>None yet.</Empty>}
      </Section>
    </div>
  );
}
