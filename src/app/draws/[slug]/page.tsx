import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { autoLockDue, eligibilityProblems, isSalesOpen, publicStatus, PUBLIC_CAMPAIGN_STATUSES } from "@/lib/campaigns";
import { money, dateTime } from "@/lib/format";
import { buyTicketsAction } from "@/app/actions/marketplace";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash, KV, Progress, PublicStatusBadge } from "@/components/ui";
import { Gallery } from "@/components/Gallery";
import { productPath } from "@/lib/urls";

type P = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const c = await db.campaign.findUnique({ where: { slug: (await params).slug } });
  return c ? { title: c.title, description: `${c.prizeName} — prize value ${money(c.prizeValue)}. Draw ${c.drawAt.toDateString()}.`, alternates: { canonical: `/draws/${c.slug}` } } : {};
}

export default async function CampaignPage({ params, searchParams }: P) {
  await autoLockDue();
  const { slug } = await params;
  const sp = await searchParams;
  const [c, user] = await Promise.all([
    db.campaign.findUnique({
      where: { slug },
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        listing: { include: { images: true } },
        seller: { select: { sellerProfile: { select: { sellerCode: true, businessName: true, legalName: true } }, firstName: true } },
        schedules: { where: { status: "APPROVED", kind: "EXTENSION" }, orderBy: { reviewedAt: "asc" } },
        result: true,
      },
    }),
    getCurrentUser(),
  ]);
  if (!c) notFound();
  const isOwner = user?.id === c.sellerId;
  if (!PUBLIC_CAMPAIGN_STATUSES.includes(c.status) && !isOwner && user?.role !== "ADMIN") notFound();

  const status = publicStatus(c);
  const open = isSalesOpen(c);
  const remaining = c.totalTickets - c.ticketsAllocated;
  const [myTickets, participants] = await Promise.all([
    user ? db.ticket.findMany({ where: { campaignId: c.id, buyerId: user.id, status: "VALID" }, orderBy: { number: "asc" } }) : [],
    db.ticket.findMany({ where: { campaignId: c.id, status: "VALID" }, distinct: ["buyerId"], select: { buyerId: true } }).then((r) => r.length),
  ]);
  const maxNow = Math.max(0, Math.min(c.maxPerBuyer - myTickets.length, remaining));
  const problems = user && open ? await eligibilityProblems(c, user, 1) : [];
  const images = [...c.images.map((i) => i.url), ...(c.listing?.images.map((i) => i.url) ?? [])];
  const states = (c.allowedStates ?? "").split(",").filter(Boolean);

  return (
    <div className="container-page py-8">
      <Flash sp={sp} />
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div>
            <PublicStatusBadge status={status} />
            <h1 className="h1 mt-2">{c.title}</h1>
            <p className="mt-1 text-sm text-muted">Run by {c.seller.sellerProfile?.businessName ?? c.seller.sellerProfile?.legalName ?? c.seller.firstName} · Seller ID <span className="font-mono">{c.seller.sellerProfile?.sellerCode}</span>{c.permitNumber && <> · Permit {c.permitNumber}</>}</p>
          </div>
          <Gallery images={images} icon="🎁" alt={c.prizeName} />
          <section className="card card-pad"><h2 className="h2 mb-2">About this promotion</h2><p className="whitespace-pre-line text-sm">{c.description}</p></section>
          <section className="card card-pad">
            <h2 className="h2 mb-3">Prize</h2>
            <KV rows={[["Prize", c.prizeName], ["Prize value", money(c.prizeValue)], ["Delivery / collection", c.prizeDelivery], ...(c.listing ? [["Linked product", <Link key="l" className="link" href={productPath(c.listing)}>{c.listing.title}</Link>] as [string, React.ReactNode]] : [])]} />
          </section>
          <section className="card card-pad">
            <h2 className="h2 mb-3">Key dates ({c.timezone})</h2>
            <KV rows={[["Ticket sales open", dateTime(c.salesOpenAt, c.timezone)], ["Ticket sales close", dateTime(c.salesCloseAt, c.timezone)], ["Draw", dateTime(c.drawAt, c.timezone)], ["Draw trigger", c.drawMode === "SOLD_OUT" ? "On sell-out (if permitted by terms) or the scheduled draw date" : "Scheduled draw date"]]} />
            {c.schedules.length > 0 && (
              <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                <b>Date changes:</b>
                <ul className="mt-1 list-disc pl-5">{c.schedules.map((s) => <li key={s.id}>Approved {dateTime(s.reviewedAt)} — reason: {s.reason}</li>)}</ul>
              </div>
            )}
          </section>
          <section className="card card-pad">
            <h2 className="h2 mb-2">Terms & conditions</h2>
            <p className="whitespace-pre-line text-sm">{c.terms}</p>
            <div className="mt-3 text-sm text-muted">
              Eligibility: Australian residents aged {c.minAge}+{states.length ? ` in ${states.join(", ")}` : ""}.{c.requireIdVerification && " Identity verification required."}{" "}
              {c.fallbackProcedure && <>If the draw cannot proceed as scheduled: {c.fallbackProcedure}</>}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="card card-pad space-y-4">
            <div className="text-3xl font-extrabold">{c.ticketType === "FREE" ? "Free entry" : `${money(c.ticketPrice)} / ticket`}</div>
            <div className="space-y-1">
              <Progress value={c.ticketsAllocated} max={c.totalTickets} />
              <div className="flex justify-between text-sm"><span><b>{c.ticketsAllocated.toLocaleString()}</b> / {c.totalTickets.toLocaleString()} confirmed entries</span><span className="text-muted">{remaining.toLocaleString()} left</span></div>
              <div className="text-xs text-muted">{participants.toLocaleString()} participants · max {c.maxPerBuyer} per person</div>
            </div>
            {open && !user && <Link href={`/login?next=/draws/${c.slug}`} className="btn-primary w-full">Log in to enter</Link>}
            {open && user && problems.length > 0 && (
              <ul className="space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{problems.map((p) => <li key={p}>• {p}</li>)}{problems.some((p) => p.includes("profile")) && <li><Link href="/account" className="link">Update profile</Link></li>}</ul>
            )}
            {open && user && problems.length === 0 && maxNow > 0 && (
              <form action={buyTicketsAction} className="space-y-3">
                <input type="hidden" name="campaignId" value={c.id} />
                <input type="hidden" name="slug" value={c.slug} />
                <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
                <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
                <div><label className="label" htmlFor="quantity">Number of tickets</label>
                  <select id="quantity" name="quantity" className="input">{Array.from({ length: maxNow }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}{c.ticketType === "PAID" ? ` — ${money(n * c.ticketPrice)}` : ""}</option>)}</select>
                </div>
                <SubmitButton className="btn-primary w-full">{c.ticketType === "FREE" ? "Claim free ticket(s)" : "Buy tickets"}</SubmitButton>
                <p className="text-xs text-muted">By entering you accept the campaign terms. Ticket numbers are allocated automatically{c.ticketType === "PAID" ? " once the payment provider confirms payment" : ""}.</p>
              </form>
            )}
            {!open && status === "Upcoming" && <p className="text-sm text-muted">Ticket sales open {dateTime(c.salesOpenAt, c.timezone)}.</p>}
            {c.result?.status === "PUBLISHED" && <Link href={`/results/${c.slug}`} className="btn-success w-full">View draw result 🏆</Link>}
            {c.lockedAt && !c.result && <p className="text-sm text-muted">Entries are locked: {c.eligibleCount} eligible tickets. Draw scheduled {dateTime(c.drawAt, c.timezone)}.</p>}
          </div>
          {myTickets.length > 0 && (
            <div className="card card-pad">
              <h2 className="h2 mb-2">Your tickets</h2>
              <div className="flex flex-wrap gap-2">{myTickets.map((t) => <Link key={t.id} href={`/account/tickets/${t.id}`} className="rounded-lg bg-brand-50 px-3 py-1 font-mono font-bold text-brand-700">{t.ticketNumber}</Link>)}</div>
            </div>
          )}
          <p className="text-xs text-muted">18+ only. Please participate responsibly. Gambling Help Online: 1800 858 858.</p>
        </aside>
      </div>
    </div>
  );
}
