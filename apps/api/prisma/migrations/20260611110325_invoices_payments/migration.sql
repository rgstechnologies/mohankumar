-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK', 'UPI', 'CARD', 'CHEQUE', 'OTHER');

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "invoiceNo" INTEGER NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dueDate" DATE,
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
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
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

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_counters" (
    "companyId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "nextNo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("companyId","fiscalYear")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_voucherId_key" ON "invoices"("voucherId");

-- CreateIndex
CREATE INDEX "invoices_companyId_date_idx" ON "invoices"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_companyId_fiscalYear_invoiceNo_key" ON "invoices"("companyId", "fiscalYear", "invoiceNo");

-- CreateIndex
CREATE INDEX "invoice_lines_invoiceId_idx" ON "invoice_lines"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_voucherId_key" ON "payments"("voucherId");

-- CreateIndex
CREATE INDEX "payments_companyId_idx" ON "payments"("companyId");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_counters" ADD CONSTRAINT "invoice_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
