-- CreateTable
CREATE TABLE "service_reviews" (
    "id" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "clientUserId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_reviews_auditorId_idx" ON "service_reviews"("auditorId");

-- CreateIndex
CREATE UNIQUE INDEX "service_reviews_auditorId_clientUserId_key" ON "service_reviews"("auditorId", "clientUserId");

-- AddForeignKey
ALTER TABLE "service_reviews" ADD CONSTRAINT "service_reviews_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "auditors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_reviews" ADD CONSTRAINT "service_reviews_clientUserId_fkey" FOREIGN KEY ("clientUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
