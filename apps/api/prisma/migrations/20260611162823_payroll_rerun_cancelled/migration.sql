-- DropIndex
DROP INDEX "pay_runs_companyId_idx";

-- DropIndex
DROP INDEX "pay_runs_companyId_year_month_key";

-- CreateIndex
CREATE INDEX "pay_runs_companyId_year_month_idx" ON "pay_runs"("companyId", "year", "month");
