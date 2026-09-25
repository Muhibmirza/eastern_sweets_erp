-- CreateTable
CREATE TABLE "KitchenTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rawMaterialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "transferredBy" TEXT NOT NULL,
    "receivedBy" TEXT,
    "notes" TEXT,
    "transferDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KitchenTransfer_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "KitchenTransfer_transferredBy_fkey" FOREIGN KEY ("transferredBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "KitchenProductionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "quantityProduced" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "producedBy" TEXT NOT NULL,
    "productionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KitchenProductionRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "KitchenProductionRun_producedBy_fkey" FOREIGN KEY ("producedBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "KitchenConsumption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kitchenProductionRunId" TEXT NOT NULL,
    "rawMaterialId" TEXT NOT NULL,
    "quantityDeducted" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    CONSTRAINT "KitchenConsumption_kitchenProductionRunId_fkey" FOREIGN KEY ("kitchenProductionRunId") REFERENCES "KitchenProductionRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KitchenConsumption_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "KitchenAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rawMaterialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "adjustType" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "adjustedBy" TEXT NOT NULL,
    "adjustedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KitchenAdjustment_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "KitchenAdjustment_adjustedBy_fkey" FOREIGN KEY ("adjustedBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
