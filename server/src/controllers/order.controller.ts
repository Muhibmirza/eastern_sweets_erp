import { publicError } from '../utils/publicError';
import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import dayjs from 'dayjs';
import { createOrderRevenueEntry } from '../services/journalService';

export const getOrders = async (req: Request, res: Response) => {
  try {
    const { status, type, date, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const where: any = {};

    if (status) where.status = status;
    if (type) where.type = type;
    if (date) {
      where.deliveryDate = {
        gte: new Date(date as string + 'T00:00:00'),
        lte: new Date(date as string + 'T23:59:59')
      };
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where, skip, take: parseInt(limit as string),
        include: { customer: true, items: { include: { product: true } } },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.order.count({ where })
    ]);

    res.json({ success: true, data: orders, meta: { total } });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getOrder = async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { customer: true, items: { include: { product: { include: { category: true } } } } }
    });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const createOrder = async (req: Request, res: Response) => {
  try {
    const { customerId, type, items, advancePaid = 0, deliveryDate, notes } = req.body;
    if (!customerId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Customer and at least one item are required' });
    }

    let totalAmount = 0;
    const orderItems: any[] = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) return res.status(404).json({ success: false, message: `Product not found` });
      const quantity = parseFloat(item.quantity);
      const unitPrice = item.unitPrice !== undefined ? parseFloat(item.unitPrice) : product.sellingPrice;
      if (!quantity || quantity <= 0 || !unitPrice || unitPrice <= 0) {
        return res.status(400).json({ success: false, message: 'Item quantity and unit price must be greater than 0' });
      }
      const subtotal = unitPrice * quantity;
      totalAmount += subtotal;
      orderItems.push({ productId: item.productId, quantity, unitPrice, subtotal });
    }

    const dueAmount = totalAmount - parseFloat(advancePaid);

    const order = await prisma.order.create({
      data: {
        customerId,
        type,
        totalAmount,
        advancePaid: parseFloat(advancePaid),
        dueAmount,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        notes,
        items: { create: orderItems }
      },
      include: { customer: true, items: { include: { product: true } } }
    });

    await prisma.customer.update({ where: { id: customerId }, data: { totalOrders: { increment: 1 } } });

    res.status(201).json({ success: true, data: order });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Something went wrong. Please try again.') });
  }
};

export const updateOrder = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true } });
    if (!existing) return res.status(404).json({ success: false, message: 'Order not found' });
    if (existing.status !== 'PENDING') return res.status(400).json({ success: false, message: 'Only pending orders can be edited' });

    const { customerId, type, items, advancePaid = 0, deliveryDate, notes } = req.body;
    if (!customerId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Customer and at least one item are required' });
    }

    let totalAmount = 0;
    const orderItems: any[] = [];
    for (const item of items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
      const quantity = parseFloat(item.quantity);
      const unitPrice = item.unitPrice !== undefined ? parseFloat(item.unitPrice) : product.sellingPrice;
      if (!quantity || quantity <= 0 || !unitPrice || unitPrice <= 0) {
        return res.status(400).json({ success: false, message: 'Item quantity and unit price must be greater than 0' });
      }
      const subtotal = quantity * unitPrice;
      totalAmount += subtotal;
      orderItems.push({ productId: item.productId, quantity, unitPrice, subtotal });
    }

    const order = await prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { orderId: req.params.id } });
      return tx.order.update({
        where: { id: req.params.id },
        data: {
          customerId,
          type,
          totalAmount,
          advancePaid: parseFloat(advancePaid),
          dueAmount: totalAmount - parseFloat(advancePaid),
          deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
          notes,
          items: { create: orderItems }
        },
        include: { customer: true, items: { include: { product: true } } }
      });
    });
    res.json({ success: true, data: order });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not update order') });
  }
};

export const updateOrderStatus = async (req: Request, res: Response) => {
  try {
    const { status, advancePaid } = req.body;
    const order = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new Error('Order not found');
      const updateData: any = { status };
      if (advancePaid !== undefined) {
        updateData.advancePaid = parseFloat(advancePaid);
        updateData.dueAmount = existing.totalAmount - parseFloat(advancePaid);
      }

      const updated = await tx.order.update({
        where: { id: req.params.id },
        data: updateData,
        include: { customer: true, items: { include: { product: true } } }
      });

      if (status === 'DELIVERED' && existing.status !== 'DELIVERED') {
        const existingJournal = await tx.journalEntry.findFirst({ where: { referenceType: 'ORDER', referenceId: existing.id } });
        if (!existingJournal) await createOrderRevenueEntry(existing.id, updated.totalAmount, tx);
        if (updated.dueAmount > 0) {
          await tx.customer.update({
            where: { id: updated.customerId },
            data: { outstandingBalance: { increment: updated.dueAmount } }
          });
        }
      }
      return updated;
    });
    res.json({ success: true, data: order });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Server error') });
  }
};

export const deleteOrder = async (req: Request, res: Response) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.status !== 'CANCELLED') return res.status(400).json({ success: false, message: 'Only cancelled orders can be deleted' });
    await prisma.order.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: order, message: 'Order deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not delete order') });
  }
};

export const getTodaysDeliveries = async (req: Request, res: Response) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const orders = await prisma.order.findMany({
      where: {
        deliveryDate: { gte: new Date(today + 'T00:00:00'), lte: new Date(today + 'T23:59:59') },
        status: { notIn: ['DELIVERED', 'CANCELLED'] }
      },
      include: { customer: true, items: { include: { product: true } } },
      orderBy: { deliveryDate: 'asc' }
    });
    res.json({ success: true, data: orders });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getKanbanOrders = async (req: Request, res: Response) => {
  try {
    const statuses = ['PENDING', 'CONFIRMED', 'READY', 'DELIVERED'];
    const result: any = {};

    for (const status of statuses) {
      result[status] = await prisma.order.findMany({
        where: { status: status as any },
        include: { customer: true, items: { include: { product: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20
      });
    }

    res.json({ success: true, data: result });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
