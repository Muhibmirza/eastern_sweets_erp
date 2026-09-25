import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { consumptionReport, createAdjustment, createProductionRun, createTransfer, getAdjustments, getKitchenStock, getProductionRun, getProductionRuns, getTransfers, transferReport } from '../controllers/kitchen.controller';

const router = Router();
router.use(authenticate, authorize('ADMIN', 'MANAGER', 'PRODUCTION_MANAGER'));
router.get('/stock', getKitchenStock);
router.get('/transfers', getTransfers);
router.post('/transfers', createTransfer);
router.get('/production-runs', getProductionRuns);
router.post('/production-runs', createProductionRun);
router.get('/production-runs/:id', getProductionRun);
router.get('/adjustments', getAdjustments);
router.post('/adjustments', createAdjustment);
router.get('/reports/consumption', consumptionReport);
router.get('/reports/transfers', transferReport);
export default router;
