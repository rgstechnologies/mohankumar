-- AlterTable
ALTER TABLE "items" ADD COLUMN     "reorderLevel" DECIMAL(18,3);

-- CreateTable
CREATE TABLE "purchase_bills" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "billNo" INTEGER NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "supplierBillNo" TEXT,
    "date" DATE NOT NULL,
    "dueDate" DATE,
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
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_bill_lines" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
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

    CONSTRAINT "purchase_bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_bill_counters" (
    "companyId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "nextNo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "purchase_bill_counters_pkey" PRIMARY KEY ("companyId","fiscalYear")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_bills_voucherId_key" ON "purchase_bills"("voucherId");

-- CreateIndex
CREATE INDEX "purchase_bills_companyId_date_idx" ON "purchase_bills"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_bills_companyId_fiscalYear_billNo_key" ON "purchase_bills"("companyId", "fiscalYear", "billNo");

-- CreateIndex
CREATE INDEX "purchase_bill_lines_billId_idx" ON "purchase_bill_lines"("billId");

-- CreateIndex
CREATE UNIQUE INDEX "bill_payments_voucherId_key" ON "bill_payments"("voucherId");

-- CreateIndex
CREATE INDEX "bill_payments_companyId_idx" ON "bill_payments"("companyId");

-- CreateIndex
CREATE INDEX "bill_payments_billId_idx" ON "bill_payments"("billId");

-- AddForeignKey
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bill_lines" ADD CONSTRAINT "purchase_bill_lines_billId_fkey" FOREIGN KEY ("billId") REFERENCES "purchase_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bill_lines" ADD CONSTRAINT "purchase_bill_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_billId_fkey" FOREIGN KEY ("billId") REFERENCES "purchase_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payments" ADD CONSTRAINT "bill_payments_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bill_counters" ADD CONSTRAINT "purchase_bill_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
