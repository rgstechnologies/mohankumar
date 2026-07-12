/*
  Warnings:

  - A unique constraint covering the columns `[voucherId]` on the table `estimates` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[voucherId]` on the table `purchase_estimates` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "estimates" ADD COLUMN     "voucherId" TEXT;

-- AlterTable
ALTER TABLE "purchase_estimates" ADD COLUMN     "voucherId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "estimates_voucherId_key" ON "estimates"("voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_estimates_voucherId_key" ON "purchase_estimates"("voucherId");

-- AddForeignKey
ALTER TABLE "estimates" ADD CONSTRAINT "estimates_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_estimates" ADD CONSTRAINT "purchase_estimates_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
