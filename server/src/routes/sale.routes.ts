import { Router } from 'express';
import { createDailyClosing, getDailyClosing, getSales, getSale, getSaleByInvoice, getSaleItems, getInvoiceSuggestions, createSale, getDailySummary, getSaleReturns, returnSale } from '../controllers/sale.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER'));
router.get('/', getSales);
router.get('/items', getSaleItems);
router.get('/invoices', getInvoiceSuggestions);
router.get('/by-invoice/:invoiceNo', getSaleByInvoice);
router.get('/daily-summary', getDailySummary);
router.get('/returns', getSaleReturns);
router.post('/daily-closing', authorize('ADMIN', 'MANAGER', 'CASHIER'), createDailyClosing);
router.get('/daily-closing/:date', getDailyClosing);
router.get('/:id/receipt', getSale);
router.post('/:id/return', authorize('ADMIN', 'MANAGER', 'CASHIER'), returnSale);
router.get('/:id', getSale);
router.post('/', authorize('ADMIN', 'MANAGER', 'CASHIER'), createSale);
export default router;
