import { publicError } from '../utils/publicError';
import { Router } from 'express';
import prisma from '../utils/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { createExpenseEntry, createPurchaseEntry, createPurchaseReturnEntry, createSupplierAdvanceEntry, createSupplierPaymentEntry, createSupplierPaymentWithAdvanceEntry, recalculateAccountBalances } from '../services/journalService';

// ─── SUPPLIER ROUTES ──────────────────────────────────────────────────────────
export const supplierRouter = Router();
supplierRouter.use(authenticate);

supplierRouter.get('/', async (req, res) => {
  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    include: { _count: { select: { purchaseOrders: true, rawMaterials: true } } },
    orderBy: { name: 'asc' }
  });
  const enriched = await Promise.all(
    suppliers.map(async (supplier) => {
      const totals = await prisma.purchaseOrder.aggregate({
        where: { supplierId: supplier.id },
        _sum: { totalAmount: true, paidAmount: true }
      });
      const returns = await prisma.purchaseReturn.aggregate({
        where: { supplierId: supplier.id },
        _sum: { totalAmount: true }
      });
      const purchaseBalance = Number(totals._sum.totalAmount || 0) - Number(totals._sum.paidAmount || 0) - Number(returns._sum.totalAmount || 0);
      if (supplier.balance !== purchaseBalance) {
        await prisma.supplier.update({ where: { id: supplier.id }, data: { balance: purchaseBalance } });
      }
      return { ...supplier, balance: purchaseBalance };
    })
  );
  res.json({ success: true, data: enriched });
});

supplierRouter.post('/', authorize('ADMIN'), async (req, res) => {
  const supplier = await prisma.supplier.create({ data: { ...req.body, phone: req.body.phone || null } });
  res.status(201).json({ success: true, data: supplier });
});

supplierRouter.get('/returns/all', async (_req, res) => {
  const returns = await prisma.purchaseReturn.findMany({
    include: {
      supplier: { select: { name: true } },
      purchaseOrder: true,
      items: { include: { rawMaterial: { select: { name: true, unit: true } } } }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, data: returns });
});

supplierRouter.patch('/advances/:advanceId/recover', authorize('ADMIN'), async (req: any, res) => {
  try {
    const amount = Number(req.body.amount || 0);
    if (amount <= 0) return res.status(400).json({ success: false, message: 'Recovery amount is required' });
    const result = await prisma.$transaction(async (tx) => {
      const advance = await tx.supplierAdvance.findUnique({ where: { id: req.params.advanceId } });
      if (!advance) throw new Error('Supplier advance not found');
      const deduct = Math.min(Number(advance.remainingBalance || 0), amount);
      const newBalance = Number(advance.remainingBalance || 0) - deduct;
      await tx.supplierAdvance.update({
        where: { id: advance.id },
        data: { remainingBalance: newBalance, isFullyRecovered: newBalance <= 0 }
      });
      await tx.supplierAdvanceRecovery.create({
        data: { supplierAdvanceId: advance.id, amount: deduct, recoveredOn: new Date() }
      });
      return { ...advance, recoveredAmount: deduct, remainingBalance: newBalance };
    });
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not recover advance') });
  }
});

supplierRouter.get('/:id/advances', async (req, res) => {
  const advances = await prisma.supplierAdvance.findMany({
    where: { supplierId: req.params.id },
    include: { recoveries: true },
    orderBy: { advanceDate: 'desc' }
  });
  res.json({ success: true, data: advances });
});

supplierRouter.post('/:id/advances', authorize('ADMIN'), async (req: any, res) => {
  try {
    const totalAmount = Number(req.body.totalAmount || 0);
    const advanceType = req.body.advanceType === 'LONG_TERM' ? 'LONG_TERM' : 'SHORT_TERM';
    const monthlyDeduction = advanceType === 'LONG_TERM' ? Number(req.body.monthlyDeduction || 0) : null;
    if (totalAmount <= 0) return res.status(400).json({ success: false, message: 'Advance amount is required' });
    if (advanceType === 'LONG_TERM' && (!monthlyDeduction || monthlyDeduction <= 0)) {
      return res.status(400).json({ success: false, message: 'Monthly deduction is required for long term advance' });
    }
    const advance = await prisma.$transaction(async (tx) => {
      const row = await tx.supplierAdvance.create({
        data: {
          supplierId: req.params.id,
          advanceType,
          totalAmount,
          remainingBalance: totalAmount,
          monthlyDeduction,
          reason: req.body.reason || null,
          advanceDate: req.body.advanceDate ? new Date(req.body.advanceDate) : new Date(),
          createdBy: req.user.id
        },
        include: { recoveries: true }
      });
      await createSupplierAdvanceEntry(req.params.id, row.id, totalAmount, tx);
      return row;
    });
    res.status(201).json({ success: true, data: advance });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not create supplier advance') });
  }
});

supplierRouter.get('/:id/payment-summary', async (req, res) => {
  const days = Number(req.query.days || 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [supplier, purchases, advances] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: req.params.id } }),
    prisma.purchaseOrder.findMany({
      where: { supplierId: req.params.id, createdAt: { gte: since }, status: { in: ['RECEIVED', 'PARTIAL', 'PAID'] } },
      include: { items: { include: { rawMaterial: true } } },
      orderBy: { createdAt: 'desc' }
    }),
    prisma.supplierAdvance.findMany({ where: { supplierId: req.params.id, isFullyRecovered: false }, orderBy: { advanceDate: 'asc' } })
  ]);
  if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
  const totalPurchases = purchases.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0);
  const shortTermOutstanding = advances.filter((advance) => advance.advanceType === 'SHORT_TERM').reduce((sum, advance) => sum + Number(advance.remainingBalance || 0), 0);
  const longTermOutstanding = advances.filter((advance) => advance.advanceType === 'LONG_TERM').reduce((sum, advance) => sum + Number(advance.remainingBalance || 0), 0);
  const shortTermDeduction = shortTermOutstanding;
  const longTermDeduction = advances.filter((advance) => advance.advanceType === 'LONG_TERM').reduce((sum, advance) => sum + Math.min(Number(advance.remainingBalance || 0), Number(advance.monthlyDeduction || 0)), 0);
  res.json({
    success: true,
    data: {
      supplier,
      purchases,
      advances,
      totalPurchases,
      shortTermDeduction,
      longTermDeduction,
      shortTermRemainingBalance: Math.max(shortTermOutstanding - shortTermDeduction, 0),
      longTermRemainingBalance: Math.max(longTermOutstanding - longTermDeduction, 0),
      actualPayment: Math.max(totalPurchases - shortTermDeduction - longTermDeduction, 0)
    }
  });
});

supplierRouter.get('/:id/receipt', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Start date and end date are required' });
    }
    const start = new Date(`${String(startDate)}T00:00:00`);
    const end = new Date(`${String(endDate)}T23:59:59.999`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      return res.status(400).json({ success: false, message: 'Please select a valid date range' });
    }

    const [supplier, purchases, shortTermAdvances, longTermAdvances] = await Promise.all([
      prisma.supplier.findUnique({ where: { id: req.params.id } }),
      prisma.purchaseOrder.findMany({
        where: {
          supplierId: req.params.id,
          createdAt: { gte: start, lte: end },
          status: { in: ['RECEIVED', 'PARTIAL', 'PAID'] }
        },
        include: { items: { include: { rawMaterial: true } } },
        orderBy: { createdAt: 'asc' }
      }),
      prisma.supplierAdvance.findMany({
        where: { supplierId: req.params.id, advanceType: 'SHORT_TERM', isFullyRecovered: false }
      }),
      prisma.supplierAdvance.findMany({
        where: { supplierId: req.params.id, advanceType: 'LONG_TERM', isFullyRecovered: false }
      })
    ]);

    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });

    const materialMap: Record<string, { id: string; name: string; unit: string; totalQty: number; totalAmount: number }> = {};
    for (const purchase of purchases) {
      for (const item of purchase.items) {
        if (!materialMap[item.rawMaterialId]) {
          materialMap[item.rawMaterialId] = {
            id: item.rawMaterialId,
            name: item.rawMaterial.name,
            unit: item.rawMaterial.unit,
            totalQty: 0,
            totalAmount: 0
          };
        }
        materialMap[item.rawMaterialId].totalQty += Number(item.quantity || 0);
        materialMap[item.rawMaterialId].totalAmount += Number(item.subtotal || 0);
      }
    }

    const materials = Object.values(materialMap);
    const totalPurchaseAmount = materials.reduce((sum, material) => sum + material.totalAmount, 0);
    const shortTermOutstanding = shortTermAdvances.reduce((sum, advance) => sum + Number(advance.remainingBalance || 0), 0);
    const longTermOutstanding = longTermAdvances.reduce((sum, advance) => sum + Number(advance.remainingBalance || 0), 0);
    const shortTermDeduction = shortTermOutstanding;
    const longTermDeduction = longTermAdvances.reduce((sum, advance) => sum + Math.min(Number(advance.remainingBalance || 0), Number(advance.monthlyDeduction || 0)), 0);
    const actualPayable = totalPurchaseAmount - shortTermDeduction - longTermDeduction;

    res.json({
      success: true,
      data: {
        supplier,
        startDate: String(startDate),
        endDate: String(endDate),
        materials,
        totalPurchaseAmount,
        shortTermDeduction,
        longTermDeduction,
        shortTermRemainingBalance: Math.max(shortTermOutstanding - shortTermDeduction, 0),
        longTermRemainingBalance: Math.max(longTermOutstanding - longTermDeduction, 0),
        actualPayable
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not generate supplier receipt') });
  }
});

supplierRouter.get('/:id/ledger', async (req, res) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: req.params.id },
    include: {
      rawMaterials: {
        include: {
          stockMovements: {
            where: { type: 'IN' },
            orderBy: { createdAt: 'desc' },
            take: 30
          },
          purchaseItems: {
            include: { purchaseOrder: true },
            orderBy: { purchaseOrder: { createdAt: 'desc' } }
          }
        },
        orderBy: { name: 'asc' }
      },
      purchaseOrders: { include: { items: { include: { rawMaterial: true } } }, orderBy: { createdAt: 'desc' } },
      payments: { include: { purchaseOrder: true }, orderBy: { createdAt: 'desc' } },
      purchaseReturns: { include: { purchaseOrder: true, items: { include: { rawMaterial: true } } }, orderBy: { createdAt: 'desc' } },
      advances: { include: { recoveries: true }, orderBy: { advanceDate: 'desc' } }
    }
  });
  if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });
  const returnTotal = (supplier.purchaseReturns || []).reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);
  const purchaseBalance = supplier.purchaseOrders.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0) - Number(purchase.paidAmount || 0), 0) - returnTotal;
  if (supplier.balance !== purchaseBalance) {
    await prisma.supplier.update({ where: { id: supplier.id }, data: { balance: purchaseBalance } });
  }
  const purchaseTransactions = supplier.purchaseOrders.map((purchase) => {
    const purchaseDebit = {
      date: purchase.createdAt,
      type: 'PURCHASE',
      description: `PO ${purchase.id.slice(-6).toUpperCase()}`,
      debit: Number(purchase.totalAmount || 0),
      credit: 0,
      paymentMethod: '-'
    };
    return purchaseDebit;
  });
  const paymentTransactions = supplier.payments.length
    ? supplier.payments.map((payment) => ({
      date: payment.createdAt,
      type: 'PAYMENT',
      description: `Supplier payment (${payment.paymentMethod})`,
      debit: 0,
      credit: Number(payment.amount || 0),
      paymentMethod: payment.paymentMethod
    }))
    : supplier.purchaseOrders.flatMap((purchase) => Number(purchase.paidAmount || 0) > 0 ? [{
      date: purchase.updatedAt,
      type: 'PAYMENT',
      description: `Payment against PO ${purchase.id.slice(-6).toUpperCase()}`,
      debit: 0,
      credit: Number(purchase.paidAmount || 0),
      paymentMethod: 'Legacy'
    }] : []);
  const returnTransactions = (supplier.purchaseReturns || []).map((row) => ({
    date: row.createdAt,
    type: 'RETURN',
    description: `Return outward ${row.id.slice(-6).toUpperCase()}`,
    debit: 0,
    credit: Number(row.totalAmount || 0),
    paymentMethod: '-'
  }));
  const advanceTransactions = (supplier.advances || []).flatMap((advance) => [
    {
      date: advance.advanceDate,
      type: advance.advanceType,
      description: `Supplier advance ${advance.advanceType === 'SHORT_TERM' ? '(Kharchi)' : '(Long term)'}`,
      debit: 0,
      credit: 0,
      paymentMethod: '-'
    },
    ...(advance.recoveries || []).map((recovery) => ({
      date: recovery.recoveredOn,
      type: 'ADVANCE_RECOVERY',
      description: `Advance recovered ${advance.id.slice(-6).toUpperCase()}`,
      debit: 0,
      credit: Number(recovery.amount || 0),
      paymentMethod: '-'
    }))
  ]);
  const transactions = [...purchaseTransactions, ...paymentTransactions, ...returnTransactions, ...advanceTransactions].sort((a, b) => new Date(a.date as any).getTime() - new Date(b.date as any).getTime());
  const totalDebit = transactions.reduce((sum, item) => sum + item.debit, 0);
  const totalCredit = transactions.reduce((sum, item) => sum + item.credit, 0);
  res.json({
    success: true,
    data: {
      ...supplier,
      supplier: { id: supplier.id, name: supplier.name, phone: supplier.phone, address: supplier.address, city: supplier.city, balance: purchaseBalance },
      balance: purchaseBalance,
      transactions,
      payments: supplier.payments,
      returns: supplier.purchaseReturns,
      advances: supplier.advances,
      totalDebit,
      totalCredit,
      outstandingBalance: totalDebit - totalCredit
    }
  });
});

supplierRouter.get('/:id/outstanding', async (req, res) => {
  const totals = await prisma.purchaseOrder.aggregate({
    where: { supplierId: req.params.id },
    _sum: { totalAmount: true, paidAmount: true }
  });
  const outstanding = Number(totals._sum.totalAmount || 0) - Number(totals._sum.paidAmount || 0);
  res.json({ success: true, data: { supplierId: req.params.id, outstanding } });
});

supplierRouter.post('/:id/payment', authorize('ADMIN'), async (req: any, res) => {
  try {
    const amount = Number(req.body.amount || 0);
    const paymentMethod = String(req.body.paymentMethod || 'CASH').toUpperCase();
    const purchaseOrderId = req.body.purchaseOrderId || null;
    const requestedShortTermDeduction = Math.max(0, Number(req.body.shortTermDeduction || 0));
    const requestedLongTermDeduction = Math.max(0, Number(req.body.longTermDeduction || 0));
    if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Payment amount is required' });
    const result = await prisma.$transaction(async (tx) => {
      const openPurchases = await tx.purchaseOrder.findMany({
        where: { supplierId: req.params.id, totalAmount: { gt: 0 } },
        orderBy: { createdAt: 'asc' }
      });
      const outstanding = openPurchases.reduce((sum, purchase) => sum + Math.max(purchase.totalAmount - purchase.paidAmount, 0), 0);
      if (amount > outstanding) throw new Error(`Payment cannot exceed outstanding balance ${outstanding}`);
      const advances = await tx.supplierAdvance.findMany({
        where: { supplierId: req.params.id, isFullyRecovered: false },
        orderBy: { advanceDate: 'asc' }
      });
      const recoveryPlan: Array<{ id: string; amount: number; newBalance: number }> = [];
      let shortTermDeduction = 0;
      let longTermDeduction = 0;
      let shortRemaining = requestedShortTermDeduction;
      let longRemaining = requestedLongTermDeduction;
      for (const advance of advances.filter((row) => row.advanceType === 'SHORT_TERM')) {
        if (shortRemaining <= 0) break;
        const remainingBalance = Number(advance.remainingBalance || 0);
        const deduct = Math.min(remainingBalance, shortRemaining);
        if (deduct <= 0) continue;
        shortTermDeduction += deduct;
        shortRemaining -= deduct;
        recoveryPlan.push({ id: advance.id, amount: deduct, newBalance: remainingBalance - deduct });
      }
      for (const advance of advances.filter((row) => row.advanceType === 'LONG_TERM')) {
        if (longRemaining <= 0) break;
        const remainingBalance = Number(advance.remainingBalance || 0);
        const deduct = Math.min(remainingBalance, longRemaining);
        if (deduct <= 0) continue;
        longTermDeduction += deduct;
        longRemaining -= deduct;
        recoveryPlan.push({ id: advance.id, amount: deduct, newBalance: remainingBalance - deduct });
      }
      const totalAdvanceDeduction = shortTermDeduction + longTermDeduction;
      if (totalAdvanceDeduction > amount) throw new Error('Advance deductions cannot exceed payment amount');
      const actualPayment = Math.max(amount - totalAdvanceDeduction, 0);
      let remaining = amount;
      for (const purchase of openPurchases) {
        if (remaining <= 0) break;
        const due = purchase.totalAmount - purchase.paidAmount;
        if (due <= 0) continue;
        const paid = Math.min(due, remaining);
        remaining -= paid;
        await tx.purchaseOrder.update({
          where: { id: purchase.id },
          data: {
            paidAmount: { increment: paid },
            status: purchase.paidAmount + paid >= purchase.totalAmount ? 'PAID' : 'PARTIAL'
          }
        });
      }
      const payment = await tx.supplierPayment.create({
        data: {
          supplierId: req.params.id,
          purchaseOrderId,
          amount: actualPayment,
          paymentMethod,
          notes: [
            req.body.notes || '',
            shortTermDeduction > 0 ? `Short term deducted: ${shortTermDeduction}` : '',
            longTermDeduction > 0 ? `Long term deducted: ${longTermDeduction}` : ''
          ].filter(Boolean).join(' | ') || null,
          createdBy: req.user?.id || null
        }
      });
      for (const recovery of recoveryPlan) {
        await tx.supplierAdvance.update({
          where: { id: recovery.id },
          data: { remainingBalance: recovery.newBalance, isFullyRecovered: recovery.newBalance <= 0 }
        });
        await tx.supplierAdvanceRecovery.create({
          data: {
            supplierAdvanceId: recovery.id,
            amount: recovery.amount,
            recoveredOn: new Date(),
            paymentId: payment.id
          }
        });
      }
      const remainingAdvances = await tx.supplierAdvance.findMany({
        where: { supplierId: req.params.id, isFullyRecovered: false }
      });
      const shortTermRemainingBalance = remainingAdvances
        .filter((advance) => advance.advanceType === 'SHORT_TERM')
        .reduce((sum, advance) => sum + Number(advance.remainingBalance || 0), 0);
      const longTermRemainingBalance = remainingAdvances
        .filter((advance) => advance.advanceType === 'LONG_TERM')
        .reduce((sum, advance) => sum + Number(advance.remainingBalance || 0), 0);
      if (totalAdvanceDeduction > 0) {
        await createSupplierPaymentWithAdvanceEntry(req.params.id, payment.id, amount, totalAdvanceDeduction, actualPayment, tx);
      } else {
        await createSupplierPaymentEntry(req.params.id, amount, tx);
      }
      await tx.supplier.update({ where: { id: req.params.id }, data: { balance: { decrement: amount - remaining } } });
      return {
        supplierId: req.params.id,
        requestedAmount: amount,
        amount: actualPayment,
        paymentMethod,
        shortTermDeduction,
        longTermDeduction,
        shortTermRemainingBalance,
        longTermRemainingBalance,
        totalAdvanceDeduction,
        unapplied: remaining,
        payment
      };
    });
    res.status(201).json({ success: true, data: result });
  } catch (error: any) { res.status(500).json({ success: false, message: publicError(error, 'Something went wrong. Please try again.') }); }
});

supplierRouter.get('/:id/payments', async (req, res) => {
  const payments = await prisma.supplierPayment.findMany({
    where: { supplierId: req.params.id },
    include: { purchaseOrder: true },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, data: payments });
});

supplierRouter.get('/:id/returns', async (req, res) => {
  const returns = await prisma.purchaseReturn.findMany({
    where: { supplierId: req.params.id },
    include: { purchaseOrder: true, items: { include: { rawMaterial: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, data: returns });
});

supplierRouter.post('/:id/return', authorize('ADMIN', 'PRODUCTION_MANAGER'), async (req: any, res) => {
  try {
    const { purchaseOrderId, items = [], reason } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ success: false, message: 'Return items are required' });
    if (!reason) return res.status(400).json({ success: false, message: 'Return reason is required' });

    const result = await prisma.$transaction(async (tx) => {
      let totalReturnAmount = 0;
      const prepared = items.map((item: any) => {
        const quantity = Number(item.quantity || 0);
        const rate = Number(item.rate || 0);
        if (!item.rawMaterialId || quantity <= 0 || rate < 0) throw new Error('Each return item needs material, quantity, and rate');
        const subtotal = quantity * rate;
        totalReturnAmount += subtotal;
        return {
          rawMaterialId: item.rawMaterialId,
          quantity,
          unit: item.unit || 'KG',
          rate,
          subtotal
        };
      });

      const returnRecord = await tx.purchaseReturn.create({
        data: {
          supplierId: req.params.id,
          purchaseOrderId: purchaseOrderId || null,
          totalAmount: totalReturnAmount,
          reason,
          createdBy: req.user.id,
          items: { create: prepared }
        },
        include: { purchaseOrder: true, items: { include: { rawMaterial: true } } }
      });

      for (const item of prepared) {
        await tx.rawMaterial.update({
          where: { id: item.rawMaterialId },
          data: { currentStock: { decrement: item.quantity } }
        });
        await tx.stockMovement.create({
          data: {
            rawMaterialId: item.rawMaterialId,
            type: 'OUT',
            quantity: item.quantity,
            reason: `Return to supplier: ${reason}`,
            userId: req.user.id
          }
        });
      }

      await tx.supplier.update({ where: { id: req.params.id }, data: { balance: { decrement: totalReturnAmount } } });
      await createPurchaseReturnEntry(returnRecord.id, totalReturnAmount, tx);
      return returnRecord;
    });

    res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not record supplier return') });
  }
});

supplierRouter.put('/:id', authorize('ADMIN'), async (req, res) => {
  const supplier = await prisma.supplier.update({ where: { id: req.params.id }, data: { ...req.body, phone: req.body.phone || null } });
  res.json({ success: true, data: supplier });
});

supplierRouter.delete('/:id', authorize('ADMIN'), async (req, res) => {
  await prisma.supplier.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true, message: 'Deleted' });
});

// ─── PURCHASE ROUTES ──────────────────────────────────────────────────────────
export const purchaseRouter = Router();
purchaseRouter.use(authenticate);

purchaseRouter.get('/', async (req, res) => {
  const { status, supplierId } = req.query;
  const where: any = {};
  if (status) where.status = status;
  if (supplierId) where.supplierId = supplierId;
  const purchases = await prisma.purchaseOrder.findMany({
    where, include: { supplier: true, items: { include: { rawMaterial: true } } }, orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, data: purchases });
});

purchaseRouter.post('/', authorize('ADMIN', 'PRODUCTION_MANAGER'), async (req: any, res) => {
  try {
    const { supplierId, items, notes } = req.body;
    let totalAmount = 0;
    const purchaseItems: any[] = [];

    for (const item of items) {
      const subtotal = item.quantity * item.unitCost;
      totalAmount += subtotal;
      purchaseItems.push({ rawMaterialId: item.rawMaterialId, quantity: item.quantity, unitCost: item.unitCost, subtotal });
    }

    const purchase = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: { supplierId, totalAmount, notes, status: 'RECEIVED', items: { create: purchaseItems } },
        include: { supplier: true, items: { include: { rawMaterial: true } } }
      });

      for (const item of purchaseItems) {
        const material = await tx.rawMaterial.findUnique({ where: { id: item.rawMaterialId } });
        if (!material) throw new Error('Raw material not found');
        const currentStock = Number(material.currentStock || 0);
        const currentAvgCost = Number(material.avgCost || material.costPerUnit || 0);
        const quantity = Number(item.quantity);
        const purchaseRate = Number(item.unitCost);
        const newStock = currentStock + quantity;
        const newAvgCost = newStock > 0 ? ((currentStock * currentAvgCost) + (quantity * purchaseRate)) / newStock : purchaseRate;
        await tx.rawMaterial.update({
          where: { id: item.rawMaterialId },
          data: {
            currentStock: { increment: quantity },
            avgCost: newAvgCost,
            costPerUnit: purchaseRate
          }
        });
        await tx.stockMovement.create({
          data: { rawMaterialId: item.rawMaterialId, type: 'IN', quantity, reason: `Purchase #${po.id}`, userId: req.user.id }
        });
      }
      await tx.supplier.update({ where: { id: supplierId }, data: { balance: { increment: totalAmount } } });
      await createPurchaseEntry(po.id, supplierId, totalAmount, tx);
      return po;
    });

    res.status(201).json({ success: true, data: purchase });
  } catch (error: any) { res.status(500).json({ success: false, message: publicError(error, 'Something went wrong. Please try again.') }); }
});

purchaseRouter.put('/:id', authorize('ADMIN'), async (req, res) => {
  const purchase = await prisma.purchaseOrder.update({ where: { id: req.params.id }, data: req.body, include: { supplier: true, items: true } });
  res.json({ success: true, data: purchase });
});

purchaseRouter.delete('/:id', authorize('ADMIN'), async (req, res) => {
  await prisma.purchaseOrder.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: 'Deleted' });
});

// ─── STOCK ROUTES ─────────────────────────────────────────────────────────────
export const stockRouter = Router();
stockRouter.use(authenticate);

stockRouter.get('/movements', async (req, res) => {
  const { productId, rawMaterialId, type, page = '1', limit = '30' } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const where: any = {};
  if (productId) where.productId = productId;
  if (rawMaterialId) where.rawMaterialId = rawMaterialId;
  if (type) where.type = type;

  const movements = await prisma.stockMovement.findMany({
    where, skip, take: parseInt(limit as string),
    include: { product: true, rawMaterial: true, user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, data: movements });
});

stockRouter.get('/expiry-report', async (_req, res) => {
  const today = new Date();
  const inThirtyDays = new Date();
  inThirtyDays.setDate(today.getDate() + 30);
  const movements = await prisma.stockMovement.findMany({
    where: { expiryDate: { gte: today, lte: inThirtyDays } },
    include: { product: true, rawMaterial: true },
    orderBy: { expiryDate: 'asc' }
  });
  res.json({ success: true, data: movements });
});

const createStockAdjustment = async (req: any, res: any) => {
  try {
    const { productId, rawMaterialId, type, quantity, reason, batchNumber, expiryDate } = req.body;
    const movement = await prisma.stockMovement.create({
      data: { productId, rawMaterialId, type, quantity: parseFloat(quantity), reason, batchNumber, expiryDate: expiryDate ? new Date(expiryDate) : undefined, userId: req.user.id }
    });

    if (productId) {
      const increment = type === 'IN' ? parseFloat(quantity) : -parseFloat(quantity);
      await prisma.product.update({ where: { id: productId }, data: { currentStock: { increment } } });
    }
    if (rawMaterialId) {
      const increment = type === 'IN' ? parseFloat(quantity) : -parseFloat(quantity);
      await prisma.rawMaterial.update({ where: { id: rawMaterialId }, data: { currentStock: { increment } } });
    }

    res.status(201).json({ success: true, data: movement });
  } catch (error: any) { res.status(500).json({ success: false, message: publicError(error, 'Something went wrong. Please try again.') }); }
};

stockRouter.post('/movements', authorize('ADMIN', 'PRODUCTION_MANAGER'), createStockAdjustment);
stockRouter.post('/adjust', authorize('ADMIN', 'PRODUCTION_MANAGER'), createStockAdjustment);

stockRouter.get('/alerts', async (req, res) => {
  const lowProducts = await prisma.$queryRaw`
    SELECT id, name, "currentStock", "minStockLevel", unit FROM "Product"
    WHERE "isActive" = true AND "currentStock" <= "minStockLevel"
  `;
  const lowMaterials = await prisma.$queryRaw`
    SELECT id, name, "currentStock", "minStockLevel", unit FROM "RawMaterial"
    WHERE "currentStock" <= "minStockLevel"
  `;
  res.json({ success: true, data: { products: lowProducts, rawMaterials: lowMaterials } });
});

// ─── EXPENSE ROUTES ───────────────────────────────────────────────────────────
export const expenseRouter = Router();
expenseRouter.use(authenticate);

expenseRouter.get('/', async (req, res) => {
  const { startDate, endDate, category } = req.query;
  const where: any = {};
  if (category) where.category = category;
  if (startDate && endDate) where.date = { gte: new Date(startDate as string), lte: new Date(endDate as string + 'T23:59:59') };

  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({ where, include: { user: { select: { name: true } } }, orderBy: { date: 'desc' } }),
    prisma.expense.aggregate({ where, _sum: { amount: true } })
  ]);
  res.json({ success: true, data: expenses, meta: { total: total._sum.amount || 0 } });
});

expenseRouter.post('/', authorize('ADMIN'), async (req: any, res) => {
  const { category, amount, description, date } = req.body;
  const expense = await prisma.$transaction(async (tx) => {
    const created = await tx.expense.create({
      data: { category, amount: parseFloat(amount), description, userId: req.user.id, date: date ? new Date(date) : new Date() },
      include: { user: { select: { name: true } } }
    });
    await createExpenseEntry(created.id, category, Number(amount), tx);
    return created;
  });
  res.status(201).json({ success: true, data: expense });
});

expenseRouter.put('/:id', authorize('ADMIN'), async (req, res) => {
  const { category, amount, description, date } = req.body;
  const expense = await prisma.$transaction(async (tx) => {
    await tx.journalEntry.deleteMany({ where: { referenceType: 'EXPENSE', referenceId: req.params.id } });
    const updated = await tx.expense.update({
      where: { id: req.params.id },
      data: { category, amount: parseFloat(amount), description, date: date ? new Date(date) : undefined }
    });
    await createExpenseEntry(updated.id, category, Number(amount), tx);
    await recalculateAccountBalances(tx);
    return updated;
  });
  res.json({ success: true, data: expense });
});

expenseRouter.delete('/:id', authorize('ADMIN'), async (req, res) => {
  await prisma.$transaction(async (tx) => {
    await tx.expense.delete({ where: { id: req.params.id } });
    await tx.journalEntry.deleteMany({ where: { referenceType: 'EXPENSE', referenceId: req.params.id } });
    await recalculateAccountBalances(tx);
  });
  res.json({ success: true, message: 'Deleted' });
});

// ─── RAW MATERIAL ROUTES ──────────────────────────────────────────────────────
export const rawMaterialRouter = Router();
rawMaterialRouter.use(authenticate);

rawMaterialRouter.get('/', async (req, res) => {
  const materials = await prisma.rawMaterial.findMany({ include: { supplier: true }, orderBy: { name: 'asc' } });
  res.json({ success: true, data: materials });
});

rawMaterialRouter.post('/', authorize('ADMIN', 'PRODUCTION_MANAGER'), async (req, res) => {
  const { name, unit, currentStock, minStockLevel, costPerUnit, supplierId } = req.body;
  const material = await prisma.rawMaterial.create({
    data: { name, unit, currentStock: parseFloat(currentStock || '0'), minStockLevel: parseFloat(minStockLevel || '10'), costPerUnit: parseFloat(costPerUnit), supplierId }
  });
  res.status(201).json({ success: true, data: material });
});

rawMaterialRouter.put('/:id', authorize('ADMIN', 'PRODUCTION_MANAGER'), async (req, res) => {
  const material = await prisma.rawMaterial.update({ where: { id: req.params.id }, data: req.body });
  res.json({ success: true, data: material });
});

rawMaterialRouter.delete('/:id', authorize('ADMIN'), async (req, res) => {
  await prisma.rawMaterial.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: 'Deleted' });
});
