-- AlterTable
ALTER TABLE "SellerProfile" ADD COLUMN     "abnConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "businessAddressEnc" TEXT,
ADD COLUMN     "businessCheckData" JSONB,
ADD COLUMN     "businessCheckStatus" TEXT NOT NULL DEFAULT 'NOT_CHECKED',
ADD COLUMN     "businessCheckedAt" TIMESTAMP(3),
ADD COLUMN     "businessStructure" TEXT,
ADD COLUMN     "businessVerifiedById" TEXT,
ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'AU',
ADD COLUMN     "geoEnc" TEXT,
ADD COLUMN     "locationCheckedAt" TIMESTAMP(3),
ADD COLUMN     "locationMethod" TEXT,
ADD COLUMN     "locationNotes" TEXT,
ADD COLUMN     "locationStatus" TEXT NOT NULL DEFAULT 'NOT_VERIFIED',
ADD COLUMN     "locationVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "locationVerifiedById" TEXT,
ADD COLUMN     "pinConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "streetAddressEnc" TEXT,
ADD COLUMN     "suburb" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketingOptInAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "ip" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsentRecord_userId_type_idx" ON "ConsentRecord"("userId", "type");

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

