-- CreateEnum
CREATE TYPE "EstimateStatus" AS ENUM ('OPEN', 'ACCEPTED', 'DECLINED', 'CONVERTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "estimates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "branchId" TEXT,
    "estimateNo" INTEGER NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "validUntil" DATE,
    "placeOfSupply" TEXT,
    "isInterState" BOOLEAN NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discountTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(18,2) NOT NULL,
    "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "status" "EstimateStatus" NOT NULL DEFAULT 'OPEN',
    "invoiceId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_lines" (
    "id" TEXT NOT NULL,
    "estimateId" TEXT NOT NULL,
    "itemId" TEXT,
    "lineNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "hsnCode" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'PCS',
    "quantity" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxableValue" DECIMAL(18,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "cgst" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "estimate_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estimate_counters" (
    "companyId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "nextNo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "estimate_counters_pkey" PRIMARY KEY ("companyId","fiscalYear")
);

-- CreateIndex
CREATE UNIQUE INDEX "estimates_invoiceId_key" ON "estimates"("invoiceId");

-- CreateIndex
CREATE INDEX "estimates_companyId_date_idx" ON "estimates"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "estimates_companyId_fiscalYear_estimateNo_key" ON "estimates"("companyId", "fiscalYear", "estimateNo");

-- CreateIndex
CREATE INDEX "estimate_lines_estimateId_idx" ON "estimate_lines"("estimateId");

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "estimates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_lines" ADD CONSTRAINT "estimate_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estimate_counters" ADD CONSTRAINT "estimate_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
