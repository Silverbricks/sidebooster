# SideBooster — Shop • Tickets • Win

<img src="assets/logos/sidebooster-logo.svg" alt="SideBooster" width="320">

Product marketplace and prize draw platform · https://sidebooster.com

A verified Australian marketplace where approved sellers list products and, with permission, run approved prize promotions. Buyers purchase products, claim or buy tickets, and check verifiable draw results, all from one account.

**Principles built into the code:** no verification means no selling, no approved sale means no commission, and no verified payment means no order confirmation.

## Quick start

Requires Node 20.18+ and Docker (for PostgreSQL).

```bash
cp .env.example .env   # then fill in ENCRYPTION_KEY and CRON_SECRET
npm install
npm run db:up          # PostgreSQL in Docker on localhost:5432
npm run setup          # apply migrations + load demo data
npm run dev            # http://localhost:3000
```

**Docs:** [About](docs/ABOUT.md) · [All URLs](docs/URLS.md) · [Admin guide & logins](docs/ADMIN.md) · [Deploying](DEPLOY.md)

**Brand:** [guidelines](docs/branding/brand-guidelines.md) · [logo](docs/branding/logo-specification.md) · **Requirements:** [overview](docs/requirements/platform-overview.md) · [sellers](docs/requirements/seller-management.md) · [tickets](docs/requirements/ticket-management.md) · [coupons](docs/requirements/coupon-management.md) · [draw engine](docs/requirements/prize-draw-engine.md) · [payments](docs/requirements/payment-management.md) · **Technical:** [architecture](docs/technical/architecture.md) · [database](docs/technical/database-schema.md) · [API](docs/technical/api-documentation.md) · [domains](docs/technical/deployment.md) · [rebranding record](docs/change-management/software-rebranding.md)

Demo logins (password `Password123`):

| Email | ID | Role |
|---|---|---|
| admin@sidebooster.test | ADM-000001 | Super Admin |
| seller@sidebooster.test | SEL-000001 | Active individual seller (free draws allowed) |
| business@sidebooster.test | BUS-000001 | Business seller, under review |
| buyer@sidebooster.test | BUY-000001 | Verified buyer (QLD) |
| buyer2@sidebooster.test | BUY-000002 | Verified buyer (NSW) |

The demo includes a campaign whose draw time has already passed. Log in as admin, go to **Draw management**, and follow lock → run draw → verify & publish.

Emails and SMS codes (including registration OTPs) are not sent in development. They are printed to the server console and listed at **/admin/messages**.

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run db:up` | Start local PostgreSQL (Docker) |
| `npm run setup` | Apply migrations and seed demo data |
| `npm run db:migrate` | Create a new migration after editing `schema.prisma` |
| `npm run bootstrap` | Production-safe: default categories/pages + first admin (never deletes) |
| `npm run db:seed` | Re-seed demo data. **Wipes all data**; refuses to run when `NODE_ENV=production` |
| `npm run test:flows` | 21 business-rule tests against the separate `sidebooster_test` database (`TEST_DATABASE_URL`) |
| `npm run test:smoke` | GETs every page as each role against a running server on :3100 and checks access control |
| `npm run typecheck` / `lint` | Static checks |

## Stack

- **Next.js 15** (App Router, server components, server actions) with TypeScript and Tailwind v4.
- **Prisma 6 + PostgreSQL**, with migrations in `prisma/migrations`.
- **Docker**: `Dockerfile` (production image) and `docker-compose.yml` (local DB, or full stack with `--profile app`). CI in `.github/workflows/ci.yml`.
- **Custom session auth**: bcrypt password hashes, httpOnly cookie sessions, and role checks on every page and action.
- **Payments**: a provider-independent interface (`src/lib/payment-provider.ts`). It ships with a simulated test gateway and a Stripe Connect adapter.

## Architecture map

| Area | Where |
|---|---|
| Data model (all tables, statuses) | `prisma/schema.prisma` |
| Platform IDs (BUY/SEL/BUS/ADM), ABN/ACN/mobile validation | `src/lib/ids.ts` |
| Account and seller verification lifecycle, OTP | `src/lib/accounts.ts` |
| **Approval engine** (admin-editable rules) | `src/lib/settings.ts` → `/admin/settings` |
| Payments, checkout, webhooks, refunds | `src/lib/payments.ts`, `src/app/api/payments/webhook` |
| Commission engine (rules → records → invoices/payouts) | `src/lib/commission.ts` |
| Offers and discounts | `src/lib/offers.ts` |
| Ticketing, eligibility, compliance, lock/draw/publish | `src/lib/campaigns.ts` |
| Hash-chained draw audit log | `src/lib/audit.ts` |
| Dynamic category fields | `CategoryAttribute` / `ListingAttribute` → `/admin/categories` |
| Upload validation (type, size, magic bytes) | `src/lib/uploads.ts` |
| Scheduled worker | `GET /api/cron/tick` with `Authorization: Bearer $CRON_SECRET` |

### Key flows

- **Buyer:** registers and receives a BUY ID → verifies email and mobile (OTP) → account becomes Active automatically, unless risk screening flags a possible duplicate.
- **Seller:** registers and receives a provisional SEL or BUS ID → verifies email and mobile → uploads documents → admin approves → payout account is verified by the provider → seller becomes **Active**. Every listing is still approved separately; trusted-seller auto-approval is optional and admin-controlled.
- **Online purchase:** checkout creates a *pending* payment → the provider's **signed webhook** confirms it → stock is decremented → buyer confirms receipt → Sale is approved → commission is generated → the seller payout is scheduled, net of commission.
- **Cars, property and other high-value categories:** buyers enquire only, with no online checkout → seller reports the sale with the buyer's ID and final price → buyer confirms → admin approves → commission is approved → invoice issued → admin marks it paid. Sellers can never mark their own invoices paid.
- **Refunds and cancellations** reverse the sale and commission and cancel any unpaid payout.
- **Promotions:**
  1. The seller requests a campaign, optionally linked to an approved product.
  2. Automated compliance checks run, followed by an admin legal-review checkbox and approval.
  3. Tickets are allocated atomically, with sequential numbers unique per campaign.
  4. When sales close, the entry register is locked: its hash is recorded and a seed commitment is published.
  5. The admin runs the draw: `SHA256(seed:eligibleHash) mod count`.
  6. Five integrity checks run → the result is published (immutable) → participants are notified.
  7. Prize delivery is recorded.
  8. Date changes are extension requests that need admin approval. Participants are notified, and the original date stays in the audit history.
- **Draw triggers:** Mode A is a fixed date. Mode B is sold-out, available only when the platform rule is enabled.
- **Separate ledgers:** product payments and ticket payments are kept apart (`Payment.ledger`) in every report and export.

## ⚠️ Before going live

The full step-by-step hosting guide and launch checklist is in **[DEPLOY.md](DEPLOY.md)**. In short:

1. **Legal advice (SRS §17).** Paid ticket campaigns are **off** by default (`paid_draws_enabled`), and paid entry is blocked in VIC and NSW (`paid_entry_blocked_states`). Get Australian gaming and trade-promotion advice before changing either. The Terms, Privacy, Refund and Responsible Participation pages are **placeholders** that a lawyer must write.
2. **Stripe.** The Stripe Connect adapter has **not yet been run against a Stripe account**. Test it end to end in Stripe test mode before taking real money.
3. **Email and SMS** are logged only. Connect a provider in `src/lib/notify.ts` (`deliver`).
4. **Single instance.** The rate limiter is in memory and uploads are on a disk volume. Run one app instance, or move to Redis and object storage first.

## Not yet built (SRS Phase 4 / follow-ups)

Mobile app, seller subscriptions, paid featured listings and advertising (admins can mark listings featured), multi-language, an AI description writer (the current generator is deterministic and only uses the seller's own specifications), password reset, and a live Stripe Connect test.
