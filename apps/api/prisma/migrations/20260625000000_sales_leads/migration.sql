-- CreateEnum
CREATE TYPE "SalesLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'CLOSED');

-- CreateTable
CREATE TABLE "sales_leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "requirements" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'ENTERPRISE',
    "status" "SalesLeadStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_leads_status_createdAt_idx" ON "sales_leads"("status", "createdAt");
