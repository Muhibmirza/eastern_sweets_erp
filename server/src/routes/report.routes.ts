import { Router } from 'express';
import { getCashBookReport, getDailyReport, getMonthlyReport, getPayrollReport, getProductSalesReport, getProfitLossReport, getStockValuationReport, getSupplierOutstandingReport } from '../controllers/report.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate, authorize('ADMIN'));
router.get('/daily', getDailyReport);
router.get('/weekly', getDailyReport);
router.get('/monthly', getMonthlyReport);
router.get('/cash-book', getCashBookReport);
router.get('/profit-loss', getProfitLossReport);
router.get('/payroll', getPayrollReport);
router.get('/supplier-outstanding', getSupplierOutstandingReport);
router.get('/stock-valuation', getStockValuationReport);
router.get('/product-sales', getProductSalesReport);
export default router;
