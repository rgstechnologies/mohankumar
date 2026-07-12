-- CreateEnum
CREATE TYPE "OpeningDocKind" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateTable
CREATE TABLE "opening_documents" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "kind" "OpeningDocKind" NOT NULL,
    "refNo" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dueDate" DATE,
    "amount" DECIMAL(18,2) NOT NULL,
    "settled" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opening_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "opening_documents_companyId_kind_idx" ON "opening_documents"("companyId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "opening_documents_companyId_partyId_kind_refNo_key" ON "opening_documents"("companyId", "partyId", "kind", "refNo");

-- AddForeignKey
ALTER TABLE "opening_documents" ADD CONSTRAINT "opening_documents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_documents" ADD CONSTRAINT "opening_documents_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
