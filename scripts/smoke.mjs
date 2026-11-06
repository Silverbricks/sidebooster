// Smoke test: creates sessions directly in the dev DB, then GETs every page per role.
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

const BASE = "http://localhost:3100";
const db = new PrismaClient();
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

async function session(email) {
  const u = await db.user.findUniqueOrThrow({ where: { email } });
  const token = crypto.randomBytes(32).toString("base64url");
  await db.session.create({ data: { tokenHash: sha(token), userId: u.id, expiresAt: new Date(Date.now() + 3600_000) } });
  return `se_session=${token}`;
}

for (let i = 0; i < 60; i++) {
  try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 1000)); }
}

const listing = await db.listing.findFirst({ where: { status: "ACTIVE", allowCheckout: true } });
const car = await db.listing.findFirst({ where: { title: { contains: "RAV4" } } });
const campaign = await db.campaign.findFirst({ where: { slug: "win-a-dell-xps-15" } });
const due = await db.campaign.findFirst({ where: { slug: "win-a-weekend-getaway" } });
const sellerProfile = await db.sellerProfile.findFirst({ where: { sellerCode: "BUS-000001" } });
const ticket = await db.ticket.findFirst({ where: { buyer: { email: "buyer@selleasy.test" } } });

const pages = {
  anon: ["/", "/marketplace", "/marketplace/cars-vehicles", "/marketplace/mobile-phones?a_brand=Apple", "/marketplace?q=iphone&min=100&sort=price_asc", `/listing/${listing.id}`, `/listing/${car.id}`, "/draws", "/draws?tab=upcoming", "/draws?tab=previous", `/draws/${campaign.slug}`, "/results", `/results/${due.slug}`, "/about", "/contact", "/terms", "/privacy", "/refund-policy", "/responsible-participation", "/register", "/register/seller", "/login", "/sitemap.xml", "/robots.txt"],
  buyer: ["/account", "/account/orders", "/account/payments", "/account/tickets", `/account/tickets/${ticket.id}`, "/account/draws", "/account/enquiries", "/account/sales", "/account/wishlist", "/account/notifications", `/checkout/${listing.id}`, `/draws/${campaign.slug}`, "/verify"],
  seller: ["/seller", "/seller/verification", "/seller/payouts", "/seller/listings", "/seller/listings/new", `/seller/listings/${listing.id}`, "/seller/offers", "/seller/orders", "/seller/enquiries", "/seller/sales", "/seller/commissions", "/seller/campaigns", "/seller/campaigns/new", `/seller/campaigns/${campaign.id}`, "/seller/profile"],
  admin: ["/admin", "/admin/approvals", "/admin/users", "/admin/users?role=BUYER", "/admin/sellers", `/admin/sellers/${sellerProfile.id}`, "/admin/categories", `/admin/categories?edit=${car.categoryId}`, "/admin/listings", "/admin/listings?status=ACTIVE", "/admin/offers", "/admin/orders", "/admin/sales", "/admin/commissions", "/admin/commissions/invoices", "/admin/commissions/rules", "/admin/payouts", "/admin/payments", "/admin/refunds", "/admin/campaigns", `/admin/campaigns/${campaign.id}`, `/admin/campaigns/${due.id}`, "/admin/draws", "/admin/reports", "/admin/cms", "/admin/settings", "/admin/audit", "/admin/messages", "/api/admin/export/payments", "/api/admin/export/commissions", `/api/admin/export/tickets?campaign=${campaign.id}`],
};
const cookies = { anon: "", buyer: await session("buyer@selleasy.test"), seller: await session("seller@selleasy.test"), admin: await session("admin@selleasy.test") };

let fail = 0;
let ok = 0;
for (const [role, list] of Object.entries(pages)) {
  for (const p of list) {
    const res = await fetch(BASE + p, { headers: { cookie: cookies[role] }, redirect: "manual" });
    const body = await res.text();
    const bad = res.status >= 400 || /Application error|Internal Server Error|Unhandled Runtime Error/.test(body);
    if (bad) { fail++; console.log(`✘ [${role}] ${p} → ${res.status}`); } else ok++;
    if (res.status >= 300 && res.status < 400) console.log(`↪ [${role}] ${p} → ${res.status} ${res.headers.get("location")}`);
  }
}
// access control checks
const checks = [
  ["anon → /admin redirects to login", "", "/admin", (r) => r.status >= 300 && r.status < 400 && r.headers.get("location")?.includes("/login")],
  ["buyer → /admin is denied", cookies.buyer, "/admin", (r) => r.status >= 300 && r.status < 400 && !r.headers.get("location")?.includes("/admin")],
  ["buyer → admin export forbidden", cookies.buyer, "/api/admin/export/payments", (r) => r.status === 403],
  ["seller → /admin is denied", cookies.seller, "/admin/settings", (r) => r.status >= 300 && r.status < 400],
  ["anon → private document 401", "", "/api/documents/x", (r) => r.status === 401],
  ["webhook rejects unsigned", "", "/api/payments/webhook", (r) => r.status === 400, "POST"],
  ["cron requires secret", "", "/api/cron/tick", (r) => r.status === 401],
  ["upload path traversal blocked", "", "/api/uploads/..%2F.env", (r) => r.status === 404],
];
for (const [name, cookie, path, pred, method] of checks) {
  const r = await fetch(BASE + path, { method: method ?? "GET", headers: { cookie }, redirect: "manual", body: method === "POST" ? "{}" : undefined });
  if (pred(r)) ok++; else { fail++; console.log(`✘ ${name} (got ${r.status} ${r.headers.get("location") ?? ""})`); }
}
const cron = await fetch(`${BASE}/api/cron/tick`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
console.log("cron:", cron.status, await cron.text());
await db.session.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() + 2 * 3600_000) } } });
console.log(`\n${ok} passed, ${fail} failed`);
await db.$disconnect();
process.exit(fail ? 1 : 0);
