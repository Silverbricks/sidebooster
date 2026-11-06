import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { payoutAction } from "@/app/actions/admin";

export const metadata = { title: "Seller payouts" };

export default async function AdminPayouts({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const payouts = await db.payout.findMany({ where: sp.status ? { status: sp.status } : {}, include: { sale: { select: { saleNumber: true } } }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 });
  const sellers = new Map((await db.sellerProfile.findMany({ where: { userId: { in: payouts.map((p) => p.sellerId) } }, include: { paymentAccount: true } })).map((s) => [s.userId, s]));
  return (
    <div>
      <PageHeader title="Seller payouts" subtitle="Net amounts after commission, for approved online sales. Released only to verified, unrestricted payout accounts." />
      <Flash sp={sp} />
      {payouts.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Sale</th><th>Seller</th><th>Gross</th><th>Commission</th><th>Net</th><th>Account</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{payouts.map((p) => {
              const s = sellers.get(p.sellerId);
              const a = s?.paymentAccount;
              return (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.sale.saleNumber}<div className="text-muted">{dateTime(p.createdAt)}</div></td>
                  <td className="font-mono text-xs">{s?.sellerCode}</td>
                  <td>{money(p.gross)}</td><td>−{money(p.commission)}</td><td><b>{money(p.amount)}</b></td>
                  <td className="text-xs">{a ? `${a.payoutsEnabled ? "✅ enabled" : "⬜ not enabled"}${a.restricted ? " · restricted" : ""}${a.payoutsHeld ? " · held" : ""}` : "none"}</td>
                  <td><Badge status={p.status} />{p.holdReason && <div className="text-xs text-muted">{p.holdReason}</div>}</td>
                  <td>
                    <form action={payoutAction} className="flex flex-wrap gap-1">
                      <input type="hidden" name="id" value={p.id} />
                      {p.status === "SCHEDULED" && <><SubmitButton name="op" value="pay" className="btn-success btn-sm">Release</SubmitButton><input name="reason" className="input w-28 py-1 text-xs" placeholder="Hold reason" aria-label="Hold reason" /><SubmitButton name="op" value="hold" className="btn-secondary btn-sm">Hold</SubmitButton></>}
                      {p.status === "HELD" && <SubmitButton name="op" value="release" className="btn-secondary btn-sm">Unhold</SubmitButton>}
                    </form>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      ) : <Empty>No payouts.</Empty>}
    </div>
  );
}
