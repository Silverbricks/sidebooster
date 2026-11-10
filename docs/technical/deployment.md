# Deployment and domains

The full step-by-step hosting guide (Railway/Render or a VPS, backups, Stripe, launch checklist) is in **[/DEPLOY.md](../../DEPLOY.md)**. This page covers the SideBooster domain setup.

## Domains

| Application | Domain | How it's served today |
|---|---|---|
| Public website | `sidebooster.com` | The app (primary domain; set `APP_URL=https://sidebooster.com`) |
| Public website alias | `www.sidebooster.com` | **301 redirect** to `sidebooster.com`, set at DNS/host level |
| Seller/Admin portal | `app.sidebooster.com` | Same app. Point the domain at the same deployment; portal pages are `/seller` and `/admin` |
| Backend API | `api.sidebooster.com` | Same app. Point it at the same deployment; endpoints are under `/api` |

One deployment serves everything, so sessions, CSRF protection and webhooks work with no CORS or cross-domain cookie setup.

> **Recommendation:** launch on `sidebooster.com` + `www` only. Add `app.` and `api.` when there is a separate frontend or mobile app that needs them. Login cookies are set for the host the user logged in on, so a user who logs in on `sidebooster.com` is not logged in on `app.sidebooster.com`. Sharing a login across subdomains needs a cookie `domain=.sidebooster.com` change (`src/lib/auth.ts`). That change needs testing and is a separate, approved migration.

## DNS (example)

| Type | Name | Value |
|---|---|---|
| A / ALIAS / CNAME | `@` | your host's target (Railway/Render give a CNAME, a VPS gives an IP) |
| CNAME | `www` | same target. Configure the host to redirect `www` → apex |
| CNAME | `app`, `api` | same target (optional, see above) |
| TXT / MX | `@` | email provider records for `support@` and `no-reply@sidebooster.com` (SPF, DKIM, DMARC) |

SSL: managed hosts issue certificates automatically for each added domain. On a VPS, Caddy does it automatically (see DEPLOY.md).

## Settings to update for the new domain

| Where | Value |
|---|---|
| `APP_URL` env var | `https://sidebooster.com` (staging: e.g. `https://staging.sidebooster.com`) |
| Stripe webhook endpoint | `https://sidebooster.com/api/payments/webhook` |
| Stripe Connect redirect/refresh URLs | built from `APP_URL` automatically |
| Stripe statement descriptor | `SIDEBOOSTER` (Stripe dashboard → Settings → Public details) |
| Cron caller | `https://sidebooster.com/api/cron/tick` |
| Uptime monitor | `https://sidebooster.com/api/health` |
| Email provider | sender `no-reply@sidebooster.com`, reply-to `support@sidebooster.com` |
| `/admin/settings` | `site_name` = SideBooster, `support_email` = support@sidebooster.com |
| OAuth | none used today (email/password login only) |

## Staging and production

Keep two separate deployments, each with its own database, volume and secrets:

| | Staging | Production |
|---|---|---|
| Domain | `staging.sidebooster.com` | `sidebooster.com` |
| `ALLOW_TEST_PAYMENTS` | `true` (simulated gateway) or Stripe **test** keys | **unset**; Stripe **live** keys |
| Data | test data only | real data, daily backups |

Never point staging at the production database.

## Firebase Analytics

- Project `sidebooster-2a402`. The web config is in `src/config/firebase.ts`. It is public by design, so it is not a secret.
- `src/components/FirebaseAnalytics.tsx` is mounted in the root layout. It sends a `page_view` for each route, with these limits:
  - only on `sidebooster.com`;
  - never for `/admin`, `/account`, `/seller`, `/pay` or `/verify*`.
- The SDK is lazy-loaded through `src/lib/firebase.ts`. Use `track(name, params)` for custom events.
- Restrict the API key to `sidebooster.com` and `*.sidebooster.com` in Google Cloud Console → APIs & Services → Credentials.
- Mention Google Analytics in the Privacy Policy.
