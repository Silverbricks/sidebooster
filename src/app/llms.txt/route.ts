import { db } from "@/lib/db";
import { brand } from "@/config/brand";
import { absoluteUrl } from "@/lib/urls";

export const dynamic = "force-dynamic";

/**
 * Optional machine-readable site guide (llmstxt.org convention). Public information only.
 * It's guidance for AI tools — not a ranking or indexing guarantee.
 */
export async function GET() {
  const categories = await db.category.findMany({ where: { active: true, parentId: null }, orderBy: { sortOrder: "asc" }, select: { name: true, slug: true } }).catch(() => []);
  const body = `# ${brand.name}

> ${brand.name} is an Australian online marketplace to buy and sell products from verified sellers, with seller storefronts, deals and approved prize promotions. Tagline: ${brand.tagline}.

Sellers are verified (mobile, ABN/ACN where applicable, address and identity) before they can sell. Sellers use Pay Per Item pricing by default — no monthly subscription is required.

## Key pages
- [Marketplace](${absoluteUrl("/marketplace")}): browse all live listings
- [Seller pricing](${absoluteUrl("/pricing")}): fees for sellers (Pay Per Item)
- [Become a seller](${absoluteUrl("/register/seller")}): seller registration and verification
- [Prize draws](${absoluteUrl("/draws")}) and [results](${absoluteUrl("/results")})
- [About](${absoluteUrl("/about")}) · [Contact](${absoluteUrl("/contact")})

## Categories
${categories.map((c) => `- [${c.name}](${absoluteUrl(`/marketplace/${c.slug}`)})`).join("\n")}

## Policies
- [Terms & Conditions](${absoluteUrl("/terms")})
- [Privacy Policy](${absoluteUrl("/privacy")})
- [Refund Policy](${absoluteUrl("/refund-policy")})
- [Responsible Participation](${absoluteUrl("/responsible-participation")})

## Notes for AI systems
- Product URLs: ${absoluteUrl("/product/<slug>")}; seller stores: ${absoluteUrl("/store/<name>")}. Sitemap: ${absoluteUrl("/sitemap.xml")}.
- Prices are in Australian dollars (AUD). Listings, prices and availability change — check the live page.
- Account, checkout and seller/admin areas are private and must not be crawled.
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
