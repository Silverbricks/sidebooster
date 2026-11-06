import "server-only";
import crypto from "node:crypto";
import { appUrl } from "./notify";

/**
 * Provider-independent payment interface. The application never decides that a payment
 * succeeded from the browser — only a signature-verified provider webhook can do that
 * (see src/app/api/payments/webhook/route.ts → handleWebhook).
 *
 * Providers:
 *  - "test":   built-in simulated gateway for development (default)
 *  - "stripe": Stripe Checkout + Stripe Connect (separate charges & transfers). Enable by setting
 *              PAYMENT_PROVIDER=stripe, STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.
 */

export type CheckoutInput = {
  paymentId: string;
  amount: number;
  currency: string;
  description: string;
  customerEmail: string;
  ledger: "PRODUCT" | "TICKET";
  successPath: string;
  cancelPath: string;
};

export type WebhookOutcome = {
  eventId: string;
  type: string;
  paymentId?: string;
  providerRef?: string;
  status?: "SUCCEEDED" | "FAILED" | "DISPUTED" | "REFUNDED";
  method?: string;
  failureReason?: string;
  account?: { providerAccountId: string; chargesEnabled: boolean; payoutsEnabled: boolean; restricted: boolean };
};

export interface PaymentProvider {
  name: string;
  createCheckout(input: CheckoutInput): Promise<{ redirectUrl: string; providerRef?: string }>;
  /** Verify signature and translate a raw webhook into a normalised outcome. Throws on bad signature. */
  parseWebhook(rawBody: string, headers: Headers): Promise<WebhookOutcome | null>;
  refund(providerRef: string, amount: number): Promise<{ refundRef: string }>;
  createConnectedAccount(input: { email: string; businessType: "individual" | "company"; sellerProfileId: string }): Promise<{ providerAccountId: string }>;
  onboardingLink(providerAccountId: string, returnPath: string): Promise<string>;
  transfer(providerAccountId: string, amount: number, reference: string): Promise<{ transferRef: string }>;
}

// ---------------------------------------------------------------- test provider

const TEST_SECRET = () => process.env.TEST_WEBHOOK_SECRET || process.env.ENCRYPTION_KEY || "dev-test-secret";

export function signTestEvent(body: string) {
  return crypto.createHmac("sha256", TEST_SECRET()).update(body).digest("hex");
}

const testProvider: PaymentProvider = {
  name: "test",
  async createCheckout(input) {
    return { redirectUrl: `/pay/${input.paymentId}` };
  },
  async parseWebhook(rawBody, headers) {
    const sig = headers.get("x-test-signature") ?? "";
    const expected = signTestEvent(rawBody);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error("Invalid signature");
    return JSON.parse(rawBody) as WebhookOutcome;
  },
  async refund(providerRef) {
    return { refundRef: `test_re_${providerRef}` };
  },
  async createConnectedAccount({ sellerProfileId }) {
    return { providerAccountId: `test_acct_${sellerProfileId}` };
  },
  async onboardingLink(providerAccountId, returnPath) {
    return `/seller/payouts/test-onboarding?account=${encodeURIComponent(providerAccountId)}&return=${encodeURIComponent(returnPath)}`;
  },
  async transfer(_acct, _amount, reference) {
    return { transferRef: `test_tr_${reference}` };
  },
};

// ---------------------------------------------------------------- Stripe (Connect) provider
// Uses the Stripe REST API directly. NOTE: written against Stripe's documented API but not yet
// exercised against a live Stripe account — test end-to-end in Stripe test mode before launch.

async function stripe(path: string, params: Record<string, string>, idempotencyKey?: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: new URLSearchParams(params),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path}: ${json?.error?.message ?? res.status}`);
  return json;
}

function verifyStripeSignature(rawBody: string, header: string, secret: string, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  const v1 = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !v1.length || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return v1.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

const stripeProvider: PaymentProvider = {
  name: "stripe",
  async createCheckout(i) {
    const session = await stripe(
      "checkout/sessions",
      {
        mode: "payment",
        customer_email: i.customerEmail,
        client_reference_id: i.paymentId,
        "metadata[paymentId]": i.paymentId,
        "metadata[ledger]": i.ledger,
        "payment_intent_data[metadata][paymentId]": i.paymentId,
        "payment_intent_data[transfer_group]": i.paymentId,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": i.currency.toLowerCase(),
        "line_items[0][price_data][unit_amount]": String(i.amount),
        "line_items[0][price_data][product_data][name]": i.description,
        success_url: appUrl(i.successPath),
        cancel_url: appUrl(i.cancelPath),
      },
      `checkout_${i.paymentId}`,
    );
    return { redirectUrl: session.url, providerRef: session.id };
  },
  async parseWebhook(rawBody, headers) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !verifyStripeSignature(rawBody, headers.get("stripe-signature") ?? "", secret)) throw new Error("Invalid signature");
    const evt = JSON.parse(rawBody);
    const o = evt.data?.object ?? {};
    switch (evt.type) {
      case "checkout.session.completed":
        if (o.payment_status !== "paid") return { eventId: evt.id, type: evt.type };
        return { eventId: evt.id, type: evt.type, paymentId: o.metadata?.paymentId, providerRef: o.payment_intent, status: "SUCCEEDED", method: "card" };
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired":
        return { eventId: evt.id, type: evt.type, paymentId: o.metadata?.paymentId, status: "FAILED", failureReason: evt.type };
      case "charge.dispute.created":
        return { eventId: evt.id, type: evt.type, providerRef: o.payment_intent, status: "DISPUTED" };
      case "account.updated":
        return {
          eventId: evt.id,
          type: evt.type,
          account: {
            providerAccountId: o.id,
            chargesEnabled: !!o.charges_enabled,
            payoutsEnabled: !!o.payouts_enabled,
            restricted: (o.requirements?.disabled_reason ?? null) !== null,
          },
        };
      default:
        return { eventId: evt.id, type: evt.type };
    }
  },
  async refund(providerRef, amount) {
    const r = await stripe("refunds", { payment_intent: providerRef, amount: String(amount) });
    return { refundRef: r.id };
  },
  async createConnectedAccount({ email, businessType, sellerProfileId }) {
    const a = await stripe(
      "accounts",
      {
        type: "express",
        country: "AU",
        email,
        business_type: businessType,
        "capabilities[transfers][requested]": "true",
        "metadata[sellerProfileId]": sellerProfileId,
      },
      `acct_${sellerProfileId}`,
    );
    return { providerAccountId: a.id };
  },
  async onboardingLink(providerAccountId, returnPath) {
    const l = await stripe("account_links", {
      account: providerAccountId,
      type: "account_onboarding",
      refresh_url: appUrl("/seller/payouts"),
      return_url: appUrl(returnPath),
    });
    return l.url;
  },
  async transfer(providerAccountId, amount, reference) {
    const t = await stripe("transfers", { amount: String(amount), currency: "aud", destination: providerAccountId, transfer_group: reference }, `transfer_${reference}`);
    return { transferRef: t.id };
  },
};

/** True when the simulated gateway may be used. Never enable on a live site — it moves no real money. */
export function testPaymentsAllowed() {
  return process.env.PAYMENT_PROVIDER !== "stripe" && (process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_PAYMENTS === "true");
}

export function paymentProvider(): PaymentProvider {
  if (process.env.PAYMENT_PROVIDER === "stripe") return stripeProvider;
  if (!testPaymentsAllowed()) throw new Error("No payment provider configured. Set PAYMENT_PROVIDER=stripe (or ALLOW_TEST_PAYMENTS=true on a non-live environment).");
  return testProvider;
}
