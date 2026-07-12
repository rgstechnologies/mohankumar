-- CreateEnum
CREATE TYPE "EWayBillStatus" AS ENUM ('GENERATED', 'CANCELLED');

-- CreateTable
CREATE TABLE "e_way_bills" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "status" "EWayBillStatus" NOT NULL DEFAULT 'GENERATED',
    "ewbNo" TEXT NOT NULL,
    "ewbDate" TIMESTAMP(3) NOT NULL,
    "validUpto" TIMESTAMP(3) NOT NULL,
    "transportMode" TEXT NOT NULL DEFAULT 'ROAD',
    "vehicleNo" TEXT,
    "transporterId" TEXT,
    "transporterName" TEXT,
    "transportDocNo" TEXT,
    "transportDocDate" TIMESTAMP(3),
    "distanceKm" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL DEFAULT 'SIMULATOR',
    "requestJson" TEXT NOT NULL,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "e_way_bills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "e_way_bills_invoiceId_key" ON "e_way_bills"("invoiceId");

-- AddForeignKey
ALTER TABLE "e_way_bills" ADD CONSTRAINT "e_way_bills_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
