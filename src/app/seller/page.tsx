import { brand } from "@/config/brand";
import Link from "next/link";
import { requireSeller } from "@/lib/auth";
import { db } from "@/lib/db";
import { date, money } from "@/lib/format";
import { Badge, PageHeader, Section, Stat } from "@/components/ui";
import { ActionList, QuickLinks, RecentList, TrendBars, dailySeries } from "@/components/dashboard";
import { ORDER_STATUS } from "@/lib/constants";
import { productPath, storePath } from "@/lib/urls";

export const metadata = { title: "Seller dashboard" };
export const dynamic = "force-dynamic";

const PAID = ["PAID", "FULFILLED", "COMPLETED"];

export default async function SellerHome() {
  const user = await requireSeller();
  const sp = user.sellerProfile;
  const me = user.id;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const soon = new Date(Date.now() + 7 * 86_400_000);
  const [
    listings, pending, orders, revenue, commission, outstanding, campaigns, tickets,
    toFulfil, openEnquiries, feesDue, expiring, rejected, drafts,
    orders30, visits30, views, recentOrders, topListings,
  ] = await Promise.all([
    db.listing.count({ where: { sellerId: me, status: "ACTIVE" } }),
    db.listing.count({ where: { sellerId: me, status: "PENDING" } }),
    db.order.count({ where: { sellerId: me, status: { in: PAID } } }),
    db.sale.aggregate({ where: { sellerId: me, status: "APPROVED" }, _sum: { salePrice: true } }),
    db.commissionRecord.aggregate({ where: { sellerId: me, status: { in: ["GENERATED", "INVOICED", "PAID", "OVERDUE"] } }, _sum: { amount: true } }),
    db.commissionInvoice.aggregate({ where: { sellerId: me, status: { in: ["ISSUED", "OVERDUE"] } }, _sum: { amount: true }, _count: true }),
    db.campaign.count({ where: { sellerId: me, status: "APPROVED" } }),
    db.ticket.count({ where: { campaign: { sellerId: me }, status: "VALID" } }),
    db.order.count({ where: { sellerId: me, status: "PAID" } }),
    db.enquiry.count({ where: { sellerId: me, status: "OPEN" } }),
    db.platformFee.aggregate({ where: { sellerId: me, status: "DUE" }, _sum: { amount: true }, _count: true }),
    db.listing.count({ where: { sellerId: me, status: "ACTIVE", expiresAt: { lte: soon } } }),
    db.listing.count({ where: { sellerId: me, status: "REJECTED" } }),
    db.listing.count({ where: { sellerId: me, status: "DRAFT" } }),
    db.order.findMany({ where: { sellerId: me, status: { in: PAID }, createdAt: { gte: since } }, select: { createdAt: true, total: true } }),
    db.referralEvent.findMany({ where: { sellerId: me, kind: "VISIT", createdAt: { gte: since } }, select: { createdAt: true } }),
    db.listing.aggregate({ where: { sellerId: me, status: "ACTIVE" }, _sum: { views: true } }),
    db.order.findMany({ where: { sellerId: me, status: { not: "PENDING_PAYMENT" } }, orderBy: { createdAt: "desc" }, take: 5, include: { items: { take: 1 } } }),
    db.listing.findMany({ where: { sellerId: me, status: "ACTIVE" }, orderBy: { views: "desc" }, take: 5, select: { id: true, slug: true, title: true, price: true, views: true, _count: { select: { enquiries: true, wishlistedBy: true } } } }),
  ]);

  const sales = dailySeries(orders30.map((o) => ({ at: o.createdAt, value: o.total })));
  const visits = dailySeries(visits30.map((v) => ({ at: v.createdAt, value: 1 })));
  const approved = !!sp && ["APPROVED", "ACTIVE"].includes(sp.status);

  const checklist: [string, boolean, string][] = [
    ["Email & mobile verified", user.accountStatus === "ACTIVE", "/verify"],
    ["Verification documents submitted", !!sp && !["VERIFICATION_PENDING", "DOCUMENTS_REQUIRED", "REGISTERED"].includes(sp.status), "/seller/verification"],
    [`Approved by ${brand.name}`, approved, "/seller/verification"],
    ["Payout account verified", !!sp?.paymentAccount?.payoutsEnabled, "/seller/payouts"],
  ];
  const setupLeft = checklist.filter((c) => !c[1]).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        subtitle={sp && <>Seller ID <span className="font-mono font-semibold">{sp.sellerCode}</span>{approved && <> · <Link href={storePath(sp)} className="link">View my store</Link></>}</>}
        actions={<Link href="/seller/listings/new" className="btn-primary">+ Add product</Link>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Live listings" value={listings} sub={`${pending} awaiting approval`} />
        <Stat label="Orders" value={orders} sub={`${toFulfil} to fulfil`} />
        <Stat label="Approved sales" value={money(revenue._sum.salePrice ?? 0)} sub={`Commission ${money(commission._sum.amount ?? 0)}`} />
        <Stat label="Owed to platform" value={money((outstanding._sum.amount ?? 0) + (feesDue._sum.amount ?? 0))} sub="Commission invoices + fees due" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TrendBars title="Online sales · last 30 days" points={sales} format={money} />
        <TrendBars title="Tracked visits · last 30 days" points={visits} total={`${visits30.length.toLocaleString("en-AU")} visits · ${(views._sum.views ?? 0).toLocaleString("en-AU")} listing views all-time`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Needs your attention">
          <ActionList items={[
            { label: "Finish seller setup", count: setupLeft, href: "/seller/verification", hint: "See the checklist below" },
            { label: "Paid orders to fulfil", count: toFulfil, href: "/seller/orders" },
            { label: "Unanswered enquiries", count: openEnquiries, href: "/seller/enquiries" },
            { label: "Platform fees due", count: feesDue._count, href: "/seller/commissions", hint: money(feesDue._sum.amount ?? 0) },
            { label: "Commission invoices to pay", count: outstanding._count, href: "/seller/commissions", hint: money(outstanding._sum.amount ?? 0) },
            { label: "Listings expiring within 7 days", count: expiring, href: "/seller/listings?status=ACTIVE" },
            { label: "Rejected listings to fix", count: rejected, href: "/seller/listings?status=REJECTED" },
            { label: "Drafts not yet submitted", count: drafts, href: "/seller/listings?status=DRAFT", tone: "info" },
          ]} />
        </Section>
        <Section title="Quick links">
          <QuickLinks links={[["Add product", "/seller/listings/new"], ["My listings", "/seller/listings"], ["Orders", "/seller/orders"], ["Record offline sale", "/seller/sales"], ["Offers & coupons", "/seller/offers"], ["Marketing & sharing", "/seller/marketing"], ["Payouts", "/seller/payouts"], ["Store profile", "/seller/profile"]]} />
          <p className="mt-4 text-sm text-muted">Active campaigns: <span className="font-semibold text-ink">{campaigns}</span> · {tickets.toLocaleString("en-AU")} confirmed entries</p>
        </Section>
        <Section title="Recent orders" actions={<Link href="/seller/orders" className="link text-sm">All orders →</Link>}>
          <RecentList empty="No orders yet. Share your products to get your first sale." rows={recentOrders.map((o) => ({
            key: o.id, href: "/seller/orders",
            title: o.items[0]?.title ?? o.orderNumber,
            meta: <>{o.orderNumber} · {date(o.createdAt)}</>,
            right: <><div className="font-semibold tabular-nums">{money(o.total)}</div><Badge status={o.status} labels={ORDER_STATUS} /></>,
          }))} />
        </Section>
        <Section title="Top listings" actions={<Link href="/seller/listings" className="link text-sm">All listings →</Link>}>
          <RecentList empty="No live listings yet." rows={topListings.map((l) => ({
            key: l.id, href: productPath(l), title: l.title,
            meta: <>{l.views.toLocaleString("en-AU")} views · {l._count.enquiries} enquiries · {l._count.wishlistedBy} saves</>,
            right: <span className="font-semibold tabular-nums">{money(l.price)}</span>,
          }))} />
        </Section>
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
