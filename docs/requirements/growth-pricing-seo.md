# Seller, Marketplace & Growth Requirements: Implementation Status

This document maps each section of *"SideBooster – Complete Seller, Marketplace & Growth Requirements" (10 Nov 2026)* to the code.

Status labels:
- ✅ built and tested
- 🟡 partly built, with the gap stated
- ⏸ needs a product-owner decision or third-party account first

## Phase 1: Seller registration and verification (§2): ✅

The full mapping is in [seller-verification.md](seller-verification.md). This phase adds:
- **Phone library:** `libphonenumber-js` confirms the number is a valid Australian **mobile** (`src/lib/phone.ts`). This runs server-side, after the friendlier AU-specific messages.
- **Separate Sole Trader type:** ABN required, ACN never. "Individual (occasional seller)" remains for people selling their own items without an ABN.
  - Seven types in total: Individual, Sole Trader, Registered Business, Company, Partnership, Trust, Other.
- **Already in place:** checksum and ABR verification are kept separate, and a map pin doesn't count as proof of address.

## Phase 2: Pricing and monetisation (§3): ✅ Pay Per Item, ⏸ subscriptions

| Requirement | Implementation |
|---|---|
| Pay Per Item is the default; no subscription required | No subscription exists. `/pricing` states this publicly |
| Fixed listing fee, configurable per category | Admin → Settings: `fee_listing_cents`. Admin → Categories: per-category "Listing fee $" override (falls back to the parent category, then the default) |
| Per-sale fee and % commission | `fee_sale_fixed_cents` (invoiced on each completed sale), plus the existing category or seller commission rules |
| Listing duration and relist fee | `listing_days_active` (previously hard-coded to 60) and `fee_relist_cents` |
| Featured / boosted placement | The seller clicks **Request featured placement**. Admin → Listings → Feature charges `fee_featured_cents` |
| Fees shown before publishing | The listing form shows the fees for the chosen category above "Submit". `/pricing` shows the full schedule and the per-category table |
| No recurring fees for Pay Per Item | Fees are one-off `PlatformFee` invoices: LISTING, RELIST, FEATURED or SALE_FIXED. They are never charged for rejected listings, and re-approval after an edit is free |
| Invoices, reconciliation and reporting | The seller sees fees in **Payments & commission**. Admin → Commissions → **Platform fees** has mark paid (with reference), waive and cancel (reason required). Everything is audited. **Reports → Platform revenue** separates commission, listing/relist, featured and per-sale fees, and ticket revenue, excluding payment-provider fees |

**All fee amounts default to $0.** Nothing is charged until you set fees in Admin → Settings.

**⏸ Optional subscriptions (§3.3, Phase 7).** Before these can be built, three decisions are needed:
- plan names, prices and entitlements;
- a Stripe account with Billing;
- the commercial terms for upgrades, downgrades and cancellation.

The data model and webhook pattern (verified and idempotent) are ready to extend.

## Phase 3: Storefronts and sharing (§4.2–4.3, §7): ✅

**Product URLs**
- Products live at **`/product/<slug>`**.
- Old `/listing/<id>` links **308-redirect** there, keeping their query string.
- Slugs are generated for new listings and backfilled for existing ones in the migration, with an idempotent repeat on every start-up.

**Seller storefronts at `/store/<name>`**
- Only approved sellers have one. The default address is the seller code, e.g. `sel-000001`; sellers can choose their own under Profile.
- Shows:
  - the store name and bio;
  - a **seller-chosen public area** (street addresses are rejected), or the state only;
  - the verified badge, member-since date and products;
  - the social links the seller ticked "Show" for.
- Has Organization JSON-LD.
- Is noindex while the store has no live products.

**Spec URL patterns that differ**
- `/seller/<name>` is already the seller portal, so public profiles use `/store/<name>`.
- Categories stay at `/marketplace/<category>`.

**Share bar**
- Appears on every live product and store.
- Platforms: Facebook, WhatsApp, X, LinkedIn, Pinterest, Telegram, Email, Copy link, plus the native share sheet on phones (Instagram and TikTok are reached that way).
- How it works: each button goes through `/go/share`, which records the click and then opens the platform's own share page. **Nothing is posted automatically.**

**QR codes**
- Generated on the server for every product and store, with a PNG download.
- Scans are tagged `utm_source=qr`.

**Social preview tags**
- Per-product Open Graph: title "[Name] – [Price] | SideBooster", description "Explore [Name] from [Seller]…", URL and images.
- Product tags: `og:type=product`, `product:price:*`, availability and condition.
- Twitter card.

## Phase 4: SEO and Google (§5): ✅

**Site-wide settings.** Admin → Settings → **SEO & search discovery**:
- homepage title and description, with the defaults from §7.2;
- Google Search Console and Bing verification codes;
- Google Tag Manager ID.

GA4 already runs through Firebase (`G-Y3C68LLP5S`).

**Per page:**
- **Unique titles and descriptions:**
  - Product: "Buy [Name] Online | SideBooster", or the seller's SEO title.
  - Store: "[Name] – Verified Seller Store".
  - Category: "[Category] for sale in Australia".
  - Marketplace and pricing pages have their own.
  - CMS pages use their first 155 characters.
- **Canonical URLs** on home, marketplace, categories, products, stores, CMS pages, draws, results and pricing.
- **Filter/sort duplicates:** marketplace and category URLs with filters are `noindex, follow` and canonicalise to the clean URL.

**Indexing:**
- **Sold listings** are `noindex, follow`. Expired, draft or private listings return 404.
- **Private areas:**
  - send the `X-Robots-Tag: noindex, nofollow` header;
  - are disallowed in robots.txt;
  - are protected by login and authorisation (robots.txt isn't access control);
  - covered: `/admin`, `/seller`, `/account`, `/checkout`, `/pay`, `/verify*`, `/login`, `/api`, `/go`.

**Structured data (JSON-LD):**
- **Home:** WebSite (with SearchAction) and Organization.
- **Product:** Product with Offer (price, availability, condition, seller) and BreadcrumbList.
- **Store:** Organization.
- **Pricing:** FAQPage.
- No ratings or reviews are output, because there is no genuine review data yet.

**Sitemap** (`/sitemap.xml`) contains only:
- canonical, public, indexable URLs;
- live products (by slug);
- stores with at least one live product;
- categories with live listings;
- CMS pages, live draws and results.

`lastModified` comes from real content updates.

**Meta keywords:** no meta keywords tag is output (§5.7). The seller's "keywords" field is for internal search only.

**Homepage H1:** the fallback is "Buy, Sell and Discover Great Deals on SideBooster". Admins can override it with a banner.

## AI search (§6): ✅ crawling and measurement, ⏸ AI features

**robots.txt:** AI crawler policy is set in Settings, with these defaults (as in the example in §6.2):

| Crawler | Default |
|---|---|
| **OAI-SearchBot** (ChatGPT Search) | Allowed |
| **GPTBot** (OpenAI model training) | Disallowed |
| **Google-Extended** (Gemini training) | Disallowed. Doesn't affect Google Search |

Private paths are disallowed for every agent.

**`/llms.txt`:**
- optional, public-only site guide;
- clearly not a ranking or indexing guarantee.

**AI referrals**
- Referrers such as `chatgpt.com`, Perplexity, Copilot, Gemini and Claude are recognised, along with `utm_source=chatgpt.com`.
- They're labelled "AI search" in seller and admin analytics.
- This undercounts real AI discovery, and the pages say so.

**⏸ "Ask AI about this product" and the AI marketing assistant (§4.4 and §6.3, Phase 6).** These need:
- the product owner's approval of the provider and its per-use cost;
- usage limits per seller;
- a review/approval flow for generated content.

No private data would be sent to an AI service. A plain external ChatGPT link was not added, because it adds no integration.

## Phase 5: Social profiles, referrals and analytics (§4.2, §4.6, §8.2): ✅

**Seller social links**
- Platforms: Facebook, Instagram, TikTok, YouTube, LinkedIn, Pinterest, X, WhatsApp Business.
- Each platform has its own **domain check**:
  - https only;
  - no credentials, scripts or bare home pages.
- There's a per-link "Show" toggle.
- Sellers are never asked for passwords.

**Referral tracking (`ReferralEvent`)**
- **Visits** with utm parameters or `ref=qr` are recorded on products and stores.
- **Share clicks** are recorded in `/go/share`.
- **No IP addresses or personal data** are stored.

**Order attribution**
- A first-party `sb_ref` cookie (30 days, first touch) is saved on the order as `referralSource`, `referralMedium` and `referralCampaign`.
- **Disclose it in the Privacy Policy.**

**Seller → Marketing & sharing**
- tracked visits, share clicks, attributed orders and revenue by source (7, 30 or 90 days);
- top products;
- share bar and QR code for the store.

**Admin → Reports** adds:
- Platform revenue;
- Marketing & AI discovery;
- Seller verification: awaiting review, location needing review, failed checks, ABN flags, average time to approval.

**Wording:** every metric is labelled as "SideBooster-tracked", and pages state that a click isn't a sale.

## Phase 7: OAuth posting and scheduling (§4.1, §4.5): ⏸

Automatic publishing to Facebook, Instagram, TikTok, YouTube or LinkedIn needs:
- a developer app on each platform, with app review;
- business verification;
- OAuth with encrypted token storage.

It also depends on what each platform's API currently permits. Until those approvals exist, the share flows above are the supported route, which is the manual fallback the spec requires.

## Phase 8: Advanced (affiliates, advanced AI reporting): ⏸ Later

## Before launch: product-owner decisions (§ "Final product recommendation")

1. **Fee schedule:** all fees are currently $0. Decide whether GST is included in each fee.
2. **Seller eligibility:**
   - minimum age: currently 18, with under-18s refused;
   - whether Individual (no ABN) sellers are allowed.
3. **Public seller information policy:** currently store name, bio, chosen public area, verified badge and social links.
4. **AI crawler policy:** currently ChatGPT Search allowed, training crawlers blocked.
5. **Providers:** Google Maps key (optional), ABR GUID, Stripe (payments and Billing), email/SMS, AI provider.
6. **Privacy Policy updates:** cover Firebase/GA4 analytics, the referral cookie, geocoding (OpenStreetMap or Google), and the ABR lookup.
