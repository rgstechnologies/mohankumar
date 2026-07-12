-- CreateTable
CREATE TABLE "print_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "docKind" TEXT NOT NULL DEFAULT 'invoice',
    "name" TEXT NOT NULL,
    "design" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "print_templates_companyId_docKind_idx" ON "print_templates"("companyId", "docKind");

-- AddForeignKey
ALTER TABLE "print_templates" ADD CONSTRAINT "print_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
