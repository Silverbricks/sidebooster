import "server-only";
import crypto from "node:crypto";
import type { Campaign, User } from "@prisma/client";
import { db, type Tx } from "./db";
import { sha256 } from "./crypto";
import { drawAudit, verifyDrawAuditChain } from "./audit";
import { notify } from "./notify";
import { ageOn, maskName, padTicket } from "./format";
import { getBool, getList } from "./settings";
import { DRAW_METHOD, type PublicDrawStatus } from "./constants";

// ---------------------------------------------------------------- status

export function publicStatus(c: Pick<Campaign, "status" | "salesOpenAt" | "salesCloseAt" | "scheduleApproved">, now = new Date()): PublicDrawStatus {
  switch (c.status) {
    case "WINNER_ANNOUNCED":
    case "COMPLETED":
      return "Winner Announced";
    case "DRAW_COMPLETED":
      return "Draw Completed";
    case "SALES_CLOSED":
      return c.scheduleApproved ? "Draw Scheduled" : "Sales Closed";
    case "APPROVED":
      if (now < c.salesOpenAt) return "Upcoming";
      if (now < c.salesCloseAt) return "Ticket Sales Open";
      return "Sales Closed";
    default:
      return "Cancelled";
  }
}

export const PUBLIC_CAMPAIGN_STATUSES = ["APPROVED", "SALES_CLOSED", "DRAW_COMPLETED", "WINNER_ANNOUNCED", "COMPLETED", "CANCELLED"];

export function isSalesOpen(c: Campaign, now = new Date()) {
  return c.status === "APPROVED" && now >= c.salesOpenAt && now < c.salesCloseAt;
}

// ---------------------------------------------------------------- eligibility

export type EligibilityUser = Pick<User, "id" | "role" | "accountStatus" | "dateOfBirth" | "state" | "idVerifiedAt">;

/** States where paid entry is blocked (e.g. VIC/NSW trade promotions must be free to enter). */
export async function blockedPaidStates() {
  return getList("paid_entry_blocked_states");
}

/** Campaign-level compliance checks run at submission and approval. */
export async function campaignComplianceProblems(
  c: Pick<Campaign, "ticketType" | "allowedStates" | "ticketPrice" | "drawMode" | "salesOpenAt" | "salesCloseAt" | "drawAt" | "totalTickets" | "maxPerBuyer" | "minAge">,
) {
  const p: string[] = [];
  const allowed = (c.allowedStates ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (c.ticketType === "PAID") {
    if (!(await getBool("paid_draws_enabled"))) p.push("Paid ticket campaigns are disabled platform-wide pending legal advice.");
    const blocked = await blockedPaidStates();
    if (!allowed.length) p.push(`Paid campaigns must list permitted states (paid entry is blocked in ${blocked.join(", ")}).`);
    const bad = allowed.filter((s) => blocked.includes(s));
    if (bad.length) p.push(`Paid entry is not permitted in: ${bad.join(", ")}.`);
    if (c.ticketPrice <= 0) p.push("Paid campaigns need a ticket price.");
  } else if (c.ticketPrice !== 0) p.push("Free campaigns cannot have a ticket price.");
  if (c.drawMode === "SOLD_OUT" && !(await getBool("rule_sold_out_trigger_allowed"))) p.push("Sold-out draw triggers are not enabled on this platform.");
  if (!(c.salesOpenAt < c.salesCloseAt)) p.push("Sales must open before they close.");
  if (!(c.salesCloseAt <= c.drawAt)) p.push("The draw must be at or after sales close.");
  if (c.totalTickets < 1 || c.maxPerBuyer < 1 || c.maxPerBuyer > c.totalTickets) p.push("Check ticket capacity and per-buyer limit.");
  if (c.minAge < 18) p.push("Minimum entrant age must be 18 or over.");
  return p;
}

/** Returns a list of reasons the user cannot enter. Empty list = eligible. */
export async function eligibilityProblems(c: Campaign, user: EligibilityUser, quantity: number, tx: Tx = db) {
  const problems: string[] = [];
  if (!isSalesOpen(c)) problems.push("Ticket sales are not open for this campaign.");
  if (c.ticketType === "PAID" && !(await getBool("paid_draws_enabled")))
    problems.push("Paid draws are not currently enabled on this platform.");
  if (c.ticketType === "FREE" && !(await getBool("free_draws_enabled")))
    problems.push("Free draws are not currently enabled on this platform.");
  if (user.id === c.sellerId) problems.push("You cannot enter your own campaign.");
  if (user.role === "ADMIN") problems.push("Administrators cannot enter draws.");
  if (user.accountStatus !== "ACTIVE") problems.push("Your account must be verified (email and mobile) and active.");
  if (!user.dateOfBirth) problems.push("Add your date of birth to your profile.");
  else if (ageOn(user.dateOfBirth) < c.minAge) problems.push(`You must be ${c.minAge}+ to enter.`);
  const allowed = (c.allowedStates ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!user.state) problems.push("Add your state/territory to your profile.");
  else if (allowed.length && !allowed.includes(user.state)) problems.push(`This campaign is only open to residents of ${allowed.join(", ")}.`);
  else if (c.ticketType === "PAID" && (await blockedPaidStates()).includes(user.state)) problems.push(`Paid entry is not available to residents of ${user.state}.`);
  if (c.requireIdVerification && !user.idVerifiedAt) problems.push("This campaign requires identity verification.");

  if (!Number.isInteger(quantity) || quantity < 1) problems.push("Choose at least one ticket.");
  const owned = await tx.ticket.count({ where: { campaignId: c.id, buyerId: user.id, status: "VALID" } });
  if (owned + quantity > c.maxPerBuyer) problems.push(`Maximum ${c.maxPerBuyer} tickets per person (you hold ${owned}).`);
  const remaining = c.totalTickets - c.ticketsAllocated;
  if (quantity > remaining) problems.push(remaining === 0 ? "Sold out." : `Only ${remaining} tickets left.`);
  return problems;
}

// ---------------------------------------------------------------- allocation

export class AllocationError extends Error {}

/**
 * Atomically reserves `qty` sequential ticket numbers and creates Ticket rows.
 * The conditional update guarantees no over-allocation; the unique index on
 * (campaignId, number) guarantees no number is ever issued twice.
 */
export async function allocateTickets(tx: Tx, campaignId: string, buyerId: string, purchaseId: string, qty: number) {
  const c = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (!isSalesOpen(c)) throw new AllocationError("Ticket sales are closed.");
  const owned = await tx.ticket.count({ where: { campaignId, buyerId, status: "VALID" } });
  if (owned + qty > c.maxPerBuyer) throw new AllocationError("Per-buyer ticket limit reached.");

  const reserved = await tx.campaign.updateMany({
    where: { id: campaignId, status: "APPROVED", ticketsAllocated: { lte: c.totalTickets - qty } },
    data: { ticketsAllocated: { increment: qty }, nextTicketNumber: { increment: qty } },
  });
  if (reserved.count !== 1) throw new AllocationError("Not enough tickets remaining.");
  const after = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const start = after.nextTicketNumber - qty;

  const numbers: string[] = [];
  for (let i = 0; i < qty; i++) {
    const n = start + i;
    const ticketNumber = padTicket(n, c.totalTickets);
    numbers.push(ticketNumber);
    await tx.ticket.create({
      data: { campaignId, number: n, ticketNumber, buyerId, purchaseId, allocationType: c.ticketType },
    });
  }
  return { numbers, soldOut: after.ticketsAllocated >= after.totalTickets };
}

/** Sold-out trigger: lock early only if the platform rule allows it and the campaign uses SOLD_OUT mode. */
export async function onSoldOut(campaignId: string) {
  const c = await db.campaign.update({ where: { id: campaignId }, data: { soldOutAt: new Date() } });
  await db.$transaction((tx) => drawAudit(tx, campaignId, "SOLD_OUT", null, { totalTickets: c.totalTickets }));
  if (c.drawMode === "SOLD_OUT" && (await getBool("rule_sold_out_trigger_allowed")))
    await lockCampaign(campaignId, null, { force: true, reason: "SOLD_OUT_TRIGGER" });
}

/** Claim free tickets (no payment). */
export async function claimFreeTickets(campaignId: string, user: EligibilityUser, qty: number, idempotencyKey: string) {
  const res = await db.$transaction(async (tx) => {
    const existing = await tx.ticketPurchase.findUnique({ where: { idempotencyKey }, include: { tickets: true } });
    if (existing) return { numbers: existing.tickets.map((t) => t.ticketNumber), soldOut: false };
    const c = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    if (c.ticketType !== "FREE") throw new AllocationError("This campaign uses paid tickets.");
    const problems = await eligibilityProblems(c, user, qty, tx);
    if (problems.length) throw new AllocationError(problems.join(" "));
    const purchase = await tx.ticketPurchase.create({
      data: { campaignId, buyerId: user.id, quantity: qty, amount: 0, status: "FREE_CLAIMED", idempotencyKey },
    });
    const { numbers, soldOut } = await allocateTickets(tx, campaignId, user.id, purchase.id, qty);
    await notify(
      user.id,
      {
        type: "TICKET_ALLOCATED",
        title: `Your free ticket${qty > 1 ? "s" : ""} for ${c.title}`,
        body: `Ticket number${qty > 1 ? "s" : ""}: ${numbers.join(", ")}. Draw: ${c.drawAt.toISOString()}.`,
        link: "/account/tickets",
      },
      tx,
    );
    return { numbers, soldOut };
  });
  if (res.soldOut) await onSoldOut(campaignId);
  return res.numbers;
}

// ---------------------------------------------------------------- lock & draw

function eligibleListHash(campaignId: string, ticketNumbers: string[]) {
  return sha256(`${campaignId}\n${ticketNumbers.join(",")}`);
}

async function eligibleTickets(tx: Tx, campaignId: string) {
  return tx.ticket.findMany({
    where: { campaignId, status: "VALID", purchase: { status: { in: ["PAID", "FREE_CLAIMED"] } } },
    orderBy: { number: "asc" },
    include: { buyer: { select: { id: true, name: true, displayName: true } } },
  });
}

/** Close sales and freeze the eligible ticket list. Idempotent. */
export async function lockCampaign(campaignId: string, actorId: string | null, opts: { force?: boolean; reason?: string } = {}) {
  return db.$transaction(async (tx) => {
    const c = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    if (c.lockedAt) return c;
    if (c.status !== "APPROVED") throw new Error("Only approved campaigns can be closed.");
    if (!opts.force && new Date() < c.salesCloseAt) throw new Error("Sales have not reached their closing time.");

    // abandon unpaid checkouts so they can never be allocated afterwards
    await tx.ticketPurchase.updateMany({ where: { campaignId, status: "PENDING" }, data: { status: "CANCELLED" } });
    await tx.payment.updateMany({ where: { ledger: "TICKET", status: "PENDING", ticketPurchase: { campaignId } }, data: { status: "CANCELLED" } });

    const tickets = await eligibleTickets(tx, campaignId);
    const numbers = tickets.map((t) => t.ticketNumber);
    const eligibleHash = eligibleListHash(campaignId, numbers);
    const seed = crypto.randomBytes(32).toString("hex");
    const seedCommitment = sha256(seed);
    const updated = await tx.campaign.update({
      where: { id: campaignId },
      data: {
        status: "SALES_CLOSED",
        lockedAt: new Date(),
        eligibleCount: numbers.length,
        eligibleHash,
        seedCommitment,
        drawSeed: seed,
        salesCloseAt: opts.force && new Date() < c.salesCloseAt ? new Date() : c.salesCloseAt,
      },
    });
    await drawAudit(tx, campaignId, "SALES_LOCKED", actorId, {
      eligibleCount: numbers.length,
      eligibleHash,
      seedCommitment,
      forcedEarly: Boolean(opts.force && new Date() < c.salesCloseAt),
      reason: opts.reason ?? (opts.force ? "ADMIN_CLOSE" : "SCHEDULED_CLOSE"),
    });
    return updated;
  });
}

/** Auto-close any campaigns whose sales window has ended. Called by cron and on page views. */
export async function autoLockDue() {
  const due = await db.campaign.findMany({
    where: { status: "APPROVED", salesCloseAt: { lte: new Date() }, lockedAt: null },
    select: { id: true },
  });
  for (const c of due) await lockCampaign(c.id, null).catch((e) => console.error("auto-lock failed", c.id, e));
  return due.length;
}

export function computeWinningIndex(seed: string, eligibleHash: string, count: number) {
  const digest = sha256(`${seed}:${eligibleHash}`);
  return Number(BigInt("0x" + digest) % BigInt(count));
}

function resultHashOf(r: {
  campaignId: string; eligibleCount: number; eligibleHash: string; seed: string; seedCommitment: string;
  winningIndex: number; winningTicketId: string; winningNumber: string; winnerUserId: string; drawnAt: Date;
}) {
  return sha256(
    [r.campaignId, r.eligibleCount, r.eligibleHash, r.seed, r.seedCommitment, r.winningIndex, r.winningTicketId, r.winningNumber, r.winnerUserId, r.drawnAt.toISOString()].join("|"),
  );
}

export async function runDraw(campaignId: string, adminId: string) {
  const result = await db.$transaction(async (tx) => {
    const c = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    if (c.status !== "SALES_CLOSED" || !c.lockedAt || !c.drawSeed || !c.eligibleHash || !c.seedCommitment)
      throw new Error("Sales must be closed and locked before drawing.");
    if (!c.scheduleApproved) throw new Error("The draw schedule has not been approved.");
    const soldOutEarly = c.drawMode === "SOLD_OUT" && !!c.soldOutAt && (await getBool("rule_sold_out_trigger_allowed"));
    if (new Date() < c.drawAt && !soldOutEarly) throw new Error("The scheduled draw time has not been reached.");
    if (await tx.drawResult.findUnique({ where: { campaignId } })) throw new Error("This campaign has already been drawn.");

    const tickets = await eligibleTickets(tx, campaignId);
    const hash = eligibleListHash(campaignId, tickets.map((t) => t.ticketNumber));
    if (hash !== c.eligibleHash || tickets.length !== c.eligibleCount) {
      await drawAudit(tx, campaignId, "DRAW_ABORTED_INTEGRITY", adminId, { expected: c.eligibleHash, actual: hash });
      throw new Error("Eligible ticket list has changed since lock — draw aborted and recorded.");
    }
    if (tickets.length === 0) throw new Error("No eligible tickets — cancel the campaign instead.");

    const winningIndex = computeWinningIndex(c.drawSeed, c.eligibleHash, tickets.length);
    const win = tickets[winningIndex];
    const drawnAt = new Date();
    const base = {
      campaignId,
      eligibleCount: tickets.length,
      eligibleHash: c.eligibleHash,
      seed: c.drawSeed,
      seedCommitment: c.seedCommitment,
      winningIndex,
      winningTicketId: win.id,
      winningNumber: win.ticketNumber,
      winnerUserId: win.buyer.id,
      drawnAt,
    };
    const created = await tx.drawResult.create({
      data: {
        ...base,
        method: DRAW_METHOD,
        winnerDisplayName: win.buyer.displayName || maskName(win.buyer.name),
        drawnById: adminId,
        resultHash: resultHashOf(base),
      },
    });
    await tx.campaign.update({ where: { id: campaignId }, data: { status: "DRAW_COMPLETED" } });
    await drawAudit(tx, campaignId, "DRAW_RUN", adminId, {
      seedRevealed: c.drawSeed,
      winningIndex,
      winningNumber: win.ticketNumber,
      resultHash: created.resultHash,
    });
    return created;
  });
  return result;
}

export async function verifyResult(campaignId: string) {
  const [c, r] = await Promise.all([
    db.campaign.findUnique({ where: { id: campaignId } }),
    db.drawResult.findUnique({ where: { campaignId } }),
  ]);
  if (!c || !r) return null;
  const checks = {
    seedMatchesCommitment: sha256(r.seed) === r.seedCommitment && r.seedCommitment === c.seedCommitment,
    eligibleHashMatchesLock: r.eligibleHash === c.eligibleHash,
    winningIndexRecomputes: computeWinningIndex(r.seed, r.eligibleHash, r.eligibleCount) === r.winningIndex,
    resultHashIntact: resultHashOf(r) === r.resultHash,
    auditChainIntact: (await verifyDrawAuditChain(campaignId)).ok,
  };
  return { checks, ok: Object.values(checks).every(Boolean) };
}

export async function publishResult(campaignId: string, adminId: string, videoUrl: string | null) {
  const v = await verifyResult(campaignId);
  if (!v) throw new Error("No draw result to publish.");
  if (!v.ok) throw new Error("Verification failed — result cannot be published: " + JSON.stringify(v.checks));

  const { c, r } = await db.$transaction(async (tx) => {
    const r = await tx.drawResult.findUniqueOrThrow({ where: { campaignId } });
    if (r.status === "PUBLISHED") throw new Error("Result already published and cannot be changed.");
    const updated = await tx.drawResult.update({
      where: { campaignId },
      data: { status: "PUBLISHED", verifiedById: adminId, publishedAt: new Date(), videoUrl },
    });
    const c = await tx.campaign.update({ where: { id: campaignId }, data: { status: "WINNER_ANNOUNCED" } });
    await drawAudit(tx, campaignId, "RESULT_VERIFIED_AND_PUBLISHED", adminId, { checks: v.checks, videoUrl });
    return { c, r: updated };
  });

  // notifications (outside the transaction — failures must not undo the publication)
  const participants = await db.ticket.findMany({
    where: { campaignId, status: "VALID" },
    distinct: ["buyerId"],
    select: { buyerId: true },
  });
  for (const p of participants) {
    const won = p.buyerId === r.winnerUserId;
    await notify(p.buyerId, {
      type: won ? "DRAW_WON" : "WINNER_ANNOUNCED",
      title: won ? `🎉 You won: ${c.prizeName}!` : `Winner announced: ${c.title}`,
      body: won
        ? `Your ticket ${r.winningNumber} was drawn as the winner. The seller will contact you about: ${c.prizeDelivery}`
        : `The winning ticket was ${r.winningNumber}. Thanks for taking part.`,
      link: `/results/${c.slug}`,
    });
  }
  await notify(c.sellerId, {
    type: "WINNER_ANNOUNCED",
    title: `Winner published for ${c.title}`,
    body: `Winning ticket: ${r.winningNumber}. Please arrange prize delivery.`,
    link: `/seller/campaigns/${c.id}`,
  });
  return r;
}

/** Cancel a campaign: void tickets and refund every paid ticket purchase. */
export async function cancelCampaign(campaignId: string, adminId: string, reason: string) {
  const c = await db.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (["WINNER_ANNOUNCED", "COMPLETED", "CANCELLED"].includes(c.status)) throw new Error("This campaign can no longer be cancelled.");
  const buyers = await db.$transaction(async (tx) => {
    const purchases = await tx.ticketPurchase.findMany({
      where: { campaignId, status: { in: ["PAID", "FREE_CLAIMED", "PENDING"] } },
      include: { payment: true },
    });
    for (const p of purchases) {
      if (p.payment && p.payment.status === "SUCCEEDED") {
        await tx.refund.create({
          data: { paymentId: p.payment.id, amount: p.payment.amount, reason: `Campaign cancelled: ${reason}`, status: "PROCESSED", requestedById: adminId, processedById: adminId, processedAt: new Date() },
        });
        await tx.payment.update({ where: { id: p.payment.id }, data: { status: "REFUNDED" } });
      } else if (p.payment && p.payment.status === "PENDING") {
        await tx.payment.update({ where: { id: p.payment.id }, data: { status: "CANCELLED" } });
      }
      await tx.ticketPurchase.update({ where: { id: p.id }, data: { status: p.status === "PAID" ? "REFUNDED" : "CANCELLED" } });
    }
    await tx.ticket.updateMany({ where: { campaignId }, data: { status: "VOID" } });
    await tx.campaign.update({ where: { id: campaignId }, data: { status: "CANCELLED", statusReason: reason } });
    await drawAudit(tx, campaignId, "CAMPAIGN_CANCELLED", adminId, { reason, purchasesAffected: purchases.length });
    return [...new Set(purchases.map((p) => p.buyerId))];
  });
  for (const b of buyers)
    await notify(b, {
      type: "CAMPAIGN_CANCELLED",
      title: `Campaign cancelled: ${c.title}`,
      body: `This campaign was cancelled (${reason}). Any ticket payments have been refunded to your original payment method.`,
      link: "/account/payments",
    });
}

/** Approve a proposed schedule change (SRS rule 5: reason recorded, admin approval required). */
export async function approveSchedule(scheduleId: string, adminId: string, note: string | null) {
  const result = await db.$transaction(async (tx) => {
    const s = await tx.drawSchedule.findUniqueOrThrow({ where: { id: scheduleId }, include: { campaign: true } });
    if (s.status !== "PROPOSED") throw new Error("Schedule already reviewed.");
    const c = s.campaign;
    if (["DRAW_COMPLETED", "WINNER_ANNOUNCED", "CANCELLED"].includes(c.status)) throw new Error("Campaign has already been drawn or cancelled.");
    if (c.lockedAt && s.salesCloseAt.getTime() !== c.salesCloseAt.getTime())
      throw new Error("Sales are locked; only the draw time can change.");
    if (s.drawAt < s.salesCloseAt) throw new Error("Draw must be after sales close.");
    await tx.drawSchedule.update({ where: { id: s.id }, data: { status: "APPROVED", reviewedById: adminId, reviewNote: note, reviewedAt: new Date() } });
    await tx.campaign.update({
      where: { id: c.id },
      data: { drawAt: s.drawAt, salesCloseAt: s.salesCloseAt, timezone: s.timezone, scheduleApproved: true },
    });
    await drawAudit(tx, c.id, "SCHEDULE_APPROVED", adminId, {
      scheduleId: s.id,
      reason: s.reason,
      previous: { drawAt: c.drawAt, salesCloseAt: c.salesCloseAt, timezone: c.timezone },
      next: { drawAt: s.drawAt, salesCloseAt: s.salesCloseAt, timezone: s.timezone },
      note,
    });
    return s;
  });
  if (result.kind === "EXTENSION") {
    const c = await db.campaign.findUniqueOrThrow({ where: { id: result.campaignId } });
    const people = await db.ticket.findMany({ where: { campaignId: c.id, status: "VALID" }, distinct: ["buyerId"], select: { buyerId: true } });
    for (const p of [...people.map((x) => x.buyerId), c.sellerId])
      await notify(p, {
        type: "DRAW_DATE_CHANGED",
        title: `Draw date updated: ${c.title}`,
        body: `The draw has been rescheduled to ${c.drawAt.toISOString()} (${c.timezone}). Reason: ${result.reason}. The original date is kept in the public audit history.`,
        link: `/draws/${c.slug}`,
      });
  }
  return result;
}

export async function rejectSchedule(scheduleId: string, adminId: string, note: string) {
  if (!note) throw new Error("A reason is required.");
  await db.$transaction(async (tx) => {
    const s = await tx.drawSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
    if (s.status !== "PROPOSED") throw new Error("Schedule already reviewed.");
    await tx.drawSchedule.update({ where: { id: s.id }, data: { status: "REJECTED", reviewedById: adminId, reviewNote: note, reviewedAt: new Date() } });
    await drawAudit(tx, s.campaignId, "SCHEDULE_REJECTED", adminId, { scheduleId: s.id, kind: s.kind, requested: { drawAt: s.drawAt }, note });
  });
}

export async function markPrizeDelivered(campaignId: string, adminId: string, note: string | null) {
  await db.$transaction(async (tx) => {
    const c = await tx.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    if (c.status !== "WINNER_ANNOUNCED") throw new Error("Winner must be announced first.");
    await tx.campaign.update({ where: { id: campaignId }, data: { status: "COMPLETED", prizeDeliveredAt: new Date() } });
    await drawAudit(tx, campaignId, "PRIZE_DELIVERED", adminId, { note });
  });
}
