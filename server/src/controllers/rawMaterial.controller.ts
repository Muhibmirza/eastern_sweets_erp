import { publicError } from '../utils/publicError';
import { Response } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const getRawMaterials = async (req: AuthRequest, res: Response) => {
  try {
    const { search, supplierId, lowStock } = req.query;
    const where: any = { isActive: true };
    if (search && String(search).trim()) {
      const term = String(search).trim();
      where.OR = [
        { name: { contains: term } },
        { supplier: { name: { contains: term } } }
      ];
    }
    if (supplierId) where.supplierId = String(supplierId);

    const materials = await prisma.rawMaterial.findMany({
      where,
      include: { supplier: true },
      orderBy: { name: 'asc' }
    });
    const enriched = materials.map((material) => ({
      ...material,
      isLow: material.currentStock <= material.minStockLevel
    }));
    res.json({ success: true, data: lowStock === 'true' ? enriched.filter((material) => material.isLow) : enriched });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not load raw materials') });
  }
};

export const getRawMaterial = async (req: AuthRequest, res: Response) => {
  try {
    const material = await prisma.rawMaterial.findUnique({
      where: { id: req.params.id },
      include: {
        supplier: true,
        stockMovements: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { name: true } } }
        }
      }
    });
    if (!material || !material.isActive) return res.status(404).json({ success: false, message: 'Raw material not found' });
    res.json({ success: true, data: { ...material, isLow: material.currentStock <= material.minStockLevel } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not load raw material') });
  }
};

export const createRawMaterial = async (req: AuthRequest, res: Response) => {
  try {
    const { name, unit, currentStock = 0, minStockLevel = 10, costPerUnit, avgCost, supplierId } = req.body;
    if (!name || !unit || toNumber(costPerUnit) <= 0) {
      return res.status(400).json({ success: false, message: 'Name, unit, and cost per unit greater than 0 are required' });
    }

    const material = await prisma.$transaction(async (tx) => {
      const created = await tx.rawMaterial.create({
        data: {
          name,
          unit,
          currentStock: toNumber(currentStock),
          minStockLevel: toNumber(minStockLevel, 10),
          costPerUnit: toNumber(costPerUnit),
          avgCost: toNumber(avgCost, toNumber(costPerUnit)),
          supplierId: supplierId || null
        },
        include: { supplier: true }
      });

      const openingQty = toNumber(currentStock);
      if (created.supplierId && openingQty > 0) {
        const subtotal = openingQty * toNumber(costPerUnit);
        await tx.purchaseOrder.create({
          data: {
            supplierId: created.supplierId,
            totalAmount: subtotal,
            paidAmount: 0,
            status: 'RECEIVED',
            notes: `Opening stock for ${created.name}`,
            items: { create: [{ rawMaterialId: created.id, quantity: openingQty, unitCost: toNumber(costPerUnit), subtotal }] }
          }
        });
        await tx.supplier.update({ where: { id: created.supplierId }, data: { balance: { increment: subtotal } } });
      }

      return created;
    });
    res.status(201).json({ success: true, data: { ...material, isLow: material.currentStock <= material.minStockLevel } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not create raw material') });
  }
};

export const updateRawMaterial = async (req: AuthRequest, res: Response) => {
  try {
    const { name, unit, minStockLevel, costPerUnit, avgCost, supplierId } = req.body;
    if (!name || !unit || toNumber(costPerUnit) <= 0) {
      return res.status(400).json({ success: false, message: 'Name, unit, and cost per unit greater than 0 are required' });
    }

    const material = await prisma.rawMaterial.update({
      where: { id: req.params.id },
      data: {
        name,
        unit,
        minStockLevel: toNumber(minStockLevel, 10),
        costPerUnit: toNumber(costPerUnit),
        avgCost: avgCost !== undefined ? toNumber(avgCost) : toNumber(costPerUnit),
        supplierId: supplierId || null
      },
      include: { supplier: true }
    });
    res.json({ success: true, data: { ...material, isLow: material.currentStock <= material.minStockLevel } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not update raw material') });
  }
};

export const deleteRawMaterial = async (req: AuthRequest, res: Response) => {
  try {
    const recipeUses = await prisma.recipeIngredient.count({ where: { rawMaterialId: req.params.id } });
    const material = await prisma.rawMaterial.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });
    res.json({
      success: true,
      data: material,
      message: recipeUses ? 'Raw material deactivated. It is still referenced by existing recipes.' : 'Raw material deleted'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not delete raw material') });
  }
};

export const stockIn = async (req: AuthRequest, res: Response) => {
  try {
    const quantity = toNumber(req.body.quantity);
    if (quantity <= 0) return res.status(400).json({ success: false, message: 'Quantity must be greater than 0' });
    const { reason, batchNumber, expiryDate } = req.body;
    const transactionDate = req.body.date ? new Date(req.body.date) : new Date();
    const result = await prisma.$transaction(async (tx) => {
      const material = await tx.rawMaterial.update({
        where: { id: req.params.id },
        data: { currentStock: { increment: quantity } },
        include: { supplier: true }
      });
      const movement = await tx.stockMovement.create({
        data: {
          rawMaterialId: req.params.id,
          type: 'IN',
          quantity,
          reason: reason || 'Manual stock in',
          batchNumber: batchNumber || null,
          expiryDate: expiryDate ? new Date(expiryDate) : null,
          userId: req.user!.id,
          createdAt: transactionDate
        }
      });
      let purchase: any = null;
      if (material.supplierId) {
        const unitCost = toNumber(material.costPerUnit || material.avgCost);
        const subtotal = quantity * unitCost;
        purchase = await tx.purchaseOrder.create({
          data: {
            supplierId: material.supplierId,
            totalAmount: subtotal,
            paidAmount: 0,
            status: 'RECEIVED',
            notes: reason || `Stock in for ${material.name}`,
            createdAt: transactionDate,
            items: { create: [{ rawMaterialId: material.id, quantity, unitCost, subtotal }] }
          },
          include: { items: { include: { rawMaterial: true } } }
        });
        await tx.supplier.update({ where: { id: material.supplierId }, data: { balance: { increment: subtotal } } });
      }
      return { material: { ...material, isLow: material.currentStock <= material.minStockLevel }, movement, purchase };
    });
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not add stock') });
  }
};

export const stockOut = async (req: AuthRequest, res: Response) => {
  try {
    const quantity = toNumber(req.body.quantity);
    if (quantity <= 0) return res.status(400).json({ success: false, message: 'Quantity must be greater than 0' });
    if (!req.body.reason) return res.status(400).json({ success: false, message: 'Reason is required' });

    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.rawMaterial.findUnique({ where: { id: req.params.id } });
      if (!current || !current.isActive) throw new Error('Raw material not found');
      if (quantity > current.currentStock) throw new Error(`Only ${current.currentStock} ${current.unit} available`);

      const material = await tx.rawMaterial.update({
        where: { id: req.params.id },
        data: { currentStock: { decrement: quantity } },
        include: { supplier: true }
      });
      const movement = await tx.stockMovement.create({
        data: {
          rawMaterialId: req.params.id,
          type: 'OUT',
          quantity,
          reason: req.body.reason,
          userId: req.user!.id,
          createdAt: req.body.date ? new Date(req.body.date) : new Date()
        }
      });
      return { material: { ...material, isLow: material.currentStock <= material.minStockLevel }, movement };
    });
    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    res.status(error.message?.includes('Only ') ? 400 : 500).json({ success: false, message: publicError(error, 'Could not deduct stock') });
  }
};
