-- CreateEnum
CREATE TYPE "PartyType" AS ENUM ('CUSTOMER', 'VENDOR');

-- CreateTable
CREATE TABLE "parties" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "PartyType" NOT NULL,
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "stateCode" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "pincode" TEXT,
    "ledgerId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "hsnCode" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'PCS',
    "gstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "salePrice" DECIMAL(18,2),
    "purchasePrice" DECIMAL(18,2),
    "openingStock" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parties_ledgerId_key" ON "parties"("ledgerId");

-- CreateIndex
CREATE INDEX "parties_companyId_type_idx" ON "parties"("companyId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "parties_companyId_name_key" ON "parties"("companyId", "name");

-- CreateIndex
CREATE INDEX "items_companyId_idx" ON "items"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "items_companyId_name_key" ON "items"("companyId", "name");

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parties" ADD CONSTRAINT "parties_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "ledgers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
