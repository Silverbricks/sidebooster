import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Badge, Flash, KV, PageHeader, Progress, PublicStatusBadge, Section } from "@/components/ui";
import { DecisionForm } from "@/components/DecisionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { CAMPAIGN_STATUS } from "@/lib/constants";
import { autoLockDue, campaignComplianceProblems, publicStatus, verifyResult } from "@/lib/campaigns";
import { verifyDrawAuditChain } from "@/lib/audit";
import { campaignDecisionAction, drawStepAction, scheduleDecisionAction } from "@/app/actions/admin";
import { getBool } from "@/lib/settings";

export const metadata = { title: "Campaign review" };
export const dynamic = "force-dynamic";

export default async function AdminCampaign({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  await autoLockDue();
  const { id } = await params;
  const sp = await searchParams;
  const c = await db.campaign.findUnique({
    where: { id },
    include: { images: true, listing: true, result: true, schedules: { orderBy: { createdAt: "desc" } }, auditLogs: { orderBy: { seq: "desc" } }, seller: { include: { sellerProfile: true } } },
  });
  if (!c) notFound();
  const [problems, chain, verification, soldOutRule] = await Promise.all([campaignComplianceProblems(c), verifyDrawAuditChain(id), c.result ? verifyResult(id) : null, getBool("rule_sold_out_trigger_allowed")]);
  const pendingSchedules = c.schedules.filter((s) => s.status === "PROPOSED");
  const now = new Date();
  const drawDue = now >= c.drawAt || (c.drawMode === "SOLD_OUT" && !!c.soldOutAt && soldOutRule);

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.title}
        subtitle={<span className="flex flex-wrap gap-2"><Badge status={c.status} labels={CAMPAIGN_STATUS} /><PublicStatusBadge status={publicStatus(c)} />{c.statusReason && <span>— {c.statusReason}</span>}</span>}
        actions={<><Link href={`/draws/${c.slug}`} className="btn-secondary" target="_blank">Public page</Link><a className="btn-secondary" href={`/api/admin/export/tickets?campaign=${c.id}`}>⬇ Entry register</a><a className="btn-secondary" href={`/api/admin/export/audit?campaign=${c.id}`}>⬇ Audit log</a></>}
      />
      <Flash sp={sp} />

      {c.status === "PENDING_APPROVAL" && (
        <Section title="Approval review">
          {problems.length > 0 ? (
            <ul className="mb-4 space-y-1 rounded-lg bg-red-50 p-3 text-sm text-red-800">{problems.map((p) => <li key={p}>❌ {p}</li>)}</ul>
          ) : <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">✅ Automated compliance checks passed. A human legal review is still required.</p>}
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>Is the entry structure lawful in every permitted state (trade promotion vs lottery; free entry in VIC/NSW)?</li>
            <li>Are permits / licences required for the prize value and states (e.g. NSW, SA, ACT thresholds)? Permit no.: <b>{c.permitNumber ?? "none supplied"}</b></li>
            <li>Do the terms cover draw method, date, unclaimed prize, extension and fallback procedures?</li>
            <li>Can the seller deliver the prize? Delivery: {c.prizeDelivery}</li>
          </ul>
          <DecisionForm action={campaignDecisionAction} hidden={{ id: c.id }} buttons={[{ value: "APPROVE", label: "Approve campaign & schedule", className: "btn-success btn-sm" }, { value: "REJECT", label: "Reject", className: "btn-danger btn-sm" }]} reasonPlaceholder="Note / reason (required for rejection)">
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="legalReviewConfirmed" /> Legal & compliance review completed</label>
            <label className="flex items-center gap-1 text-sm">Approved capacity <input name="totalTickets" type="number" defaultValue={c.totalTickets} max={c.totalTickets} min={1} className="input w-24 py-1" /></label>
          </DecisionForm>
        </Section>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Campaign">
          <KV rows={[
            ["Seller", <Link key="s" className="link" href={`/admin/sellers/${c.seller.sellerProfile?.id}`}>{c.seller.sellerProfile?.sellerCode} — {c.seller.sellerProfile?.legalName}</Link>],
            ["Seller permissions", `free: ${c.seller.sellerProfile?.canRunFreeDraws ? "yes" : "no"} · paid: ${c.seller.sellerProfile?.canRunPaidDraws ? "yes" : "no"}`],
            ["Prize", `${c.prizeName} — ${money(c.prizeValue)}`], ["Linked product", c.listing ? <Link key="l" className="link" href={`/listing/${c.listing.id}`}>{c.listing.title} ({c.listing.status})</Link> : "—"],
            ["Tickets", `${c.ticketType === "FREE" ? "Free" : `Paid ${money(c.ticketPrice)}`} · ${c.totalTickets} total · max ${c.maxPerBuyer}/buyer`],
            ["Eligibility", `${c.minAge}+ · ${c.allowedStates || "all states"}${c.requireIdVerification ? " · ID verification" : ""}`],
            ["Sales", `${dateTime(c.salesOpenAt, c.timezone)} → ${dateTime(c.salesCloseAt, c.timezone)}`], ["Draw", `${dateTime(c.drawAt, c.timezone)} · ${c.drawMode === "SOLD_OUT" ? "sold-out trigger" : "fixed date"}`],
            ["Legal notes", c.legalNotes], ["Fallback", c.fallbackProcedure], ["Legal review confirmed", c.legalReviewConfirmed ? "Yes" : "No"],
          ]} />
          <details className="mt-3 text-sm"><summary className="cursor-pointer font-medium">Terms & description</summary><p className="mt-2 whitespace-pre-line">{c.description}</p><p className="mt-2 whitespace-pre-line text-muted">{c.terms}</p></details>
        </Section>
        <Section title="Entry register">
          <Progress value={c.ticketsAllocated} max={c.totalTickets} />
          <KV rows={[
            ["Allocated", `${c.ticketsAllocated} / ${c.totalTickets}`], ["Sold out", dateTime(c.soldOutAt, c.timezone)],
            ["Locked", c.lockedAt ? dateTime(c.lockedAt, c.timezone) : "Not locked"], ["Eligible tickets", c.eligibleCount ?? "—"],
            ["Eligible list hash", c.eligibleHash ? <code key="h" className="break-all text-xs">{c.eligibleHash}</code> : "—"],
            ["Seed commitment", c.seedCommitment ? <code key="c" className="break-all text-xs">{c.seedCommitment}</code> : "—"],
            ["Audit chain", chain.ok ? `✅ intact (${chain.count} entries)` : `❌ BROKEN at #${chain.brokenAt}`],
          ]} />
        </Section>
      </div>

      {pendingSchedules.length > 0 && (
        <Section title="Schedule / extension requests">
          {pendingSchedules.map((s) => (
            <div key={s.id} className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <div><b>{s.kind === "INITIAL" ? "Initial schedule" : "Extension request"}</b> · requested {dateTime(s.createdAt)}</div>
              <div>Current: draw {dateTime(c.drawAt, c.timezone)}, close {dateTime(c.salesCloseAt, c.timezone)}</div>
              <div>Requested: draw <b>{dateTime(s.drawAt, s.timezone)}</b>, close <b>{dateTime(s.salesCloseAt, s.timezone)}</b></div>
              <div>Reason: {s.reason}</div>
              {s.kind === "EXTENSION" && (
                <div className="mt-2">
                  <DecisionForm action={scheduleDecisionAction} hidden={{ id: s.id }} buttons={[{ value: "APPROVE", label: "Approve & notify participants", className: "btn-success btn-sm" }, { value: "REJECT", label: "Reject", className: "btn-danger btn-sm" }]} reasonPlaceholder="Decision reason (required to reject)">
                    <label className="flex items-center gap-1"><input type="checkbox" name="legalChecked" /> Change permitted by terms / regulator</label>
                  </DecisionForm>
                </div>
              )}
              {s.kind === "INITIAL" && <p className="mt-1 text-xs text-muted">Approved together with the campaign.</p>}
            </div>
          ))}
        </Section>
      )}

      <Section title="Draw console">
        <ol className="space-y-4 text-sm">
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span><b>1. Close sales & lock the entry register</b> — {c.lockedAt ? `done ${dateTime(c.lockedAt, c.timezone)}` : now >= c.salesCloseAt ? "closing time reached" : `scheduled ${dateTime(c.salesCloseAt, c.timezone)}`}</span>
            {c.status === "APPROVED" && !c.lockedAt && (
              <form action={drawStepAction} className="flex items-center gap-2"><input type="hidden" name="id" value={c.id} /><input type="hidden" name="step" value="lock" />
                {now < c.salesCloseAt && <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="force" /> close early</label>}
                <SubmitButton className="btn-secondary btn-sm" confirm="Lock the entry register? This cannot be undone.">Lock register</SubmitButton></form>
            )}
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span><b>2. Conduct the draw</b> — {c.result ? `drawn ${dateTime(c.result.drawnAt, c.timezone)}: ticket #${c.result.winningNumber}` : drawDue ? "draw time reached" : `at ${dateTime(c.drawAt, c.timezone)}`}{!c.scheduleApproved && " · schedule not approved"}</span>
            {c.status === "SALES_CLOSED" && !c.result && drawDue && (
              <form action={drawStepAction}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="step" value="draw" /><SubmitButton className="btn-primary btn-sm" confirm="Run the draw now? The result is recorded permanently.">Run draw</SubmitButton></form>
            )}
          </li>
          <li>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><b>3. Verify & publish the result</b> — {c.result?.status === "PUBLISHED" ? `published ${dateTime(c.result.publishedAt, c.timezone)}` : c.result ? "awaiting verification" : "—"}</span>
            </div>
            {verification && (
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">{Object.entries(verification.checks).map(([k, ok]) => <li key={k}>{ok ? "✅" : "❌"} {k.replace(/([A-Z])/g, " $1").toLowerCase()}</li>)}</ul>
            )}
            {c.result && c.result.status !== "PUBLISHED" && (
              <form action={drawStepAction} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="id" value={c.id} /><input type="hidden" name="step" value="publish" />
                <input name="videoUrl" className="input max-w-sm" placeholder="Recorded draw video URL (optional)" aria-label="Video URL" />
                <SubmitButton className="btn-success btn-sm" confirm="Publish this result? Published results can never be changed.">Verify & publish</SubmitButton></form>
            )}
            {c.result && <div className="mt-2 text-muted">Winner: {c.result.winnerDisplayName} · ticket #{c.result.winningNumber} · index {c.result.winningIndex} of {c.result.eligibleCount}</div>}
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span><b>4. Prize delivered</b> — {c.prizeDeliveredAt ? dateTime(c.prizeDeliveredAt, c.timezone) : "pending"}</span>
            {c.status === "WINNER_ANNOUNCED" && (
              <form action={drawStepAction} className="flex gap-2"><input type="hidden" name="id" value={c.id} /><input type="hidden" name="step" value="delivered" /><input name="note" className="input py-1 text-xs" placeholder="Delivery evidence / note" aria-label="Note" /><SubmitButton className="btn-secondary btn-sm">Mark delivered</SubmitButton></form>
            )}
          </li>
        </ol>
      </Section>

      {["APPROVED", "SUSPENDED", "SALES_CLOSED", "DRAW_COMPLETED"].includes(c.status) && (
        <Section title="Campaign controls">
          <DecisionForm action={campaignDecisionAction} hidden={{ id: c.id }} buttons={[
            ...(c.status === "APPROVED" ? [{ value: "SUSPEND", label: "Pause / suspend sales" }] : []),
            ...(c.status === "SUSPENDED" ? [{ value: "RESUME", label: "Resume" }] : []),
            ...(c.status !== "DRAW_COMPLETED" ? [{ value: "CANCEL", label: "Cancel & refund all", className: "btn-danger btn-sm", confirm: "Cancel this campaign, void all tickets and refund every paid ticket?" }] : []),
          ]} reasonPlaceholder="Reason (required)" />
        </Section>
      )}

      <Section title={`Audit trail (${c.auditLogs.length})`}>
        <ol className="space-y-2 text-xs">
          {c.auditLogs.map((l) => (
            <li key={l.id} className="rounded border border-line p-2">
              <div className="flex flex-wrap justify-between gap-2"><b>#{l.seq} {l.action}</b><span className="text-muted">{dateTime(l.createdAt, c.timezone)} · actor {l.actorId ?? "system"}</span></div>
              <code className="block break-all text-muted">{l.details}</code>
              <code className="block break-all text-[10px] text-slate-400">prev {l.prevHash.slice(0, 16)}… → {l.hash}</code>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
