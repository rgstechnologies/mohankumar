-- CreateEnum
CREATE TYPE "ServiceRequestKind" AS ENUM ('ENQUIRY', 'SERVICE', 'CUSTOM_QUOTE');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('NEW', 'REVIEWING', 'QUOTED', 'ACCEPTED', 'DECLINED', 'CLOSED');

-- CreateEnum
CREATE TYPE "QuotationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "service_requests" (
    "id" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "serviceId" TEXT,
    "tierId" TEXT,
    "kind" "ServiceRequestKind" NOT NULL,
    "message" TEXT,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditor_quotations" (
    "id" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "requestId" TEXT,
    "quoteNo" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "gstApplicable" BOOLEAN NOT NULL DEFAULT false,
    "gstPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "dueDate" DATE,
    "notes" TEXT,
    "status" "QuotationStatus" NOT NULL DEFAULT 'PENDING',
    "invoiceNo" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auditor_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditor_counters" (
    "auditorId" TEXT NOT NULL,
    "nextQuoteNo" INTEGER NOT NULL DEFAULT 1,
    "nextInvoiceNo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "auditor_counters_pkey" PRIMARY KEY ("auditorId")
);

-- CreateIndex
CREATE INDEX "service_requests_auditorId_status_idx" ON "service_requests"("auditorId", "status");

-- CreateIndex
CREATE INDEX "service_requests_clientUserId_idx" ON "service_requests"("clientUserId");

-- CreateIndex
CREATE INDEX "auditor_quotations_auditorId_status_idx" ON "auditor_quotations"("auditorId", "status");

-- CreateIndex
CREATE INDEX "auditor_quotations_clientUserId_idx" ON "auditor_quotations"("clientUserId");

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "auditors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "auditor_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "service_pricing_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditor_quotations" ADD CONSTRAINT "auditor_quotations_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "auditors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditor_quotations" ADD CONSTRAINT "auditor_quotations_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditor_quotations" ADD CONSTRAINT "auditor_quotations_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "service_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditor_counters" ADD CONSTRAINT "auditor_counters_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "auditors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
