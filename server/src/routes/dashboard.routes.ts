import { Router } from 'express';
import { getDashboardStats, getRevenueChart, getTopProducts, getRecentOrders } from '../controllers/dashboard.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'PRODUCTION_MANAGER'));
router.get('/stats', getDashboardStats);
router.get('/revenue-chart', authorize('ADMIN'), getRevenueChart);
router.get('/top-products', authorize('ADMIN'), getTopProducts);
router.get('/recent-orders', getRecentOrders);
export default router;
