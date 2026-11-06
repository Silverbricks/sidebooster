# Database schema

- **Source of truth:** [`prisma/schema.prisma`](../../prisma/schema.prisma). Migrations are in `prisma/migrations/`.
- **Database:** PostgreSQL 16 or later.
- **Conventions:**
  - IDs are `cuid` strings.
  - Money is stored as **integer cents (AUD)**; rates in **basis points** (100 = 1%).
  - Statuses are strings. Allowed values are documented in comments and in `src/lib/constants.ts`.
  - Timestamps are UTC.

> Rebranding did **not** rename any table, column, key or relation. Existing data stays compatible.

## Tables by area

| Area | Models | Notes |
|---|---|---|
| Identity | `User`, `Session`, `Counter` | `User.publicId` is the permanent `BUY/SEL/BUS/ADM-000001` ID, allocated from `Counter`. Mobile is unique. Sessions store only a hash of the token |
| Sellers | `SellerProfile`, `SellerDocument`, `PaymentAccount` | `sellerCode`, seller type, ABN/ACN, status, permission flags; private documents; payout account at the provider |
| Catalogue | `Category`, `CategoryAttribute`, `Listing`, `ListingAttribute`, `ListingImage`, `WishlistItem`, `Enquiry` | Category-driven dynamic fields; `Category.highValue` marks enquiry-only categories |
| Offers | `Offer`, `OfferUsage` | Product discounts and coupons |
| Orders and sales | `Order`, `OrderItem`, `Sale` | `Sale` covers both online orders and reported offline sales |
| Commission | `CommissionRule`, `CommissionRecord`, `CommissionInvoice`, `Payout` | Rules are per seller or category, with effective dates |
| Payments | `Payment`, `WebhookEvent`, `Refund` | `Payment.ledger` = `PRODUCT` / `TICKET`. `providerRef` and `WebhookEvent.id` are unique, giving idempotency and replay protection |
| Promotions | `Campaign`, `CampaignImage`, `TicketPurchase`, `Ticket`, `DrawSchedule` | `@@unique([campaignId, number])` on `Ticket` guarantees unique ticket numbers |
| Draws | `DrawResult`, `DrawAuditLog` | One result per campaign; hash-chained log with `@@unique([campaignId, seq])` |
| Platform | `AuditLog`, `Notification`, `MessageLog`, `Setting`, `Page`, `Banner`, `ContactMessage` | `Setting` rows override `DEFAULT_SETTINGS` (approval engine) |

## Brand-related data

| Data | Where | After rebranding |
|---|---|---|
| Site name and support email | `Setting` keys `site_name`, `support_email`. Defaults come from `brand.ts` | Defaults now say SideBooster. If a live database has saved values, update them in `/admin/settings` |
| About and Contact pages | `Page` rows (`about`, `contact`) | New installs get SideBooster text. Existing installs: edit in `/admin/cms` |
| Banners | `Banner` rows | Edit in `/admin/cms` |
| Audit logs | `AuditLog`, `DrawAuditLog` | **Never rewritten.** Historic entries keep their original wording, and the draw log is hash-chained |

## Changing the schema

```bash
# edit prisma/schema.prisma, then:
npm run db:migrate -- --name describe_change   # creates prisma/migrations/<timestamp>_describe_change
git add prisma/ && git commit
# production applies it automatically on start (prisma migrate deploy)
```
