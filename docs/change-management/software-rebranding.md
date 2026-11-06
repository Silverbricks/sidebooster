# Change record: rebrand to SideBooster

| | |
|---|---|
| **Change** | Rename the platform (previously "SellEasy") to **SideBooster**, tagline **Shop • Tickets • Win**, domain **sidebooster.com** |
| **Date** | 2026-11-06 |
| **Type** | Branding only. No business logic, routes, database tables or columns changed |
| **Verification** | Typecheck ✓ · lint ✓ · 21 business-rule tests ✓ · production build ✓ · 91 page and access-control smoke checks ✓, 0 server errors · rendered HTML contains no old name |

## 1. What changed

### Central brand configuration (new)

| File | Purpose |
|---|---|
| `src/config/brand.ts` | **Single source of truth**: name, legal name, domain, URL, tagline, descriptions, support and no-reply emails, planned hosts, colours |
| `src/components/branding/Logo.tsx` | Icon and wordmark, optional tagline; used in the header and footer |
| `src/components/branding/BrandName.tsx` | Styled "Side**Booster**" wordmark |
| `src/components/branding/Favicon.tsx` | `BrandIcon`: the SVG brand icon as a React component |

### Logos, icons and images (new or replaced)

| File | Status |
|---|---|
| `scripts/generate-brand-assets.mjs` | New: generates every file below from one definition |
| `assets/logos/sidebooster-icon.svg`, `sidebooster-logo.svg`, `sidebooster-logo-dark.svg`, `sidebooster-logo.png` | New |
| `assets/icons/icon-{16,32,48,180,192,512}.png` | New |
| `assets/banners/social-share-1200x630.{svg,png}` | New |
| `assets/email-templates/base.html` | New: branded HTML email layout, for when an email provider is connected |
| `src/app/favicon.ico` | **Replaced**: the default Next.js icon became the SideBooster icon (16/32/48 px) |
| `src/app/icon.svg`, `src/app/apple-icon.png`, `src/app/opengraph-image.png` | New (Next.js picks these up automatically) |
| `public/logo.svg` | New |

### Application code (modified)

| File | Change |
|---|---|
| `src/app/layout.tsx` | Title, description, application name, Open Graph and Twitter metadata, and theme colour all come from `brand` |
| `src/app/globals.css` | Brand palette changed from blue to SideBooster violet, plus new `accent-*` amber tokens |
| `src/components/SiteHeader.tsx` | Uses `<Logo />` |
| `src/components/SiteFooter.tsx` | Brand block (logo, tagline, description); copyright uses `brand.legalName` and `brand.domain` |
| `src/lib/settings.ts` | Defaults for `site_name` and `support_email` come from `brand` |
| `src/lib/notify.ts` | Every email ends with the SideBooster signature (team, tagline, domain, support email) |
| `src/lib/accounts.ts` | SMS verification text |
| `src/app/actions/auth.ts` | Email verification subject and body |
| `src/app/actions/admin.ts` | Listing-approved notification |
| `src/app/api/seller/statement/route.ts` | Seller statement CSV header |
| `src/app/checkout/[id]/page.tsx`, `src/app/draws/page.tsx`, `src/app/pay/[id]/page.tsx` | Customer-facing text |
| `src/app/seller/page.tsx`, `seller/profile`, `seller/verification`, `seller/commissions`, `seller/sales`, `seller/campaigns`, `seller/campaigns/new` | Seller dashboard text |

### Data, tests and infrastructure (modified)

| File | Change |
|---|---|
| `prisma/seed-data.ts` | About page text (SideBooster positioning and categories); contact email `support@sidebooster.com` |
| `prisma/seed.ts` | Demo accounts are now `*@sidebooster.test`; welcome notification |
| `prisma/schema.prisma` | Header comment only, so **no migration is needed** |
| `scripts/test-flows.ts`, `scripts/smoke.mjs` | Demo account emails |
| `package.json` | Package name `sidebooster`; test database URL |
| `.env.example`, `docker-compose.yml`, `docker/initdb/01-test-db.sql`, `.github/workflows/ci.yml` | Local and CI Postgres user and database `selleasy` → `sidebooster` (development only; production uses the host's own `DATABASE_URL`) |
| `Dockerfile`, `DEPLOY.md`, `README.md`, `docs/ABOUT.md`, `docs/URLS.md`, `docs/ADMIN.md` | Name and demo emails |

### Documentation (new)

The `docs/branding/`, `docs/requirements/` (6 files) and `docs/technical/` (4 files) folders, plus this record.

## 2. Deliberately NOT changed (backward compatibility)

| Item | Why |
|---|---|
| Database tables, columns, keys, relations | Brief §6. No data migration needed |
| Session cookie name `se_session` | Renaming it would sign out every user. Purely internal |
| URL paths and API routes | Brief §5. Bookmarks, webhooks and integrations keep working |
| Platform ID prefixes (`BUY-`, `SEL-`, `BUS-`, `ADM-`), order and receipt formats | Permanent identifiers already issued |
| Historic `AuditLog` / `DrawAuditLog` entries | Audit records are never rewritten; the draw log is hash-chained |
| Third-party packages and integrations (Next.js, Prisma, Stripe…) | Brief §2 |
| Unused Next.js sample files in `public/` (`next.svg`, `vercel.svg`…) | Brief §10: don't delete source files |
| Category names | Business data, not branding. To match the brand list (e.g. add "Luxury products", "Home and lifestyle"), edit `/admin/categories`. No code change needed |
| Project folder name on disk (`selleasynew`) | Local only. The GitHub repository is already `sidebooster` |

## 3. Not applicable yet

| Brief item | Status |
|---|---|
| PDF documents and invoices | The app has no PDF output yet; invoices are on-screen and CSV, and both are rebranded |
| Mobile apps (§7) | Not built (Phase 4). Icon and splash guidance is in `docs/branding/logo-specification.md` |
| Monorepo folders `apps/*`, `packages/*`, `pnpm-workspace.yaml` (§3) | Not created: splitting the working app would be a re-architecture, not a rebrand. The mapping is in `docs/technical/architecture.md` |
| `app.` / `api.` subdomains (§8) | Documented in `docs/technical/deployment.md`. One deployment serves all hosts |
| OAuth redirect URLs | No OAuth is used |

## 4. Steps for an existing deployment

No live deployment existed at the time of this change. If one exists later:

1. Back up the database and the `/data` volume.
2. Deploy. No migration runs, because the schema is unchanged.
3. In `/admin/settings`, set `site_name` = SideBooster and `support_email` = support@sidebooster.com, if they were saved with old values.
4. In `/admin/cms`, update the About and Contact pages and the banners.
5. Set `APP_URL=https://sidebooster.com`, update the Stripe webhook URL and statement descriptor, and update DNS (see `docs/technical/deployment.md`).
6. Test login, checkout, a free ticket claim and a draw on staging, then promote to production.

## 5. Local developer action

The local database is now `sidebooster`, so update `DATABASE_URL` in `.env` (see `.env.example`), then:

```bash
npm run db:up && npm run setup
```

Demo logins are now `admin@sidebooster.test` and so on, with password `Password123`.
