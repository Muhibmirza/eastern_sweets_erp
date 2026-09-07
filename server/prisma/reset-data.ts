import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRaw`PRAGMA foreign_keys = OFF`;
  await prisma.saleReturnItem.deleteMany();
  await prisma.saleReturn.deleteMany();
  await prisma.stockMovement.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.journalLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.productionConsumption.deleteMany();
  await prisma.productionOrder.deleteMany();
  await prisma.recipeIngredient.deleteMany();
  await prisma.recipe.deleteMany();
  await prisma.token.deleteMany();
  await prisma.tokenCounter.deleteMany();
  await prisma.loanRecovery.deleteMany();
  await prisma.salary.deleteMany();
  await prisma.employeeAdvance.deleteMany();
  await prisma.employeeLoan.deleteMany();
  await prisma.employeeFine.deleteMany();
  await prisma.salaryRevision.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.purchaseItem.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.product.deleteMany();
  await prisma.rawMaterial.deleteMany();
  await prisma.category.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.chartOfAccounts.updateMany({ data: { balance: 0 } });
  await prisma.$executeRaw`PRAGMA foreign_keys = ON`;

  await prisma.user.updateMany({
    data: { isActive: true }
  });

  await prisma.shopSettings.upsert({
    where: { id: 'settings-1' },
    update: {
      shopName: 'Darbar Sweets',
      address: 'Liquat Chowk, Sukkur, Sindh',
      phone: '0317-3258390',
      city: 'Sukkur, Sindh',
      currency: 'PKR',
      taxRate: 0
    },
    create: {
      id: 'settings-1',
      shopName: 'Darbar Sweets',
      address: 'Liquat Chowk, Sukkur, Sindh',
      phone: '0317-3258390',
      city: 'Sukkur, Sindh',
      currency: 'PKR',
      taxRate: 0
    }
  });

  console.log('Business data reset complete. Users, shop settings, and chart of accounts kept.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
