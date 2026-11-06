import Link from "next/link";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Badge, Empty, PageHeader, PublicStatusBadge } from "@/components/ui";
import { CAMPAIGN_STATUS } from "@/lib/constants";
import { autoLockDue, publicStatus } from "@/lib/campaigns";

export const metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

export default async function AdminCampaigns({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await autoLockDue();
  const sp = await searchParams;
  const campaigns = await db.campaign.findMany({ where: sp.status ? { status: sp.status } : {}, include: { seller: { select: { sellerProfile: { select: { sellerCode: true } } } } }, orderBy: { updatedAt: "desc" } });
  return (
    <div>
      <PageHeader title="Ticket campaigns" />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/campaigns" className={`rounded-full px-3 py-1 ${!sp.status ? "bg-brand-600 text-white" : "bg-white ring-1 ring-line"}`}>All</Link>
        {Object.entries(CAMPAIGN_STATUS).map(([k, v]) => <Link key={k} href={`/admin/campaigns?status=${k}`} className={`rounded-full px-3 py-1 ${sp.status === k ? "bg-brand-600 text-white" : "bg-white ring-1 ring-line"}`}>{v}</Link>)}
      </div>
      {campaigns.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Campaign</th><th>Seller</th><th>Type</th><th>Entries</th><th>Draw</th><th>Status</th></tr></thead>
            <tbody>{campaigns.map((c) => (
              <tr key={c.id}>
                <td><Link className="link font-medium" href={`/admin/campaigns/${c.id}`}>{c.title}</Link><div className="text-xs text-muted">{c.prizeName} · {money(c.prizeValue)}</div></td>
                <td className="font-mono text-xs">{c.seller.sellerProfile?.sellerCode ?? "admin"}</td>
                <td>{c.ticketType === "FREE" ? "Free" : `Paid ${money(c.ticketPrice)}`}</td>
                <td>{c.ticketsAllocated}/{c.totalTickets}</td>
                <td className="text-xs">{dateTime(c.drawAt, c.timezone)}</td>
                <td><Badge status={c.status} labels={CAMPAIGN_STATUS} /> <PublicStatusBadge status={publicStatus(c)} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>No campaigns.</Empty>}
    </div>
  );
}
