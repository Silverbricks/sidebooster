import { brand } from "@/config/brand";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { autoLockDue } from "@/lib/campaigns";
import { CampaignCard } from "@/components/Cards";
import { Empty } from "@/components/ui";

export const metadata = { title: "Tickets & Draws", description: "Approved prize promotions from verified sellers, with auditable draws." };
export const dynamic = "force-dynamic";

const TABS = [
  ["open", "Sales open"],
  ["upcoming", "Upcoming"],
  ["closed", "Sales closed / draw scheduled"],
  ["previous", "Previous draws"],
] as const;

export default async function DrawsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await autoLockDue();
  const tab = (await searchParams).tab ?? "open";
  const now = new Date();
  const where: Prisma.CampaignWhereInput =
    tab === "upcoming" ? { status: "APPROVED", salesOpenAt: { gt: now } }
      : tab === "closed" ? { status: { in: ["SALES_CLOSED", "DRAW_COMPLETED"] } }
        : tab === "previous" ? { status: { in: ["WINNER_ANNOUNCED", "COMPLETED", "CANCELLED"] } }
          : { status: "APPROVED", salesOpenAt: { lte: now }, salesCloseAt: { gt: now } };
  const campaigns = await db.campaign.findMany({ where, include: { images: true, listing: { include: { images: true } } }, orderBy: { drawAt: tab === "previous" ? "desc" : "asc" }, take: 60 });

  return (
    <div className="container-page py-8">
      <h1 className="h1">Tickets & Draws</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Every promotion is approved by {brand.name} before it opens. Draws use a published, verifiable random method and every step is recorded in a tamper-evident audit log.{" "}
        <Link href="/responsible-participation" className="link">Eligibility & responsible participation</Link>
      </p>
      <nav className="mt-6 flex gap-2 overflow-x-auto" aria-label="Draw filters">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/draws?tab=${k}`} className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm ${tab === k ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-line hover:bg-slate-50"}`}>{label}</Link>
        ))}
      </nav>
      <div className="mt-6">
        {campaigns.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{campaigns.map((c) => <CampaignCard key={c.id} c={c} />)}</div> : <Empty>No promotions here right now.</Empty>}
      </div>
    </div>
  );
}
