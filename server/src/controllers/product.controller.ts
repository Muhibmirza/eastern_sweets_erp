import { publicError } from '../utils/publicError';
import { Request, Response } from 'express';
import prisma from '../utils/prisma';

const normalizeProduct = (product: any) => ({
  ...product,
  quantityPresets: product.quantityPresets ? (() => { try { return JSON.parse(product.quantityPresets); } catch { return []; } })() : null
});

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { search, categoryId, isActive, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { isActive: true };
    const searchTerm = String(search || '').trim();
    if (searchTerm) where.OR = [
      { name: { contains: searchTerm } },
      { skuCode: { contains: searchTerm } },
      { barcode: { contains: searchTerm } }
    ];
    if (categoryId) where.categoryId = categoryId;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where, skip, take: parseInt(limit as string),
        include: { category: true },
        orderBy: { name: 'asc' }
      }),
      prisma.product.count({ where })
    ]);

    res.json({ success: true, data: products.map(normalizeProduct), meta: { total, page: parseInt(page as string), limit: parseInt(limit as string) } });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getProduct = async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: { category: true, stockMovements: { take: 20, orderBy: { createdAt: 'desc' }, include: { user: { select: { name: true } } } } }
    });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: normalizeProduct(product) });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const { name, categoryId, unit, sellingPrice, costPrice, currentCost, currentStock, minStockLevel, description, skuCode, barcode, saleMode = 'UNIT', quantityPresets } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const initialCost = Number(currentCost || costPrice || 0);
    const product = await prisma.product.create({
      data: { name, categoryId, unit, sellingPrice: parseFloat(sellingPrice), costPrice: initialCost, currentCost: initialCost, currentStock: parseFloat(currentStock || '0'), minStockLevel: parseFloat(minStockLevel || '5'), description, imageUrl, skuCode: skuCode || null, barcode: barcode || null, saleMode: saleMode === 'WEIGHT' ? 'WEIGHT' : 'UNIT', quantityPresets: saleMode === 'WEIGHT' ? JSON.stringify(Array.isArray(quantityPresets) ? quantityPresets.map(Number).filter((x: number) => x > 0) : [250, 500, 750, 1000]) : null },
      include: { category: true }
    });
    res.status(201).json({ success: true, data: normalizeProduct(product) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Something went wrong. Please try again.') });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const { name, categoryId, unit, sellingPrice, costPrice, currentCost, minStockLevel, description, isActive, skuCode, barcode, saleMode, quantityPresets } = req.body;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

    const updateData: any = {
      name,
      categoryId,
      unit,
      minStockLevel: minStockLevel !== undefined ? parseFloat(minStockLevel) : undefined,
      description,
      skuCode: skuCode || null,
      barcode: barcode || null
    };
    if (isActive !== undefined) updateData.isActive = isActive === true || isActive === 'true';
    if (sellingPrice !== undefined && sellingPrice !== '') updateData.sellingPrice = parseFloat(sellingPrice);
    if (currentCost !== undefined) {
      updateData.currentCost = parseFloat(currentCost);
      updateData.costPrice = parseFloat(currentCost);
    } else if (costPrice !== undefined) {
      updateData.costPrice = parseFloat(costPrice);
    }
    if (imageUrl) updateData.imageUrl = imageUrl;
    if (saleMode !== undefined) updateData.saleMode = saleMode === 'WEIGHT' ? 'WEIGHT' : 'UNIT';
    if (quantityPresets !== undefined) updateData.quantityPresets = JSON.stringify(Array.isArray(quantityPresets) ? quantityPresets.map(Number).filter((x: number) => x > 0) : []);

    const product = await prisma.product.update({
      where: { id: req.params.id }, data: updateData, include: { category: true }
    });
    res.json({ success: true, data: normalizeProduct(product) });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getProductByBarcode = async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.findFirst({
      where: { OR: [{ barcode: req.params.barcode }, { skuCode: req.params.barcode }] },
      include: { category: true }
    });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: normalizeProduct(product) });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const product = await prisma.product.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true, data: product, message: 'Product deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not delete product') });
  }
};

export const addProductStock = async (req: any, res: Response) => {
  try {
    const { quantity, reason, batchNumber, expiryDate, costPrice, date, adjustmentType = 'IN' } = req.body;
    const qty = Number(quantity);
    const unitCost = costPrice !== undefined && costPrice !== '' ? Number(costPrice) : null;
    const movementType = adjustmentType === 'OUT' ? 'OUT' : 'IN';

    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Quantity to add is required' });
    }
    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) {
      return res.status(400).json({ success: false, message: 'Cost price must be valid' });
    }

    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    if (movementType === 'OUT' && qty > product.currentStock) {
      return res.status(400).json({ success: false, message: `Cannot remove ${qty}. Current stock is ${product.currentStock}` });
    }

    const updatedProduct = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: product.id },
        data: {
          currentStock: movementType === 'IN' ? { increment: qty } : { decrement: qty },
          ...(unitCost !== null ? { currentCost: unitCost, costPrice: unitCost } : {})
        },
        include: { category: true }
      });

      await tx.stockMovement.create({
        data: {
          productId: product.id,
          type: movementType,
          quantity: qty,
          reason: reason || (movementType === 'IN' ? 'Manual stock addition' : 'Manual stock removal'),
          batchNumber: batchNumber || null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          userId: req.user.id,
          createdAt: date ? new Date(date) : new Date()
        }
      });

      return updated;
    });

    res.json({ success: true, data: updatedProduct });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not add stock') });
  }
};

export const getLowStockProducts = async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true, currentStock: { lte: prisma.product.fields.minStockLevel } },
      include: { category: true }
    });
    res.json({ success: true, data: products });
  } catch {
    // Fallback using raw comparison
    const products = await prisma.$queryRaw`
      SELECT p.*, c.name as category_name 
      FROM "Product" p 
      JOIN "Category" c ON p."categoryId" = c.id 
      WHERE p."isActive" = true AND p."currentStock" <= p."minStockLevel"
    `;
    res.json({ success: true, data: products });
  }
};
