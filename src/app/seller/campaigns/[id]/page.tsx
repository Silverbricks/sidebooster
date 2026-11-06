import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSeller } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { utcToZonedInput } from "@/lib/time";
import { Badge, Flash, KV, PageHeader, Progress, PublicStatusBadge, Section, Stat } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { CAMPAIGN_STATUS } from "@/lib/constants";
import { publicStatus, autoLockDue } from "@/lib/campaigns";
import { deleteCampaignDraftAction, requestExtensionAction, withdrawCampaignAction } from "@/app/actions/seller";

export const metadata = { title: "Campaign" };
export const dynamic = "force-dynamic";

export default async function SellerCampaign({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await autoLockDue();
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireSeller();
  const c = await db.campaign.findUnique({ where: { id }, include: { schedules: { orderBy: { createdAt: "desc" } }, result: true, listing: { select: { id: true, title: true } } } });
  if (!c || (c.sellerId !== user.id && user.role !== "ADMIN")) notFound();

  const [purchases, participants, daily] = await Promise.all([
    db.ticketPurchase.groupBy({ by: ["status"], where: { campaignId: id }, _count: true, _sum: { quantity: true, amount: true } }),
    db.ticket.findMany({ where: { campaignId: id, status: "VALID" }, distinct: ["buyerId"], select: { buyerId: true } }).then((r) => r.length),
    db.ticket.findMany({ where: { campaignId: id, status: "VALID", createdAt: { gte: new Date(Date.now() - 14 * 86400_000) } }, select: { createdAt: true } }),
  ]);
  const by = (s: string) => purchases.find((p) => p.status === s);
  const confirmed = c.ticketsAllocated - (await db.ticket.count({ where: { campaignId: id, status: "VOID" } }));
  const pendingQty = by("PENDING")?._sum.quantity ?? 0;
  const failed = (by("FAILED")?._count ?? 0) + (by("CANCELLED")?._count ?? 0);
  const refunded = by("REFUNDED")?._sum.quantity ?? 0;
  const revenue = by("PAID")?._sum.amount ?? 0;
  const perDay = new Map<string, number>();
  for (const t of daily) { const k = t.createdAt.toISOString().slice(5, 10); perDay.set(k, (perDay.get(k) ?? 0) + 1); }
  const maxDay = Math.max(1, ...perDay.values());
  const pendingSchedule = c.schedules.find((s) => s.status === "PROPOSED");
  const canExtend = ["APPROVED", "SALES_CLOSED"].includes(c.status) && !pendingSchedule;

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge status={c.status} labels={CAMPAIGN_STATUS} /> <PublicStatusBadge status={publicStatus(c)} />{c.statusReason && <span>— {c.statusReason}</span>}</span>}
        actions={<>
          {PUBLIC_VIEW.includes(c.status) && <Link href={`/draws/${c.slug}`} className="btn-secondary">Public page</Link>}
          {["DRAFT", "REJECTED"].includes(c.status) && <Link href={`/seller/campaigns/${c.id}/edit`} className="btn-primary">Edit & submit</Link>}
          {c.status === "PENDING_APPROVAL" && <form action={withdrawCampaignAction}><input type="hidden" name="campaignId" value={c.id} /><SubmitButton className="btn-secondary">Withdraw</SubmitButton></form>}
          {["DRAFT", "REJECTED"].includes(c.status) && <form action={deleteCampaignDraftAction}><input type="hidden" name="campaignId" value={c.id} /><SubmitButton className="btn-danger" confirm="Delete this draft?">Delete</SubmitButton></form>}
        </>}
      />
      <Flash sp={sp} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Confirmed entries" value={confirmed.toLocaleString()} sub={`${Math.round((confirmed / c.totalTickets) * 100)}% of capacity`} />
        <Stat label="Remaining" value={(c.totalTickets - c.ticketsAllocated).toLocaleString()} />
        <Stat label="Unique participants" value={participants.toLocaleString()} sub={participants ? `${(confirmed / participants).toFixed(1)} entries per buyer` : undefined} />
        <Stat label={c.ticketType === "PAID" ? "Ticket revenue" : "Pending checkouts"} value={c.ticketType === "PAID" ? money(revenue) : pendingQty} sub={c.ticketType === "PAID" ? `${pendingQty} pending · ${failed} failed/cancelled · ${refunded} refunded` : undefined} />
      </div>
      <Progress value={confirmed} max={c.totalTickets} />

      {perDay.size > 0 && (
        <Section title="Daily entries (last 14 days)">
          <div className="flex h-32 items-end gap-1" role="img" aria-label="Daily entries chart">
            {[...perDay.entries()].map(([d, n]) => (
              <div key={d} className="flex flex-1 flex-col items-center gap-1 text-[10px] text-muted">
                <span>{n}</span><div className="w-full rounded-t bg-brand-500" style={{ height: `${(n / maxDay) * 90}px` }} /><span>{d}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Campaign details">
        <KV rows={[
          ["Ticket type", c.ticketType === "FREE" ? "Free" : `Paid — ${money(c.ticketPrice)}`], ["Capacity", `${c.totalTickets} (max ${c.maxPerBuyer} per buyer)`],
          ["Prize", `${c.prizeName} (${money(c.prizeValue)})`], ["Linked product", c.listing ? <Link key="l" className="link" href={`/listing/${c.listing.id}`}>{c.listing.title}</Link> : "—"],
          ["Sales", `${dateTime(c.salesOpenAt, c.timezone)} → ${dateTime(c.salesCloseAt, c.timezone)}`], ["Draw", dateTime(c.drawAt, c.timezone)],
          ["Draw trigger", c.drawMode === "SOLD_OUT" ? "Sold-out trigger" : "Fixed date"], ["Schedule approved", c.scheduleApproved ? "Yes" : "No"],
          ["Permitted states", c.allowedStates || "All"], ["Entries locked", c.lockedAt ? `${dateTime(c.lockedAt, c.timezone)} — ${c.eligibleCount} eligible` : "No"],
          ["Winner", c.result?.status === "PUBLISHED" ? `#${c.result.winningNumber} — ${c.result.winnerDisplayName}` : "—"],
          ["Prize delivered", dateTime(c.prizeDeliveredAt, c.timezone)],
        ]} />
      </Section>

      <Section title="Draw schedule & extension requests">
        {canExtend && (
          <form action={requestExtensionAction} className="mb-5 grid gap-3 rounded-lg border border-line p-4 sm:grid-cols-2">
            <input type="hidden" name="campaignId" value={c.id} />
            <div className="sm:col-span-2 text-sm text-muted">Current draw: <b>{dateTime(c.drawAt, c.timezone)}</b>. Requesting a change does <b>not</b> change the published date until an admin approves it.</div>
            {!c.lockedAt && <div><label className="label" htmlFor="salesCloseAt">Requested sales close</label><input id="salesCloseAt" name="salesCloseAt" type="datetime-local" defaultValue={utcToZonedInput(c.salesCloseAt, c.timezone)} className="input" required /></div>}
            <div><label className="label" htmlFor="drawAt">Requested new draw date</label><input id="drawAt" name="drawAt" type="datetime-local" defaultValue={utcToZonedInput(c.drawAt, c.timezone)} className="input" required /></div>
            <div className="sm:col-span-2"><label className="label" htmlFor="reason">Reason for extension</label><textarea id="reason" name="reason" rows={2} className="input" required minLength={10} placeholder="Not enough eligible entries received…" /></div>
            <div><SubmitButton>Request extension</SubmitButton></div>
          </form>
        )}
        <table className="table">
          <thead><tr><th>Requested</th><th>Type</th><th>Draw</th><th>Sales close</th><th>Reason</th><th>Status</th></tr></thead>
          <tbody>{c.schedules.map((s) => (
            <tr key={s.id}><td>{dateTime(s.createdAt)}</td><td>{s.kind === "INITIAL" ? "Initial" : "Extension"}</td><td>{dateTime(s.drawAt, s.timezone)}</td><td>{dateTime(s.salesCloseAt, s.timezone)}</td><td>{s.reason}</td><td><Badge status={s.status} />{s.reviewNote && <div className="text-xs text-muted">{s.reviewNote}</div>}</td></tr>
          ))}</tbody>
        </table>
      </Section>
    </div>
  );
}

const PUBLIC_VIEW = ["APPROVED", "SALES_CLOSED", "DRAW_COMPLETED", "WINNER_ANNOUNCED", "COMPLETED", "CANCELLED"];
