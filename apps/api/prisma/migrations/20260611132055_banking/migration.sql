-- CreateTable
CREATE TABLE "bank_import_batches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "lineCount" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_statement_lines" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "type" "EntryType" NOT NULL,
    "matchedVoucherLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_statement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_import_batches_companyId_ledgerId_idx" ON "bank_import_batches"("companyId", "ledgerId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_lines_matchedVoucherLineId_key" ON "bank_statement_lines"("matchedVoucherLineId");

-- CreateIndex
CREATE INDEX "bank_statement_lines_companyId_ledgerId_idx" ON "bank_statement_lines"("companyId", "ledgerId");

-- AddForeignKey
ALTER TABLE "bank_import_batches" ADD CONSTRAINT "bank_import_batches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_import_batches" ADD CONSTRAINT "bank_import_batches_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "ledgers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "bank_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "ledgers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_statement_lines" ADD CONSTRAINT "bank_statement_lines_matchedVoucherLineId_fkey" FOREIGN KEY ("matchedVoucherLineId") REFERENCES "voucher_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
