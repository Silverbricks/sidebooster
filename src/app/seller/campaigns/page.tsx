import { brand } from "@/config/brand";
import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader, Progress } from "@/components/ui";
import { CAMPAIGN_STATUS } from "@/lib/constants";

export const metadata = { title: "My campaigns" };

export default async function SellerCampaigns({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireSeller();
  const sp = await searchParams;
  const campaigns = await db.campaign.findMany({ where: { sellerId: user.id }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader title="Promotion campaigns" actions={<Link href="/seller/campaigns/new" className="btn-primary">+ Request campaign</Link>} />
      <Flash sp={sp} />
      {!user.sellerProfile?.canRunFreeDraws && !user.sellerProfile?.canRunPaidDraws && user.role !== "ADMIN" && (
        <div className="mb-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Your account doesn&apos;t have campaign permissions yet. Contact {brand.name} to request access to promotions.</div>
      )}
      {campaigns.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/seller/campaigns/${c.id}`} className="card card-pad space-y-2 hover:shadow-md">
              <div className="flex items-center justify-between"><span className="font-semibold">{c.title}</span><Badge status={c.status} labels={CAMPAIGN_STATUS} /></div>
              <div className="text-sm text-muted">{c.ticketType === "FREE" ? "Free entry" : `${money(c.ticketPrice)} / ticket`} · Draw {dateTime(c.drawAt, c.timezone)}</div>
              <Progress value={c.ticketsAllocated} max={c.totalTickets} />
              <div className="text-xs text-muted">{c.ticketsAllocated} / {c.totalTickets} confirmed entries</div>
            </Link>
          ))}
        </div>
      ) : <Empty>No campaigns yet.</Empty>}
    </div>
  );
}
