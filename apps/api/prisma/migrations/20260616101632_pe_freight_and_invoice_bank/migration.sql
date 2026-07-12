-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "bankAccountId" TEXT;

-- AlterTable
ALTER TABLE "purchase_estimates" ADD COLUMN     "freightCharges" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherCharges" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
