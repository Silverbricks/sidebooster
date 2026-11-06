import Link from "next/link";
import { db } from "@/lib/db";
import { money, dateTime } from "@/lib/format";
import { Empty, PageHeader, Section } from "@/components/ui";

export const metadata = { title: "Approval centre" };
export const dynamic = "force-dynamic";

export default async function ApprovalCentre() {
  const [users, sellers, listings, offers, sales, commissions, refunds, campaigns, schedules] = await Promise.all([
    db.user.findMany({ where: { accountStatus: "VERIFICATION_REQUIRED" }, take: 10 }),
    db.sellerProfile.findMany({ where: { status: "UNDER_REVIEW" }, take: 10, orderBy: { updatedAt: "asc" } }),
    db.listing.findMany({ where: { status: "PENDING" }, take: 10, orderBy: { updatedAt: "asc" }, include: { seller: { select: { publicId: true } } } }),
    db.offer.findMany({ where: { status: "PENDING" }, take: 10 }),
    db.sale.findMany({ where: { status: { in: ["UNDER_REVIEW", "BUYER_CONFIRMED"] } }, take: 10, include: { listing: { select: { title: true } } } }),
    db.commissionRecord.findMany({ where: { status: "PENDING_APPROVAL" }, take: 10 }),
    db.refund.findMany({ where: { status: "REQUESTED" }, take: 10, include: { payment: true } }),
    db.campaign.findMany({ where: { status: "PENDING_APPROVAL" }, take: 10 }),
    db.drawSchedule.findMany({ where: { status: "PROPOSED", kind: "EXTENSION" }, take: 10, include: { campaign: { select: { title: true, id: true } } } }),
  ]);
  const block = (title: string, href: string, items: { key: string; label: React.ReactNode; sub?: React.ReactNode; link: string }[]) => (
    <Section title={`${title} (${items.length}${items.length === 10 ? "+" : ""})`} actions={<Link href={href} className="link text-sm">Open queue →</Link>}>
      {items.length ? <ul className="divide-y divide-line text-sm">{items.map((i) => <li key={i.key} className="flex justify-between gap-3 py-2"><Link href={i.link} className="link">{i.label}</Link><span className="text-muted">{i.sub}</span></li>)}</ul> : <Empty>Nothing waiting.</Empty>}
    </Section>
  );
  return (
    <div className="space-y-5">
      <PageHeader title="Approval centre" subtitle="Every approval in one place. Rules that control what needs approval live in Settings → Approval rules." />
      {block("Buyer verification", "/admin/users?status=VERIFICATION_REQUIRED", users.map((u) => ({ key: u.id, label: `${u.publicId} — ${u.name}`, sub: u.riskFlags, link: `/admin/users?q=${u.publicId}` })))}
      {block("Seller / business verification", "/admin/sellers?status=UNDER_REVIEW", sellers.map((s) => ({ key: s.id, label: `${s.sellerCode} — ${s.legalName}`, sub: s.sellerType, link: `/admin/sellers/${s.id}` })))}
      {block("Product listings", "/admin/listings?status=PENDING", listings.map((l) => ({ key: l.id, label: l.title, sub: `${l.seller.publicId} · ${money(l.price)}`, link: `/admin/listings?status=PENDING#${l.id}` })))}
      {block("Offers & discounts", "/admin/offers", offers.map((o) => ({ key: o.id, label: o.name, link: "/admin/offers" })))}
      {block("Sale confirmations", "/admin/sales", sales.map((s) => ({ key: s.id, label: `${s.saleNumber} — ${s.listing.title}`, sub: money(s.salePrice), link: "/admin/sales" })))}
      {block("Commission approvals", "/admin/commissions?status=PENDING_APPROVAL", commissions.map((c) => ({ key: c.id, label: `Commission ${money(c.amount)}`, link: "/admin/commissions?status=PENDING_APPROVAL" })))}
      {block("Refund requests", "/admin/refunds", refunds.map((r) => ({ key: r.id, label: `${r.payment.receiptNumber} — ${money(r.amount)}`, sub: r.payment.ledger, link: "/admin/refunds" })))}
      {block("Campaign approvals", "/admin/campaigns?status=PENDING_APPROVAL", campaigns.map((c) => ({ key: c.id, label: c.title, sub: c.ticketType, link: `/admin/campaigns/${c.id}` })))}
      {block("Draw extension requests", "/admin/draws", schedules.map((s) => ({ key: s.id, label: s.campaign.title, sub: `→ ${dateTime(s.drawAt, s.timezone)}`, link: `/admin/campaigns/${s.campaign.id}` })))}
    </div>
  );
}
