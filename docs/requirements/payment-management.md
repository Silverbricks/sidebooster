# Payment management

## Principles

- **Only a verified payment-provider webhook confirms payment.** The customer's browser never decides that a payment succeeded.
- **Separate ledgers:** `Payment.ledger` is `PRODUCT` or `TICKET`, and they are kept apart in every report and export.
- Money is stored as **integer cents (AUD)**. Rates are stored in **basis points**.

## Provider

The provider-independent interface is in `src/lib/payment-provider.ts`.

| Provider | Use |
|---|---|
| `test` | Simulated gateway with HMAC-signed events. Development and staging only. It refuses to run in production unless `ALLOW_TEST_PAYMENTS=true` |
| `stripe` | Stripe Checkout and Connect (`PAYMENT_PROVIDER=stripe`). The webhook is verified with `STRIPE_WEBHOOK_SECRET`. **Not yet tested against a live Stripe account.** |

## Flow

1. **Checkout** creates an `Order` (`PENDING_PAYMENT`) and a `Payment` (`PENDING`), using an idempotency key. The payment expires after `payment_expiry_minutes`.
2. The customer pays on the provider's page.
3. The **webhook** (`/api/payments/webhook`) is signature-checked and stored in `WebhookEvent`. Its unique id protects against replays.
   - On **success:** the payment is `SUCCEEDED`, the order is `PAID`, stock is decremented and offer usage recorded, or tickets are allocated.
   - On **failure:** the payment is `FAILED` and the order is cancelled. Abandoned checkouts are set to `CANCELLED` by the cron after `payment_expiry_minutes`.
   - If stock or tickets have run out after payment, the payment is **refunded automatically**.
4. The seller fulfils the order and the buyer confirms receipt (`COMPLETED`).
5. A **Sale** is created and approved, and **commission** is generated.

Payment statuses: `PENDING`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `UNDER_REVIEW`, `REFUND_REQUESTED`, `PARTIALLY_REFUNDED`, `REFUNDED`, `DISPUTED`, `CANCELLED`.

## High-value sales (cars, property)

There is no online checkout. The seller reports the sale (buyer ID and final price), the buyer confirms, and an admin approves. Commission is then **invoiced** (`CommissionInvoice`), and the admin marks it paid when the money arrives.

## Commission

- Suggested defaults:
  - general 5%;
  - cars 1%;
  - property 0.5%;
  - machinery 3%.
- The rate is resolved in this order:
  1. seller-specific rule;
  2. category;
  3. parent category;
  4. the `default_commission_bps` setting.
- The rate is generated only on **approved** sales.
- Statuses: `PENDING_APPROVAL → GENERATED → INVOICED → PAID` (or `OVERDUE`), plus `WAIVED`, `REVERSED` and `REJECTED`. Adjustments keep the status and record the old and new amounts and the reason.
- Admins can approve, adjust, waive or reverse commission, **always with a reason** that is audit-logged.
- Online sales pay out to the seller **net of commission** (`Payout`).

## Refunds

- The customer requests a refund, the admin approves or rejects it, and the refund goes through the provider.
- A refund **reverses the sale's commission** and cancels any unpaid payout.

## Reports

- `/admin/payments`, `/admin/payouts`, `/admin/refunds` and `/admin/reports`.
- CSV exports at `/api/admin/export/{payments,commissions,tickets,audit}`.
- A monthly seller statement at `/api/seller/statement`.
