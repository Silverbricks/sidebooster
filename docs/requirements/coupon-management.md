# Coupon and offer management

Offers and coupons apply to **product purchases only**. They never apply to tickets or draws.

## Offer types (`Offer.type`)

| Type | `value` | Example |
|---|---|---|
| `PERCENT` | basis points (1000 = 10%) | Buy 2+ save 10% |
| `FIXED` | cents | $10 off orders over $200 |
| `FREE_DELIVERY` | (none) | Free delivery |

## Conditions

| Field | Meaning |
|---|---|
| `listingId` / `categoryId` | One product, or all of the seller's products in a category. If both are empty, all the seller's products |
| `minQuantity`, `minSubtotal` | Thresholds |
| `maxDiscount` | Cap, in cents |
| `couponCode` | If set, the buyer must enter it at checkout. If not set, the offer applies automatically |
| `startsAt` / `endsAt` | Validity window |
| `usageLimit`, `perBuyerLimit` | Total uses and uses per buyer (tracked in `OfferUsage`) |

## Lifecycle

`PENDING → APPROVED` (or `REJECTED`), with `PAUSED` available. Offers need admin approval at `/admin/offers` when `rule_offer_require_approval` is on, which is the default.

## Checkout behaviour (`src/lib/offers.ts`)

- `liveOffersFor` lists the approved, in-date offers for a listing.
- `bestOffer` chooses the single best qualifying offer, counting free delivery as its value. Coupon offers count only when the buyer enters the matching code. Per-buyer limits are checked, and only one discount applies per order.
- The discount and offer are stored on the `Order`. Commission is calculated on the **amount actually paid** after the discount.
- Usage is recorded only when payment is confirmed.

## Who can do what

| Action | Seller | Admin |
|---|---|---|
| Create, edit or pause own offers | ✓ | ✓ |
| Approve or reject | | ✓ |
| Apply to tickets | ✗ | ✗ |
