import { publicError } from '../utils/publicError';
import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import dayjs from 'dayjs';
import { createSaleEntry, createSalesReturnEntry } from '../services/journalService';
import { calculatePackagingCharge } from '../utils/packaging';

const generateInvoiceNo = () => {
  const date = dayjs().format('YYYYMMDD');
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `ES-${date}-${random}`;
};

const generateReturnNo = () => {
  const date = dayjs().format('YYYYMMDD');
  const random = Math.floor(Math.random() * 900) + 100;
  return `RET-${date}-${random}`;
};

const orderTypeFromSale = (sale: { isDelivery?: boolean | null; customerId?: string | null }) => {
  if (sale.isDelivery) return 'Delivery';
  if (sale.customerId) return 'Advance';
  return 'Walk-in';
};

export const getSales = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, cashierId, invoiceNo, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const where: any = {};

    if (startDate && endDate) {
      where.createdAt = { gte: new Date(startDate as string), lte: new Date(endDate as string + 'T23:59:59') };
    }
    if (cashierId) where.cashierId = cashierId;
    if (invoiceNo) where.invoiceNo = { contains: String(invoiceNo) };

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where, skip, take: parseInt(limit as string),
        include: { customer: true, cashier: { select: { name: true } }, items: { include: { product: true, packagingType: true } } },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.sale.count({ where })
    ]);

    res.json({ success: true, data: sales, meta: { total, page: parseInt(page as string) } });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getSale = async (req: Request, res: Response) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: { customer: true, cashier: { select: { name: true, email: true } }, items: { include: { product: { include: { category: true } }, packagingType: true } } }
    });
    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });
    if (!sale.tokenNumber) {
      const token = await prisma.token.findFirst({
        where: { OR: [{ saleId: sale.id }, { id: sale.tokenId || '' }] },
        select: { tokenNumber: true }
      });
      return res.json({ success: true, data: { ...sale, tokenNumber: token?.tokenNumber || null } });
    }
    res.json({ success: true, data: sale });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getSaleByInvoice = async (req: Request, res: Response) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { invoiceNo: req.params.invoiceNo },
      include: {
        customer: true,
        cashier: { select: { name: true, email: true } },
        items: { include: { product: { include: { category: true } }, packagingType: true, returns: true } }
      }
    });
    if (!sale) return res.status(404).json({ success: false, message: 'Sale not found' });
    if (!sale.tokenNumber) {
      const token = await prisma.token.findFirst({
        where: { OR: [{ saleId: sale.id }, { id: sale.tokenId || '' }] },
        select: { tokenNumber: true }
      });
      return res.json({ success: true, data: { ...sale, tokenNumber: token?.tokenNumber || null } });
    }
    res.json({ success: true, data: sale });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Server error') });
  }
};

export const getSaleItems = async (req: Request, res: Response) => {
  try {
    const {
      startDate,
      endDate,
      productId,
      customerId,
      customerSearch,
      invoiceNo,
      tokenNumber,
      orderType,
      page = '1',
      limit = '50'
    } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const saleWhere: any = {};
    if (startDate && endDate) saleWhere.createdAt = { gte: new Date(String(startDate)), lte: new Date(String(endDate) + 'T23:59:59') };
    if (customerId) saleWhere.customerId = String(customerId);
    if (invoiceNo) saleWhere.invoiceNo = { contains: String(invoiceNo) };
    if (tokenNumber) saleWhere.tokenNumber = Number(tokenNumber);
    if (customerSearch) saleWhere.customer = { name: { contains: String(customerSearch) } };
    if (orderType === 'DELIVERY') saleWhere.isDelivery = true;
    if (orderType === 'ADVANCE') {
      saleWhere.isDelivery = false;
      saleWhere.customerId = { not: null };
    }
    if (orderType === 'WALKIN') {
      saleWhere.isDelivery = false;
      saleWhere.customerId = null;
    }

    const where: any = { sale: saleWhere };
    if (productId) where.productId = String(productId);

    const includeOrders = !tokenNumber && orderType !== 'WALKIN';
    const returnsWhere: any = {};
    if (startDate && endDate) returnsWhere.createdAt = { gte: new Date(String(startDate)), lte: new Date(String(endDate) + 'T23:59:59') };

    const [items, total, totals, orderItems, orderTotal, orderTotals, returnsTotal] = await Promise.all([
      prisma.saleItem.findMany({
        where,
        include: {
          product: { select: { name: true, unit: true } },
          sale: {
            include: {
              customer: { select: { name: true } },
              cashier: { select: { name: true } }
            }
          }
        },
        orderBy: { sale: { createdAt: 'desc' } },
        skip,
        take: Number(limit)
      }),
      prisma.saleItem.count({ where }),
      prisma.saleItem.aggregate({ where, _sum: { quantity: true, subtotal: true } }),
      !includeOrders ? Promise.resolve([]) : prisma.orderItem.findMany({
        where: {
          productId: productId ? String(productId) : undefined,
          order: {
            status: 'DELIVERED',
            updatedAt: startDate && endDate ? { gte: new Date(String(startDate)), lte: new Date(String(endDate) + 'T23:59:59') } : undefined,
            customerId: customerId ? String(customerId) : undefined,
            id: invoiceNo ? { contains: String(invoiceNo).replace(/^ORD-/i, '') } : undefined,
            customer: customerSearch ? { name: { contains: String(customerSearch) } } : undefined,
            type: orderType === 'ADVANCE' || orderType === 'DELIVERY' ? String(orderType) : undefined
          }
        },
        include: {
          product: { select: { name: true, unit: true } },
          order: { include: { customer: { select: { name: true } } } }
        },
        orderBy: { order: { updatedAt: 'desc' } },
        take: Number(limit)
      }),
      !includeOrders ? Promise.resolve(0) : prisma.orderItem.count({
        where: {
          productId: productId ? String(productId) : undefined,
          order: {
            status: 'DELIVERED',
            updatedAt: startDate && endDate ? { gte: new Date(String(startDate)), lte: new Date(String(endDate) + 'T23:59:59') } : undefined,
            customerId: customerId ? String(customerId) : undefined,
            id: invoiceNo ? { contains: String(invoiceNo).replace(/^ORD-/i, '') } : undefined,
            customer: customerSearch ? { name: { contains: String(customerSearch) } } : undefined,
            type: orderType === 'ADVANCE' || orderType === 'DELIVERY' ? String(orderType) : undefined
          }
        }
      }),
      !includeOrders ? Promise.resolve({ _sum: { quantity: 0, subtotal: 0 } }) : prisma.orderItem.aggregate({
        where: {
          productId: productId ? String(productId) : undefined,
          order: {
            status: 'DELIVERED',
            updatedAt: startDate && endDate ? { gte: new Date(String(startDate)), lte: new Date(String(endDate) + 'T23:59:59') } : undefined,
            customerId: customerId ? String(customerId) : undefined,
            id: invoiceNo ? { contains: String(invoiceNo).replace(/^ORD-/i, '') } : undefined,
            customer: customerSearch ? { name: { contains: String(customerSearch) } } : undefined,
            type: orderType === 'ADVANCE' || orderType === 'DELIVERY' ? String(orderType) : undefined
          }
        },
        _sum: { quantity: true, subtotal: true }
      }),
      prisma.saleReturn.aggregate({ where: returnsWhere, _sum: { totalAmount: true } })
    ]);
    const saleIds = [...new Set(items.map((item) => item.saleId))];
    const tokenIds = [...new Set(items.map((item) => item.sale.tokenId).filter(Boolean))] as string[];
    const linkedTokens = saleIds.length
      ? await prisma.token.findMany({
          where: { OR: [{ saleId: { in: saleIds } }, ...(tokenIds.length ? [{ id: { in: tokenIds } }] : [])] },
          select: { id: true, saleId: true, tokenNumber: true }
        })
      : [];
    const tokenBySaleId = new Map(linkedTokens.filter((token) => token.saleId).map((token) => [token.saleId!, token.tokenNumber]));
    const tokenById = new Map(linkedTokens.map((token) => [token.id, token.tokenNumber]));
    const saleForTokenInference = new Map(items.map((item) => [item.saleId, item.sale]));
    const unresolvedSales = Array.from(saleForTokenInference.entries())
      .filter(([, sale]) => !sale.tokenNumber && !sale.tokenId && !tokenBySaleId.has(sale.id));
    const inferredTokenBySaleId = new Map<string, number>();
    if (unresolvedSales.length) {
      const saleDates = unresolvedSales.map(([, sale]) => new Date(sale.createdAt).getTime());
      const tokenCandidates = await prisma.token.findMany({
        where: {
          cashierId: { in: Array.from(new Set(unresolvedSales.map(([, sale]) => sale.cashierId))) },
          createdAt: {
            gte: new Date(Math.min(...saleDates) - 24 * 60 * 60 * 1000),
            lte: new Date(Math.max(...saleDates) + 60 * 1000)
          }
        },
        select: { id: true, saleId: true, tokenNumber: true, cashierId: true, totalAmount: true, createdAt: true },
        orderBy: { createdAt: 'asc' }
      });
      const usedTokenIds = new Set<string>();
      for (const [saleId, sale] of unresolvedSales.sort((a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime())) {
        const saleTime = new Date(sale.createdAt).getTime();
        const possible = tokenCandidates
          .filter((token) => {
            if (usedTokenIds.has(token.id)) return false;
            if (token.saleId && token.saleId !== saleId) return false;
            const tokenTime = new Date(token.createdAt).getTime();
            return token.cashierId === sale.cashierId && tokenTime <= saleTime && saleTime - tokenTime <= 24 * 60 * 60 * 1000;
          })
          .sort((a, b) => {
            const amountScoreA = Math.abs(Number(a.totalAmount) - Number(sale.totalAmount));
            const amountScoreB = Math.abs(Number(b.totalAmount) - Number(sale.totalAmount));
            if (amountScoreA !== amountScoreB) return amountScoreA - amountScoreB;
            return Math.abs(saleTime - new Date(a.createdAt).getTime()) - Math.abs(saleTime - new Date(b.createdAt).getTime());
          });
        const match = possible.find((token) => {
          const tokenTime = new Date(token.createdAt).getTime();
          return token.cashierId === sale.cashierId
            && Math.abs(Number(token.totalAmount) - Number(sale.totalAmount)) < 0.01
            && tokenTime <= saleTime
            && saleTime - tokenTime <= 24 * 60 * 60 * 1000;
        }) || possible[0];
        if (match) {
          inferredTokenBySaleId.set(saleId, match.tokenNumber);
          usedTokenIds.add(match.id);
        }
      }
    }

    const saleRows = items.map((item) => ({
      id: item.id,
      recordType: 'SALE',
      saleId: item.saleId,
      invoiceNo: item.sale.invoiceNo,
        createdAt: item.sale.createdAt,
        tokenNumber: item.sale.tokenNumber || (item.sale.tokenId ? tokenById.get(item.sale.tokenId) : null) || tokenBySaleId.get(item.saleId) || inferredTokenBySaleId.get(item.saleId) || null,
        orderType: orderTypeFromSale(item.sale),
      customer: item.sale.customer?.name || 'Walk-in Customer',
      product: item.product?.name || 'Item',
      unit: item.displayUnit || item.product?.unit || '',
      quantity: item.displayQuantity || item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      isDelivery: item.sale.isDelivery,
      paymentMethod: item.sale.paymentMethod
    }));
    const orderRows = orderItems.map((item: any) => ({
      id: item.id,
      recordType: 'ORDER',
      saleId: item.orderId,
      invoiceNo: `ORD-${item.orderId.slice(-6).toUpperCase()}`,
      createdAt: item.order.updatedAt,
      tokenNumber: null,
      orderType: item.order.type === 'DELIVERY' ? 'Delivery' : 'Advance',
      customer: item.order.customer?.name || 'Customer',
      product: item.product?.name || 'Item',
      unit: item.product?.unit || '',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      isDelivery: item.order.type === 'DELIVERY',
      paymentMethod: 'ORDER'
    }));
    const rows = [...saleRows, ...orderRows]
      .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
      .slice(0, Number(limit));

    const deliveredOrderWhere: any = {
      status: 'DELIVERED',
      updatedAt: startDate && endDate ? { gte: new Date(String(startDate)), lte: new Date(String(endDate) + 'T23:59:59') } : undefined,
      customerId: customerId ? String(customerId) : undefined,
      id: invoiceNo ? { contains: String(invoiceNo).replace(/^ORD-/i, '') } : undefined,
      customer: customerSearch ? { name: { contains: String(customerSearch) } } : undefined,
      type: orderType === 'ADVANCE' || orderType === 'DELIVERY' ? String(orderType) : undefined
    };
    const [saleRevenue, deliveredOrdersRevenue] = await Promise.all([
      prisma.sale.aggregate({ where: saleWhere, _sum: { netAmount: true } }),
      !includeOrders ? Promise.resolve({ _sum: { totalAmount: 0 } }) : prisma.order.aggregate({ where: deliveredOrderWhere, _sum: { totalAmount: true } })
    ]);
    const grossRevenue = Number(saleRevenue._sum.netAmount || 0) + Number(deliveredOrdersRevenue._sum.totalAmount || 0);
    const returnAmount = returnsTotal._sum.totalAmount || 0;
    const finalRevenue = grossRevenue - returnAmount;

    res.json({
      success: true,
      data: rows,
      meta: {
        total: total + Number(orderTotal || 0),
        page: Number(page),
        limit: Number(limit),
        grossRevenue,
        returnAmount,
        netRevenue: grossRevenue,
        finalRevenue,
        totalRevenue: finalRevenue,
        totalItemsSold: (totals._sum.quantity || 0) + (orderTotals._sum.quantity || 0)
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not load sales items') });
  }
};

export const getInvoiceSuggestions = async (req: Request, res: Response) => {
  try {
    const search = String(req.query.search || '').trim();
    const sales = await prisma.sale.findMany({
      where: search ? { invoiceNo: { contains: search } } : undefined,
      include: {
        customer: { select: { name: true } },
        items: { include: { product: { select: { name: true } } } }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    const saleIds = sales.map((sale) => sale.id);
    const tokenIds = [...new Set(sales.map((sale) => sale.tokenId).filter(Boolean))] as string[];
    const linkedTokens = saleIds.length
      ? await prisma.token.findMany({
          where: { OR: [{ saleId: { in: saleIds } }, ...(tokenIds.length ? [{ id: { in: tokenIds } }] : [])] },
          select: { id: true, saleId: true, tokenNumber: true }
        })
      : [];
    const tokenBySaleId = new Map(linkedTokens.filter((token) => token.saleId).map((token) => [token.saleId!, token.tokenNumber]));
    const tokenById = new Map(linkedTokens.map((token) => [token.id, token.tokenNumber]));
    res.json({
      success: true,
      data: sales.map((sale) => ({
        id: sale.id,
        invoiceNo: sale.invoiceNo,
        createdAt: sale.createdAt,
        customer: sale.customer?.name || 'Walk-in Customer',
        total: sale.netAmount,
        tokenNumber: sale.tokenNumber || (sale.tokenId ? tokenById.get(sale.tokenId) : null) || tokenBySaleId.get(sale.id) || null,
        items: sale.items.map((item) => item.product?.name || 'Item').join(', ')
      }))
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not load invoices') });
  }
};

export const createSale = async (req: any, res: Response) => {
  try {
    const {
      customerId,
      items,
      discount = 0,
      taxAmount = 0,
      paymentMethod = 'CASH',
      cashReceived,
      isDelivery = false,
      deliveryCharges = 0,
      tokenId,
      tokenNumber
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one item required' });
    }

    // Validate stock and calculate totals before any database write.
    let totalAmount = 0;
    let totalCogs = 0;
    const saleItems: any[] = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) return res.status(404).json({ success: false, message: `Product ${item.productId} not found` });
      const quantity = Number(item.quantity);
      if (!quantity || quantity <= 0) {
        return res.status(400).json({ success: false, message: `Invalid quantity for ${product.name}` });
      }
      if (quantity > product.currentStock) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}. Available: ${product.currentStock} ${product.unit}` });
      }
      const unitPrice = Number(item.unitPrice || product.sellingPrice);
      const costPrice = product.currentCost || product.costPrice || 0;
      const subtotal = unitPrice * quantity;
      let packagingType: any = null;
      let packagingCharge = 0;
      if (item.packagingTypeId) {
        packagingType = await prisma.packagingType.findFirst({
          where: { id: String(item.packagingTypeId), isActive: true, categories: { some: { categoryId: product.categoryId } } }
        });
        if (!packagingType) return res.status(400).json({ success: false, message: `Invalid packaging selection for ${product.name}` });
        packagingCharge = Math.round(calculatePackagingCharge(packagingType, quantity, subtotal));
      }
      const profit = (unitPrice - costPrice) * quantity + packagingCharge;
      totalAmount += subtotal + packagingCharge;
      totalCogs += costPrice * quantity;
      saleItems.push({
        productId: item.productId,
        quantity,
        displayQuantity: Number(item.displayQuantity ?? quantity),
        displayUnit: item.displayUnit || product.unit,
        unitPrice,
        subtotal,
        costPrice,
        profit,
        packagingTypeId: packagingType?.id || null,
        packagingCharge
      });
    }

    const finalDiscount = Number(discount || 0);
    const finalTax = Number(taxAmount || 0);
    const finalDeliveryCharges = isDelivery ? Number(deliveryCharges || 0) : 0;
    const netAmount = Math.max(totalAmount - finalDiscount + finalTax + finalDeliveryCharges, 0);
    const finalCashReceived = paymentMethod === 'CASH' && cashReceived !== undefined && cashReceived !== '' ? Number(cashReceived) : null;
    const changeGiven = finalCashReceived !== null ? finalCashReceived - netAmount : null;
    if (paymentMethod === 'CASH' && finalCashReceived !== null && finalCashReceived - netAmount < 0) {
      return res.status(400).json({ success: false, message: 'Amount entered is less than total' });
    }

    // Create sale and update stock in transaction
    const sale = await prisma.$transaction(async (tx) => {
      let sourceToken = tokenId
        ? await tx.token.findUnique({ where: { id: tokenId }, select: { id: true, tokenNumber: true } })
        : null;
      const requestedTokenNumber = tokenNumber ? Number(tokenNumber) : null;
      if (!sourceToken && requestedTokenNumber) {
        sourceToken = await tx.token.findFirst({
          where: {
            tokenNumber: requestedTokenNumber,
            status: 'PENDING',
            cashierId: req.user.id
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, tokenNumber: true }
        });
      }
      const resolvedTokenId = sourceToken?.id || tokenId || null;
      const resolvedTokenNumber = requestedTokenNumber || sourceToken?.tokenNumber || null;
      const newSale = await tx.sale.create({
        data: {
          invoiceNo: generateInvoiceNo(),
          customerId: customerId || null,
          totalAmount,
          discount: finalDiscount,
          taxAmount: finalTax,
          netAmount,
          paymentMethod,
          cashReceived: finalCashReceived,
          changeGiven: changeGiven === null ? null : Math.max(changeGiven, 0),
          isDelivery: Boolean(isDelivery),
          deliveryCharges: finalDeliveryCharges,
          tokenId: resolvedTokenId,
          tokenNumber: resolvedTokenNumber,
          cashierId: req.user.id,
          items: { create: saleItems }
        },
        include: { customer: true, cashier: { select: { name: true } }, items: { include: { product: true, packagingType: true } } }
      });

      // Deduct stock
      for (const item of saleItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: { decrement: item.quantity } }
        });
        await tx.stockMovement.create({
          data: { productId: item.productId, type: 'OUT', quantity: item.quantity, reason: `Sale: ${newSale.invoiceNo}`, userId: req.user.id }
        });
      }

      // Update customer order count
      if (customerId) {
        await tx.customer.update({ where: { id: customerId }, data: { totalOrders: { increment: 1 }, outstandingBalance: { increment: 0 } } });
      }

      await createSaleEntry(newSale.id, netAmount, tx, totalCogs);

      if (resolvedTokenId) {
        await tx.token.update({
          where: { id: resolvedTokenId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            saleId: newSale.id
          }
        });
      }

      return newSale;
    });

    res.status(201).json({ success: true, data: sale });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Something went wrong. Please try again.') });
  }
};

export const returnSale = async (req: any, res: Response) => {
  try {
    const { items = [], reason = 'Sales return' } = req.body;
    if (!items.length) return res.status(400).json({ success: false, message: 'Return items are required' });

    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id: req.params.id }, include: { items: { include: { product: true, returns: true } } } });
      if (!sale) throw new Error('Sale not found');

      let returnAmount = 0;
      const returnItems: Array<{ saleItemId: string; productId: string; quantity: number; unitPrice: number; subtotal: number }> = [];
      for (const item of items) {
        const saleItem = item.saleItemId
          ? sale.items.find((line) => line.id === item.saleItemId)
          : sale.items.find((line) => line.productId === item.productId);
        if (!saleItem) throw new Error(`Selected item was not part of this sale`);
        const qty = Number(item.quantity);
        const alreadyReturned = saleItem.returns.reduce((sum, row) => sum + row.quantity, 0);
        const available = saleItem.quantity - alreadyReturned;
        if (qty <= 0 || qty > available) throw new Error(`Invalid return quantity for ${saleItem.product.name}. Available to return: ${available}`);
        const subtotal = saleItem.unitPrice * qty;
        returnAmount += subtotal;
        returnItems.push({ saleItemId: saleItem.id, productId: saleItem.productId, quantity: qty, unitPrice: saleItem.unitPrice, subtotal });
        await tx.product.update({ where: { id: saleItem.productId }, data: { currentStock: { increment: qty } } });
        await tx.stockMovement.create({
          data: { productId: saleItem.productId, type: 'IN', quantity: qty, reason: `${reason}: ${sale.invoiceNo}`, userId: req.user.id }
        });
      }

      const saleReturn = await tx.saleReturn.create({
        data: {
          saleId: sale.id,
          returnNo: generateReturnNo(),
          reason,
          totalAmount: returnAmount,
          processedBy: req.user.id,
          items: { create: returnItems }
        },
        include: { items: true }
      });
      const journal = await createSalesReturnEntry(sale.id, returnAmount, tx);
      return { saleId: sale.id, invoiceNo: sale.invoiceNo, returnNo: saleReturn.returnNo, returnAmount, reason, journal, saleReturn };
    });

    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Something went wrong. Please try again.') });
  }
};

export const getSaleReturns = async (_req: Request, res: Response) => {
  try {
    const returns = await prisma.saleReturn.findMany({
      include: {
        sale: { select: { invoiceNo: true, createdAt: true } },
        items: { include: { product: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    const userIds = Array.from(new Set(returns.map((row) => row.processedBy).filter(Boolean)));
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));
    res.json({
      success: true,
      data: returns.map((row) => ({
        ...row,
        processedByUser: row.processedBy ? userById.get(row.processedBy) || null : null
      }))
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not load sale returns') });
  }
};

export const createDailyClosing = async (req: Request, res: Response) => {
  try {
    const date = (req.body.date as string) || dayjs().format('YYYY-MM-DD');
    const start = new Date(date + 'T00:00:00');
    const end = new Date(date + 'T23:59:59');
    const paymentBreakdown = await prisma.sale.groupBy({
      by: ['paymentMethod'],
      where: { createdAt: { gte: start, lte: end } },
      _sum: { netAmount: true },
      _count: true
    });
    const total = paymentBreakdown.reduce((sum, row) => sum + Number(row._sum.netAmount || 0), 0);
    res.status(201).json({ success: true, data: { date, total, paymentBreakdown, closedAt: new Date() } });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getDailyClosing = async (req: Request, res: Response) => {
  req.query.date = req.params.date;
  return getDailySummary(req, res);
};

export const getDailySummary = async (req: Request, res: Response) => {
  try {
    const date = (req.query.date as string) || dayjs().format('YYYY-MM-DD');
    const start = new Date(date + 'T00:00:00');
    const end = new Date(date + 'T23:59:59');

    const [sales, totalRevenue] = await Promise.all([
      prisma.sale.findMany({
        where: { createdAt: { gte: start, lte: end } },
        include: { items: { include: { product: true } } }
      }),
      prisma.sale.aggregate({
        where: { createdAt: { gte: start, lte: end } },
        _sum: { netAmount: true },
        _count: true
      })
    ]);

    // Calculate payment method breakdown
    const paymentBreakdown = await prisma.sale.groupBy({
      by: ['paymentMethod'],
      where: { createdAt: { gte: start, lte: end } },
      _sum: { netAmount: true },
      _count: true
    });

    res.json({
      success: true,
      data: {
        date,
        totalSales: totalRevenue._count,
        totalRevenue: totalRevenue._sum.netAmount || 0,
        paymentBreakdown,
        sales
      }
    });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
