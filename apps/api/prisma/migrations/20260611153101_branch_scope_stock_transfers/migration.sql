-- AlterTable
ALTER TABLE "company_users" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "invites" ADD COLUMN     "branchId" TEXT;

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "transferNo" INTEGER NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "fromBranchId" TEXT,
    "toBranchId" TEXT,
    "narration" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_lines" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchId" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "stock_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_counters" (
    "companyId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "nextNo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "stock_transfer_counters_pkey" PRIMARY KEY ("companyId","fiscalYear")
);

-- CreateIndex
CREATE INDEX "stock_transfers_companyId_idx" ON "stock_transfers"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_companyId_fiscalYear_transferNo_key" ON "stock_transfers"("companyId", "fiscalYear", "transferNo");

-- CreateIndex
CREATE INDEX "stock_transfer_lines_transferId_idx" ON "stock_transfer_lines"("transferId");

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_users" ADD CONSTRAINT "company_users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "item_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_counters" ADD CONSTRAINT "stock_transfer_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
