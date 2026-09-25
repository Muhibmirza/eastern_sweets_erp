-- CreateTable
CREATE TABLE "PackagingType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "extraCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "chargeType" TEXT NOT NULL DEFAULT 'FIXED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "PackagingTypeCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "packagingTypeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    CONSTRAINT "PackagingTypeCategory_packagingTypeId_fkey" FOREIGN KEY ("packagingTypeId") REFERENCES "PackagingType" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PackagingTypeCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN "packagingTypeId" TEXT REFERENCES "PackagingType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleItem" ADD COLUMN "packagingCharge" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "PackagingTypeCategory_packagingTypeId_categoryId_key" ON "PackagingTypeCategory"("packagingTypeId", "categoryId");
