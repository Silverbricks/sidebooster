import { db } from "./db";

export async function approvalCounts() {
  const [buyers, sellers, listings, offers, sales, commissions, refunds, campaigns, extensions, draws, invoicesOverdue, payoutsHeld] = await Promise.all([
    db.user.count({ where: { accountStatus: "VERIFICATION_REQUIRED" } }),
    db.sellerProfile.count({ where: { status: "UNDER_REVIEW" } }),
    db.listing.count({ where: { status: "PENDING" } }),
    db.offer.count({ where: { status: "PENDING" } }),
    db.sale.count({ where: { status: { in: ["UNDER_REVIEW", "BUYER_CONFIRMED"] } } }),
    db.commissionRecord.count({ where: { status: "PENDING_APPROVAL" } }),
    db.refund.count({ where: { status: "REQUESTED" } }),
    db.campaign.count({ where: { status: "PENDING_APPROVAL" } }),
    db.drawSchedule.count({ where: { status: "PROPOSED", kind: "EXTENSION" } }),
    db.campaign.count({ where: { OR: [{ status: "SALES_CLOSED", drawAt: { lte: new Date() } }, { status: "DRAW_COMPLETED" }, { status: "APPROVED", salesCloseAt: { lte: new Date() } }] } }),
    db.commissionInvoice.count({ where: { status: "OVERDUE" } }),
    db.payout.count({ where: { status: "HELD" } }),
  ]);
  return { buyers, sellers, listings, offers, sales, commissions, refunds, campaigns, extensions, draws, invoicesOverdue, payoutsHeld };
}
