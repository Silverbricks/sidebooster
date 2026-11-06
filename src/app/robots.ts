import type { MetadataRoute } from "next";

// read APP_URL at request time (the Docker image is built before the domain is known)
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/seller", "/account", "/api", "/pay", "/checkout", "/verify"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
