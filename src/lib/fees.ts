// Pay Per Item seller pricing (the default — no subscription is ever required to list or share).
// Admin configures: listing fee (global + per-category override), relist fee, featured placement fee,
// a fixed per-sale fee, and the existing percentage commission. All fees are shown before the seller commits.

import crypto from "node:crypto";
import type { Listing } from "@prisma/client";
import { db, type Tx } from "./db";
import { getNumber } from "./settings";
import { resolveRate } from "./commission";
import { money } from "./format";
import { audit } from "./audit";
import { notify } from "./notify";

export type FeeType = "LISTING" | "RELIST" | "FEATURED" | "SALE_FIXED";
export const FEE_LABELS: Record<FeeType, string> = { LISTING: "Listing fee", RELIST: "Relist fee", FEATURED: "Featured placement", SALE_FIXED: "Per-sale fee" };

export type FeeSchedule = { listingFee: number; relistFee: number; featuredFee: number; saleFixedFee: number; commissionBps: number; listingDays: number; categoryOverride: boolean };

/** The fees that apply to a listing in this category for this seller (cents / basis points). */
export async function feeSchedule(categoryId: string | null, sellerId: string | null, client: Tx = db): Promise<FeeSchedule> {
  const [cat, listingDefault, relistFee, featuredFee, saleFixedFee, listingDays] = await Promise.all([
    categoryId ? client.category.findUnique({ where: { id: categoryId }, select: { listingFee: true, parentId: true } }) : null,
    getNumber("fee_listing_cents", client),
    getNumber("fee_relist_cents", client),
    getNumber("fee_featured_cents", client),
    getNumber("fee_sale_fixed_cents", client),
    getNumber("listing_days_active", client),
  ]);
  let override = cat?.listingFee ?? null;
  if (override == null && cat?.parentId) override = (await client.category.findUnique({ where: { id: cat.parentId }, select: { listingFee: true } }))?.listingFee ?? null;
  const { rateBps } = categoryId ? await resolveRate(client, categoryId, sellerId ?? "", new Date()) : { rateBps: await getNumber("default_commission_bps", client) };
  return { listingFee: override ?? listingDefault, relistFee, featuredFee, saleFixedFee, commissionBps: rateBps, listingDays, categoryOverride: override != null };
}

/** Human-readable fee lines for disclosure (seller listing form, pricing page). */
export function describeFees(f: FeeSchedule) {
  const free = (c: number) => (c > 0 ? money(c) : "Free");
  return [
    { label: "Listing fee", value: free(f.listingFee), note: `Charged once when the listing is published (live for ${f.listingDays} days).` },
    { label: "Relisting an expired listing", value: free(f.relistFee), note: "Only if you choose to relist." },
    { label: "Commission on a successful sale", value: `${(f.commissionBps / 100).toFixed(f.commissionBps % 100 ? 2 : 0)}%`, note: "Of the sale price, only when the item sells." },
    ...(f.saleFixedFee > 0 ? [{ label: "Per-sale fee", value: money(f.saleFixedFee), note: "Per completed sale, in addition to commission." }] : []),
    { label: "Featured placement (optional)", value: f.featuredFee > 0 ? money(f.featuredFee) : "Free on request", note: "Only if you request it and an admin approves." },
    { label: "Monthly subscription", value: "None", note: "Pay Per Item — no recurring fees." },
  ];
}

const invoiceNo = () => `FEE-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString("hex").toUpperCase()}`;

/** Creates a fee invoice (skipped when the amount is 0). Pass the transaction client inside transactions. */
export async function chargeFee(client: Tx, input: { sellerId: string; listingId?: string | null; saleId?: string | null; type: FeeType; amount: number; description: string; actorId: string | null }) {
  if (input.amount <= 0) return null;
  const days = await getNumber("commission_invoice_due_days", client);
  const fee = await client.platformFee.create({
    data: { invoiceNumber: invoiceNo(), sellerId: input.sellerId, listingId: input.listingId ?? null, saleId: input.saleId ?? null, type: input.type, amount: input.amount, description: input.description.slice(0, 200), dueDate: new Date(Date.now() + days * 86_400_000) },
  });
  await audit(input.actorId, "PLATFORM_FEE_CHARGED", "PlatformFee", fee.id, { type: input.type, amount: input.amount, listingId: input.listingId ?? null }, client);
  await notify(input.sellerId, { type: "PLATFORM_FEE", title: `${FEE_LABELS[input.type]} ${fee.invoiceNumber}`, body: `${money(fee.amount)} — ${fee.description}. Due ${fee.dueDate.toDateString()}.`, link: "/seller/commissions" }, client);
  return fee;
}

/**
 * Call when a listing goes live. First publication → listing fee; going live again after it expired → relist fee;
 * re-approval after an edit → nothing. Never charges twice for the same publication.
 */
export async function chargeOnActivation(client: Tx, before: Pick<Listing, "id" | "sellerId" | "title" | "categoryId" | "publishedAt" | "expiresAt">, actorId: string | null) {
  const relist = !!before.publishedAt && !!before.expiresAt && before.expiresAt < new Date();
  if (before.publishedAt && !relist) return null;
  const f = await feeSchedule(before.categoryId, before.sellerId, client);
  return chargeFee(client, {
    sellerId: before.sellerId, listingId: before.id, type: relist ? "RELIST" : "LISTING", amount: relist ? f.relistFee : f.listingFee,
    description: `${relist ? "Relist" : "Listing"}: ${before.title}`, actorId,
  });
}
