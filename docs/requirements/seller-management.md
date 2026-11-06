# Seller management

## Registration

- `/register/seller`: individual or business. Business sellers add legal name, ABN (checksum-validated), ACN (optional, validated), an authorised representative and a business address.
- A provisional Seller ID is issued straight away: `SEL-xxxxxx` (individual) or `BUS-xxxxxx` (business). A buyer who becomes a seller keeps their `BUY-` ID as well.
- Email (link) and mobile (6-digit OTP) verification are required.

## Lifecycle

```
REGISTERED → VERIFICATION_PENDING → UNDER_REVIEW → APPROVED → ACTIVE
                                   ↘ DOCUMENTS_REQUIRED (more info) / REJECTED
ACTIVE → SUSPENDED (admin) → reinstated · CLOSED
```

| Step | Who | Requirement |
|---|---|---|
| Documents | Seller | Photo ID, plus ABN/ASIC evidence for business sellers. Uploaded at `/seller/verification`, stored privately (`private-uploads/`), visible only to the seller and admins |
| Review | Admin | `/admin/sellers/[id]`: approve, reject, request more documents, suspend or reinstate, always with a reason. Every action is audit-logged |
| Payout account | Payment provider | Stripe Connect onboarding. The seller becomes `ACTIVE` only when the provider reports payouts enabled (`account.updated` webhook) |

Code: `refreshSellerStatus`, `canSubmitListings`, `canSell` in `src/lib/accounts.ts`.

## Permissions set by the admin

| Flag | Effect |
|---|---|
| `trustedSeller` | Listings skip the approval queue, if `rule_trusted_seller_auto_approve` is on |
| `canRunFreeDraws` | May request free-entry campaigns |
| `canRunPaidDraws` | May request paid campaigns, only if `paid_draws_enabled` is on platform-wide |

Seller approval and **listing approval are separate**: an approved seller's listings are still reviewed unless they are trusted.

## Seller dashboard (`/seller`)

Overview checklist, listings, orders, enquiries, sales (including reporting offline sales), commissions and invoices, monthly statement (CSV), offers, campaigns, payouts and profile.

## Rules sellers cannot override

- Sellers cannot edit commission rates or mark their own commission invoices paid.
- Sellers cannot change an advertised draw date. They submit an extension request that an admin approves.
- Sellers cannot publish a listing, offer or campaign without the required approvals.
