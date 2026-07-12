-- CreateEnum
CREATE TYPE "EInvoiceStatus" AS ENUM ('GENERATED', 'CANCELLED');

-- CreateTable
CREATE TABLE "e_invoices" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "status" "EInvoiceStatus" NOT NULL DEFAULT 'GENERATED',
    "irn" TEXT NOT NULL,
    "ackNo" TEXT NOT NULL,
    "ackDate" TIMESTAMP(3) NOT NULL,
    "signedQrCode" TEXT NOT NULL,
    "signedInvoice" TEXT,
    "ewbNo" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'SIMULATOR',
    "requestJson" TEXT NOT NULL,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "e_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "e_invoices_invoiceId_key" ON "e_invoices"("invoiceId");

-- AddForeignKey
ALTER TABLE "e_invoices" ADD CONSTRAINT "e_invoices_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
