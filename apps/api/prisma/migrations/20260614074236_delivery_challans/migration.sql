-- CreateTable
CREATE TABLE "delivery_challans" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "branchId" TEXT,
    "challanNo" INTEGER NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "placeOfSupply" TEXT,
    "isInterState" BOOLEAN NOT NULL,
    "vehicleNo" TEXT,
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

    CONSTRAINT "delivery_challans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_challan_lines" (
    "id" TEXT NOT NULL,
    "challanId" TEXT NOT NULL,
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

    CONSTRAINT "delivery_challan_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_challan_counters" (
    "companyId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "nextNo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "delivery_challan_counters_pkey" PRIMARY KEY ("companyId","fiscalYear")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_challans_invoiceId_key" ON "delivery_challans"("invoiceId");

-- CreateIndex
CREATE INDEX "delivery_challans_companyId_date_idx" ON "delivery_challans"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_challans_companyId_fiscalYear_challanNo_key" ON "delivery_challans"("companyId", "fiscalYear", "challanNo");

-- CreateIndex
CREATE INDEX "delivery_challan_lines_challanId_idx" ON "delivery_challan_lines"("challanId");

-- AddForeignKey
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_challans" ADD CONSTRAINT "delivery_challans_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_challan_lines" ADD CONSTRAINT "delivery_challan_lines_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "delivery_challans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_challan_lines" ADD CONSTRAINT "delivery_challan_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_challan_counters" ADD CONSTRAINT "delivery_challan_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
