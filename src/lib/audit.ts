import { db, type Tx } from "./db";
import { sha256 } from "./crypto";

/** Approval / admin activity log. `reason` is required for rejections, adjustments, waivers etc. */
export async function audit(
  actorId: string | null,
  action: string,
  entityType: string,
  entityId?: string | null,
  details?: unknown,
  tx: Tx = db,
  reason?: string | null,
) {
  await tx.auditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId: entityId ?? null,
      reason: reason ?? null,
      details: details === undefined ? null : JSON.stringify(details),
    },
  });
}

const GENESIS = "0".repeat(64);

function entryHash(e: { campaignId: string; seq: number; action: string; actorId: string | null; details: string; prevHash: string; createdAt: Date }) {
  return sha256([e.campaignId, e.seq, e.action, e.actorId ?? "", e.details, e.prevHash, e.createdAt.toISOString()].join("|"));
}

/** Append to the hash-chained draw audit log. Must be called inside the same transaction as the change it records. */
export async function drawAudit(tx: Tx, campaignId: string, action: string, actorId: string | null, details: unknown = {}) {
  const last = await tx.drawAuditLog.findFirst({ where: { campaignId }, orderBy: { seq: "desc" } });
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? GENESIS;
  const createdAt = new Date();
  const detailStr = JSON.stringify(details);
  const hash = entryHash({ campaignId, seq, action, actorId, details: detailStr, prevHash, createdAt });
  await tx.drawAuditLog.create({ data: { campaignId, seq, action, actorId, details: detailStr, prevHash, hash, createdAt } });
}

/** Recompute the chain; returns the first broken sequence number, or null if intact. */
export async function verifyDrawAuditChain(campaignId: string) {
  const rows = await db.drawAuditLog.findMany({ where: { campaignId }, orderBy: { seq: "asc" } });
  let prev = GENESIS;
  for (const r of rows) {
    if (r.prevHash !== prev || entryHash(r) !== r.hash) return { ok: false as const, brokenAt: r.seq, count: rows.length };
    prev = r.hash;
  }
  return { ok: true as const, brokenAt: null, count: rows.length, head: prev };
}
