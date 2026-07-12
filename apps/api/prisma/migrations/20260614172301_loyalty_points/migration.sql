-- CreateEnum
CREATE TYPE "LoyaltyTxnType" AS ENUM ('EARN', 'REDEEM', 'ADJUST');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "loyaltyEarnPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "parties" ADD COLUMN     "loyaltyPoints" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "loyalty_txns" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "type" "LoyaltyTxnType" NOT NULL,
    "points" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_txns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loyalty_txns_companyId_partyId_idx" ON "loyalty_txns"("companyId", "partyId");

-- AddForeignKey
ALTER TABLE "loyalty_txns" ADD CONSTRAINT "loyalty_txns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_txns" ADD CONSTRAINT "loyalty_txns_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
