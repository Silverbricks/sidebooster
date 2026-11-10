-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "listingFee" INTEGER;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "referralCampaign" TEXT,
ADD COLUMN     "referralMedium" TEXT,
ADD COLUMN     "referralSource" TEXT;

-- AlterTable
ALTER TABLE "SellerProfile" ADD COLUMN     "publicLocation" TEXT,
ADD COLUMN     "socialLinks" JSONB,
ADD COLUMN     "storeSlug" TEXT;

-- CreateTable
CREATE TABLE "PlatformFee" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "listingId" TEXT,
    "saleId" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "medium" TEXT,
    "campaign" TEXT,
    "listingId" TEXT,
    "sellerId" TEXT,
    "path" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFee_invoiceNumber_key" ON "PlatformFee"("invoiceNumber");

-- CreateIndex
CREATE INDEX "PlatformFee_sellerId_status_idx" ON "PlatformFee"("sellerId", "status");

-- CreateIndex
CREATE INDEX "PlatformFee_type_createdAt_idx" ON "PlatformFee"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralEvent_sellerId_createdAt_idx" ON "ReferralEvent"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralEvent_listingId_createdAt_idx" ON "ReferralEvent"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralEvent_source_createdAt_idx" ON "ReferralEvent"("source", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_slug_key" ON "Listing"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "SellerProfile_storeSlug_key" ON "SellerProfile"("storeSlug");

-- AddForeignKey
ALTER TABLE "PlatformFee" ADD CONSTRAINT "PlatformFee_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralEvent" ADD CONSTRAINT "ReferralEvent_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: clean product URLs (title-slug + id suffix, unique) and storefront slugs (seller code — no personal names)
UPDATE "Listing" SET "slug" = trim(both '-' from left(regexp_replace(lower("title"), '[^a-z0-9]+', '-', 'g'), 60)) || '-' || right("id", 6) WHERE "slug" IS NULL;
UPDATE "SellerProfile" SET "storeSlug" = lower("sellerCode") WHERE "storeSlug" IS NULL;
