import Link from "next/link";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Empty, PublicStatusBadge } from "@/components/ui";
import { publicStatus } from "@/lib/campaigns";

export const metadata = { title: "Draw results", description: "Published, verifiable draw results." };
export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const campaigns = await db.campaign.findMany({
    where: { status: { in: ["SALES_CLOSED", "DRAW_COMPLETED", "WINNER_ANNOUNCED", "COMPLETED", "CANCELLED"] } },
    include: { result: true },
    orderBy: { drawAt: "desc" },
    take: 100,
  });
  return (
    <div className="container-page py-8">
      <h1 className="h1">Draw results</h1>
      <p className="mt-1 text-sm text-muted">Results are published only after an administrator verifies the draw. Each result can be independently checked.</p>
      <div className="card mt-6 overflow-x-auto">
        {campaigns.length ? (
          <table className="table">
            <thead><tr><th>Campaign</th><th>Prize</th><th>Draw date</th><th>Eligible tickets</th><th>Winning ticket</th><th>Winner</th><th>Status</th></tr></thead>
            <tbody>
              {campaigns.map((c) => {
                const pub = c.result?.status === "PUBLISHED" ? c.result : null;
                return (
                  <tr key={c.id}>
                    <td><Link href={`/results/${c.slug}`} className="link font-medium">{c.title}</Link></td>
                    <td>{c.prizeName}<div className="text-xs text-muted">{money(c.prizeValue)}</div></td>
                    <td>{dateTime(c.drawAt, c.timezone)}</td>
                    <td className="tabular-nums">{c.eligibleCount ?? "—"}</td>
                    <td className="font-mono font-bold">{pub ? pub.winningNumber : "—"}</td>
                    <td>{pub ? pub.winnerDisplayName : "—"}</td>
                    <td><PublicStatusBadge status={publicStatus(c)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <Empty>No draws yet.</Empty>}
      </div>
    </div>
  );
}
