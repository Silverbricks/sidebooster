import { db } from "./db";

/**
 * Platform settings + the central Approval Engine rules. Everything here is editable by the
 * Super Admin at /admin/settings, so business rules change without code changes.
 */
export const DEFAULT_SETTINGS = {
  site_name: "SellEasy",
  support_email: "support@selleasy.example",
  default_commission_bps: "500",
  commission_invoice_due_days: "14",
  payment_expiry_minutes: "30",
  max_tickets_per_order: "50",

  // promotions / legal (SRS §17). Paid draws stay OFF until Australian legal advice is obtained.
  paid_draws_enabled: "false",
  free_draws_enabled: "true",
  paid_entry_blocked_states: "VIC,NSW",

  // approval engine
  rule_buyer_require_mobile: "true",
  rule_seller_require_documents: "true",
  rule_seller_require_payout_account: "true",
  rule_listing_require_approval: "true",
  rule_trusted_seller_auto_approve: "false",
  rule_offer_require_approval: "true",
  rule_online_sale_auto_approve: "true",
  rule_offline_sale_require_buyer_confirm: "true",
  rule_offline_sale_require_admin: "true",
  rule_sold_out_trigger_allowed: "false",
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;

export const SETTING_LABELS: Partial<Record<SettingKey, [string, string]>> = {
  rule_buyer_require_mobile: ["Buyers must verify mobile (OTP)", "Buyer account becomes Active only after email + mobile verification."],
  rule_seller_require_documents: ["Sellers must upload verification documents", "Identity / business documents required before admin review."],
  rule_seller_require_payout_account: ["Sellers need a verified payout account to sell", "Approved sellers become Active only once the payment provider enables payouts."],
  rule_listing_require_approval: ["Listings require admin approval", "Every listing goes to the approval queue before publishing."],
  rule_trusted_seller_auto_approve: ["Trusted sellers skip listing approval", "Only applies to sellers an admin has marked Trusted."],
  rule_offer_require_approval: ["Offers & discounts require admin approval", ""],
  rule_online_sale_auto_approve: ["Auto-approve completed online sales", "Commission is generated automatically when a paid online order is completed."],
  rule_offline_sale_require_buyer_confirm: ["Reported (offline) sales need buyer confirmation", "Used for cars, property and other high-value categories."],
  rule_offline_sale_require_admin: ["Reported (offline) sales need admin approval", ""],
  rule_sold_out_trigger_allowed: ["Allow sold-out draw trigger", "Only enable if your approved campaign terms permit drawing on sell-out."],
  paid_draws_enabled: ["Enable paid ticket campaigns", "Keep OFF until Australian gaming/trade-promotion legal advice confirms the model."],
  free_draws_enabled: ["Enable free-entry campaigns", ""],
};

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const rows = await db.setting.findMany();
  const out = { ...DEFAULT_SETTINGS } as Record<SettingKey, string>;
  for (const r of rows) if (r.key in out) out[r.key as SettingKey] = r.value;
  return out;
}

export async function getSetting(key: SettingKey) {
  const row = await db.setting.findUnique({ where: { key } });
  return row?.value ?? DEFAULT_SETTINGS[key];
}

export async function getBool(key: SettingKey) {
  return (await getSetting(key)) === "true";
}

export async function getNumber(key: SettingKey) {
  return Number(await getSetting(key));
}

export async function getList(key: SettingKey) {
  return (await getSetting(key)).split(",").map((s) => s.trim()).filter(Boolean);
}
