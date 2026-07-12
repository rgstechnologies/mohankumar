-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "purchase_bills" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "branchId" TEXT;

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branches_companyId_idx" ON "branches"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_companyId_name_key" ON "branches"("companyId", "name");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_bills" ADD CONSTRAINT "purchase_bills_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
