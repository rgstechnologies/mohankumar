/*
  Warnings:

  - You are about to drop the column `composition` on the `items` table. All the data in the column will be lost.
  - You are about to drop the column `gsm` on the `items` table. All the data in the column will be lost.
  - You are about to drop the column `widthInches` on the `items` table. All the data in the column will be lost.
  - You are about to drop the column `yarnCount` on the `items` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "purchasePaymentLink" TEXT NOT NULL DEFAULT 'purchase',
ADD COLUMN     "salesPaymentLink" TEXT NOT NULL DEFAULT 'invoice';

-- AlterTable
ALTER TABLE "items" DROP COLUMN "composition",
DROP COLUMN "gsm",
DROP COLUMN "widthInches",
DROP COLUMN "yarnCount",
ADD COLUMN     "customFields" JSONB;

-- AlterTable
ALTER TABLE "parties" ADD COLUMN     "aliasName" TEXT,
ADD COLUMN     "state" TEXT;
