-- AlterTable
ALTER TABLE "items" ADD COLUMN     "parentItemId" TEXT,
ADD COLUMN     "variantLabel" TEXT;

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "bankName" TEXT,
    "accountNo" TEXT,
    "ifsc" TEXT,
    "branch" TEXT,
    "upiId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_ledgerId_key" ON "bank_accounts"("ledgerId");

-- CreateIndex
CREATE INDEX "bank_accounts_companyId_idx" ON "bank_accounts"("companyId");

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "ledgers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
