-- CreateEnum
CREATE TYPE "PartyPaymentDirection" AS ENUM ('RECEIPT', 'PAYMENT');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "printName" TEXT;

-- AlterTable
ALTER TABLE "parties" ADD COLUMN     "image" TEXT;

-- CreateTable
CREATE TABLE "party_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "direction" "PartyPaymentDirection" NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "note" TEXT,
    "estimateId" TEXT,
    "purchaseOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "party_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "party_payments_voucherId_key" ON "party_payments"("voucherId");

-- CreateIndex
CREATE INDEX "party_payments_companyId_partyId_idx" ON "party_payments"("companyId", "partyId");

-- CreateIndex
CREATE INDEX "party_payments_estimateId_idx" ON "party_payments"("estimateId");

-- CreateIndex
CREATE INDEX "party_payments_purchaseOrderId_idx" ON "party_payments"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "party_payments" ADD CONSTRAINT "party_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_payments" ADD CONSTRAINT "party_payments_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_payments" ADD CONSTRAINT "party_payments_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_payments" ADD CONSTRAINT "party_payments_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_payments" ADD CONSTRAINT "party_payments_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
