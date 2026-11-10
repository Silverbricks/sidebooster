// Public URL helpers. Product pages live at /product/<slug>; /listing/<id> permanently redirects there.

import { slugify } from "./format";

export const siteUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const absoluteUrl = (path: string) => `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;

export const productPath = (l: { slug: string | null; id: string }) => (l.slug ? `/product/${l.slug}` : `/listing/${l.id}`);
export const storePath = (sp: { storeSlug: string | null; sellerCode: string }) => `/store/${sp.storeSlug ?? sp.sellerCode.toLowerCase()}`;

/** New listing slug: readable title + random suffix so it's unique without a lookup and never reveals the DB id. */
export function newListingSlug(title: string) {
  const base = slugify(title) || "item";
  const rnd = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 6);
  return `${base}-${rnd}`;
}

const RESERVED_STORE_SLUGS = new Set(["admin", "api", "seller", "sellers", "store", "stores", "account", "login", "register", "help", "support", "sidebooster", "official", "new", "edit"]);

/** Seller-chosen storefront address: 3–40 chars, a–z, 0–9 and hyphens. Returns the problem or null. */
export function storeSlugProblem(slug: string) {
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/.test(slug)) return "Store address must be 3–40 characters: lower-case letters, numbers and hyphens (not at the start or end).";
  if (slug.includes("--")) return "Store address can't contain double hyphens.";
  if (RESERVED_STORE_SLUGS.has(slug)) return "That store address is reserved.";
  return null;
}

/** Adds UTM parameters for share links (first-party attribution). */
export function withUtm(url: string, source: string, medium = "social", campaign = "share") {
  const u = new URL(url);
  u.searchParams.set("utm_source", source);
  u.searchParams.set("utm_medium", medium);
  u.searchParams.set("utm_campaign", campaign);
  return u.toString();
}
