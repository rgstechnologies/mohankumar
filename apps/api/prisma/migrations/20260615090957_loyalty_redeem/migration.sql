-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "loyaltyRedeemValue" DECIMAL(10,2) NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "loyaltyDiscount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "loyaltyPointsRedeemed" INTEGER NOT NULL DEFAULT 0;
