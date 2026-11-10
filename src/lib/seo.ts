import "server-only";
import { brand } from "@/config/brand";
import { getSettings } from "./settings";

/** SEO settings for the root layout. Falls back to defaults if the database isn't reachable (e.g. during the Docker build). */
export async function seoSettings() {
  try {
    const s = await getSettings();
    const gtm = /^GTM-[A-Z0-9]{4,12}$/.test(s.seo_gtm_container_id.trim()) ? s.seo_gtm_container_id.trim() : null;
    return {
      title: s.seo_home_title || `${brand.name} — ${brand.tagline}`,
      description: s.seo_home_description || brand.description,
      google: s.seo_google_site_verification.trim() || null,
      bing: s.seo_bing_site_verification.trim() || null,
      gtm,
      crawlers: { oaiSearch: s.crawler_allow_oai_searchbot === "true", gptBot: s.crawler_allow_gptbot === "true", googleExtended: s.crawler_allow_google_extended === "true" },
    };
  } catch {
    return { title: `${brand.name} — ${brand.tagline}`, description: brand.description, google: null, bing: null, gtm: null, crawlers: { oaiSearch: true, gptBot: false, googleExtended: false } };
  }
}
