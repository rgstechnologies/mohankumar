-- CreateTable
CREATE TABLE "auditors" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "firmName" TEXT,
    "tagline" TEXT,
    "bio" TEXT,
    "experienceYrs" INTEGER,
    "phone" TEXT,
    "email" TEXT,
    "city" TEXT,
    "state" TEXT,
    "logo" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ratingAvg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auditors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditor_services" (
    "id" TEXT NOT NULL,
    "auditorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "shortDesc" TEXT,
    "detailDesc" TEXT,
    "image" TEXT,
    "deliveryTime" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auditor_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_pricing_tiers" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "gstApplicable" BOOLEAN NOT NULL DEFAULT false,
    "gstPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "deliveryTimeline" TEXT,
    "revisions" INTEGER,
    "prioritySupport" BOOLEAN NOT NULL DEFAULT false,
    "dedicatedConsultant" BOOLEAN NOT NULL DEFAULT false,
    "billingType" TEXT NOT NULL DEFAULT 'one_time',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_pricing_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tier_features" (
    "id" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tier_features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auditors_userId_key" ON "auditors"("userId");

-- CreateIndex
CREATE INDEX "auditor_services_auditorId_idx" ON "auditor_services"("auditorId");

-- CreateIndex
CREATE INDEX "service_pricing_tiers_serviceId_idx" ON "service_pricing_tiers"("serviceId");

-- CreateIndex
CREATE INDEX "tier_features_tierId_idx" ON "tier_features"("tierId");

-- AddForeignKey
ALTER TABLE "auditors" ADD CONSTRAINT "auditors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditor_services" ADD CONSTRAINT "auditor_services_auditorId_fkey" FOREIGN KEY ("auditorId") REFERENCES "auditors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_pricing_tiers" ADD CONSTRAINT "service_pricing_tiers_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "auditor_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tier_features" ADD CONSTRAINT "tier_features_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "service_pricing_tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
