import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { autoLockDue } from "@/lib/campaigns";
import { expirePendingPayments } from "@/lib/payments";
import { markOverdueInvoices } from "@/lib/commission";
import { notify } from "@/lib/notify";

/**
 * Scheduled worker. Call every 5 minutes from a scheduler (cron, Vercel Cron, GitHub Actions…):
 *   GET /api/cron/tick   with header  Authorization: Bearer $CRON_SECRET
 * Closes due ticket sales, expires abandoned checkouts, expires old listings,
 * marks overdue commission invoices and sends 24-hour draw reminders.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const locked = await autoLockDue();
  const expiredPayments = await expirePendingPayments();
  const expiredListings = (await db.listing.updateMany({ where: { status: "ACTIVE", expiresAt: { lt: new Date() } }, data: { status: "EXPIRED" } })).count;
  const overdue = await markOverdueInvoices();

  // draw reminders: draws in the next 24h that haven't had a reminder
  let reminders = 0;
  const soon = await db.campaign.findMany({ where: { status: { in: ["APPROVED", "SALES_CLOSED"] }, drawAt: { gt: new Date(), lt: new Date(Date.now() + 86400_000) } } });
  for (const c of soon) {
    const already = await db.notification.findFirst({ where: { type: "DRAW_REMINDER", link: `/draws/${c.slug}` } });
    if (already) continue;
    const holders = await db.ticket.findMany({ where: { campaignId: c.id, status: "VALID" }, distinct: ["buyerId"], select: { buyerId: true } });
    for (const h of holders) {
      await notify(h.buyerId, { type: "DRAW_REMINDER", title: `Draw tomorrow: ${c.title}`, body: `The draw takes place at ${c.drawAt.toISOString()} (${c.timezone}). Good luck!`, link: `/draws/${c.slug}` });
      reminders++;
    }
  }
  return NextResponse.json({ locked, expiredPayments, expiredListings, overdue, reminders });
}
