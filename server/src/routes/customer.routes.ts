import { publicError } from '../utils/publicError';
import { Router } from 'express';
import prisma from '../utils/prisma';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'CASHIER'));

router.get('/', async (req, res) => {
  const { search, page = '1', limit = '20' } = req.query;
  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const where: any = { isActive: true };
  if (search) where.OR = [
    { name: { contains: search as string } },
    { phone: { contains: search as string } }
  ];
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({ where, skip, take: parseInt(limit as string), orderBy: { name: 'asc' } }),
    prisma.customer.count({ where })
  ]);
  res.json({ success: true, data: customers, meta: { total } });
});

router.get('/:id', async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      orders: { take: 20, orderBy: { createdAt: 'desc' }, include: { items: { include: { product: true } } } },
      sales: { take: 20, orderBy: { createdAt: 'desc' }, include: { items: { include: { product: true } } } }
    }
  });
  if (!customer) return res.status(404).json({ success: false, message: 'Not found' });
  const totalSpent = customer.sales.reduce((sum, sale) => sum + sale.netAmount, 0);
  res.json({ success: true, data: { ...customer, orderHistory: customer.orders, totalSpent } });
});

router.get('/:id/orders', async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { customerId: req.params.id },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, data: orders });
});

router.get('/:id/sales', async (req, res) => {
  const sales = await prisma.sale.findMany({
    where: { customerId: req.params.id },
    include: { items: { include: { product: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ success: true, data: sales });
});

router.post('/', async (req, res) => {
  const { name, phone, address, city, email, creditLimit, notes } = req.body;
  const customer = await prisma.customer.create({ data: { name, phone, address, city, email, creditLimit: Number(creditLimit || 0), notes } });
  res.status(201).json({ success: true, data: customer });
});

router.put('/:id', authorize('ADMIN'), async (req, res) => {
  const customer = await prisma.customer.update({ where: { id: req.params.id }, data: req.body });
  res.json({ success: true, data: customer });
});

router.delete('/:id', authorize('ADMIN'), async (req, res) => {
  try {
    const customer = await prisma.customer.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true, data: customer, message: 'Deleted' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: publicError(error, 'Could not delete customer') });
  }
});

export default router;
