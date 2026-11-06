import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DashboardShell } from "@/components/DashboardShell";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(undefined, "/account");
  const [unread, toConfirm] = await Promise.all([
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.sale.count({ where: { buyerId: user.id, status: "REPORTED" } }),
  ]);
  return (
    <DashboardShell
      title="My account"
      idLine={<span className="font-mono font-semibold">{user.publicId}</span>}
      nav={[
        { href: "/account", label: "Profile & verification" },
        { heading: "Shopping" },
        { href: "/account/orders", label: "My orders" },
        { href: "/account/sales", label: "Purchases to confirm", badge: toConfirm },
        { href: "/account/payments", label: "Payments & refunds" },
        { href: "/account/enquiries", label: "My enquiries" },
        { href: "/account/wishlist", label: "Wishlist" },
        { heading: "Promotions" },
        { href: "/account/tickets", label: "My tickets" },
        { href: "/account/draws", label: "Draws & winnings" },
        { heading: "" },
        { href: "/account/notifications", label: "Notifications", badge: unread },
        ...(user.sellerProfile ? [{ href: "/seller", label: "→ Seller dashboard" }] : [{ href: "/register/seller", label: "Become a seller" }]),
      ]}
    >
      {children}
    </DashboardShell>
  );
}
