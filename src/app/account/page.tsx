import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateProfileAction } from "@/app/actions/account";
import { SubmitButton } from "@/components/SubmitButton";
import { Badge, Flash, KV, PageHeader, Section, Stat } from "@/components/ui";
import { ACCOUNT_STATUS, AU_STATES, SELLER_STATUS } from "@/lib/constants";
import { date, money } from "@/lib/format";
import { ORDER_STATUS } from "@/lib/constants";
import { productPath } from "@/lib/urls";
import { ActionList, QuickLinks, RecentList } from "@/components/dashboard";
import { formatDob } from "@/lib/au-validation";

export const metadata = { title: "My account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [orders, tickets, wins, spent, toConfirm, unread, replies, awaitingPay, recentOrders, wishlist, saved] = await Promise.all([
    db.order.count({ where: { buyerId: user.id } }),
    db.ticket.count({ where: { buyerId: user.id, status: "VALID" } }),
    db.drawResult.count({ where: { winnerUserId: user.id, status: "PUBLISHED" } }),
    db.order.aggregate({ where: { buyerId: user.id, status: { in: ["PAID", "FULFILLED", "COMPLETED"] } }, _sum: { total: true } }),
    db.sale.count({ where: { buyerId: user.id, status: "REPORTED" } }),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
    db.enquiry.count({ where: { buyerId: user.id, status: "REPLIED", repliedAt: { gte: new Date(Date.now() - 14 * 86_400_000) } } }),
    db.order.count({ where: { buyerId: user.id, status: "PENDING_PAYMENT" } }),
    db.order.findMany({ where: { buyerId: user.id }, orderBy: { createdAt: "desc" }, take: 5, include: { items: { take: 1 }, seller: { select: { name: true, sellerProfile: { select: { businessName: true } } } } } }),
    db.wishlistItem.findMany({ where: { userId: user.id, listing: { status: "ACTIVE" } }, orderBy: { createdAt: "desc" }, take: 5, include: { listing: { select: { id: true, slug: true, title: true, price: true, location: true } } } }),
    db.wishlistItem.count({ where: { userId: user.id, listing: { status: "ACTIVE" } } }),
  ]);
  const verified = user.accountStatus === "ACTIVE";
  const check = (ok: unknown) => (ok ? <Badge status="ACTIVE">Verified</Badge> : <Badge status="PENDING">Pending</Badge>);

  return (
    <div className="space-y-6">
      <PageHeader title={`Hi ${user.firstName}`} subtitle={<>Buyer ID <span className="font-mono font-semibold">{user.publicId}</span></>} />
      <Flash sp={sp} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Orders" value={orders} sub={`${money(spent._sum.total ?? 0)} spent`} />
        <Stat label="Wishlist" value={saved} sub="live items saved" />
        <Stat label="Active tickets" value={tickets} />
        <Stat label="Wins" value={wins} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Needs your attention">
          <ActionList items={[
            { label: "Finish verifying your account", count: verified ? 0 : 1, href: "/verify", hint: "Needed before you can buy or enter promotions" },
            { label: "Orders awaiting payment", count: awaitingPay, href: "/account/orders" },
            { label: "Purchases to confirm", count: toConfirm, href: "/account/sales", hint: "A seller recorded a sale to you — confirm or dispute it" },
            { label: "New replies from sellers", count: replies, href: "/account/enquiries", tone: "info" },
            { label: "Unread notifications", count: unread, href: "/account/notifications", tone: "info" },
          ]} />
        </Section>
        <Section title="Quick links">
          <QuickLinks links={[["Browse marketplace", "/marketplace"], ["My orders", "/account/orders"], ["Wishlist", "/account/wishlist"], ["My tickets", "/account/tickets"], ["Payments & refunds", "/account/payments"], ...(user.sellerProfile ? [["Seller dashboard", "/seller"] as [string, string]] : [["Start selling", "/register/seller"] as [string, string]])]} />
        </Section>
        <Section title="Recent orders" actions={<Link href="/account/orders" className="link text-sm">All orders →</Link>}>
          <RecentList empty="No orders yet." rows={recentOrders.map((o) => ({
            key: o.id, href: `/account/orders/${o.id}`,
            title: o.items[0]?.title ?? o.orderNumber,
            meta: <>{o.orderNumber} · {o.seller.sellerProfile?.businessName ?? o.seller.name} · {date(o.createdAt)}</>,
            right: <><div className="font-semibold tabular-nums">{money(o.total)}</div><Badge status={o.status} labels={ORDER_STATUS} /></>,
          }))} />
        </Section>
        <Section title="Saved items" actions={<Link href="/account/wishlist" className="link text-sm">Wishlist →</Link>}>
          <RecentList empty="Tap ♡ on a product to save it here." rows={wishlist.map((w) => ({
            key: w.listing.id, href: productPath(w.listing), title: w.listing.title, meta: w.listing.location,
            right: <span className="font-semibold tabular-nums">{money(w.listing.price)}</span>,
          }))} />
        </Section>
      </div>
      <Section title="Verification" actions={user.accountStatus !== "ACTIVE" ? <Link href="/verify" className="btn-primary btn-sm">Complete verification</Link> : undefined}>
        <KV rows={[
          ["Account status", <Badge key="s" status={user.accountStatus} labels={ACCOUNT_STATUS} />],
          ["Email", <span key="e">{user.email} {check(user.emailVerifiedAt)}</span>],
          ["Mobile", <span key="m">{user.mobile} {check(user.mobileVerifiedAt)}</span>],
          ["Identity", user.idVerifiedAt ? <Badge key="i" status="ACTIVE">Verified</Badge> : <span key="i" className="text-muted">Not required yet (risk-based)</span>],
          ["Terms accepted", date(user.termsAcceptedAt)],
          ...(user.sellerProfile ? [["Seller account", <span key="sp"><span className="font-mono">{user.sellerProfile.sellerCode}</span> <Badge status={user.sellerProfile.status} labels={SELLER_STATUS} /></span>] as [string, React.ReactNode]] : []),
        ]} />
      </Section>
      <Section title="Profile">
        <form action={updateProfileAction} className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Name</label><input className="input bg-slate-50" value={user.name} readOnly /></div>
          <div><label className="label" htmlFor="displayName">Public display name (if you win)</label><input id="displayName" name="displayName" defaultValue={user.displayName ?? ""} className="input" placeholder={`${user.firstName} ${user.lastName[0]}.`} /></div>
          <div><label className="label" htmlFor="dateOfBirth">Date of birth</label>
            {user.dateOfBirth ? <input className="input bg-slate-50" value={formatDob(user.dateOfBirth)} readOnly /> : <input id="dateOfBirth" name="dateOfBirth" className="input" placeholder="DD/MM/YYYY" pattern="\d{1,2}/\d{1,2}/\d{4}" inputMode="numeric" maxLength={10} />}
            <p className="hint">Required for promotions. Contact support to correct it once set.</p>
          </div>
          <div><label className="label" htmlFor="state">State</label>
            <select id="state" name="state" defaultValue={user.state ?? ""} className="input"><option value="">—</option>{AU_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select>
          </div>
          <div><label className="label" htmlFor="suburb">Suburb</label><input id="suburb" name="suburb" defaultValue={user.suburb ?? ""} className="input" /></div>
          <div><label className="label" htmlFor="postcode">Postcode</label><input id="postcode" name="postcode" defaultValue={user.postcode ?? ""} className="input" /></div>
          <div className="sm:col-span-2"><SubmitButton>Save profile</SubmitButton></div>
        </form>
      </Section>
    </div>
  );
}
