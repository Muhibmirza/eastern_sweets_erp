import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  createAccount,
  createJournalEntry,
  getBalanceSheet,
  getCashBook,
  getChartOfAccounts,
  getEmployeeLedger,
  getGeneralLedger,
  getJournalEntries,
  getJournalEntry,
  getProfitLoss,
  getSupplierLedger,
  getTrialBalance,
  updateAccount
} from '../controllers/accounting.controller';

const router = Router();
router.use(authenticate, authorize('ADMIN'));

router.get('/chart-of-accounts', getChartOfAccounts);
router.post('/chart-of-accounts', authorize('ADMIN'), createAccount);
router.put('/chart-of-accounts/:id', authorize('ADMIN'), updateAccount);
router.get('/journal-entries', getJournalEntries);
router.get('/journal-entries/:id', getJournalEntry);
router.post('/journal-entries', authorize('ADMIN'), createJournalEntry);
router.get('/trial-balance', getTrialBalance);
router.get('/profit-loss', getProfitLoss);
router.get('/balance-sheet', getBalanceSheet);
router.get('/cash-book', getCashBook);
router.get('/general-ledger/:accountId', getGeneralLedger);
router.get('/supplier-ledger/:supplierId', getSupplierLedger);
router.get('/employee-ledger/:employeeId', getEmployeeLedger);

export default router;
