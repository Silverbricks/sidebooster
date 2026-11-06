# SideBooster — Admin guide

> **Security:** never commit real passwords, API keys or the `.env` file to git. Real credentials belong in your hosting provider's environment variables and in a password manager.

## 1. Demo accounts (local and staging only)

These are created by `npm run setup` / `npm run db:seed`. The demo seed **wipes the database** and refuses to run when `NODE_ENV=production`, so these accounts never exist on the live site.

| Role | Email | Password | Platform ID |
|---|---|---|---|
| Super Admin | `admin@sidebooster.test` | `Password123` | ADM-000001 |
| Seller (active, free draws allowed) | `seller@sidebooster.test` | `Password123` | SEL-000001 |
| Business seller (under review) | `business@sidebooster.test` | `Password123` | BUS-000001 |
| Buyer (QLD) | `buyer@sidebooster.test` | `Password123` | BUY-000001 |
| Buyer (NSW) | `buyer2@sidebooster.test` | `Password123` | BUY-000002 |

Admin login: `http://localhost:3000/login` → then `/admin`.

## 2. Creating the real Super Admin (production)

The live site starts with **no** accounts. On the first deploy, set these environment variables on your host:

| Variable | Example |
|---|---|
| `ADMIN_EMAIL` | `you@yourdomain.com.au` |
| `ADMIN_PASSWORD` | 12+ characters, unique; store it in a password manager |
| `ADMIN_MOBILE` | `+614XXXXXXXX` |
| `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME` | optional |

When the container starts, `npm run bootstrap` creates the admin account (ID `ADM-000001`) only if no admin exists yet. The logs show `Created Super Admin ADM-000001 <email>`.

**Then remove `ADMIN_PASSWORD` from the host's variables and redeploy.** Running the bootstrap again never changes an existing admin.

To create the admin by hand instead, run this from a machine that can reach the database:

```bash
DATABASE_URL="postgresql://..." ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_MOBILE=+614... npm run bootstrap
```

## 3. First things to do after logging in

1. **`/admin/settings`**: review every rule in the approval engine:
   - `paid_draws_enabled`: leave **off** until legal advice is obtained (SRS §17).
   - `paid_entry_blocked_states`: default `VIC,NSW`.
   - Listing approval, trusted-seller auto-approval, sale approval, sold-out draw trigger, payment expiry, default commission (500 bps = 5%).
2. **`/admin/cms`**:
   - Replace the placeholder Terms, Privacy, Refund and Responsible Participation pages with lawyer-approved text.
   - Update the Contact page and the home-page banners.
3. **`/admin/categories`** and **`/admin/commissions/rules`**: check the categories, fields and commission rates.

## 4. Day-to-day admin tasks

| Task | Where |
|---|---|
| Everything waiting on you | `/admin/approvals` |
| Approve a seller: check documents, ABN/ACN, then approve. The seller becomes Active once their payout account is verified | `/admin/sellers/[id]` |
| Approve or reject listings | `/admin/listings` |
| Approve offers and coupons | `/admin/offers` |
| Approve offline (car/property) sales after the buyer confirms | `/admin/sales` |
| Approve, adjust, waive or reverse commission (a reason is required) | `/admin/commissions` |
| Mark commission invoices paid when the money arrives | `/admin/commissions/invoices` |
| Review refunds | `/admin/refunds` |
| Approve campaigns (tick the legal-review box) and date extensions | `/admin/campaigns` |
| **Run a draw**: Lock register → Run draw → Verify → Publish → Mark prize delivered | `/admin/campaigns/[id]` |
| See verification codes and emails (until an email/SMS provider is connected) | `/admin/messages` |
| Investigate who did what | `/admin/audit` |
| Export CSVs (payments, commissions, tickets, audit) | `/admin/reports` |

## 5. Secrets and where they live

| Secret | Where to keep it | Notes |
|---|---|---|
| `ENCRYPTION_KEY` | Host env vars and a password manager | **Losing it makes encrypted fields unreadable.** Never change it on a live site. |
| `CRON_SECRET` | Host env vars, plus the scheduler that calls `/api/cron/tick` | |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Host env vars | Use test keys on staging first |
| Database password | Host / database provider | |
| Admin password | Password manager only | Remove `ADMIN_PASSWORD` from env after the first start |

## 6. Account recovery

Password reset is not built yet (Phase 4). If an admin loses their password, a developer can reset it directly in the database: hash the new password with bcrypt (cost 12) and update `User.passwordHash`. Every admin should keep their password in a password manager.
