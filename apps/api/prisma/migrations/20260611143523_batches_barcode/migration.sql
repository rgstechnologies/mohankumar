/*
  Warnings:

  - A unique constraint covering the columns `[companyId,barcode]` on the table `items` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN     "batchId" TEXT;

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "trackBatches" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "note_lines" ADD COLUMN     "batchId" TEXT;

-- AlterTable
ALTER TABLE "purchase_bill_lines" ADD COLUMN     "batchId" TEXT;

-- CreateTable
CREATE TABLE "item_batches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "batchNo" TEXT NOT NULL,
    "expiryDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "item_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "item_batches_companyId_idx" ON "item_batches"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "item_batches_itemId_batchNo_key" ON "item_batches"("itemId", "batchNo");

-- CreateIndex
CREATE UNIQUE INDEX "items_companyId_barcode_key" ON "items"("companyId", "barcode");

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "item_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_lines" ADD CONSTRAINT "note_lines_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "item_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bill_lines" ADD CONSTRAINT "purchase_bill_lines_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "item_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_batches" ADD CONSTRAINT "item_batches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_batches" ADD CONSTRAINT "item_batches_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
