import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const csv = (rows: (string | number | null | undefined)[][]) =>
  rows.map((r) => r.map((v) => { const s = String(v ?? ""); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; }).join(",")).join("\n");

/** GET /api/seller/statement?month=YYYY-MM — downloadable monthly statement for the logged-in seller. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user?.sellerProfile) return new Response("Unauthorised", { status: 401 });
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Bad month", { status: 400 });
  const from = new Date(`${month}-01T00:00:00Z`);
  const to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + 1);
  const sales = await db.sale.findMany({ where: { sellerId: user.id, createdAt: { gte: from, lt: to } }, include: { listing: true, buyer: true, commission: { include: { invoice: true } }, payout: true }, orderBy: { createdAt: "asc" } });
  const rows = [
    ["SellEasy seller statement", month, user.sellerProfile.sellerCode, user.sellerProfile.legalName],
    [],
    ["Date", "Sale", "Source", "Product", "Buyer ID", "Sale price", "Rate %", "Commission", "Commission status", "Invoice", "Net payout", "Payout status"],
    ...sales.map((s) => [
      s.createdAt.toISOString().slice(0, 10), s.saleNumber, s.source, s.listing.title, s.buyer.publicId, (s.salePrice / 100).toFixed(2),
      s.commission ? (s.commission.rateBps / 100).toFixed(2) : "", s.commission ? (s.commission.amount / 100).toFixed(2) : "", s.commission?.status ?? "",
      s.commission?.invoice?.invoiceNumber ?? "", s.payout ? (s.payout.amount / 100).toFixed(2) : "", s.payout?.status ?? "",
    ]),
  ];
  return new Response(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="statement-${user.sellerProfile.sellerCode}-${month}.csv"` } });
}
