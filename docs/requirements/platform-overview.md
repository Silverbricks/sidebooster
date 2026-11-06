# Platform overview

**SideBooster** (Shop • Tickets • Win) is an Australian product marketplace and prize draw platform. Verified sellers list products. Customers buy them online or by enquiry, and can enter scheduled prize draws for a chance to win products.

## Users

| Role | ID | Summary |
|---|---|---|
| Customer (buyer) | `BUY-000001` | Registers, verifies email and mobile, buys, enquires, enters draws, requests refunds |
| Seller: individual | `SEL-000001` | Verified and approved before selling; lists products; runs promotions with permission |
| Seller: business | `BUS-000001` | As above, plus ABN/ACN and an authorised representative |
| Platform Admin | `ADM-000001` | Approves sellers, listings, offers, sales, commission and campaigns; runs draws; configures rules |

IDs are permanent and issued by the server (`src/lib/ids.ts`).

## Core rules

1. **No verification, no selling.** See [seller-management.md](seller-management.md).
2. **No verified payment, no order.** Only a signed provider webhook confirms payment. See [payment-management.md](payment-management.md).
3. **No approved sale, no commission.** See [payment-management.md](payment-management.md).
4. **Fair, auditable draws.** See [prize-draw-engine.md](prize-draw-engine.md).
5. **Legal first.** Paid draws are off by default, and paid entry is blocked in VIC and NSW. See [ticket-management.md](ticket-management.md).

## Modules

| Module | Requirements doc | Main code |
|---|---|---|
| Accounts and verification | [seller-management.md](seller-management.md) | `src/lib/accounts.ts`, `src/app/actions/auth.ts` |
| Marketplace and listings | this page | `src/components/ListingForm.tsx`, `src/components/MarketplaceView.tsx` |
| Offers and coupons | [coupon-management.md](coupon-management.md) | `src/lib/offers.ts` |
| Payments, refunds, commission | [payment-management.md](payment-management.md) | `src/lib/payments.ts`, `src/lib/commission.ts` |
| Tickets and campaigns | [ticket-management.md](ticket-management.md) | `src/lib/campaigns.ts` |
| Prize draw engine | [prize-draw-engine.md](prize-draw-engine.md) | `src/lib/campaigns.ts`, `src/lib/audit.ts` |
| Approval engine | this page | `src/lib/settings.ts` → `/admin/settings` |

## Marketplace

- Categories and subcategories each have their own fields (`CategoryAttribute`). Admins can add fields in `/admin/categories` without code changes.
- Listings are created with a 3-step form (category and details → description, photos and location → price and selling options). A description helper uses **only** what the seller entered and never invents features.
- Listing statuses: `DRAFT → PENDING → ACTIVE` (published) or `REJECTED`, then `PAUSED`, `SOLD`, `EXPIRED` or `SUSPENDED`.
- High-value categories (cars, property) are **enquiry-only**, with no online checkout.

## Approval engine

All approval rules are settings an admin can change at `/admin/settings`: buyer mobile verification, seller documents, payout account, listing approval, trusted-seller auto-approval, offer approval, online and offline sale approval, sold-out draw trigger, and paid or free draws.

## Phases

- **Phases 1–3:** built (marketplace, payments, commission, campaigns, draws, dashboards).
- **Phase 4:** not built (mobile apps, subscriptions, paid advertising, multi-language, password reset, AI description writer).
