import Link from "next/link";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { PageHeader, Section, Stat } from "@/components/ui";
import { approvalCounts } from "@/lib/admin-counts";

export const metadata = { title: "Admin overview" };
export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const n = await approvalCounts();
  const sum = async (status: string[]) => (await db.commissionRecord.aggregate({ where: { status: { in: status } }, _sum: { amount: true } }))._sum.amount ?? 0;
  const [buyers, sellers, live, productPay, ticketPay, generated, received, outstanding, campaignsActive, drawsScheduled] = await Promise.all([
    db.user.count({ where: { role: "BUYER" } }),
    db.sellerProfile.count({ where: { status: "ACTIVE" } }),
    db.listing.count({ where: { status: "ACTIVE" } }),
    db.payment.aggregate({ where: { ledger: "PRODUCT", status: "SUCCEEDED" }, _sum: { amount: true }, _count: true }),
    db.payment.aggregate({ where: { ledger: "TICKET", status: "SUCCEEDED" }, _sum: { amount: true }, _count: true }),
    sum(["GENERATED", "INVOICED", "PAID", "OVERDUE"]),
    sum(["PAID"]).then(async (inv) => inv + ((await db.payout.aggregate({ where: { status: "PAID" }, _sum: { commission: true } }))._sum.commission ?? 0)),
    sum(["INVOICED", "OVERDUE"]),
    db.campaign.count({ where: { status: "APPROVED" } }),
    db.campaign.count({ where: { status: "SALES_CLOSED" } }),
  ]);
  const queue: [string, number, string][] = [
    ["Buyer verification", n.buyers, "/admin/users?status=VERIFICATION_REQUIRED"], ["Seller verification", n.sellers, "/admin/sellers?status=UNDER_REVIEW"],
    ["Listing approvals", n.listings, "/admin/listings?status=PENDING"], ["Offer approvals", n.offers, "/admin/offers"], ["Sale confirmations", n.sales, "/admin/sales"],
    ["Commission approvals", n.commissions, "/admin/commissions?status=PENDING_APPROVAL"], ["Refund requests", n.refunds, "/admin/refunds"],
    ["Campaign approvals", n.campaigns, "/admin/campaigns?status=PENDING_APPROVAL"], ["Extension requests", n.extensions, "/admin/draws"], ["Draws needing action", n.draws, "/admin/draws"],
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Platform overview" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Buyers" value={buyers} />
        <Stat label="Active sellers" value={sellers} />
        <Stat label="Live listings" value={live} />
        <Stat label="Pending approvals" value={queue.reduce((a, q) => a + q[1], 0)} />
      </div>
      <Section title="Finance overview">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Stat label="Product payments" value={money(productPay._sum.amount ?? 0)} sub={`${productPay._count} payments`} />
          <Stat label="Ticket payments (separate ledger)" value={money(ticketPay._sum.amount ?? 0)} sub={`${ticketPay._count} payments`} />
          <Stat label="Commission generated" value={money(generated)} />
          <Stat label="Commission received" value={money(received)} />
          <Stat label="Commission outstanding" value={money(outstanding)} sub={`${n.invoicesOverdue} overdue invoices`} />
          <Stat label="Payouts on hold" value={n.payoutsHeld} />
        </div>
      </Section>
      <Section title="Campaign control centre">
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Active campaigns" value={campaignsActive} />
          <Stat label="Awaiting approval" value={n.campaigns} />
          <Stat label="Extension requests" value={n.extensions} />
          <Stat label="Draws scheduled" value={drawsScheduled} />
        </div>
      </Section>
      <Section title="Approval queue">
        <ul className="grid gap-2 sm:grid-cols-2">
          {queue.map(([label, count, href]) => (
            <li key={label}><Link href={href} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm hover:bg-slate-50"><span>{label}</span><span className={`rounded-full px-2 text-xs font-semibold ${count ? "bg-amber-500 text-white" : "bg-slate-100 text-muted"}`}>{count}</span></Link></li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
