# Deploying SideBooster

SideBooster ships as one Docker image. Each time the container starts it:

1. applies database migrations (`prisma migrate deploy`);
2. runs the safe bootstrap (`npm run bootstrap`): it adds the default categories and pages and creates the first Super Admin if none exists, and **never deletes data**;
3. starts the server on `$PORT` (default 3000).

It needs **PostgreSQL**, a **persistent volume mounted at `/data`** for photos and private seller documents, **HTTPS**, and a **scheduler** that calls the cron endpoint every 5 minutes.

> **Vercel and Netlify are not suitable as-is**, because uploads go to local disk. Use a host that runs containers with volumes: Railway, Render, Fly.io, DigitalOcean App Platform or a VPS. Choose an **Australian region** (Sydney) for latency and data-residency expectations.

---

## 1. Prepare the environment variables

Generate the secrets:

```bash
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('CRON_SECRET=' + require('crypto').randomBytes(24).toString('base64url'))"
```

| Variable | Value |
|---|---|
| `DATABASE_URL` | Postgres connection string from your host, e.g. `postgresql://user:pass@host:5432/db?sslmode=require` |
| `APP_URL` | `https://your-domain.com.au` (no trailing slash) |
| `ENCRYPTION_KEY` | 64 hex characters (above). **Back it up**: encrypted fields cannot be read without it. |
| `CRON_SECRET` | Random string (above) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_MOBILE` | First deploy only. Mobile format is `+614XXXXXXXX`; password is 12+ characters. **Remove `ADMIN_PASSWORD` after the first start.** |
| `PAYMENT_PROVIDER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | When you're ready for payments (step 5) |
| `ALLOW_TEST_PAYMENTS` | `true` **only on a staging site**. Never on the live site. |

The server refuses to start in production if `DATABASE_URL`, `APP_URL`, `CRON_SECRET` or `ENCRYPTION_KEY` is missing or invalid (see `src/instrumentation.ts`).

## 2a. Option A: Railway or Render (managed, easiest)

1. Push this repo to GitHub.
2. Create a new project from the GitHub repo. The host detects the `Dockerfile`.
3. Add a **PostgreSQL** database and copy its connection URL into `DATABASE_URL`.
4. Add a **volume/disk mounted at `/data`**, at least 5 GB to start.
5. Set the variables from step 1.
6. Set the health check path to `/api/health`.
7. Deploy, then check the logs for `Created Super Admin ADM-000001`.
8. Add your custom domain. The host provides the HTTPS certificate.
9. **Cron:** add a cron job (Railway "Cron" service / Render "Cron Job") running every 5 minutes:
   ```bash
   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com.au/api/cron/tick
   ```
   A free alternative is a GitHub Actions scheduled workflow, or cron-job.org with the same header.
10. Remove `ADMIN_PASSWORD` from the variables and redeploy.

## 2b. Option B: your own VPS (Docker Compose)

On an Ubuntu server with Docker installed:

```bash
git clone <your-repo-url> sidebooster && cd sidebooster
cp .env.example .env.production      # fill in step-1 values; DATABASE_URL is set by compose
export POSTGRES_PASSWORD='<strong password>'
docker compose --profile app up -d --build
docker compose logs -f app            # look for "Created Super Admin"
```

This runs Postgres, the app on port 3000 and the 5-minute cron caller. Put **Caddy** or nginx in front for HTTPS:

```
# /etc/caddy/Caddyfile
your-domain.com.au {
  reverse_proxy 127.0.0.1:3000
  request_body {
    max_size 120MB
  }
}
```

To update: `git pull && docker compose --profile app up -d --build`.

## 3. Backups (required)

- **Database:** turn on daily automated backups with point-in-time recovery if available. On a VPS, run a daily cron job and copy the dump off the server:
  ```bash
  docker compose exec -T db pg_dump -U sidebooster sidebooster | gzip > backup-$(date +%F).sql.gz
  ```
- **Files:** snapshot the `/data` volume daily. It holds listing photos and private ID documents, so keep the backups encrypted.
- **`ENCRYPTION_KEY`:** store it in a password manager. Losing it makes encrypted fields unreadable.
- Test a restore once before launch.

## 4. Smoke test after the first deploy

1. Check that `https://your-domain/api/health` returns `{"ok":true}`.
2. Log in with the admin account.
3. In **/admin/settings**, review every approval rule. `paid_draws_enabled` stays **off**.
4. Register a test buyer. The email and SMS codes appear in **/admin/messages** until a provider is connected.
5. Register a test seller, approve them, create a listing and approve it.
6. Run one cron call by hand and confirm it returns 200.

## 5. Turn on real payments (Stripe Connect)

The Stripe adapter is written to Stripe's documented API but **has not yet been run against a Stripe account**. Do this on a **staging** deployment first.

1. In the Stripe dashboard (test mode), enable **Connect** (Express accounts) and set the business country to Australia.
2. Add a webhook endpoint `https://staging-domain/api/payments/webhook` with these events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.dispute.created`
   - `account.updated`
3. Set `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY=sk_test_…` and `STRIPE_WEBHOOK_SECRET=whsec_…`, and remove `ALLOW_TEST_PAYMENTS`.
4. Walk through the whole flow:
   - seller onboarding
   - a product purchase (card `4242 4242 4242 4242`)
   - a declined card (`4000 0000 0000 0002`)
   - a refund
   - the payout record
   - the commission

   Fix anything that differs from your expectations.
5. Repeat with live keys on production.

## 6. Launch checklist

- [ ] **Legal (SRS §17):** Australian legal advice obtained on the promotions model, state permits and paid entry. `paid_draws_enabled` and `paid_entry_blocked_states` set only per that advice.
- [ ] Terms, Privacy Policy, Refund Policy and Responsible Participation pages rewritten by a lawyer (edit in **/admin/cms**).
- [ ] Contact details on the Contact page updated.
- [ ] Email and SMS provider connected in `src/lib/notify.ts` → `deliver()`. Until then, verification codes only appear in /admin/messages.
- [ ] Stripe tested end to end in test mode (step 5), then live keys set.
- [ ] `ALLOW_TEST_PAYMENTS` **not set** on production.
- [ ] `ADMIN_PASSWORD` removed after the first start.
- [ ] Daily database and volume backups running, and one restore tested.
- [ ] Cron running every 5 minutes. Check that `/admin/campaigns` closes sales on schedule.
- [ ] HTTPS on the custom domain, with `APP_URL` matching it exactly.
- [ ] Uptime monitor on `/api/health`.
- [ ] **One app instance only**, until the rate limiter moves to Redis and uploads move to object storage (S3/R2 with a private bucket for documents).

## Local production test

```bash
docker compose up -d db
docker build -t sidebooster .
docker run --rm -p 3000:3000 --env-file .env \
  -e DATABASE_URL=postgresql://sidebooster:sidebooster@host.docker.internal:5432/sidebooster \
  -e APP_URL=http://localhost:3000 -e ALLOW_TEST_PAYMENTS=true sidebooster
```
