/**
 * Central brand configuration — the ONLY place the product name, tagline and domains are defined.
 * Import `brand` instead of hard-coding the name anywhere in the app, emails or exports.
 */
export const brand = {
  name: "SideBooster",
  legalName: "SideBooster", // replace with the registered entity name (e.g. "SideBooster Pty Ltd") once known
  domain: "sidebooster.com",
  url: "https://sidebooster.com",
  tagline: "Shop • Tickets • Win",
  description: "Discover products, special offers and exciting prize draws.",
  longDescription:
    "SideBooster is an Australian online marketplace where verified sellers list products and customers can shop, enter scheduled prize draws and win.",
  supportEmail: "support@sidebooster.com",
  noReplyEmail: "no-reply@sidebooster.com",
  /** Planned production hosts (see docs/technical/deployment.md). The current app serves all of them from one deployment. */
  hosts: {
    public: "sidebooster.com",
    publicAlias: "www.sidebooster.com",
    portal: "app.sidebooster.com",
    api: "api.sidebooster.com",
  },
  colors: {
    primary: "#6d28d9", // violet-700
    primaryLight: "#8b5cf6",
    accent: "#f59e0b", // amber-500 — the "boost"
    ink: "#0f172a",
  },
} as const;

export type Brand = typeof brand;
