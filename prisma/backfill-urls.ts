import type { PrismaClient } from "@prisma/client";

/** Idempotent: gives any listing/store without a public URL slug one (same rule as the migration). */
export async function backfillPublicUrls(db: PrismaClient) {
  const listings = await db.$executeRawUnsafe(
    `UPDATE "Listing" SET "slug" = trim(both '-' from left(regexp_replace(lower("title"), '[^a-z0-9]+', '-', 'g'), 60)) || '-' || right("id", 6) WHERE "slug" IS NULL`,
  );
  const stores = await db.$executeRawUnsafe(`UPDATE "SellerProfile" SET "storeSlug" = lower("sellerCode") WHERE "storeSlug" IS NULL`);
  return { listings, stores };
}
