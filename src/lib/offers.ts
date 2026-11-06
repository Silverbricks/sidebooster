import type { Listing, Offer } from "@prisma/client";
import { db, type Tx } from "./db";

export type AppliedOffer = { offer: Offer; discount: number; freeDelivery: boolean };

export function describeOffer(o: Pick<Offer, "type" | "value" | "minQuantity" | "minSubtotal" | "couponCode">) {
  const what = o.type === "PERCENT" ? `${o.value / 100}% off` : o.type === "FIXED" ? `$${(o.value / 100).toFixed(0)} off` : "Free delivery";
  const conds = [o.minQuantity > 1 ? `buy ${o.minQuantity}+` : null, o.minSubtotal > 0 ? `orders over $${(o.minSubtotal / 100).toFixed(0)}` : null, o.couponCode ? `code ${o.couponCode}` : null].filter(Boolean);
  return conds.length ? `${what} — ${conds.join(", ")}` : what;
}

export function discountFor(o: Offer, subtotal: number, quantity: number, deliveryFee: number): AppliedOffer | null {
  if (quantity < o.minQuantity || subtotal < o.minSubtotal) return null;
  let discount = 0;
  if (o.type === "PERCENT") discount = Math.round((subtotal * o.value) / 10_000);
  if (o.type === "FIXED") discount = Math.min(o.value, subtotal);
  if (o.maxDiscount != null) discount = Math.min(discount, o.maxDiscount);
  const freeDelivery = o.type === "FREE_DELIVERY" && deliveryFee > 0;
  if (!discount && !freeDelivery) return null;
  return { offer: o, discount, freeDelivery };
}

/** Approved, in-date offers for a listing (product-specific or category-wide from the same seller). */
export async function liveOffersFor(listing: Pick<Listing, "id" | "sellerId" | "categoryId">, tx: Tx = db) {
  const now = new Date();
  const offers = await tx.offer.findMany({
    where: {
      sellerId: listing.sellerId,
      status: "APPROVED",
      startsAt: { lte: now },
      endsAt: { gt: now },
      OR: [{ listingId: listing.id }, { listingId: null, categoryId: listing.categoryId }, { listingId: null, categoryId: null }],
    },
  });
  return offers.filter((o) => o.usageLimit == null || o.usedCount < o.usageLimit);
}

/** Pick the best eligible offer. Coupon offers apply only when their code is entered. */
export async function bestOffer(
  listing: Pick<Listing, "id" | "sellerId" | "categoryId" | "price" | "deliveryFee">,
  quantity: number,
  buyerId: string,
  coupon: string | null,
  tx: Tx = db,
): Promise<AppliedOffer | null> {
  const subtotal = listing.price * quantity;
  const offers = await liveOffersFor(listing, tx);
  let best: AppliedOffer | null = null;
  for (const o of offers) {
    if (o.couponCode && o.couponCode.toUpperCase() !== (coupon ?? "").trim().toUpperCase()) continue;
    if (o.perBuyerLimit != null) {
      const used = await tx.offerUsage.count({ where: { offerId: o.id, buyerId } });
      if (used >= o.perBuyerLimit) continue;
    }
    const a = discountFor(o, subtotal, quantity, listing.deliveryFee);
    if (!a) continue;
    const value = a.discount + (a.freeDelivery ? listing.deliveryFee : 0);
    const bestValue = best ? best.discount + (best.freeDelivery ? listing.deliveryFee : 0) : -1;
    if (value > bestValue) best = a;
  }
  return best;
}
