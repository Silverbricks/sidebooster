import Link from "next/link";
import { BUSINESS_CHECK_STATUS, LOCATION_STATUS } from "@/lib/seller-location";
import { db } from "@/lib/db";
import { date } from "@/lib/format";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { SELLER_STATUS } from "@/lib/constants";

export const metadata = { title: "Sellers" };

export default async function AdminSellers({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const sellers = await db.sellerProfile.findMany({
    where: { ...(sp.status ? { status: sp.status } : {}), ...(sp.q ? { OR: [{ sellerCode: { contains: sp.q.toUpperCase(), mode: "insensitive" } }, { legalName: { contains: sp.q, mode: "insensitive" } }, { abn: { contains: sp.q, mode: "insensitive" } }] } : {}) },
    include: { user: { select: { email: true, accountStatus: true } }, paymentAccount: true, _count: { select: { documents: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <div>
      <PageHeader title="Sellers" />
      <form className="card card-pad mb-4 flex flex-wrap gap-3">
        <input name="q" defaultValue={sp.q} className="input max-w-xs" placeholder="Seller ID, name, ABN" aria-label="Search" />
        <select name="status" defaultValue={sp.status ?? ""} className="input max-w-60" aria-label="Status"><option value="">All statuses</option>{Object.entries(SELLER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className="btn-secondary">Filter</button>
      </form>
      {sellers.length ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Seller ID</th><th>Legal name</th><th>Type</th><th>ABN check</th><th>Location</th><th>Docs</th><th>Payouts</th><th>Updated</th><th>Status</th></tr></thead>
            <tbody>{sellers.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/admin/sellers/${s.id}`} className="link font-mono">{s.sellerCode}</Link></td>
                <td>{s.legalName}<div className="text-xs text-muted">{s.user.email}</div></td>
                <td>{s.sellerType === "BUSINESS" ? `Business${s.abn ? ` · ABN ${s.abn}` : ""}` : "Individual"}</td>
                <td><Badge status={s.businessCheckStatus} labels={BUSINESS_CHECK_STATUS} /></td>
                <td><Badge status={s.locationStatus} labels={LOCATION_STATUS} /></td>
                <td>{s._count.documents}</td>
                <td>{s.paymentAccount?.payoutsEnabled ? "✅" : "⬜"}{s.paymentAccount?.payoutsHeld && " ⏸"}</td>
                <td>{date(s.updatedAt)}</td>
                <td><Badge status={s.status} labels={SELLER_STATUS} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>No sellers.</Empty>}
    </div>
  );
}
