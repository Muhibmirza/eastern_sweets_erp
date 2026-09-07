import prisma from '../utils/prisma';
import { defaultCategories } from './bootstrapService';

export async function resetBusinessData() {
  await prisma.$executeRaw`PRAGMA foreign_keys = OFF`;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.saleReturnItem.deleteMany();
      await tx.saleReturn.deleteMany();
      await tx.stockMovement.deleteMany();
      await tx.auditLog.deleteMany();
      await tx.journalLine.deleteMany();
      await tx.journalEntry.deleteMany();
      await tx.productionConsumption.deleteMany();
      await tx.productionOrder.deleteMany();
      await tx.recipeIngredient.deleteMany();
      await tx.recipe.deleteMany();
      await tx.token.deleteMany();
      await tx.tokenCounter.deleteMany();
      await tx.loanRecovery.deleteMany();
      await tx.salary.deleteMany();
      await tx.employeeAdvance.deleteMany();
      await tx.employeeLoan.deleteMany();
      await tx.employeeFine.deleteMany();
      await tx.salaryRevision.deleteMany();
      await tx.leaveRequest.deleteMany();
      await tx.purchaseItem.deleteMany();
      await tx.purchaseOrder.deleteMany();
      await tx.saleItem.deleteMany();
      await tx.sale.deleteMany();
      await tx.orderItem.deleteMany();
      await tx.order.deleteMany();
      await tx.expense.deleteMany();
      await tx.attendance.deleteMany();
      await tx.product.deleteMany();
      await tx.rawMaterial.deleteMany();
      await tx.category.deleteMany();
      await tx.supplier.deleteMany();
      await tx.customer.deleteMany();
      await tx.employee.deleteMany();
      await tx.chartOfAccounts.updateMany({ data: { balance: 0 } });
      await tx.user.updateMany({ data: { isActive: true } });
      for (const category of defaultCategories) {
        await tx.category.create({ data: category });
      }
    }, { timeout: 60000 });
  } finally {
    await prisma.$executeRaw`PRAGMA foreign_keys = ON`;
  }

  return {
    resetAt: new Date().toISOString(),
    preserved: ['users', 'shop settings', 'chart of accounts', 'backup history', 'backup schedule']
  };
}
