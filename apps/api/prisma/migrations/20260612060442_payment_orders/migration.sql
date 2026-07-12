-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('CREATED', 'PAID', 'FAILED');

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "razorpayOrderId" TEXT NOT NULL,
    "razorpayPaymentId" TEXT,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_razorpayOrderId_key" ON "payment_orders"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "payment_orders_userId_idx" ON "payment_orders"("userId");

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
