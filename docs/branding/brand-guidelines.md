# SideBooster — Brand guidelines

| | |
|---|---|
| **Name** | SideBooster (one word, capital S and capital B) |
| **Tagline** | Shop • Tickets • Win. Write it in uppercase (`SHOP • TICKETS • WIN`) in logos and banners. |
| **Website** | https://sidebooster.com |
| **Support** | support@sidebooster.com |
| **Platform type** | Product marketplace and prize draw platform |
| **Primary users** | Platform Admin, Sellers and Customers |

## Positioning

SideBooster is an online marketplace where sellers list products and customers can buy them, or obtain tickets for a chance to win products in scheduled prize draws.

Short description, used in metadata and social sharing:

> Discover products, special offers and exciting prize draws.

Product categories we talk about:

- Cars and motor vehicles
- Properties and real estate
- Mobile phones and electronics
- Luxury products
- Home and lifestyle
- General merchandise

## Single source of truth

The name, tagline, domains, emails and colours are defined **once** in [`src/config/brand.ts`](../../src/config/brand.ts). The code never hard-codes the brand name. Use:

- `brand.name`, `brand.tagline` and so on in code;
- `<Logo />`, `<BrandName />` and `<BrandIcon />` from `src/components/branding/` in the UI.

## Colours

| Token | Hex | Use |
|---|---|---|
| Primary (violet 700) | `#6d28d9` | Buttons, links, "Booster" in the wordmark (`brand-600` in Tailwind) |
| Primary light (violet 500) | `#8b5cf6` | Gradients, highlights (`brand-500`) |
| Primary dark (violet 800) | `#5b21b6` | Hover states (`brand-700`) |
| Primary tint | `#f5f3ff` / `#ede9fe` | Backgrounds (`brand-50` / `brand-100`) |
| Accent (amber 500) | `#f59e0b` | The "boost" chevron, highlights, win moments (`accent-500`) |
| Ink | `#0f172a` | Text, "Side" in the wordmark |
| Muted | `#64748b` | Secondary text, the tagline on light backgrounds |

Tailwind tokens live in `src/app/globals.css` (`@theme`). Keep them in sync with `brand.colors`.

## Typography

- **Inter** (loaded via `next/font`), falling back to the system UI font.
- The wordmark uses weight 800 (extra bold) with slightly tight tracking.
- The tagline uses uppercase, weight 700, wide letter-spacing.

## Voice

- Clear, friendly, trustworthy. Say "verified sellers", "published draw method" and "your tickets".
- Never promise winning. Say "a chance to win", never "guaranteed".
- Promotions always carry "18+" and point to the terms and the Responsible Participation page.
- Australian English: colour, organise, licence (noun).

## Legal reminders for brand copy

- Paid ticket draws are **off** until Australian legal advice is obtained (`paid_draws_enabled`). Don't advertise paid tickets before then. "Tickets" in the tagline covers free-entry promotions too.
- Every promotion must show its terms, draw date, prize details and eligibility.
