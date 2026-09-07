import { publicError } from '../utils/publicError';
import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import dayjs from 'dayjs';
import { createAdvanceEntry, createSalaryExpenseEntry, createSalaryPaymentEntry } from '../services/journalService';

// ─── EMPLOYEE ─────────────────────────────────────────────────────────────────

export const getEmployees = async (req: Request, res: Response) => {
  try {
    const { isActive, search, department, status } = req.query;
    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (department) where.department = department as string;
    if (status) where.status = status as string;
    if (search) {
      where.OR = [
        { name: { contains: search as string } },
        { fatherName: { contains: search as string } },
        { phone: { contains: search as string } },
        { department: { contains: search as string } }
      ];
    }

    const employees = await prisma.employee.findMany({ where, orderBy: { name: 'asc' } });
    res.json({ success: true, data: employees });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const getEmployee = async (req: Request, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: {
        attendance: { orderBy: { date: 'desc' }, take: 60 },
        salaries: { orderBy: [{ year: 'desc' }, { month: 'desc' }] },
        advances: { orderBy: { advanceDate: 'desc' } },
        leaveRequests: { orderBy: { createdAt: 'desc' } },
        salaryRevisions: { orderBy: { effectiveDate: 'desc' } },
        loans: { include: { recoveries: true }, orderBy: { startDate: 'desc' } },
        fines: { orderBy: { date: 'desc' } }
      }
    });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    res.json({ success: true, data: employee });
  } catch (error: any) { res.status(500).json({ success: false, message: publicError(error, 'Server error') }); }
};

export const createEmployee = async (req: Request, res: Response) => {
  try {
    const {
      name, fatherName, phone, cnic, role, designation, address, department,
      salaryType = 'MONTHLY', dailyWage, basicSalary = 0, joiningDate
    } = req.body;
    const finalDesignation = designation || role || 'Staff';
    const employee = await prisma.employee.create({
      data: {
        name,
        fatherName,
        phone: phone || null,
        cnic: cnic || null,
        role: finalDesignation,
        designation: finalDesignation,
        address,
        department,
        salaryType,
        dailyWage: dailyWage === '' || dailyWage === undefined ? null : Number(dailyWage),
        basicSalary: Number(basicSalary || 0),
        joiningDate: joiningDate ? new Date(joiningDate) : new Date()
      }
    });
    res.status(201).json({ success: true, data: employee });
  } catch (error: any) { res.status(500).json({ success: false, message: publicError(error, 'Something went wrong. Please try again.') }); }
};

export const updateEmployee = async (req: Request, res: Response) => {
  try {
    const {
      name, fatherName, phone, cnic, role, designation, address, department,
      salaryType, dailyWage, basicSalary, joiningDate, leavingDate, isActive, status
    } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = name;
    if (fatherName !== undefined) data.fatherName = fatherName;
    if (phone !== undefined) data.phone = phone || null;
    if (cnic !== undefined) data.cnic = cnic || null;
    if (address !== undefined) data.address = address;
    if (department !== undefined) data.department = department;
    if (role !== undefined || designation !== undefined) {
      data.designation = designation || role;
      data.role = designation || role;
    }
    if (salaryType !== undefined) data.salaryType = salaryType;
    if (dailyWage !== undefined) data.dailyWage = dailyWage === '' ? null : Number(dailyWage);
    if (basicSalary !== undefined) data.basicSalary = Number(basicSalary || 0);
    if (joiningDate !== undefined) data.joiningDate = new Date(joiningDate);
    if (leavingDate !== undefined) data.leavingDate = leavingDate ? new Date(leavingDate) : null;
    if (isActive !== undefined) data.isActive = isActive;
    if (status !== undefined) data.status = status;
    const employee = await prisma.employee.update({
      where: { id: req.params.id },
      data
    });
    res.json({ success: true, data: employee });
  } catch (error: any) { res.status(500).json({ success: false, message: publicError(error, 'Server error') }); }
};

export const updateEmployeeStatus = async (req: Request, res: Response) => {
  try {
    const { status, leavingDate } = req.body;
    const employee = await prisma.employee.update({
      where: { id: req.params.id },
      data: {
        status,
        isActive: status === 'ACTIVE',
        leavingDate: status === 'LEFT' ? (leavingDate ? new Date(leavingDate) : new Date()) : null
      }
    });
    res.json({ success: true, data: employee });
  } catch (error: any) { res.status(500).json({ success: false, message: publicError(error, 'Server error') }); }
};

// ─── ATTENDANCE ────────────────────────────────────────────────────────────────

export const markAttendance = async (req: any, res: Response) => {
  try {
    const { employeeId, date, status, checkIn, checkOut } = req.body;
    if (!employeeId || !date || !status) {
      return res.status(400).json({ success: false, message: 'Employee, date, and status are required' });
    }
    const targetDate = new Date(dayjs(date).format('YYYY-MM-DD') + 'T00:00:00');
    if (status === 'LEAVE') {
      const leave = await prisma.leaveRequest.findFirst({
        where: {
          employeeId,
          status: 'APPROVED',
          startDate: { lte: targetDate },
          endDate: { gte: targetDate }
        }
      });
      if (!leave) {
        return res.status(400).json({ success: false, message: 'No approved leave request found for this date' });
      }
    }
    const attendance = await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId, date: targetDate } },
      update: { status, checkIn, checkOut, markedBy: req.user.id },
      create: { employeeId, date: targetDate, status, checkIn, checkOut, markedBy: req.user.id }
    });
    res.json({ success: true, data: attendance });
  } catch (error: any) { res.status(500).json({ success: false, message: publicError(error, 'Something went wrong. Please try again.') }); }
};

const getPaidAttendanceDays = async (employeeId: string, month: number, year: number) => {
  const start = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
  const end = new Date(dayjs(start).endOf('month').format('YYYY-MM-DD') + 'T23:59:59');
  const attendance = await prisma.attendance.findMany({
    where: { employeeId, date: { gte: start, lte: end } }
  });
  const approvedLeaves = await prisma.leaveRequest.findMany({
    where: { employeeId, status: 'APPROVED', startDate: { lte: end }, endDate: { gte: start } }
  });
  const hasApprovedLeave = (date: Date) => approvedLeaves.some((leave) => leave.startDate <= date && leave.endDate >= date);
  return attendance.reduce((sum, row) => {
    if (row.status === 'PRESENT') return sum + 1;
    if (row.status === 'HALF_DAY') return sum + 0.5;
    if (row.status === 'LEAVE' && hasApprovedLeave(row.date)) return sum + 1;
    return sum;
  }, 0);
};

export const getMonthlyAttendance = async (req: Request, res: Response) => {
  try {
    const { employeeId, month, year } = req.query;
    const start = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
    const end = new Date(dayjs(start).endOf('month').format('YYYY-MM-DD') + 'T23:59:59');

    const attendance = await prisma.attendance.findMany({
      where: { employeeId: employeeId as string, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' }
    });

    const summary = {
      present: attendance.filter(a => a.status === 'PRESENT').length,
      absent: attendance.filter(a => a.status === 'ABSENT').length,
      leave: attendance.filter(a => a.status === 'LEAVE').length,
      halfDay: attendance.filter(a => a.status === 'HALF_DAY').length
    };

    res.json({ success: true, data: { attendance, summary } });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const getTodayAttendance = async (req: Request, res: Response) => {
  try {
    const today = new Date(dayjs().format('YYYY-MM-DD'));
    const employees = await prisma.employee.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    const attendance = await prisma.attendance.findMany({ where: { date: today } });

    const result = employees.map(emp => ({
      ...emp,
      attendance: attendance.find(a => a.employeeId === emp.id) || null
    }));

    res.json({ success: true, data: result });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

// ─── SALARY ────────────────────────────────────────────────────────────────────

const salaryPreview = async (body: any) => {
  const {
    employeeId, month, year, workingDays, dailyWage, arrears = 0, bonus,
    bonuses, advanceDeduction, advances, loanDeduction = 0, fineDeduction = 0,
    otherDeductions, deductions, remarks, paymentMethod, linkedProductionOrderId
  } = body;
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new Error('Employee not found');

  let grossWage = 0;
  let finalWorkingDays = workingDays === '' || workingDays === undefined ? null : Number(workingDays);
  const finalDailyWage = dailyWage === '' || dailyWage === undefined ? (employee.dailyWage || 0) : Number(dailyWage);

  if (!finalWorkingDays) {
    finalWorkingDays = await getPaidAttendanceDays(employee.id, Number(month), Number(year));
  }

  if (employee.salaryType === 'DAILY') {
    grossWage = Number(finalWorkingDays || 0) * finalDailyWage;
  } else {
    const daysInMonth = dayjs(new Date(Number(year), Number(month) - 1, 1)).daysInMonth();
    const perDayRate = daysInMonth > 0 ? Number(employee.basicSalary || 0) / daysInMonth : 0;
    grossWage = Number(finalWorkingDays || 0) * perDayRate;
  }

  const finalBonus = Number(bonus ?? bonuses ?? 0);
  const finalAdvanceDeduction = Number(advanceDeduction ?? advances ?? 0);
  const finalOtherDeductions = Number(otherDeductions ?? deductions ?? 0);
  const netSalary = grossWage
    + Number(arrears || 0)
    + finalBonus
    - finalAdvanceDeduction
    - Number(loanDeduction || 0)
    - Number(fineDeduction || 0)
    - finalOtherDeductions;

  return {
    employee,
    month: Number(month),
    year: Number(year),
    salaryType: employee.salaryType,
    workingDays: finalWorkingDays,
    dailyWage: employee.salaryType === 'DAILY' ? finalDailyWage : null,
    grossWage,
    arrears: Number(arrears || 0),
    bonus: finalBonus,
    advanceDeduction: finalAdvanceDeduction,
    loanDeduction: Number(loanDeduction || 0),
    fineDeduction: Number(fineDeduction || 0),
    otherDeductions: finalOtherDeductions,
    netSalary,
    remarks,
    paymentMethod,
    linkedProductionOrderId: linkedProductionOrderId || null
  };
};

const syncSalaryLoanRecovery = async (tx: any, salary: any) => {
  const requestedDeduction = Math.max(0, Number(salary.loanDeduction || 0));
  const existingRecoveries = await tx.loanRecovery.findMany({
    where: { salaryId: salary.id },
    include: { loan: true }
  });
  const existingTotal = existingRecoveries.reduce((sum: number, recovery: any) => sum + Number(recovery.amount || 0), 0);

  if (Math.abs(existingTotal - requestedDeduction) < 0.001) return;

  for (const recovery of existingRecoveries) {
    const restoredBalance = Math.min(
      Number(recovery.loan.totalAmount || 0),
      Number(recovery.loan.remainingBalance || 0) + Number(recovery.amount || 0)
    );
    await tx.employeeLoan.update({
      where: { id: recovery.loanId },
      data: { remainingBalance: restoredBalance, isCleared: false }
    });
  }
  if (existingRecoveries.length) {
    await tx.loanRecovery.deleteMany({ where: { salaryId: salary.id } });
  }
  if (requestedDeduction <= 0) return;

  const loans = await tx.employeeLoan.findMany({
    where: { employeeId: salary.employeeId, remainingBalance: { gt: 0 } },
    orderBy: { startDate: 'asc' }
  });
  const outstandingBalance = loans.reduce((sum: number, loan: any) => sum + Number(loan.remainingBalance || 0), 0);
  if (requestedDeduction > outstandingBalance + 0.001) {
    throw new Error(`Loan deduction cannot exceed remaining loan balance ${outstandingBalance}`);
  }

  let remainingDeduction = requestedDeduction;
  for (const loan of loans) {
    if (remainingDeduction <= 0) break;
    const recoveryAmount = Math.min(Number(loan.remainingBalance || 0), remainingDeduction);
    const nextBalance = Math.max(0, Number(loan.remainingBalance || 0) - recoveryAmount);
    await tx.employeeLoan.update({
      where: { id: loan.id },
      data: { remainingBalance: nextBalance, isCleared: nextBalance <= 0 }
    });
    await tx.loanRecovery.create({
      data: {
        loanId: loan.id,
        amount: recoveryAmount,
        date: salary.paidDate || new Date(),
        salaryId: salary.id
      }
    });
    remainingDeduction -= recoveryAmount;
  }
};

export const calculateSalary = async (req: any, res: Response) => {
  try {
    const preview = await salaryPreview(req.body);
    res.json({ success: true, data: preview });
  } catch (error: any) {
    res.status(400).json({ success: false, message: publicError(error, 'Could not calculate salary') });
  }
};

export const generateSalary = async (req: any, res: Response) => {
  try {
    const preview = await salaryPreview(req.body);

    const salary = await prisma.$transaction(async (tx) => {
      const saved = await tx.salary.upsert({
        where: { employeeId_month_year: { employeeId: preview.employee.id, month: preview.month, year: preview.year } },
        update: {
          salaryType: preview.salaryType,
          workingDays: preview.workingDays,
          dailyWage: preview.dailyWage,
          grossWage: preview.grossWage,
          basicSalary: preview.employee.basicSalary,
          advances: preview.advanceDeduction,
          deductions: preview.otherDeductions,
          bonuses: preview.bonus,
          arrears: preview.arrears,
          bonus: preview.bonus,
          advanceDeduction: preview.advanceDeduction,
          loanDeduction: preview.loanDeduction,
          fineDeduction: preview.fineDeduction,
          otherDeductions: preview.otherDeductions,
          netSalary: preview.netSalary,
          paymentMethod: preview.paymentMethod,
          remarks: preview.remarks,
          linkedProductionOrderId: preview.linkedProductionOrderId,
          paidBy: req.user.id
        },
        create: {
          employeeId: preview.employee.id,
          month: preview.month,
          year: preview.year,
          salaryType: preview.salaryType,
          workingDays: preview.workingDays,
          dailyWage: preview.dailyWage,
          grossWage: preview.grossWage,
          basicSalary: preview.employee.basicSalary,
          advances: preview.advanceDeduction,
          deductions: preview.otherDeductions,
          bonuses: preview.bonus,
          arrears: preview.arrears,
          bonus: preview.bonus,
          advanceDeduction: preview.advanceDeduction,
          loanDeduction: preview.loanDeduction,
          fineDeduction: preview.fineDeduction,
          otherDeductions: preview.otherDeductions,
          netSalary: preview.netSalary,
          paymentMethod: preview.paymentMethod,
          remarks: preview.remarks,
          linkedProductionOrderId: preview.linkedProductionOrderId,
          paidBy: req.user.id
        }
      });
      await syncSalaryLoanRecovery(tx, saved);
      await createSalaryExpenseEntry(preview.employee.id, saved.id, preview.netSalary, tx);
      return saved;
    });

    res.json({ success: true, data: { ...salary, employee: preview.employee } });
  } catch (error: any) { res.status(500).json({ success: false, message: publicError(error, 'Something went wrong. Please try again.') }); }
};

export const markSalaryPaid = async (req: any, res: Response) => {
  try {
    const { paymentMethod, paidDate } = req.body || {};
    const salary = await prisma.$transaction(async (tx) => {
      const paid = await tx.salary.update({
        where: { id: req.params.id },
        data: { isPaid: true, paidDate: paidDate ? new Date(paidDate) : new Date(), paidBy: req.user.id, paymentMethod }
      });
      if (paid.advanceDeduction > 0) {
        const advances = await tx.employeeAdvance.findMany({
          where: { employeeId: paid.employeeId, remainingBalance: { gt: 0 } },
          orderBy: { advanceDate: 'asc' }
        });
        let remaining = paid.advanceDeduction;
        for (const advance of advances) {
          if (remaining <= 0) break;
          const deduct = Math.min(advance.remainingBalance, remaining);
          await tx.employeeAdvance.update({
            where: { id: advance.id },
            data: {
              deductedAmount: { increment: deduct },
              recoveredAmount: { increment: deduct },
              remainingBalance: { decrement: deduct },
              isFullyRecovered: advance.remainingBalance - deduct <= 0,
              isRecovered: advance.remainingBalance - deduct <= 0
            }
          });
          remaining -= deduct;
        }
      }
      await syncSalaryLoanRecovery(tx, paid);
      await createSalaryPaymentEntry(paid.employeeId, paid.id, paid.netSalary, tx);
      return paid;
    });
    res.json({ success: true, data: salary });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const getPayslip = async (req: Request, res: Response) => {
  try {
    const salary = await prisma.salary.findUnique({
      where: {
        employeeId_month_year: {
          employeeId: req.params.id,
          month: Number(req.params.month),
          year: Number(req.params.year)
        }
      },
      include: { employee: true, paidByUser: { select: { name: true } } }
    });
    if (!salary) return res.status(404).json({ success: false, message: 'Payslip not found' });
    res.json({ success: true, data: salary });
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const getPayslipById = async (req: Request, res: Response) => {
  try {
    const salary = await prisma.salary.findUnique({
      where: { id: req.params.id },
      include: { employee: true, paidByUser: { select: { name: true } }, linkedProductionOrder: { include: { product: true } } }
    });
    if (!salary) return res.status(404).json({ success: false, message: 'Payslip not found' });
    const salaryRecoveries = await prisma.loanRecovery.findMany({
      where: { salaryId: salary.id },
      include: { loan: true }
    });
    const recoveredLoans = Array.from(new Map(salaryRecoveries.map((recovery) => [recovery.loan.id, recovery.loan])).values());
    const activeLoan = recoveredLoans.length ? null : await prisma.employeeLoan.findFirst({
      where: { employeeId: salary.employeeId, isCleared: false },
      orderBy: { startDate: 'asc' }
    });
    const loan = recoveredLoans.length ? {
      totalAmount: recoveredLoans.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0),
      remainingBalance: recoveredLoans.reduce((sum, item) => sum + Number(item.remainingBalance || 0), 0)
    } : activeLoan;
    res.json({ success: true, data: { salary, employee: salary.employee, loan } });
  } catch { res.status(500).json({ success: false, message: 'Server error' }); }
};

export const getSalaryRevisions = async (req: Request, res: Response) => {
  const revisions = await prisma.salaryRevision.findMany({ where: { employeeId: req.params.id }, orderBy: { effectiveDate: 'desc' } });
  res.json({ success: true, data: revisions });
};

export const createSalaryRevision = async (req: any, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
    const { newSalary, newDailyWage, effectiveDate, reason } = req.body;
    const revision = await prisma.$transaction(async (tx) => {
      const created = await tx.salaryRevision.create({
        data: {
          employeeId: employee.id,
          oldSalary: employee.basicSalary,
          newSalary: Number(newSalary ?? employee.basicSalary),
          oldDailyWage: employee.dailyWage,
          newDailyWage: newDailyWage === undefined || newDailyWage === '' ? employee.dailyWage : Number(newDailyWage),
          effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
          reason,
          createdBy: req.user.id
        }
      });
      await tx.employee.update({
        where: { id: employee.id },
        data: {
          basicSalary: Number(newSalary ?? employee.basicSalary),
          dailyWage: newDailyWage === undefined || newDailyWage === '' ? employee.dailyWage : Number(newDailyWage)
        }
      });
      return created;
    });
    res.status(201).json({ success: true, data: revision });
  } catch (error: any) { res.status(500).json({ success: false, message: publicError(error, 'Could not create revision') }); }
};

export const getEmployeeAdvances = async (req: Request, res: Response) => {
  const advances = await prisma.employeeAdvance.findMany({ where: { employeeId: req.params.id }, orderBy: { advanceDate: 'desc' } });
  res.json({ success: true, data: advances });
};

export const deductAdvance = async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const existing = await prisma.employeeAdvance.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Advance not found' });
    const deduction = Number(amount || 0);
    const remainingBalance = Math.max(0, (existing.remainingBalance || existing.amount - existing.deductedAmount) - deduction);
    const deductedAmount = (existing.deductedAmount || 0) + deduction;
    const advance = await prisma.employeeAdvance.update({
      where: { id: existing.id },
      data: {
        deductedAmount,
        recoveredAmount: deductedAmount,
        remainingBalance,
        isFullyRecovered: remainingBalance <= 0,
        isRecovered: remainingBalance <= 0
      }
    });
    res.json({ success: true, data: advance });
  } catch (error: any) { res.status(500).json({ success: false, message: publicError(error, 'Could not deduct advance') }); }
};

export const getEmployeeLoans = async (req: Request, res: Response) => {
  const loans = await prisma.employeeLoan.findMany({ where: { employeeId: req.params.id }, include: { recoveries: true }, orderBy: { startDate: 'desc' } });
  res.json({ success: true, data: loans });
};

export const createLoan = async (req: any, res: Response) => {
  try {
    const { employeeId, totalAmount, reason, startDate, monthlyDeduction } = req.body;
    const amount = Number(totalAmount || 0);
    if (!employeeId || amount <= 0) return res.status(400).json({ success: false, message: 'Employee and loan amount are required' });
    const loan = await prisma.$transaction(async (tx) => {
      const created = await tx.employeeLoan.create({
        data: {
          employeeId,
          totalAmount: amount,
          remainingBalance: amount,
          reason,
          startDate: startDate ? new Date(startDate) : new Date(),
          monthlyDeduction: Number(monthlyDeduction || 0),
          createdBy: req.user.id
        },
        include: { employee: true, recoveries: true }
      });
      await createAdvanceEntry(employeeId, created.id, amount, tx);
      return created;
    });
    res.status(201).json({ success: true, data: loan });
  } catch (error: any) { res.status(500).json({ success: false, message: publicError(error, 'Could not create loan') }); }
};

export const recoverLoan = async (req: Request, res: Response) => {
  try {
    const { amount, date, salaryId } = req.body;
    const loan = await prisma.employeeLoan.findUnique({ where: { id: req.params.id } });
    if (!loan) return res.status(404).json({ success: false, message: 'Loan not found' });
    const recoveryAmount = Number(amount || 0);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.loanRecovery.create({
        data: { loanId: loan.id, amount: recoveryAmount, date: date ? new Date(date) : new Date(), salaryId }
      });
      return tx.employeeLoan.update({
        where: { id: loan.id },
        data: {
          remainingBalance: Math.max(0, loan.remainingBalance - recoveryAmount),
          isCleared: loan.remainingBalance - recoveryAmount <= 0
        },
        include: { recoveries: true }
      });
    });
    res.json({ success: true, data: updated });
  } catch (error: any) { res.status(500).json({ success: false, message: publicError(error, 'Could not recover loan') }); }
};

export const getEmployeeFines = async (req: Request, res: Response) => {
  const fines = await prisma.employeeFine.findMany({ where: { employeeId: req.params.id }, orderBy: { date: 'desc' } });
  res.json({ success: true, data: fines });
};

export const createFine = async (req: any, res: Response) => {
  try {
    const { employeeId, amount, reason, date, salaryId } = req.body;
    const fine = await prisma.employeeFine.create({
      data: { employeeId, amount: Number(amount || 0), reason, date: date ? new Date(date) : new Date(), salaryId }
    });
    res.status(201).json({ success: true, data: fine });
  } catch (error: any) { res.status(500).json({ success: false, message: publicError(error, 'Could not create fine') }); }
};

export const getEmployeeLedger = async (req: Request, res: Response) => {
  try {
    const [advances, loans, salaries, recoveries] = await Promise.all([
      prisma.employeeAdvance.findMany({ where: { employeeId: req.params.id } }),
      prisma.employeeLoan.findMany({ where: { employeeId: req.params.id } }),
      prisma.salary.findMany({ where: { employeeId: req.params.id, isPaid: true } }),
      prisma.loanRecovery.findMany({ where: { loan: { employeeId: req.params.id } } })
    ]);
    const debits = [
      ...advances.map((a) => ({ date: a.advanceDate || a.date, description: 'Advance', amount: a.amount, type: 'DEBIT' })),
      ...loans.map((l) => ({ date: l.startDate, description: 'Loan', amount: l.totalAmount, type: 'DEBIT' }))
    ];
    const credits = [
      ...salaries.map((s) => ({ date: s.paidDate || s.createdAt, description: `Salary ${s.month}/${s.year}`, amount: s.netSalary, type: 'CREDIT' })),
      ...recoveries.map((r) => ({ date: r.date, description: 'Loan Recovery', amount: r.amount, type: 'CREDIT' }))
    ];
    const transactions = [...debits, ...credits].sort((a, b) => new Date(a.date as any).getTime() - new Date(b.date as any).getTime());
    const totalDebit = debits.reduce((sum, item) => sum + item.amount, 0);
    const totalCredit = credits.reduce((sum, item) => sum + item.amount, 0);
    res.json({ success: true, data: { transactions, debits, credits, totalDebit, totalCredit, balance: totalDebit - totalCredit } });
  } catch (error: any) { res.status(500).json({ success: false, message: publicError(error, 'Could not load ledger') }); }
};

export const deleteEmployee = async (req: Request, res: Response) => {
  try {
    await prisma.$transaction([
      prisma.attendance.deleteMany({ where: { employeeId: req.params.id } }),
      prisma.salary.deleteMany({ where: { employeeId: req.params.id } }),
      prisma.employeeAdvance.deleteMany({ where: { employeeId: req.params.id } }),
      prisma.loanRecovery.deleteMany({ where: { loan: { employeeId: req.params.id } } }),
      prisma.employeeLoan.deleteMany({ where: { employeeId: req.params.id } }),
      prisma.employeeFine.deleteMany({ where: { employeeId: req.params.id } }),
      prisma.leaveRequest.deleteMany({ where: { employeeId: req.params.id } }),
      prisma.salaryRevision.deleteMany({ where: { employeeId: req.params.id } }),
      prisma.employee.delete({ where: { id: req.params.id } })
    ]);
    res.json({ success: true, message: 'Employee deleted permanently' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: publicError(error, 'Could not delete employee') });
  }
};
