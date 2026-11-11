import type { MetadataRoute } from "next";
import { seoSettings } from "@/lib/seo";

// read APP_URL + crawler policy at request time (the Docker image is built before the domain is known)
export const dynamic = "force-dynamic";

const PRIVATE = ["/admin", "/seller", "/account", "/api", "/pay", "/checkout", "/verify", "/verify-email", "/login", "/go", "/forgot-password", "/forgot-username", "/forgot-email", "/reset-password", "/verify-email-change"];

/**
 * Crawl guidance only — robots.txt is not access control; private pages are protected by login/authorisation
 * and also send X-Robots-Tag: noindex. AI crawler policy is set by the admin (Settings → SEO).
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const { crawlers } = await seoSettings();
  const rule = (userAgent: string, allowed: boolean) => (allowed ? { userAgent, allow: "/", disallow: PRIVATE } : { userAgent, disallow: "/" });
  return {
    rules: [
      rule("OAI-SearchBot", crawlers.oaiSearch), // ChatGPT Search discovery
      rule("GPTBot", crawlers.gptBot), // OpenAI model training (separate decision)
      rule("Google-Extended", crawlers.googleExtended), // Gemini training; doesn't affect Google Search
      { userAgent: "*", allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
