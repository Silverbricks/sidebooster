import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  experimental: {
    // listing photos (12 × 5MB) + optional video (50MB)
    serverActions: { bodySizeLimit: "120mb" },
  },
  poweredByHeader: false,
  async headers() {
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return [
      { source: "/:path*", headers: securityHeaders },
      ...["/admin/:path*", "/seller/:path*", "/account/:path*", "/checkout/:path*", "/pay/:path*", "/verify", "/verify-email", "/login", "/api/:path*", "/go/:path*"].map((source) => ({ source, headers: noindex })),
    ];
  },
};

export default nextConfig;
