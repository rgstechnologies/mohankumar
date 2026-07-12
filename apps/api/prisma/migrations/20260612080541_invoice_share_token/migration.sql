/*
  Warnings:

  - A unique constraint covering the columns `[shareToken]` on the table `invoices` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_shareToken_key" ON "invoices"("shareToken");
