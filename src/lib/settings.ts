import { brand } from "@/config/brand";
import { db, type Tx } from "./db";

/**
 * Platform settings + the central Approval Engine rules. Everything here is editable by the
 * Super Admin at /admin/settings, so business rules change without code changes.
 */
export const DEFAULT_SETTINGS = {
  site_name: brand.name,
  support_email: brand.supportEmail,
  default_commission_bps: "500",
  commission_invoice_due_days: "14",
  payment_expiry_minutes: "30",
  max_tickets_per_order: "50",

  // Pay Per Item seller pricing (cents; 0 = free). Category listing-fee overrides are set per category.
  fee_listing_cents: "0",
  fee_relist_cents: "0",
  fee_featured_cents: "0",
  fee_sale_fixed_cents: "0",
  listing_days_active: "60",

  // SEO & discovery
  seo_home_title: "SideBooster – Buy & Sell Online in Australia | Deals & Products",
  seo_home_description: "Discover SideBooster, an online marketplace to buy and sell products in Australia. Explore deals, discover sellers, list products and shop online.",
  seo_google_site_verification: "",
  seo_bing_site_verification: "",
  seo_gtm_container_id: "",
  crawler_allow_oai_searchbot: "true",
  crawler_allow_gptbot: "false",
  crawler_allow_google_extended: "false",

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
  crawler_allow_oai_searchbot: ["Allow ChatGPT Search (OAI-SearchBot)", "Lets public pages appear in ChatGPT search results. Doesn't guarantee inclusion."],
  crawler_allow_gptbot: ["Allow GPTBot (OpenAI model training)", "Separate from ChatGPT Search. Off = public pages aren't used to train OpenAI models."],
  crawler_allow_google_extended: ["Allow Google-Extended (Gemini training)", "Doesn't affect Google Search ranking or indexing."],
};

export async function getSettings(): Promise<Record<SettingKey, string>> {
  const rows = await db.setting.findMany();
  const out = { ...DEFAULT_SETTINGS } as Record<SettingKey, string>;
  for (const r of rows) if (r.key in out) out[r.key as SettingKey] = r.value;
  return out;
}

/**
 * Pass the transaction client when calling from inside db.$transaction: using the global `db` there
 * needs a second pooled connection and can deadlock the pool under concurrent load.
 */
export async function getSetting(key: SettingKey, client: Tx = db) {
  const row = await client.setting.findUnique({ where: { key } });
  return row?.value ?? DEFAULT_SETTINGS[key];
}

export async function getBool(key: SettingKey, client: Tx = db) {
  return (await getSetting(key, client)) === "true";
}

export async function getNumber(key: SettingKey, client: Tx = db) {
  return Number(await getSetting(key, client));
}

export async function getList(key: SettingKey, client: Tx = db) {
  return (await getSetting(key, client)).split(",").map((s) => s.trim()).filter(Boolean);
}
