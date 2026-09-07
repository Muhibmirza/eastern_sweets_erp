import { publicError } from '../utils/publicError';
import { Response } from 'express';
import dayjs from 'dayjs';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { createProductionEntry } from '../services/journalService';

export const getProductionOrders = async (_req: AuthRequest, res: Response) => {
  try {
    const orders = await prisma.productionOrder.findMany({
      include: { recipe: true, product: true, creator: { select: { name: true } }, consumptions: { include: { rawMaterial: true } } },
      orderBy: { productionDate: 'desc' }
    });
    res.json({ success: true, data: orders });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not load production orders') });
  }
};

export const getProductionOrder = async (req: AuthRequest, res: Response) => {
  const order = await prisma.productionOrder.findUnique({
    where: { id: req.params.id },
    include: { recipe: true, product: true, creator: { select: { name: true } }, consumptions: { include: { rawMaterial: true } } }
  });
  if (!order) return res.status(404).json({ success: false, message: 'Production order not found' });
  res.json({ success: true, data: order });
};

export const createProductionOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { recipeId, plannedQuantity, productionDate, notes } = req.body;
    const recipe = await prisma.recipe.findUnique({ where: { id: recipeId }, include: { ingredients: true } });
    if (!recipe) return res.status(404).json({ success: false, message: 'Recipe not found' });
    if (!Number(plannedQuantity) || Number(plannedQuantity) <= 0) return res.status(400).json({ success: false, message: 'Planned quantity must be greater than zero' });
    const multiplier = Number(plannedQuantity) / recipe.yieldQuantity;
    const order = await prisma.productionOrder.create({
      data: {
        recipeId,
        productId: recipe.productId,
        plannedQuantity: Number(plannedQuantity),
        productionDate: productionDate ? new Date(productionDate) : new Date(),
        notes,
        createdBy: req.user!.id,
        consumptions: {
          create: recipe.ingredients.map((item) => ({
            rawMaterialId: item.rawMaterialId,
            plannedQty: item.quantity * multiplier,
            unit: item.unit
          }))
        }
      },
      include: { recipe: true, product: true, consumptions: { include: { rawMaterial: true } } }
    });
    res.status(201).json({ success: true, data: order });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not create production order') });
  }
};

export const updateProductionOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { recipeId, plannedQuantity, productionDate, notes } = req.body;

    const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.productionOrder.findUnique({
      where: { id: req.params.id },
      include: { recipe: { include: { ingredients: true } } }
    });
    if (!existing) throw new Error('Production order not found');
    if (existing.status === 'COMPLETED') throw new Error('Completed production orders cannot be edited');

    const nextRecipeId = recipeId || existing.recipeId;
    const recipe = await tx.recipe.findUnique({ where: { id: nextRecipeId }, include: { ingredients: true } });
    if (!recipe) throw new Error('Recipe not found');

    const nextPlannedQuantity = plannedQuantity === undefined ? existing.plannedQuantity : Number(plannedQuantity);
    if (!Number.isFinite(nextPlannedQuantity) || nextPlannedQuantity <= 0) throw new Error('Planned quantity must be greater than zero');

    const multiplier = nextPlannedQuantity / recipe.yieldQuantity;
    const shouldRebuildConsumptions = nextRecipeId !== existing.recipeId || nextPlannedQuantity !== existing.plannedQuantity;

    if (shouldRebuildConsumptions) {
      await tx.productionConsumption.deleteMany({ where: { productionOrderId: existing.id } });
    }

    return tx.productionOrder.update({
      where: { id: existing.id },
      data: {
        recipeId: nextRecipeId,
        productId: recipe.productId,
        plannedQuantity: nextPlannedQuantity,
        productionDate: productionDate ? new Date(productionDate) : existing.productionDate,
        notes,
        ...(shouldRebuildConsumptions
          ? {
              consumptions: {
                create: recipe.ingredients.map((item) => ({
                  rawMaterialId: item.rawMaterialId,
                  plannedQty: item.quantity * multiplier,
                  unit: item.unit
                }))
              }
            }
          : {})
      },
      include: { recipe: true, product: true, creator: { select: { name: true } }, consumptions: { include: { rawMaterial: true } } }
    });
  });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(400).json({ success: false, message: publicError(error, 'Could not update production order') });
  }
};

export const deleteProductionOrder = async (req: AuthRequest, res: Response) => {
  const existing = await prisma.productionOrder.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ success: false, message: 'Production order not found' });
  if (existing.status === 'COMPLETED') {
    return res.status(400).json({ success: false, message: 'Completed production orders cannot be deleted' });
  }

  await prisma.$transaction(async (tx) => {
    await tx.salary.updateMany({ where: { linkedProductionOrderId: existing.id }, data: { linkedProductionOrderId: null } });
    await tx.productionOrder.delete({ where: { id: existing.id } });
  });
  res.json({ success: true, data: { id: existing.id } });
};

export const startProductionOrder = async (req: AuthRequest, res: Response) => {
  const order = await prisma.productionOrder.update({ where: { id: req.params.id }, data: { status: 'IN_PROGRESS' } });
  res.json({ success: true, data: order });
};

export const completeProductionOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { actualQuantity, consumptions = [], labourCost, laborCost, packagingCost, packingCost, otherOverheads, wastagePercent } = req.body;
    const completed = await prisma.$transaction(async (tx) => {
    const order = await tx.productionOrder.findUnique({
      where: { id: req.params.id },
      include: { product: true, recipe: true, consumptions: { include: { rawMaterial: true } } }
    });
      if (!order) throw new Error('Production order not found');
      if (order.status === 'COMPLETED') throw new Error('Production order is already completed');

    let rawMaterialCost = 0;
    for (const consumption of order.consumptions) {
      const override = consumptions.find((item: any) => item.rawMaterialId === consumption.rawMaterialId);
      const actualQty = Number(override?.actualQty ?? consumption.plannedQty);
      const from = (consumption.unit || '').toUpperCase();
      const to = (consumption.rawMaterial.unit || '').toUpperCase();
      let costingQty = actualQty;
      if (from === 'GRAM' && to === 'KG') costingQty = actualQty / 1000;
      if (from === 'KG' && to === 'GRAM') costingQty = actualQty * 1000;
      rawMaterialCost += costingQty * (consumption.rawMaterial.avgCost || consumption.rawMaterial.costPerUnit || 0);
      await tx.rawMaterial.update({ where: { id: consumption.rawMaterialId }, data: { currentStock: { decrement: costingQty } } });
      await tx.productionConsumption.update({ where: { id: consumption.id }, data: { actualQty } });
      await tx.stockMovement.create({
        data: {
          rawMaterialId: consumption.rawMaterialId,
          type: 'OUT',
          quantity: actualQty,
          reason: `Production ${order.id}`,
          userId: req.user!.id
        }
      });
    }

    const finishedQty = Number(actualQuantity || order.plannedQuantity);
    const scale = order.recipe.yieldQuantity > 0 ? finishedQty / order.recipe.yieldQuantity : 1;
    const finalLabourCost = labourCost !== undefined || laborCost !== undefined ? Number(labourCost ?? laborCost) : (order.recipe.labourCost || order.recipe.laborCost || 0) * scale;
    const finalGasCost = 0;
    const finalElectricityCost = 0;
    const finalPackagingCost = packagingCost !== undefined || packingCost !== undefined ? Number(packagingCost ?? packingCost) : (order.recipe.packagingCost || order.recipe.packingCost || 0) * scale;
    const finalOtherOverheads = otherOverheads !== undefined ? Number(otherOverheads) : (order.recipe.otherOverheads || 0) * scale;
    const finalWastagePercent = wastagePercent !== undefined ? Number(wastagePercent) : Number(order.recipe.wastagePercent || 0);
    const wastageCost = (finalWastagePercent / 100) * rawMaterialCost;
    const actualOutput = finishedQty * (1 - finalWastagePercent / 100);
    const totalBatchCost = rawMaterialCost + finalLabourCost + finalPackagingCost + finalOtherOverheads + wastageCost;
    const costPerUnit = (actualOutput > 0 ? totalBatchCost / actualOutput : (finishedQty > 0 ? totalBatchCost / finishedQty : 0));
    await tx.product.update({
      where: { id: order.productId },
      data: { currentStock: { increment: finishedQty }, currentCost: costPerUnit, costPrice: costPerUnit }
    });
    await tx.stockMovement.create({
      data: { productId: order.productId, type: 'IN', quantity: finishedQty, reason: `Production ${order.id}`, userId: req.user!.id }
    });
    const updated = await tx.productionOrder.update({
      where: { id: order.id },
      data: {
        status: 'COMPLETED',
        actualQuantity: finishedQty,
        rawMaterialCost,
        labourCost: finalLabourCost,
        gasCost: finalGasCost,
        electricityCost: finalElectricityCost,
        packagingCost: finalPackagingCost,
        otherOverheads: finalOtherOverheads,
        wastageCost,
        totalCost: totalBatchCost,
        costPerUnit
      },
      include: { product: true, recipe: true, consumptions: { include: { rawMaterial: true } } }
    });
    await createProductionEntry(order.id, rawMaterialCost, totalBatchCost, tx);
      return { ...updated, totalCost: totalBatchCost, qtyProduced: finishedQty, costPerUnit };
    });
    res.json({ success: true, data: completed });
  } catch (error: any) {
    res.status(400).json({ success: false, message: publicError(error, 'Could not complete production order') });
  }
};

export const cancelProductionOrder = async (req: AuthRequest, res: Response) => {
  const order = await prisma.productionOrder.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
  res.json({ success: true, data: order });
};

export const getTodayProduction = async (_req: AuthRequest, res: Response) => {
  const start = new Date(dayjs().format('YYYY-MM-DD'));
  const end = new Date(dayjs().format('YYYY-MM-DD') + 'T23:59:59');
  const orders = await prisma.productionOrder.findMany({
    where: { productionDate: { gte: start, lte: end } },
    include: { product: true, recipe: true },
    orderBy: { productionDate: 'asc' }
  });
  res.json({ success: true, data: orders });
};
