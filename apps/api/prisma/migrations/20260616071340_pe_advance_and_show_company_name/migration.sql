-- AlterTable
ALTER TABLE "estimates" ADD COLUMN     "showCompanyName" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "party_payments" ADD COLUMN     "purchaseEstimateId" TEXT;

-- AlterTable
ALTER TABLE "purchase_estimates" ADD COLUMN     "showCompanyName" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "party_payments_purchaseEstimateId_idx" ON "party_payments"("purchaseEstimateId");

-- AddForeignKey
ALTER TABLE "party_payments" ADD CONSTRAINT "party_payments_purchaseEstimateId_fkey" FOREIGN KEY ("purchaseEstimateId") REFERENCES "purchase_estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
