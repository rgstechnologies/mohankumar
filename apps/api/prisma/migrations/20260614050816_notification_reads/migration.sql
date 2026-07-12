-- CreateTable
CREATE TABLE "notification_reads" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_reads_companyId_userId_idx" ON "notification_reads"("companyId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_reads_companyId_userId_notificationId_key" ON "notification_reads"("companyId", "userId", "notificationId");

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
