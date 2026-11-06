# SideBooster API

Most user actions are **Next.js server actions**: form posts handled in `src/app/actions/*.ts`, protected by the session cookie and role checks. They are not a public API.

The HTTP endpoints below are served by the same deployment. The planned public host is **`api.sidebooster.com`**, mapped to the same app. Until then, use the main domain, e.g. `https://sidebooster.com/api/health`.

All responses are JSON unless noted. Paths have **not** changed with the rebrand.

## `GET /api/health`

Liveness and readiness probe. It requires no authentication.

```json
200 {"ok": true, "time": "2026-11-06T09:59:49.926Z"}
503 {"ok": false, "error": "database unavailable"}
```

## `POST /api/payments/webhook`

Receives payment-provider events.

| Provider | Signature header | Secret |
|---|---|---|
| Stripe (`PAYMENT_PROVIDER=stripe`) | `Stripe-Signature` | `STRIPE_WEBHOOK_SECRET` |
| Test gateway (staging only) | `x-test-signature` (HMAC-SHA256 of the body) | `TEST_WEBHOOK_SECRET`, falling back to `ENCRYPTION_KEY` |

- Stripe events handled:
  - `checkout.session.completed`
  - `checkout.session.async_payment_failed`
  - `checkout.session.expired`
  - `charge.dispute.created`
  - `account.updated`
- Each event id is stored once, so replays are ignored.
- Responses: `200` when the event is processed or is a duplicate; `400` for an invalid signature; `500` if processing fails, so that the provider retries.

Stripe metadata: Checkout sessions carry `metadata.paymentId` (the internal `Payment.id`) and `metadata.ledger` (`PRODUCT`/`TICKET`), with the product or campaign name on the line item. The statement descriptor and payment description come from your Stripe account settings. Set them to **SIDEBOOSTER** in the Stripe dashboard.

## `GET /api/cron/tick`

The scheduled worker. Call it every 5 minutes.

```
Authorization: Bearer <CRON_SECRET>
```

```json
200 {"locked":0,"expiredPayments":0,"expiredListings":0,"overdue":0,"reminders":0}
401 {"error":"unauthorised"}
```

## `GET /api/uploads/{file}`

Serves public listing and campaign images. The file name is validated, and the response carries a long cache lifetime.

## `GET /api/documents/{id}`

Serves a private seller verification document. Only the owning seller and admins can fetch it; anyone else gets `404`.

## `GET /api/seller/statement?month=YYYY-MM`

The seller's monthly statement as **CSV**. Seller session required (otherwise `401`); a bad `month` returns `400`. The header row is `SideBooster seller statement, <month>, <seller code>, <legal name>`.

## `GET /api/admin/export/{kind}`

Admin only. Returns **CSV**. `kind` is one of `payments`, `commissions`, `tickets` or `audit`. Payments are split by ledger.

## Errors and auth

- Protected endpoints return `401`/`403`, or `404` where revealing that a resource exists would leak information.
- Sessions use the `se_session` httpOnly cookie. The name is **intentionally unchanged** by the rebrand, because renaming it would sign out every user.
