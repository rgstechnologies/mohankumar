-- AlterTable
ALTER TABLE "delivery_challans" ADD COLUMN     "freightCharges" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherCharges" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "estimates" ADD COLUMN     "freightCharges" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherCharges" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "freightCharges" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherCharges" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "notes" ADD COLUMN     "freightCharges" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherCharges" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "proforma_invoices" ADD COLUMN     "freightCharges" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherCharges" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "purchase_bills" ADD COLUMN     "freightCharges" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherCharges" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales_orders" ADD COLUMN     "freightCharges" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "otherCharges" DECIMAL(18,2) NOT NULL DEFAULT 0;
