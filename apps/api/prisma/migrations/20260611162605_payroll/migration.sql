-- CreateEnum
CREATE TYPE "PayRunStatus" AS ENUM ('DRAFT', 'POSTED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "joinDate" DATE NOT NULL,
    "exitDate" DATE,
    "pan" TEXT,
    "uan" TEXT,
    "esiNo" TEXT,
    "bankName" TEXT,
    "bankAccountNo" TEXT,
    "bankIfsc" TEXT,
    "basic" DECIMAL(18,2) NOT NULL,
    "hra" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "conveyance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherAllowances" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "pfEnabled" BOOLEAN NOT NULL DEFAULT true,
    "esiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "ptMonthly" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tdsMonthly" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_runs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PayRunStatus" NOT NULL DEFAULT 'DRAFT',
    "voucherId" TEXT,
    "paymentVoucherId" TEXT,
    "narration" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_run_lines" (
    "id" TEXT NOT NULL,
    "payRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workingDays" DECIMAL(5,2) NOT NULL,
    "lopDays" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "basic" DECIMAL(18,2) NOT NULL,
    "hra" DECIMAL(18,2) NOT NULL,
    "conveyance" DECIMAL(18,2) NOT NULL,
    "otherAllowances" DECIMAL(18,2) NOT NULL,
    "gross" DECIMAL(18,2) NOT NULL,
    "pfEmployee" DECIMAL(18,2) NOT NULL,
    "pfEmployer" DECIMAL(18,2) NOT NULL,
    "esiEmployee" DECIMAL(18,2) NOT NULL,
    "esiEmployer" DECIMAL(18,2) NOT NULL,
    "pt" DECIMAL(18,2) NOT NULL,
    "tds" DECIMAL(18,2) NOT NULL,
    "totalDeductions" DECIMAL(18,2) NOT NULL,
    "netPay" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "pay_run_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employees_companyId_idx" ON "employees"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_companyId_code_key" ON "employees"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "pay_runs_voucherId_key" ON "pay_runs"("voucherId");

-- CreateIndex
CREATE UNIQUE INDEX "pay_runs_paymentVoucherId_key" ON "pay_runs"("paymentVoucherId");

-- CreateIndex
CREATE INDEX "pay_runs_companyId_idx" ON "pay_runs"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "pay_runs_companyId_year_month_key" ON "pay_runs"("companyId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "pay_run_lines_payRunId_employeeId_key" ON "pay_run_lines"("payRunId", "employeeId");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_runs" ADD CONSTRAINT "pay_runs_paymentVoucherId_fkey" FOREIGN KEY ("paymentVoucherId") REFERENCES "vouchers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_run_lines" ADD CONSTRAINT "pay_run_lines_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "pay_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_run_lines" ADD CONSTRAINT "pay_run_lines_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
