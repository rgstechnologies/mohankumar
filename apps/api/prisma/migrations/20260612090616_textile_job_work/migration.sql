-- CreateEnum
CREATE TYPE "JobWorkProcess" AS ENUM ('DYEING', 'PRINTING', 'WEAVING', 'KNITTING', 'STITCHING', 'WASHING', 'OTHER');

-- CreateEnum
CREATE TYPE "JobWorkStatus" AS ENUM ('OPEN', 'PARTIAL', 'CLOSED', 'CANCELLED');

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "composition" TEXT,
ADD COLUMN     "gsm" INTEGER,
ADD COLUMN     "widthInches" DECIMAL(5,1),
ADD COLUMN     "yarnCount" TEXT;

-- CreateTable
CREATE TABLE "job_works" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "jobNo" INTEGER NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "process" "JobWorkProcess" NOT NULL,
    "status" "JobWorkStatus" NOT NULL DEFAULT 'OPEN',
    "issueDate" DATE NOT NULL,
    "dueDate" DATE,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_work_issue_lines" (
    "id" TEXT NOT NULL,
    "jobWorkId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,

    CONSTRAINT "job_work_issue_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_work_receipt_lines" (
    "id" TEXT NOT NULL,
    "jobWorkId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "wastageQty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_work_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_work_counters" (
    "companyId" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "nextNo" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "job_work_counters_pkey" PRIMARY KEY ("companyId","fiscalYear")
);

-- CreateIndex
CREATE INDEX "job_works_companyId_status_idx" ON "job_works"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_works_companyId_fiscalYear_jobNo_key" ON "job_works"("companyId", "fiscalYear", "jobNo");

-- AddForeignKey
ALTER TABLE "job_works" ADD CONSTRAINT "job_works_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_works" ADD CONSTRAINT "job_works_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_work_issue_lines" ADD CONSTRAINT "job_work_issue_lines_jobWorkId_fkey" FOREIGN KEY ("jobWorkId") REFERENCES "job_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_work_issue_lines" ADD CONSTRAINT "job_work_issue_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_work_receipt_lines" ADD CONSTRAINT "job_work_receipt_lines_jobWorkId_fkey" FOREIGN KEY ("jobWorkId") REFERENCES "job_works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_work_receipt_lines" ADD CONSTRAINT "job_work_receipt_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_work_counters" ADD CONSTRAINT "job_work_counters_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
