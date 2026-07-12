-- CreateEnum
CREATE TYPE "AccountNature" AS ENUM ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA', 'SALES', 'PURCHASE', 'CREDIT_NOTE', 'DEBIT_NOTE');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "account_groups" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nature" "AccountNature" NOT NULL,
    "parentId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledgers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openingType" "EntryType" NOT NULL DEFAULT 'DEBIT',
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledgers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "VoucherType" NOT NULL,
    "voucherNo" INTEGER NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "narration" TEXT,
    "status" "VoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_lines" (
    "id" TEXT NOT NULL,
    "voucherId" TEXT NOT NULL,
    "ledgerId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "type" "EntryType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "voucher_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_counters" (
    "companyId" TEXT NOT NULL,
    "type" "VoucherType" NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "nextNo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "voucher_counters_pkey" PRIMARY KEY ("companyId","type","fiscalYear")
);

-- CreateIndex
CREATE INDEX "account_groups_companyId_idx" ON "account_groups"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "account_groups_companyId_name_key" ON "account_groups"("companyId", "name");

-- CreateIndex
CREATE INDEX "ledgers_companyId_idx" ON "ledgers"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ledgers_companyId_name_key" ON "ledgers"("companyId", "name");

-- CreateIndex
CREATE INDEX "vouchers_companyId_date_idx" ON "vouchers"("companyId", "date");

-- CreateIndex
CREATE INDEX "vouchers_companyId_type_idx" ON "vouchers"("companyId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_companyId_type_fiscalYear_voucherNo_key" ON "vouchers"("companyId", "type", "fiscalYear", "voucherNo");

-- CreateIndex
CREATE INDEX "voucher_lines_ledgerId_idx" ON "voucher_lines"("ledgerId");

-- CreateIndex
CREATE INDEX "voucher_lines_voucherId_idx" ON "voucher_lines"("voucherId");

-- AddForeignKey
ALTER TABLE "account_groups" ADD CONSTRAINT "account_groups_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_groups" ADD CONSTRAINT "account_groups_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "account_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledgers" ADD CONSTRAINT "ledgers_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "account_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_lines" ADD CONSTRAINT "voucher_lines_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_lines" ADD CONSTRAINT "voucher_lines_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "ledgers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_counters" ADD CONSTRAINT "voucher_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
