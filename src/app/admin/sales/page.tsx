import Link from "next/link";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Badge, Empty, Flash, PageHeader } from "@/components/ui";
import { DecisionForm } from "@/components/DecisionForm";
import { SALE_STATUS, COMMISSION_STATUS } from "@/lib/constants";
import { saleDecisionAction } from "@/app/actions/admin";

export const metadata = { title: "Sale confirmations" };

export default async function AdminSales({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const status = sp.status ?? "REVIEW";
  const sales = await db.sale.findMany({
    where: status === "REVIEW" ? { status: { in: ["UNDER_REVIEW", "BUYER_CONFIRMED", "REPORTED", "MORE_INFO"] } } : status === "ALL" ? {} : { status },
    include: { listing: { include: { category: true } }, buyer: { select: { publicId: true, name: true } }, seller: { select: { publicId: true, sellerProfile: { select: { sellerCode: true } } } }, commission: true, order: { select: { orderNumber: true } } },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  return (
    <div>
      <PageHeader title="Sale confirmations" subtitle="Seller reports sale → buyer confirms → admin approves → commission is calculated." />
      <Flash sp={sp} />
      <div className="mb-4 flex gap-2 text-sm">{[["REVIEW", "Needs review"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["ALL", "All"]].map(([k, l]) => <Link key={k} href={`/admin/sales?status=${k}`} className={`rounded-full px-3 py-1 ${status === k ? "bg-brand-600 text-white" : "bg-white ring-1 ring-line"}`}>{l}</Link>)}</div>
      {sales.length ? (
        <div className="space-y-3">
          {sales.map((s) => (
            <div key={s.id} className="card card-pad text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><span className="font-mono font-semibold">{s.saleNumber}</span> · {s.source === "ONLINE" ? `Online order ${s.order?.orderNumber}` : "Reported offline sale"}</span>
                <Badge status={s.status} labels={SALE_STATUS} />
              </div>
              <div className="mt-2 grid gap-1 sm:grid-cols-2">
                <div>Product: <Link className="link" href={`/listing/${s.listingId}`}>{s.listing.title}</Link> ({s.listing.category.name})</div>
                <div>Final sale price: <b>{money(s.salePrice)}</b> <span className="text-muted">(listed {money(s.listing.price)})</span></div>
                <div>Seller: <span className="font-mono">{s.seller.sellerProfile?.sellerCode}</span> · Buyer: <span className="font-mono">{s.buyer.publicId}</span> ({s.buyer.name})</div>
                <div>Buyer confirmed: {s.buyerConfirmedAt ? dateTime(s.buyerConfirmedAt) : s.buyerDisputed ? <b className="text-red-700">Disputed by buyer</b> : "Not yet"}</div>
                {s.sellerNote && <div className="sm:col-span-2 text-muted">Seller note: {s.sellerNote}</div>}
                {s.adminNote && <div className="sm:col-span-2 text-muted">Admin note: {s.adminNote}</div>}
                {s.commission && <div>Commission: {money(s.commission.amount)} <Badge status={s.commission.status} labels={COMMISSION_STATUS} /></div>}
              </div>
              {["UNDER_REVIEW", "BUYER_CONFIRMED", "MORE_INFO", "REPORTED"].includes(s.status) && (
                <div className="mt-3">
                  <DecisionForm action={saleDecisionAction} hidden={{ id: s.id }} buttons={[
                    { value: "APPROVE", label: "Approve sale", className: "btn-success btn-sm" },
                    { value: "MORE_INFO", label: "Request more info" },
                    { value: "REJECT", label: "Reject", className: "btn-danger btn-sm" },
                  ]} />
                  {s.status === "REPORTED" && <p className="mt-1 text-xs text-amber-700">The buyer hasn&apos;t confirmed yet — approving overrides buyer confirmation.</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : <Empty>Nothing here.</Empty>}
    </div>
  );
}
