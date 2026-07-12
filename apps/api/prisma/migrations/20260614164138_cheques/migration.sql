-- CreateEnum
CREATE TYPE "ChequeDirection" AS ENUM ('RECEIVED', 'ISSUED');

-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('PENDING', 'CLEARED', 'BOUNCED', 'CANCELLED');

-- CreateTable
CREATE TABLE "cheques" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "partyId" TEXT,
    "partyName" TEXT,
    "direction" "ChequeDirection" NOT NULL,
    "chequeNo" TEXT NOT NULL,
    "bankName" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "chequeDate" DATE NOT NULL,
    "status" "ChequeStatus" NOT NULL DEFAULT 'PENDING',
    "clearedDate" DATE,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cheques_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cheques_companyId_status_idx" ON "cheques"("companyId", "status");

-- CreateIndex
CREATE INDEX "cheques_companyId_chequeDate_idx" ON "cheques"("companyId", "chequeDate");

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
