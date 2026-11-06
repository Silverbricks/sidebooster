import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/DashboardShell";
import { Badge } from "@/components/ui";
import { SELLER_STATUS } from "@/lib/constants";

export default async function SellerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSeller();
  const sp = user.sellerProfile;
  const [openEnq, toShip] = await Promise.all([
    db.enquiry.count({ where: { sellerId: user.id, status: "OPEN" } }),
    db.order.count({ where: { sellerId: user.id, status: "PAID" } }),
  ]);
  return (
    <DashboardShell
      title="Seller dashboard"
      idLine={sp ? <><span className="font-mono font-semibold">{sp.sellerCode}</span> <Badge status={sp.status} labels={SELLER_STATUS} /></> : "Admin"}
      nav={[
        { href: "/seller", label: "Overview" },
        { href: "/seller/verification", label: "Verification" },
        { href: "/seller/payouts", label: "Payout account" },
        { heading: "Selling" },
        { href: "/seller/listings", label: "Products" },
        { href: "/seller/listings/new", label: "+ Add product" },
        { href: "/seller/offers", label: "Offers & discounts" },
        { href: "/seller/orders", label: "Orders", badge: toShip },
        { href: "/seller/enquiries", label: "Enquiries", badge: openEnq },
        { href: "/seller/sales", label: "Completed sales" },
        { heading: "Finance" },
        { href: "/seller/commissions", label: "Payments & commission" },
        { heading: "Promotions" },
        { href: "/seller/campaigns", label: "Campaigns" },
        { href: "/seller/campaigns/new", label: "+ Request campaign" },
        { heading: "" },
        { href: "/seller/profile", label: "Profile & settings" },
        { href: "/account", label: "→ Buyer account" },
      ]}
    >
      {sp && !["ACTIVE"].includes(sp.status) && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <b>Your seller account is {SELLER_STATUS[sp.status]?.toLowerCase()}.</b>{" "}
          {sp.status === "APPROVED" ? <>Connect your <Link href="/seller/payouts" className="link">payout account</Link> to start selling.</> :
            ["VERIFICATION_PENDING", "DOCUMENTS_REQUIRED", "REGISTERED"].includes(sp.status) ? <>Complete <Link href="/seller/verification" className="link">verification</Link> to sell. You can save draft listings meanwhile.</> :
              sp.status === "UNDER_REVIEW" ? "We're reviewing your details — you can prepare drafts meanwhile." : sp.statusReason}
        </div>
      )}
      {children}
    </DashboardShell>
  );
}
