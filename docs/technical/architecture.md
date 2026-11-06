# Architecture

SideBooster is **one Next.js 15 application** that serves the public website, the customer dashboard, the seller and admin portals, and the backend (server actions and API routes). It uses PostgreSQL through Prisma.

```
Browser ──HTTPS──▶ Next.js (App Router)
                    ├─ Server components (pages)        src/app/**/page.tsx
                    ├─ Server actions (forms)           src/app/actions/*.ts
                    ├─ API routes (webhooks, cron, CSV) src/app/api/**/route.ts
                    └─ Domain logic                     src/lib/*.ts
                                                          │
                              Prisma ─────────────────────┴──▶ PostgreSQL
                              Disk volume /data ─────────────▶ photos, private documents
Stripe ──signed webhook──▶ /api/payments/webhook
Scheduler ──every 5 min──▶ /api/cron/tick
```

## Repository layout and the recommended structure

The rebranding brief proposes a monorepo layout (`apps/frontend-users`, `apps/frontend-providers`, `apps/backend`, `apps/mobile-*`, `packages/*`, pnpm workspaces). The brief also says *"preserve existing working application code"* and *"do not rebuild existing features unnecessarily"*. Splitting the working app into several apps would be a re-architecture, not a rebrand, so the app stays in one package. Each recommended folder maps to its current location below:

| Recommended | Where it lives today | Notes |
|---|---|---|
| `apps/frontend-users` | `src/app/(public pages)`, `src/app/account` | Public site and customer dashboard |
| `apps/frontend-providers` | `src/app/seller`, `src/app/admin` | Seller and admin portals |
| `apps/backend` | `src/app/actions`, `src/app/api`, `src/lib` | Server actions, API routes, domain logic |
| `apps/mobile-customer`, `apps/mobile-admin` | not built | SRS Phase 4 |
| `packages/ui` | `src/components`, `src/components/branding` | Shared UI and brand components |
| `packages/config` | `src/config/brand.ts`, `src/lib/settings.ts`, `next.config.ts` | Brand and platform configuration |
| `packages/types` | `prisma/schema.prisma` (generated types), `src/lib/constants.ts` | |
| `packages/validation` | `src/lib/ids.ts`, `src/lib/uploads.ts`, form checks in `src/lib/*` | |
| `packages/shared` | `src/lib/format.ts`, `src/lib/time.ts`, `src/lib/crypto.ts` | |
| `docs/`, `assets/`, `scripts/` | same | Created as specified |
| `tests/` | `scripts/test-flows.ts`, `scripts/smoke.mjs` | Run with `npm run test:flows` and `npm run test:smoke` |
| `pnpm-workspace.yaml` | not used | The project uses npm (`package-lock.json`). Switching package managers isn't needed for a rebrand |

**When to split:** when the mobile apps are built (Phase 4), move to `apps/web` + `apps/mobile-*` + `packages/*`, and expose the domain logic in `src/lib` as a versioned REST API on `api.sidebooster.com`. The `src/lib` modules are already free of UI code, which makes that move straightforward.

## Key modules (`src/lib`)

| Module | Responsibility |
|---|---|
| `auth.ts` | Sessions (httpOnly cookie, SHA-256-hashed token), role guards |
| `accounts.ts` | Buyer and seller verification lifecycle, OTP, risk screening |
| `settings.ts` | Platform settings and the approval engine |
| `payments.ts`, `payment-provider.ts` | Checkout, webhooks, refunds; test and Stripe providers |
| `commission.ts` | Rates, sales, commission records, invoices, payouts |
| `offers.ts` | Offers and coupons |
| `campaigns.ts` | Campaigns, eligibility, ticket allocation, lock/draw/verify/publish |
| `audit.ts` | General audit log and the hash-chained draw audit log |
| `notify.ts` | In-app notifications, email and SMS (logged until a provider is connected) |
| `uploads.ts` | Validated uploads (MIME type, size, magic bytes) |

## Branding

All brand values live in `src/config/brand.ts`. The UI components are in `src/components/branding/` (`Logo`, `BrandName`, `BrandIcon`). See [../branding/brand-guidelines.md](../branding/brand-guidelines.md).

## Security summary

- bcrypt password hashes, httpOnly SameSite cookies, and role checks on every page, action and route.
- AES-256-GCM encryption for sensitive fields (`ENCRYPTION_KEY`).
- Signed webhooks with replay protection; idempotency keys.
- Rate limiting and honeypots on forms. The limiter is in memory, so use a single instance or move to Redis.
- Security headers (HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy).
- The server refuses to start in production with an invalid configuration (`src/instrumentation.ts`).
