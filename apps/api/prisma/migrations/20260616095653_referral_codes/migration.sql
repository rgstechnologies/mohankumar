-- CreateEnum
CREATE TYPE "ReferralDiscountType" AS ENUM ('PERCENT', 'FLAT');

-- AlterTable
ALTER TABLE "payment_orders" ADD COLUMN     "discountPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "referralCodeId" TEXT;

-- CreateTable
CREATE TABLE "referral_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "ReferralDiscountType" NOT NULL DEFAULT 'PERCENT',
    "discountValue" DECIMAL(10,2) NOT NULL,
    "maxUses" INTEGER,
    "usesCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_referralCodeId_fkey" FOREIGN KEY ("referralCodeId") REFERENCES "referral_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
