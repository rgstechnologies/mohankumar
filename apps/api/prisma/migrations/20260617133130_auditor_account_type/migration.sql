-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('BUSINESS', 'AUDITOR');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "accountType" "AccountType" NOT NULL DEFAULT 'BUSINESS';
