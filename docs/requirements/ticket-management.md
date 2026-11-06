# Ticket management

## Campaigns

A campaign (promotion) is requested by a seller with draw permission. It can be linked to an approved product listing as the prize.

| Field | Notes |
|---|---|
| Ticket type | `FREE` or `PAID`. **Never mixed** in one campaign |
| Ticket price | Paid campaigns only |
| Total tickets, max per buyer | Enforced at allocation |
| Sales open / close, draw date, time zone | Shown on the public page; changed only by an approved extension |
| Draw mode | **A:** fixed date. **B:** sold-out trigger (only if `rule_sold_out_trigger_allowed`) |
| Prize, prize value, delivery details, terms, minimum age, eligible states | Shown publicly |
| Permit number (where required) | Compliance |

**Statuses:** `DRAFT → PENDING_APPROVAL → APPROVED → SALES_CLOSED` (register locked) `→ DRAW_COMPLETED → WINNER_ANNOUNCED → COMPLETED` (prize delivered), plus `REJECTED`, `CANCELLED` and `SUSPENDED`. The public status (Upcoming / Open / Sales closed / Drawn) is derived from the dates.

## Approval

- Automated compliance checks (`campaignComplianceProblems`):
  - paid draws globally enabled;
  - seller permission;
  - terms present;
  - dates in order;
  - a linked listing that is approved;
  - blocked states for paid entry.
- The admin must tick a **legal-review confirmation** and approve the initial draw schedule.

## Allocation

- **Free tickets** are claimed straight away (`claimFreeTickets`).
- **Paid tickets** are allocated only after the payment webhook confirms payment (`startTicketCheckout` → webhook).
- Ticket numbers are sequential and zero-padded (e.g. `00042`), and **unique per campaign**. This is enforced by a database constraint plus an atomic conditional capacity update, so concurrent claims can't oversell. This is tested.
- Each request carries an idempotency key, so a double-submit doesn't create duplicates.
- Bot protection: per-user rate limits and a honeypot field.

## Eligibility (`eligibilityProblems`)

A buyer can enter only if all of these hold:

- the account is Active;
- the email and mobile are verified;
- they meet the minimum age (date of birth);
- their state is eligible;
- **paid** entry is not blocked in their state (default `VIC,NSW`);
- the per-buyer limit isn't exceeded;
- sales are open.

## Customer view

- `/account/tickets`: every ticket number, grouped by campaign.
- `/account/draws`: entered promotions and results.
- Ticket payments are kept in a **separate ledger** from product payments (`Payment.ledger = TICKET`).

## Refunds

Paid tickets are refundable until sales close and the register is locked, or automatically if the campaign is cancelled.

## Legal (SRS §17)

`paid_draws_enabled` defaults to **false**. Do not enable it without Australian legal advice for each state. A software setting cannot make an otherwise unlawful lottery legal.
