import { requireAdmin } from "@/lib/auth";
import { DashboardShell } from "@/components/DashboardShell";
import { approvalCounts } from "@/lib/admin-counts";
import { db } from "@/lib/db";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const [n, recoveryPending] = await Promise.all([approvalCounts(), db.recoveryRequest.count({ where: { status: "PENDING" } })]);
  return (
    <DashboardShell
      title="Super Admin"
      idLine={<span className="font-mono font-semibold">{admin.publicId}</span>}
      nav={[
        { href: "/admin", label: "Overview" },
        { href: "/admin/approvals", label: "Approval centre", badge: n.buyers + n.sellers + n.listings + n.offers + n.sales + n.commissions + n.refunds + n.campaigns + n.extensions },
        { heading: "People" },
        { href: "/admin/users?role=BUYER", label: "Buyers", badge: n.buyers },
        { href: "/admin/sellers", label: "Sellers", badge: n.sellers },
        { heading: "Marketplace" },
        { href: "/admin/categories", label: "Categories & fields" },
        { href: "/admin/listings", label: "Product listings", badge: n.listings },
        { href: "/admin/offers", label: "Offers", badge: n.offers },
        { href: "/admin/orders", label: "Product orders" },
        { heading: "Finance & approvals" },
        { href: "/admin/sales", label: "Sale confirmations", badge: n.sales },
        { href: "/admin/commissions", label: "Commissions", badge: n.commissions },
        { href: "/admin/commissions/invoices", label: "Commission invoices", badge: n.invoicesOverdue },
        { href: "/admin/commissions/rules", label: "Commission rates" },
        { href: "/admin/payouts", label: "Seller payouts", badge: n.payoutsHeld },
        { href: "/admin/payments", label: "Payments & reconciliation" },
        { href: "/admin/refunds", label: "Refunds", badge: n.refunds },
        { heading: "Promotions" },
        { href: "/admin/campaigns", label: "Campaigns", badge: n.campaigns },
        { href: "/admin/draws", label: "Draw management", badge: n.draws + n.extensions },
        { heading: "Platform" },
        { href: "/admin/reports", label: "Reports" },
        { href: "/admin/cms", label: "CMS / pages" },
        { href: "/admin/settings", label: "Settings & approval rules" },
        { href: "/admin/recovery", label: "Account recovery", badge: recoveryPending },
        { href: "/admin/audit", label: "Audit log" },
        { href: "/admin/messages", label: "Email / SMS outbox" },
      ]}
    >
      {children}
    </DashboardShell>
  );
}
