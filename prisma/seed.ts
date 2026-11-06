/* Seed data for local development. Run: npm run db:seed (wipes and recreates demo data). */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const db = new PrismaClient();
const DAY = 86400_000;
const now = Date.now();

import { CATEGORIES, PAGES, type Attr } from "./seed-data";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error("Refusing to run the demo seed in production: it WIPES all data. Use `npm run bootstrap` instead.");
  }
  console.log("Resetting database…");
  const tables = [
    "drawAuditLog", "drawResult", "drawSchedule", "ticket", "payment", "refund", "ticketPurchase", "campaignImage", "campaign",
    "offerUsage", "offer", "payout", "commissionInvoice", "commissionRecord", "sale", "orderItem", "order", "enquiry", "wishlistItem",
    "listingAttribute", "listingImage", "listing", "commissionRule", "categoryAttribute", "sellerDocument", "paymentAccount", "sellerProfile",
    "notification", "auditLog", "session", "user", "category", "counter", "setting", "page", "banner", "messageLog", "webhookEvent", "contactMessage",
  ] as const;
  // refund references payment → delete refunds first
  await db.refund.deleteMany();
  for (const t of tables) await (db[t] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();

  // ---- categories, attributes, commission rules
  const catIds: Record<string, string> = {};
  let order = 0;
  for (const c of CATEGORIES) {
    const cat = await db.category.create({ data: { name: c.name, slug: c.slug, icon: c.icon, highValue: !!c.highValue, sortOrder: order++ } });
    catIds[c.slug] = cat.id;
    await createAttrs(cat.id, c.attrs);
    await db.commissionRule.create({ data: { categoryId: cat.id, rateBps: c.bps, effectiveFrom: new Date(now - 365 * DAY) } });
    let s = 0;
    for (const sub of c.subs ?? []) {
      const sc = await db.category.create({ data: { name: sub.name, slug: sub.slug, parentId: cat.id, sortOrder: s++, highValue: !!c.highValue } });
      catIds[sub.slug] = sc.id;
      await createAttrs(sc.id, sub.attrs ?? []);
    }
  }

  // ---- users
  const pw = await bcrypt.hash("Password123", 12);
  const verified = { emailVerifiedAt: new Date(), mobileVerifiedAt: new Date(), termsAcceptedAt: new Date(), accountStatus: "ACTIVE" };
  const admin = await db.user.create({ data: { publicId: "ADM-000001", email: "admin@selleasy.test", passwordHash: pw, firstName: "Super", lastName: "Admin", name: "Super Admin", mobile: "+61400000001", role: "ADMIN", ...verified } });
  const seller = await db.user.create({
    data: { publicId: "SEL-000001", email: "seller@selleasy.test", passwordHash: pw, firstName: "Sam", lastName: "Seller", name: "Sam Seller", mobile: "+61400000002", role: "SELLER", state: "QLD", postcode: "4000", dateOfBirth: new Date("1985-04-12"), ...verified },
  });
  const sp = await db.sellerProfile.create({
    data: { userId: seller.id, sellerCode: "SEL-000001", sellerType: "INDIVIDUAL", legalName: "Samuel Seller", address: "1 Queen St, Brisbane QLD 4000", state: "QLD", postcode: "4000", status: "ACTIVE", approvedById: admin.id, approvedAt: new Date(now - 30 * DAY), canRunFreeDraws: true, canRunPaidDraws: false, trustedSeller: false, bio: "Quality pre-owned tech and vehicles in Brisbane." },
  });
  await db.paymentAccount.create({ data: { sellerId: sp.id, provider: "test", providerAccountId: `test_acct_${sp.id}`, chargesEnabled: true, payoutsEnabled: true } });

  const biz = await db.user.create({
    data: { publicId: "BUS-000001", email: "business@selleasy.test", passwordHash: pw, firstName: "Bella", lastName: "Business", name: "Bella Business", mobile: "+61400000003", role: "SELLER", state: "NSW", postcode: "2000", ...verified },
  });
  await db.sellerProfile.create({
    data: { userId: biz.id, sellerCode: "BUS-000001", sellerType: "BUSINESS", legalName: "Harbour Motors Pty Ltd", businessName: "Harbour Motors", abn: "51824753556", authorisedRep: "Bella Business", address: "10 George St, Sydney NSW 2000", state: "NSW", postcode: "2000", status: "UNDER_REVIEW" },
  });

  const buyer = await db.user.create({
    data: { publicId: "BUY-000001", email: "buyer@selleasy.test", passwordHash: pw, firstName: "Bob", lastName: "Buyer", name: "Bob Buyer", mobile: "+61400000004", role: "BUYER", state: "QLD", postcode: "4101", suburb: "South Brisbane", dateOfBirth: new Date("1990-06-01"), ...verified },
  });
  const buyer2 = await db.user.create({
    data: { publicId: "BUY-000002", email: "buyer2@selleasy.test", passwordHash: pw, firstName: "Alice", lastName: "Nguyen", name: "Alice Nguyen", mobile: "+61400000005", role: "BUYER", state: "NSW", postcode: "2010", dateOfBirth: new Date("1994-11-20"), ...verified },
  });
  for (const [k, v] of [["ADM", 1], ["SEL", 1], ["BUS", 1], ["BUY", 2]] as const) await db.counter.create({ data: { key: k, value: v } });

  // ---- listings
  type L = { title: string; cat: string; sub?: string; price: number; desc: string; condition?: string; checkout?: boolean; qty?: number; status?: string; attrs?: Record<string, string>; delivery?: number; featured?: boolean };
  const LISTINGS: L[] = [
    { title: "2021 Toyota RAV4 GXL Hybrid", cat: "cars-vehicles", sub: "cars", price: 4299000, desc: "One owner, full Toyota service history, 52,000 km. Excellent condition inside and out.", attrs: { make: "Toyota", model: "RAV4 GXL", year: "2021", kilometres: "52000", fuel: "Hybrid", transmission: "Automatic", bodyType: "SUV", vin: "JTMW1RFV00D000000" }, featured: true },
    { title: "2018 Yamaha MT-07", cat: "cars-vehicles", sub: "motorcycles", price: 899000, desc: "LAMS approved, 18,400 km, new tyres.", attrs: { make: "Yamaha", model: "MT-07", year: "2018", kilometres: "18400", transmission: "Manual", engineCc: "689" } },
    { title: "3-bedroom family home, Carindale", cat: "property-real-estate", sub: "houses", price: 129500000, desc: "Renovated 3-bed, 2-bath home on 607 m² with double garage, close to schools and shops.", attrs: { propertyType: "House", saleType: "For sale", bedrooms: "3", bathrooms: "2", parking: "2", landSize: "607" }, featured: true },
    { title: "iPhone 15 Pro 256GB — Natural Titanium", cat: "mobile-phones", price: 129900, desc: "Like new, always in a case, 96% battery health. Box and cable included.", condition: "USED", checkout: true, qty: 1, delivery: 1500, attrs: { brand: "Apple", model: "iPhone 15 Pro", storage: "256GB", colour: "Natural Titanium", batteryHealth: "96", networkLock: "Unlocked" }, featured: true },
    { title: "Samsung Galaxy S24 128GB (New, sealed)", cat: "mobile-phones", price: 109900, desc: "Brand new, sealed. Australian stock with full warranty.", condition: "NEW", checkout: true, qty: 5, delivery: 1000, attrs: { brand: "Samsung", model: "Galaxy S24", storage: "128GB", networkLock: "Unlocked", warranty: "12 months manufacturer" } },
    { title: "Dell XPS 15 — i7, 32GB, 1TB", cat: "computers-laptops", price: 189900, desc: "13th gen i7, RTX 4050, 3.5K OLED. Great for creators.", checkout: true, qty: 2, delivery: 2000, attrs: { brand: "Dell", model: "XPS 15 9530", processor: "Intel i7-13700H", ram: "32GB", storage: "1TB SSD", graphics: "RTX 4050", screenSize: "15.6", os: "Windows" } },
    { title: "LG 65\" C3 OLED 4K Smart TV", cat: "electronics", sub: "tvs", price: 239900, desc: "Stunning picture, 18 months old, wall mount included.", checkout: true, qty: 1, delivery: 5000, attrs: { brand: "LG", model: "OLED65C3", screenSize: "65", resolution: "4K", display: "OLED", smart: "true" } },
    { title: "Sony WH-1000XM5 headphones", cat: "electronics", sub: "audio", price: 39900, desc: "Noise cancelling, barely used.", checkout: true, qty: 3, delivery: 900, attrs: { brand: "Sony", model: "WH-1000XM5" } },
    { title: "Solid oak 6-seater dining table", cat: "furniture-home-appliances", sub: "furniture", price: 85000, desc: "Handmade solid oak, 180×90 cm. Pick-up from Paddington.", attrs: { type: "Dining table", material: "Oak", dimensions: "180 × 90 × 76 cm", collection: "Pick-up only" } },
    { title: "Kubota mini excavator U17", cat: "machinery-equipment", price: 3450000, desc: "1.7 t mini excavator, 2,100 hours, 3 buckets.", attrs: { manufacturer: "Kubota", model: "U17-3", year: "2019", hours: "2100", capacity: "1.7 t" } },
    { title: "PS5 Slim + 2 controllers", cat: "electronics", sub: "gaming", price: 64900, desc: "Disc edition, 6 months old.", checkout: true, qty: 1, delivery: 1500, status: "PENDING", attrs: { brand: "Sony", model: "PS5 Slim" } },
    { title: "Draft: vintage leather jacket", cat: "other-products", sub: "fashion", price: 25000, desc: "Size M, brown.", status: "DRAFT", attrs: { size: "M", colour: "Brown", material: "Leather" } },
  ];
  const listingIds: string[] = [];
  for (const [i, l] of LISTINGS.entries()) {
    const status = l.status ?? "ACTIVE";
    const listing = await db.listing.create({
      data: {
        sellerId: seller.id, title: l.title, categoryId: catIds[l.cat], subcategoryId: l.sub ? catIds[l.sub] : null, description: l.desc, price: l.price, declaredValue: l.price,
        condition: l.condition ?? "USED", brand: l.attrs?.brand ?? l.attrs?.make ?? null, model: l.attrs?.model ?? null, location: "Brisbane", state: "QLD", postcode: "4000",
        allowCheckout: !!l.checkout, quantity: l.qty ?? 1, deliveryFee: l.delivery ?? 0, status, featured: !!l.featured,
        publishedAt: status === "ACTIVE" ? new Date(now - i * DAY) : null, expiresAt: status === "ACTIVE" ? new Date(now + 60 * DAY) : null,
        contactPhone: "0400 000 002",
      },
    });
    listingIds.push(listing.id);
    for (const [k, v] of Object.entries(l.attrs ?? {})) {
      const a = await db.categoryAttribute.findFirst({ where: { key: k, categoryId: { in: [catIds[l.cat], l.sub ? catIds[l.sub] : ""] } } });
      if (a) await db.listingAttribute.create({ data: { listingId: listing.id, attributeId: a.id, value: v } });
    }
  }

  // ---- offers
  await db.offer.create({ data: { sellerId: seller.id, name: "Buy 2+ save 10%", description: "Applies to Samsung Galaxy S24", listingId: listingIds[4], type: "PERCENT", value: 1000, minQuantity: 2, startsAt: new Date(now - DAY), endsAt: new Date(now + 30 * DAY), status: "APPROVED" } });
  await db.offer.create({ data: { sellerId: seller.id, name: "SAVE10 coupon", type: "FIXED", value: 1000, minSubtotal: 20000, couponCode: "SAVE10", startsAt: new Date(now - DAY), endsAt: new Date(now + 30 * DAY), status: "APPROVED", perBuyerLimit: 1 } });

  // ---- campaigns
  const open = await db.campaign.create({
    data: {
      slug: "win-a-dell-xps-15", sellerId: seller.id, listingId: listingIds[5], title: "Win a Dell XPS 15 laptop", description: "Free-entry promotion: claim a free ticket for your chance to win a brand-new Dell XPS 15.",
      prizeName: "Dell XPS 15 (i7, 32GB, 1TB)", prizeValue: 349900, prizeDelivery: "Shipped free to the winner anywhere in Australia within 14 days of the draw.", ticketType: "FREE", ticketPrice: 0,
      totalTickets: 500, maxPerBuyer: 5, salesOpenAt: new Date(now - 3 * DAY), salesCloseAt: new Date(now + 14 * DAY), drawAt: new Date(now + 15 * DAY), timezone: "Australia/Brisbane",
      terms: "Free entry. Open to Australian residents 18+. One prize. The winner is drawn using the platform's published verifiable random method and notified by email.", minAge: 18,
      status: "APPROVED", scheduleApproved: true, legalReviewConfirmed: true,
    },
  });
  await db.drawSchedule.create({ data: { campaignId: open.id, drawAt: open.drawAt, salesCloseAt: open.salesCloseAt, timezone: open.timezone, reason: "Initial schedule", status: "APPROVED", proposedById: seller.id, reviewedById: admin.id, reviewedAt: new Date() } });
  await seedTickets(open.id, [[buyer.id, 3], [buyer2.id, 2]], 500);

  const due = await db.campaign.create({
    data: {
      slug: "win-a-weekend-getaway", sellerId: seller.id, title: "Win a Gold Coast weekend getaway", description: "Two nights for two at a beachfront Gold Coast hotel.",
      prizeName: "2-night beachfront stay for two", prizeValue: 120000, prizeDelivery: "Voucher emailed to the winner; valid for 12 months.", ticketType: "FREE", ticketPrice: 0,
      totalTickets: 100, maxPerBuyer: 3, salesOpenAt: new Date(now - 20 * DAY), salesCloseAt: new Date(now - DAY), drawAt: new Date(now - 60 * 60_000), timezone: "Australia/Brisbane",
      terms: "Free entry, 18+, Australian residents.", status: "APPROVED", scheduleApproved: true, legalReviewConfirmed: true,
    },
  });
  await db.drawSchedule.create({ data: { campaignId: due.id, drawAt: due.drawAt, salesCloseAt: due.salesCloseAt, timezone: due.timezone, reason: "Initial schedule", status: "APPROVED", proposedById: seller.id, reviewedById: admin.id, reviewedAt: new Date() } });
  await seedTickets(due.id, [[buyer.id, 3], [buyer2.id, 3]], 100);

  const pending = await db.campaign.create({
    data: {
      slug: "win-an-iphone-15-pro", sellerId: seller.id, listingId: listingIds[3], title: "Win an iPhone 15 Pro", description: "Free-entry promotion for our newsletter subscribers.",
      prizeName: "iPhone 15 Pro 256GB", prizeValue: 189900, prizeDelivery: "Shipped to the winner.", ticketType: "FREE", ticketPrice: 0, totalTickets: 1000, maxPerBuyer: 2,
      salesOpenAt: new Date(now + DAY), salesCloseAt: new Date(now + 30 * DAY), drawAt: new Date(now + 31 * DAY), timezone: "Australia/Brisbane", terms: "Free entry, 18+.", status: "PENDING_APPROVAL",
    },
  });
  await db.drawSchedule.create({ data: { campaignId: pending.id, drawAt: pending.drawAt, salesCloseAt: pending.salesCloseAt, timezone: pending.timezone, reason: "Initial schedule", proposedById: seller.id } });

  // ---- CMS, banners, notifications
  for (const [slug, title, content] of PAGES) await db.page.create({ data: { slug, title, content } });
  await db.banner.create({ data: { title: "Buy and sell with verified Australians", subtitle: "Every seller is ID-checked. Every listing is reviewed.", link: "/marketplace", sortOrder: 0 } });
  await db.banner.create({ data: { title: "Free-entry promotions are live", subtitle: "Claim a free ticket for a chance to win a Dell XPS 15.", link: "/draws/win-a-dell-xps-15", sortOrder: 1 } });
  await db.notification.create({ data: { userId: buyer.id, type: "WELCOME", title: "Welcome to SellEasy", body: "Your Buyer ID is BUY-000001." } });

  console.log("Seeded. Logins (password: Password123):");
  console.log("  admin@selleasy.test (ADM-000001)\n  seller@selleasy.test (SEL-000001, active)\n  business@selleasy.test (BUS-000001, under review)\n  buyer@selleasy.test (BUY-000001)\n  buyer2@selleasy.test (BUY-000002)");
}


async function createAttrs(categoryId: string, attrs: Attr[]) {
  for (const [i, [key, label, type = "text", options, extra]] of attrs.entries())
    await db.categoryAttribute.create({ data: { categoryId, key, label, type, options: options ?? null, sortOrder: i, unit: extra?.unit, required: !!extra?.required, isPrivate: !!extra?.isPrivate, filterable: !!extra?.filterable } });
}

async function seedTickets(campaignId: string, holders: [string, number][], total: number) {
  let n = 1;
  for (const [buyerId, qty] of holders) {
    const p = await db.ticketPurchase.create({ data: { campaignId, buyerId, quantity: qty, amount: 0, status: "FREE_CLAIMED", idempotencyKey: crypto.randomUUID() } });
    for (let i = 0; i < qty; i++, n++)
      await db.ticket.create({ data: { campaignId, buyerId, purchaseId: p.id, number: n, ticketNumber: String(n).padStart(Math.max(5, String(total).length), "0"), allocationType: "FREE" } });
  }
  await db.campaign.update({ where: { id: campaignId }, data: { nextTicketNumber: n, ticketsAllocated: n - 1 } });
}

main().finally(() => db.$disconnect());
