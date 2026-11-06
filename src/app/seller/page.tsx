import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/format";
import { PageHeader, Section, Stat } from "@/components/ui";

export const metadata = { title: "Seller dashboard" };

export default async function SellerHome() {
  const user = await requireSeller();
  const sp = user.sellerProfile;
  const [listings, pending, orders, revenue, commission, outstanding, campaigns, tickets] = await Promise.all([
    db.listing.count({ where: { sellerId: user.id, status: "ACTIVE" } }),
    db.listing.count({ where: { sellerId: user.id, status: "PENDING" } }),
    db.order.count({ where: { sellerId: user.id, status: { in: ["PAID", "FULFILLED", "COMPLETED"] } } }),
    db.sale.aggregate({ where: { sellerId: user.id, status: "APPROVED" }, _sum: { salePrice: true } }),
    db.commissionRecord.aggregate({ where: { sellerId: user.id, status: { in: ["GENERATED", "INVOICED", "PAID", "OVERDUE"] } }, _sum: { amount: true } }),
    db.commissionInvoice.aggregate({ where: { sellerId: user.id, status: { in: ["ISSUED", "OVERDUE"] } }, _sum: { amount: true } }),
    db.campaign.count({ where: { sellerId: user.id, status: "APPROVED" } }),
    db.ticket.count({ where: { campaign: { sellerId: user.id }, status: "VALID" } }),
  ]);
  const checklist: [string, boolean, string][] = [
    ["Email & mobile verified", user.accountStatus === "ACTIVE", "/verify"],
    ["Verification documents submitted", !!sp && !["VERIFICATION_PENDING", "DOCUMENTS_REQUIRED", "REGISTERED"].includes(sp.status), "/seller/verification"],
    ["Approved by SellEasy", !!sp && ["APPROVED", "ACTIVE"].includes(sp.status), "/seller/verification"],
    ["Payout account verified", !!sp?.paymentAccount?.payoutsEnabled, "/seller/payouts"],
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${user.firstName}`} actions={<Link href="/seller/listings/new" className="btn-primary">+ Add product</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Live listings" value={listings} sub={`${pending} awaiting approval`} />
        <Stat label="Orders" value={orders} />
        <Stat label="Approved sales" value={money(revenue._sum.salePrice ?? 0)} sub={`Commission ${money(commission._sum.amount ?? 0)}`} />
        <Stat label="Commission outstanding" value={money(outstanding._sum.amount ?? 0)} />
        <Stat label="Active campaigns" value={campaigns} sub={`${tickets.toLocaleString()} confirmed entries`} />
      </div>
      <Section title="Seller verification checklist">
        <ul className="space-y-2 text-sm">
          {checklist.map(([label, ok, href]) => (
            <li key={label} className="flex items-center justify-between">
              <span>{ok ? "✅" : "⬜"} {label}</span>
              {!ok && <Link href={href} className="link">Complete →</Link>}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
