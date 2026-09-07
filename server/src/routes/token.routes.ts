import { publicError } from '../utils/publicError';
import { Router } from 'express';
import prisma from '../utils/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'CASHIER'));

const parseTokenItems = (token: any) => ({ ...token, items: token.items ? JSON.parse(token.items) : [] });

async function reserveNextTokenNumber(tx: any) {
  const counter = await tx.tokenCounter.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', nextNumber: 1 }
  });
  await tx.tokenCounter.update({
    where: { id: 'default' },
    data: { nextNumber: { increment: 1 } }
  });
  return counter.nextNumber;
}

router.get('/', async (_req, res) => {
  const tokens = await prisma.token.findMany({
    where: { status: 'PENDING' },
    include: { cashier: { select: { name: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, data: tokens.map(parseTokenItems) });
});

router.get('/counter/next', async (_req, res) => {
  const counter = await prisma.tokenCounter.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', nextNumber: 1 }
  });
  res.json({ success: true, data: { nextNumber: counter.nextNumber } });
});

router.post('/counter/reset', authorize('ADMIN', 'CASHIER'), async (_req, res) => {
  await prisma.tokenCounter.upsert({
    where: { id: 'default' },
    update: { nextNumber: 1 },
    create: { id: 'default', nextNumber: 1 }
  });
  await prisma.token.updateMany({ where: { status: 'PENDING' }, data: { status: 'CANCELLED' } });
  res.json({ success: true, data: { nextNumber: 1 }, message: 'Token counter reset to 1' });
});

router.get('/:id', async (req, res) => {
  const token = await prisma.token.findUnique({
    where: { id: req.params.id },
    include: { cashier: { select: { name: true } } }
  });
  if (!token) return res.status(404).json({ success: false, message: 'Token not found' });
  res.json({ success: true, data: parseTokenItems(token) });
});

router.post('/', authorize('ADMIN', 'CASHIER'), async (req: any, res) => {
  try {
    const { tokenNumber, items = [], totalAmount, saleId } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, message: 'Token items are required' });

    const token = await prisma.$transaction(async (tx) => {
      const finalTokenNumber = Number(tokenNumber) || await reserveNextTokenNumber(tx);
      const token = await tx.token.create({
        data: {
          tokenNumber: finalTokenNumber,
          items: JSON.stringify(items),
          totalAmount: Number(totalAmount || items.reduce((sum: number, item: any) => sum + Number(item.subtotal || 0), 0)),
          cashierId: req.user.id,
          saleId: saleId || null,
          status: saleId ? 'COMPLETED' : 'PENDING',
          completedAt: saleId ? new Date() : null
        },
        include: { cashier: { select: { name: true } } }
      });
      if (saleId) {
        await tx.sale.update({
          where: { id: saleId },
          data: { tokenId: token.id, tokenNumber: finalTokenNumber }
        });
      }
      return token;
    });
    res.status(201).json({ success: true, data: parseTokenItems(token) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not create token') });
  }
});

router.patch('/:id/complete', authorize('ADMIN', 'CASHIER'), async (req, res) => {
  const token = await prisma.token.update({
    where: { id: req.params.id },
    data: { status: 'COMPLETED', completedAt: new Date(), saleId: req.body.saleId || null }
  });
  res.json({ success: true, data: parseTokenItems(token) });
});

router.patch('/:id/cancel', authorize('ADMIN', 'CASHIER'), async (req, res) => {
  const token = await prisma.token.update({
    where: { id: req.params.id },
    data: { status: 'CANCELLED' }
  });
  res.json({ success: true, data: parseTokenItems(token) });
});

export default router;
