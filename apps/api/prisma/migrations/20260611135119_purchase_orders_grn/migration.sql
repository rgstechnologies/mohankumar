-- CreateEnum
CREATE TYPE "PoStatus" AS ENUM ('OPEN', 'PARTIAL', 'RECEIVED', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "poNo" INTEGER NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "expectedDate" DATE,
    "notes" TEXT,
    "status" "PoStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "itemId" TEXT,
    "lineNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'PCS',
    "quantity" DECIMAL(18,3) NOT NULL,
    "rate" DECIMAL(18,2) NOT NULL,
    "receivedQty" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grns" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "grnNo" INTEGER NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grn_lines" (
    "id" TEXT NOT NULL,
    "grnId" TEXT NOT NULL,
    "poLineId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "grn_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_counters" (
    "companyId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "nextNo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "po_counters_pkey" PRIMARY KEY ("companyId","fiscalYear")
);

-- CreateTable
CREATE TABLE "grn_counters" (
    "companyId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "nextNo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "grn_counters_pkey" PRIMARY KEY ("companyId","fiscalYear")
);

-- CreateIndex
CREATE INDEX "purchase_orders_companyId_date_idx" ON "purchase_orders"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_companyId_fiscalYear_poNo_key" ON "purchase_orders"("companyId", "fiscalYear", "poNo");

-- CreateIndex
CREATE INDEX "purchase_order_lines_poId_idx" ON "purchase_order_lines"("poId");

-- CreateIndex
CREATE INDEX "grns_companyId_idx" ON "grns"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "grns_companyId_fiscalYear_grnNo_key" ON "grns"("companyId", "fiscalYear", "grnNo");

-- CreateIndex
CREATE INDEX "grn_lines_grnId_idx" ON "grn_lines"("grnId");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_poId_fkey" FOREIGN KEY ("poId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grns" ADD CONSTRAINT "grns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grns" ADD CONSTRAINT "grns_poId_fkey" FOREIGN KEY ("poId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "grns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_lines" ADD CONSTRAINT "grn_lines_poLineId_fkey" FOREIGN KEY ("poLineId") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_counters" ADD CONSTRAINT "po_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grn_counters" ADD CONSTRAINT "grn_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
