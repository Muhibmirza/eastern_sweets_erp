import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

const numericFields = new Set([
  ...Prisma.dmmf.datamodel.models.flatMap(model => model.fields
    .filter(field => ['Int', 'Float', 'Decimal', 'BigInt'].includes(field.type)).map(field => field.name)),
  'qty', 'actualQty', 'workingDays', 'laborCost', 'packingCost', 'shortTermDeduction', 'longTermDeduction',
  'recoveredAmount', 'openingBalance', 'advance', 'paid', 'debit', 'credit', 'kitchenAdjustmentQuantity'
]);
// Balances and closing differences may legitimately be negative.
const signedFields = new Set(['balance', 'openingBalance', 'closingBalance', 'difference', 'cashDifference', 'profit', 'netProfit', 'kitchenAdjustmentQuantity']);

export function validateWriteNumbers(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const inspect = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return true;
    return Object.entries(value).every(([key, item]) => {
      if (numericFields.has(key) && item !== null && item !== undefined && item !== '') {
        if (!['number', 'string'].includes(typeof item) || (typeof item === 'string' && !item.trim())) return false;
        const number = Number(item);
        if (!Number.isFinite(number) || (!signedFields.has(key) && number < 0)) return false;
      }
      return inspect(item);
    });
  };
  if (!inspect(req.body)) return res.status(400).json({ success: false, message: 'Invalid numeric input' });
  next();
}

function withoutSecrets(value: any): any {
  if (Array.isArray(value)) return value.map(withoutSecrets);
  if (!value || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/^(password|password_hash|passwordHash|currentPassword|newPassword|JWT_SECRET|JWT_REFRESH_SECRET|DATABASE_URL)$/i.test(key))
    .map(([key, item]) => [key, withoutSecrets(item)]));
}

export function protectResponses(_req: Request, res: Response, next: NextFunction) {
  const json = res.json.bind(res);
  res.json = (body: any) => {
    if (res.statusCode >= 500) return json({ success: false, message: 'Something went wrong. Please try again.' });
    return json(withoutSecrets(body));
  };
  next();
}
