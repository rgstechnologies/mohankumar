-- CreateEnum
CREATE TYPE "NoteType" AS ENUM ('CREDIT_NOTE', 'DEBIT_NOTE');

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "NoteType" NOT NULL,
    "noteNo" INTEGER NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "purchaseBillId" TEXT,
    "voucherId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "isInterState" BOOLEAN NOT NULL,
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

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_lines" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "itemId" TEXT,
    "lineNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "hsnCode" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'PCS',
    "quantity" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "taxableValue" DECIMAL(18,2) NOT NULL,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "cgst" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igst" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "note_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_counters" (
    "companyId" TEXT NOT NULL,
    "type" "NoteType" NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "nextNo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "note_counters_pkey" PRIMARY KEY ("companyId","type","fiscalYear")
);

-- CreateIndex
CREATE UNIQUE INDEX "notes_voucherId_key" ON "notes"("voucherId");

-- CreateIndex
CREATE INDEX "notes_companyId_date_idx" ON "notes"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "notes_companyId_type_fiscalYear_noteNo_key" ON "notes"("companyId", "type", "fiscalYear", "noteNo");

-- CreateIndex
CREATE INDEX "note_lines_noteId_idx" ON "note_lines"("noteId");

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_purchaseBillId_fkey" FOREIGN KEY ("purchaseBillId") REFERENCES "purchase_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_lines" ADD CONSTRAINT "note_lines_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_lines" ADD CONSTRAINT "note_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_counters" ADD CONSTRAINT "note_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
