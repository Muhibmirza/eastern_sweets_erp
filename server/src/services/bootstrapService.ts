import { bootstrapPassword } from '../config/environment';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';

const SHOP_ADDRESS = 'Eastern Sweets, Bakers & Nimco';
const SHOP_PHONE = '';

export const defaultCategories = [
  { name: 'Sweets', type: 'SWEET', description: 'Mithai and sweet items' },
  { name: 'Bakery Items', type: 'BAKERY', description: 'Fresh baked goods' },
  { name: 'Raw Materials', type: 'RAW_MATERIAL', description: 'Kitchen and bakery ingredients' }
];

export async function ensureDefaultData() {
  const existingSettings = await prisma.shopSettings.findFirst();
  if (!existingSettings) {
    await prisma.shopSettings.create({
      data: {
        id: 'settings-1',
        shopName: 'Eastern Sweets',
        address: SHOP_ADDRESS,
        phone: SHOP_PHONE,
        city: 'Pakistan',
        currency: 'PKR',
        taxRate: 0
      }
    });
  } else if (
    !existingSettings.phone ||
    existingSettings.phone === '0300-1234567' ||
    !existingSettings.address ||
    existingSettings.address === 'Main Bazar, Sukkur'
  ) {
    await prisma.shopSettings.update({
      where: { id: existingSettings.id },
      data: {
        phone: !existingSettings.phone || existingSettings.phone === '0300-1234567' ? SHOP_PHONE : existingSettings.phone,
        address: !existingSettings.address || existingSettings.address === 'Main Bazar, Sukkur' ? SHOP_ADDRESS : existingSettings.address
      }
    });
  }

  const accounts = [
    ['1001', 'Cash in Hand', 'ASSET', 'CASH'],
    ['1002', 'Bank Account', 'ASSET', 'BANK'],
    ['1100', 'Inventory - Raw Materials', 'ASSET', 'INVENTORY'],
    ['1101', 'Inventory - Finished Goods', 'ASSET', 'INVENTORY'],
    ['1102', 'Kitchen / WIP Inventory', 'ASSET', 'INVENTORY'],
    ['1200', 'Employee Advances', 'ASSET', 'RECEIVABLE'],
    ['1201', 'Supplier Advances', 'ASSET', 'RECEIVABLE'],
    ['1300', 'Accounts Receivable', 'ASSET', 'RECEIVABLE'],
    ['2001', 'Accounts Payable (Supplier)', 'LIABILITY', 'PAYABLE'],
    ['2002', 'Salary Payable', 'LIABILITY', 'PAYABLE'],
    ['2003', 'Tax Payable', 'LIABILITY', 'TAX'],
    ['3001', 'Sales Revenue', 'INCOME', 'REVENUE'],
    ['3002', 'Other Income', 'INCOME', 'REVENUE'],
    ['4001', 'Cost of Goods Sold (COGS)', 'EXPENSE', 'COST_OF_GOODS'],
    ['4002', 'Salary Expense', 'EXPENSE', 'SALARY'],
    ['4003', 'Rent Expense', 'EXPENSE', 'RENT'],
    ['4004', 'Electricity Expense', 'EXPENSE', 'ELECTRICITY'],
    ['4005', 'Gas Expense', 'EXPENSE', 'GAS'],
    ['4006', 'Fuel Expense', 'EXPENSE', 'FUEL'],
    ['4007', 'Repair & Maintenance', 'EXPENSE', 'REPAIRS'],
    ['4008', 'Miscellaneous Expense', 'EXPENSE', 'MISC'],
    ['5001', 'Owner Equity', 'EQUITY', 'EQUITY'],
    ['5002', 'Retained Earnings', 'EQUITY', 'EQUITY']
  ];

  for (const [code, name, type, subType] of accounts) {
    await prisma.chartOfAccounts.upsert({
      where: { code },
      update: { name, type, subType, isActive: true },
      create: { code, name, type, subType }
    });
  }

  for (const category of defaultCategories) {
    const existing = await prisma.category.findFirst({ where: { name: category.name } });
    if (!existing) await prisma.category.create({ data: category });
  }

  const userCount = await prisma.user.count();
  if (userCount > 0) return;

  const adminPassword = await bcrypt.hash(bootstrapPassword('SEED_ADMIN_PASSWORD'), 12);
  const cashierPassword = await bcrypt.hash(bootstrapPassword('SEED_CASHIER_PASSWORD'), 12);
  const productionPassword = await bcrypt.hash(bootstrapPassword('SEED_PRODUCTION_PASSWORD'), 12);

  const admin = await prisma.user.create({
    data: { name: 'Admin', email: 'admin@easternsweets.com', password: adminPassword, role: 'ADMIN', isActive: true }
  });
  await prisma.user.create({
    data: { name: 'Cashier', email: 'cashier@easternsweets.com', password: cashierPassword, role: 'CASHIER', isActive: true }
  });
  await prisma.user.create({
    data: { name: 'Production Manager', email: 'production@easternsweets.com', password: productionPassword, role: 'PRODUCTION_MANAGER', isActive: true }
  });

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'BOOTSTRAP',
      tableName: 'System',
      recordId: 'initial-seed',
      newData: JSON.stringify({ message: 'Initial desktop database created without demo business data' })
    }
  });
}
