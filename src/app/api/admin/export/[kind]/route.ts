import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

const cell = (v: unknown) => {
  const s = v instanceof Date ? v.toISOString() : String(v ?? "");
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // CSV formula-injection guard
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\n");
const $ = (c: number | null | undefined) => (c == null ? "" : (c / 100).toFixed(2));

/** Admin CSV exports: payments | commissions | tickets?campaign=ID | audit?campaign=ID */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") return new Response("Forbidden", { status: 403 });
  const { kind } = await params;
  const sp = new URL(req.url).searchParams;
  let rows: unknown[][] = [];

  if (kind === "payments") {
    const where: Prisma.PaymentWhereInput = {};
    if (sp.get("ledger")) where.ledger = sp.get("ledger")!;
    if (sp.get("status")) where.status = sp.get("status")!;
    const list = await db.payment.findMany({ where, include: { user: true }, orderBy: { createdAt: "asc" } });
    rows = [["receipt", "ledger", "user_id", "amount", "currency", "status", "provider", "provider_ref", "created_at", "paid_at"], ...list.map((p) => [p.receiptNumber, p.ledger, p.user.publicId, $(p.amount), p.currency, p.status, p.provider, p.providerRef, p.createdAt, p.paidAt])];
  } else if (kind === "commissions") {
    const list = await db.commissionRecord.findMany({ include: { sale: { include: { buyer: true, seller: { include: { sellerProfile: true } }, listing: { include: { category: true } } } }, invoice: true }, orderBy: { createdAt: "asc" } });
    rows = [["date", "sale", "source", "category", "seller_id", "buyer_id", "base", "rate_pct", "commission", "status", "invoice", "reason"], ...list.map((c) => [c.createdAt, c.sale.saleNumber, c.sale.source, c.sale.listing.category.name, c.sale.seller.sellerProfile?.sellerCode, c.sale.buyer.publicId, $(c.baseAmount), (c.rateBps / 100).toFixed(2), $(c.amount), c.status, c.invoice?.invoiceNumber, c.adjustReason])];
  } else if (kind === "tickets" && sp.get("campaign")) {
    const list = await db.ticket.findMany({ where: { campaignId: sp.get("campaign")! }, include: { buyer: true, purchase: { include: { payment: true } } }, orderBy: { number: "asc" } });
    rows = [["ticket_number", "status", "buyer_id", "allocation", "allocated_at", "purchase_status", "receipt"], ...list.map((t) => [t.ticketNumber, t.status, t.buyer.publicId, t.allocationType, t.createdAt, t.purchase.status, t.purchase.payment?.receiptNumber])];
  } else if (kind === "audit" && sp.get("campaign")) {
    const list = await db.drawAuditLog.findMany({ where: { campaignId: sp.get("campaign")! }, orderBy: { seq: "asc" } });
    rows = [["seq", "created_at", "action", "actor_id", "details", "prev_hash", "hash"], ...list.map((l) => [l.seq, l.createdAt, l.action, l.actorId, l.details, l.prevHash, l.hash])];
  } else return new Response("Unknown export", { status: 404 });

  await audit(user.id, "EXPORT", "Export", kind, Object.fromEntries(sp));
  return new Response(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
