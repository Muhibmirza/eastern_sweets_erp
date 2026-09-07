import { publicError } from '../utils/publicError';
import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import dayjs from 'dayjs';
import { AuthRequest } from '../middleware/auth.middleware';

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const todayStart = new Date(today + 'T00:00:00');
    const todayEnd = new Date(today + 'T23:59:59');
    const monthStart = new Date(dayjs().startOf('month').format('YYYY-MM-DD') + 'T00:00:00');

    const [
      todaySales,
      todayRevenue,
      pendingOrders,
      todayDeliveries,
      monthRevenue,
      totalProducts,
      products,
      rawMaterials,
      totalCustomers,
      pendingProductionOrders
    ] = await Promise.all([
      prisma.sale.count({ where: { createdAt: { gte: todayStart, lte: todayEnd } } }),
      prisma.sale.aggregate({ where: { createdAt: { gte: todayStart, lte: todayEnd } }, _sum: { netAmount: true } }),
      prisma.order.count({ where: { status: { in: ['PENDING', 'CONFIRMED'] } } }),
      prisma.order.count({ where: { deliveryDate: { gte: todayStart, lte: todayEnd }, status: { notIn: ['DELIVERED', 'CANCELLED'] } } }),
      prisma.sale.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { netAmount: true } }),
      prisma.product.count({ where: { isActive: true } }),
      prisma.product.findMany({
        where: { isActive: true },
        select: { currentStock: true, minStockLevel: true }
      }),
      prisma.rawMaterial.findMany({
        where: { isActive: true },
        select: { currentStock: true, minStockLevel: true }
      }),
      prisma.customer.count(),
      prisma.productionOrder.count({ where: { status: { in: ['PLANNED', 'IN_PROGRESS'] } } })
    ]);

    const lowProductCount = products.filter((product) => product.currentStock <= product.minStockLevel).length;
    const lowRawMaterialCount = rawMaterials.filter((material) => material.currentStock <= material.minStockLevel).length;

    if (req.user?.role === 'PRODUCTION_MANAGER') return res.json({ success: true, data: {
      totalProducts, rawMaterialCount: rawMaterials.length, pendingOrders, pendingProductionOrders,
      lowStockCount: lowProductCount + lowRawMaterialCount, lowProductCount, lowRawMaterialCount
    } });

    res.json({
      success: true,
      data: {
        todaySales,
        todaySalesCount: todaySales,
        todayRevenue: todayRevenue._sum.netAmount || 0,
        pendingOrders,
        todayDeliveries,
        monthRevenue: monthRevenue._sum.netAmount || 0,
        totalProducts,
        rawMaterialCount: rawMaterials.length,
        lowStockCount: lowProductCount + lowRawMaterialCount,
        lowProductCount,
        lowRawMaterialCount,
        totalCustomers,
        pendingProductionOrders
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Something went wrong. Please try again.') });
  }
};

export const getRevenueChart = async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const chartData: any[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
      const start = new Date(date + 'T00:00:00');
      const end = new Date(date + 'T23:59:59');

      const revenue = await prisma.sale.aggregate({
        where: { createdAt: { gte: start, lte: end } },
        _sum: { netAmount: true },
        _count: true
      });

      chartData.push({
        date,
        label: dayjs(date).format('DD MMM'),
        revenue: revenue._sum.netAmount || 0,
        sales: revenue._count
      });
    }

    res.json({ success: true, data: chartData });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getTopProducts = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const days = parseInt(req.query.days as string) || 30;
    const startDate = new Date(dayjs().subtract(days, 'day').format('YYYY-MM-DD') + 'T00:00:00');

    const topProducts = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: { createdAt: { gte: startDate } } },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: limit
    });

    const productsWithDetails = await Promise.all(
      topProducts.map(async (item) => {
        const product = await prisma.product.findUnique({ where: { id: item.productId }, select: { name: true, unit: true, imageUrl: true } });
        return { ...item, product };
      })
    );

    res.json({ success: true, data: productsWithDetails });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getRecentOrders = async (req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: { customer: true },
      where: { status: { not: 'CANCELLED' } }
    });
    res.json({ success: true, data: orders });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
