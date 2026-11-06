import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { publicStatus, verifyResult, PUBLIC_CAMPAIGN_STATUSES } from "@/lib/campaigns";
import { KV, PublicStatusBadge, Section } from "@/components/ui";
import { DRAW_METHOD } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const c = await db.campaign.findUnique({ where: { slug: (await params).slug } });
  return c ? { title: `Result: ${c.title}` } : {};
}

export default async function ResultPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await db.campaign.findUnique({ where: { slug }, include: { result: true, auditLogs: { orderBy: { seq: "asc" } } } });
  if (!c || !PUBLIC_CAMPAIGN_STATUSES.includes(c.status)) notFound();
  const r = c.result?.status === "PUBLISHED" ? c.result : null;
  const v = r ? await verifyResult(c.id) : null;
  const publicLog = c.auditLogs.filter((l) => ["SALES_LOCKED", "SOLD_OUT", "SCHEDULE_APPROVED", "DRAW_RUN", "RESULT_VERIFIED_AND_PUBLISHED", "CAMPAIGN_CANCELLED", "PRIZE_DELIVERED"].includes(l.action));

  return (
    <div className="container-page max-w-4xl space-y-6 py-8">
      <div>
        <PublicStatusBadge status={publicStatus(c)} />
        <h1 className="h1 mt-2">{c.title}</h1>
        <p className="text-sm text-muted"><Link href={`/draws/${c.slug}`} className="link">Campaign page</Link></p>
      </div>

      {r ? (
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 p-6 text-white">
            <div className="text-sm uppercase tracking-wider text-emerald-100">Winning ticket</div>
            <div className="font-mono text-5xl font-extrabold">#{r.winningNumber}</div>
            <div className="mt-1 text-lg">{r.winnerDisplayName}</div>
          </div>
          <div className="p-5">
            <KV rows={[["Prize", `${c.prizeName} (${money(c.prizeValue)})`], ["Draw conducted", dateTime(r.drawnAt, c.timezone)], ["Result published", dateTime(r.publishedAt, c.timezone)], ["Total eligible tickets", r.eligibleCount.toLocaleString()], ["Prize status", c.prizeDeliveredAt ? `Delivered ${dateTime(c.prizeDeliveredAt, c.timezone)}` : "Awaiting delivery"]]} />
            {r.videoUrl && <a href={r.videoUrl} className="btn-secondary mt-4" target="_blank" rel="noopener noreferrer">▶ Watch recorded draw</a>}
          </div>
        </div>
      ) : (
        <div className="card card-pad text-sm text-muted">{c.status === "CANCELLED" ? `This campaign was cancelled${c.statusReason ? `: ${c.statusReason}` : ""}. Ticket payments were refunded.` : "The result has not been published yet."}</div>
      )}

      {r && v && (
        <Section title="Draw verification">
          <p className="mb-3 text-sm">Method: {DRAW_METHOD}.</p>
          <ul className="mb-4 space-y-1 text-sm">
            {Object.entries(v.checks).map(([k, ok]) => (
              <li key={k}>{ok ? "✅" : "❌"} {k.replace(/([A-Z])/g, " $1").toLowerCase()}</li>
            ))}
          </ul>
          <KV rows={[
            ["Seed commitment (published at lock)", <code key="c" className="break-all text-xs">{r.seedCommitment}</code>],
            ["Revealed seed", <code key="s" className="break-all text-xs">{r.seed}</code>],
            ["Eligible list hash", <code key="h" className="break-all text-xs">{r.eligibleHash}</code>],
            ["Winning index", `${r.winningIndex} (0-based, of ${r.eligibleCount})`],
            ["Result hash", <code key="r" className="break-all text-xs">{r.resultHash}</code>],
          ]} />
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-medium">How to verify this yourself</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
              <li>Check SHA-256(seed) equals the seed commitment that was published when sales closed — proving the seed was fixed before the draw.</li>
              <li>Compute SHA-256(seed + &quot;:&quot; + eligibleHash), read it as a hexadecimal integer, and take it modulo the eligible ticket count.</li>
              <li>The result is the winning index into the eligible tickets sorted by ticket number.</li>
            </ol>
          </details>
        </Section>
      )}

      {publicLog.length > 0 && (
        <Section title="Audit trail">
          <ol className="space-y-2 text-sm">
            {publicLog.map((l) => (
              <li key={l.id} className="flex flex-wrap gap-x-3">
                <span className="text-muted">{dateTime(l.createdAt, c.timezone)}</span>
                <span className="font-medium">{l.action.replace(/_/g, " ").toLowerCase()}</span>
                <code className="text-xs text-muted">#{l.seq} {l.hash.slice(0, 16)}…</code>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}
