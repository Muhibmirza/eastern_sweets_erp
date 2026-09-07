import { publicError } from '../utils/publicError';
import { Router } from 'express';
import {
  calculateSalary,
  createEmployee,
  createFine,
  createLoan,
  createSalaryRevision,
  deleteEmployee,
  deductAdvance,
  generateSalary,
  getEmployee,
  getEmployeeAdvances,
  getEmployeeFines,
  getEmployeeLedger,
  getEmployeeLoans,
  getEmployees,
  getMonthlyAttendance,
  getPayslip,
  getPayslipById,
  getSalaryRevisions,
  getTodayAttendance,
  markAttendance,
  markSalaryPaid,
  recoverLoan,
  updateEmployee,
  updateEmployeeStatus
} from '../controllers/employee.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import prisma from '../utils/prisma';

// Employee
export const employeeRouter = Router();
employeeRouter.use(authenticate, authorize('ADMIN'));
employeeRouter.get('/', getEmployees);
employeeRouter.post('/', authorize('ADMIN'), createEmployee);
employeeRouter.put('/:id', authorize('ADMIN'), updateEmployee);
employeeRouter.patch('/:id/status', authorize('ADMIN'), updateEmployeeStatus);
employeeRouter.delete('/:id', authorize('ADMIN'), deleteEmployee);
employeeRouter.get('/:id/payslip/:month/:year', getPayslip);
employeeRouter.get('/:id/salary-revisions', getSalaryRevisions);
employeeRouter.post('/:id/salary-revisions', authorize('ADMIN'), createSalaryRevision);
employeeRouter.get('/:id/advances', getEmployeeAdvances);
employeeRouter.get('/:id/loans', getEmployeeLoans);
employeeRouter.get('/:id/fines', getEmployeeFines);
employeeRouter.get('/:id/ledger', getEmployeeLedger);
employeeRouter.get('/:id', getEmployee);

// Attendance
export const attendanceRouter = Router();
attendanceRouter.use(authenticate, authorize('ADMIN'));
attendanceRouter.get('/', getTodayAttendance);
attendanceRouter.get('/today', getTodayAttendance);
attendanceRouter.get('/monthly', getMonthlyAttendance);
attendanceRouter.post('/', markAttendance);
attendanceRouter.get('/:id', async (req, res) => {
  const att = await prisma.attendance.findMany({
    where: { employeeId: req.params.id },
    orderBy: { date: 'desc' },
    take: 30
  });
  res.json({ success: true, data: att });
});

// Salary
export const salaryRouter = Router();
salaryRouter.use(authenticate, authorize('ADMIN'));
salaryRouter.get('/', async (req, res) => {
  const { month, year, isPaid } = req.query;
  const where: any = {};
  if (month) where.month = parseInt(month as string);
  if (year) where.year = parseInt(year as string);
  if (isPaid !== undefined) where.isPaid = isPaid === 'true';
  const salaries = await prisma.salary.findMany({ where, include: { employee: true } });
  res.json({ success: true, data: salaries });
});
salaryRouter.post('/calculate', authorize('ADMIN'), calculateSalary);
salaryRouter.post('/generate', authorize('ADMIN'), generateSalary);
salaryRouter.get('/:id/payslip', getPayslipById);
salaryRouter.patch('/:id/pay', authorize('ADMIN'), markSalaryPaid);

export const loanRouter = Router();
loanRouter.use(authenticate, authorize('ADMIN'));
loanRouter.post('/', authorize('ADMIN'), createLoan);
loanRouter.patch('/supplier/:id', authorize('ADMIN'), async (req, res) => {
  try {
    const monthlyDeduction = Number(req.body.monthlyDeduction || 0);
    if (monthlyDeduction < 0) return res.status(400).json({ success: false, message: 'Monthly deduction cannot be negative' });
    const advance = await prisma.supplierAdvance.findUnique({ where: { id: req.params.id } });
    if (!advance || advance.advanceType !== 'LONG_TERM') {
      return res.status(404).json({ success: false, message: 'Long term supplier advance not found' });
    }
    const updated = await prisma.supplierAdvance.update({
      where: { id: req.params.id },
      data: { monthlyDeduction },
      include: { recoveries: true }
    });
    res.json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not update supplier advance deduction') });
  }
});
loanRouter.post('/:id/recover', authorize('ADMIN'), recoverLoan);

export const fineRouter = Router();
fineRouter.use(authenticate, authorize('ADMIN'));
fineRouter.post('/', authorize('ADMIN'), createFine);
