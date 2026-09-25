-- AlterTable
ALTER TABLE "Product" ADD COLUMN "saleMode" TEXT NOT NULL DEFAULT 'UNIT';
ALTER TABLE "Product" ADD COLUMN "quantityPresets" TEXT;
