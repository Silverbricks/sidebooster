/*
 * Production bootstrap — safe to run on every deploy. It NEVER deletes data.
 *  - Creates the default categories, category fields, commission rules and CMS pages if they are missing.
 *  - Creates the first Super Admin from ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_MOBILE if no admin exists yet.
 * Run: npm run bootstrap
 */
import { PrismaClient } from "@prisma/client";
import { backfillPublicUrls } from "./backfill-urls";
import bcrypt from "bcryptjs";
import { CATEGORIES, PAGES, type Attr } from "./seed-data";

const db = new PrismaClient();

async function ensureAttrs(categoryId: string, attrs: Attr[]) {
  for (const [i, [key, label, type = "text", options, extra]] of attrs.entries()) {
    const exists = await db.categoryAttribute.findFirst({ where: { categoryId, key } });
    if (!exists)
      await db.categoryAttribute.create({ data: { categoryId, key, label, type, options: options ?? null, sortOrder: i, unit: extra?.unit, required: !!extra?.required, isPrivate: !!extra?.isPrivate, filterable: !!extra?.filterable } });
  }
}

async function main() {
  let created = 0;
  if ((await db.category.count()) === 0) {
    let order = 0;
    for (const c of CATEGORIES) {
      const cat = await db.category.create({ data: { name: c.name, slug: c.slug, icon: c.icon, highValue: !!c.highValue, sortOrder: order++ } });
      await ensureAttrs(cat.id, c.attrs);
      await db.commissionRule.create({ data: { categoryId: cat.id, rateBps: c.bps, effectiveFrom: new Date() } });
      let s = 0;
      for (const sub of c.subs ?? []) {
        const sc = await db.category.create({ data: { name: sub.name, slug: sub.slug, parentId: cat.id, sortOrder: s++, highValue: !!c.highValue } });
        await ensureAttrs(sc.id, sub.attrs ?? []);
      }
      created++;
    }
    console.log(`Created ${created} default categories with fields and commission rules.`);
  } else console.log("Categories already exist — skipped.");

  for (const [slug, title, content] of PAGES) {
    if (!(await db.page.findUnique({ where: { slug } }))) {
      await db.page.create({ data: { slug, title, content } });
      console.log(`Created page /${slug}`);
    }
  }

  if (await db.user.findFirst({ where: { role: "ADMIN" } })) {
    console.log("An admin account already exists — skipped.");
    return;
  }
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const mobile = process.env.ADMIN_MOBILE?.trim();
  if (!email || !password || !mobile) {
    console.warn("No admin exists. Set ADMIN_EMAIL, ADMIN_PASSWORD and ADMIN_MOBILE (+614XXXXXXXX) and run `npm run bootstrap` again.");
    return;
  }
  if (password.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
  if (!/^\+614\d{8}$/.test(mobile)) throw new Error("ADMIN_MOBILE must be in the form +614XXXXXXXX.");
  await db.$transaction(async (tx) => {
    const c = await tx.counter.upsert({ where: { key: "ADM" }, create: { key: "ADM", value: 1 }, update: { value: { increment: 1 } } });
    const publicId = `ADM-${String(c.value).padStart(6, "0")}`;
    const now = new Date();
    await tx.user.create({
      data: {
        publicId, email, mobile, role: "ADMIN", passwordHash: await bcrypt.hash(password, 12),
        firstName: process.env.ADMIN_FIRST_NAME || "Super", lastName: process.env.ADMIN_LAST_NAME || "Admin",
        name: `${process.env.ADMIN_FIRST_NAME || "Super"} ${process.env.ADMIN_LAST_NAME || "Admin"}`,
        emailVerifiedAt: now, mobileVerifiedAt: now, termsAcceptedAt: now, accountStatus: "ACTIVE",
      },
    });
    console.log(`Created Super Admin ${publicId} <${email}>. Remove ADMIN_PASSWORD from the environment now.`);
  });
}

main()
  .then(async () => {
    const r = await backfillPublicUrls(db);
    if (r.listings || r.stores) console.log(`Public URLs backfilled: ${r.listings} listings, ${r.stores} stores.`);
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
