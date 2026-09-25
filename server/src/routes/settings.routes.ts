import { publicUserSelect } from '../utils/userSelect';
import { body } from 'express-validator';
import { validateAuth } from './auth.routes';
import { Router } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import prisma from '../utils/prisma';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { deleteBackup, formatBytes, getBackupGroupsWithSizes, mergeFullDatabaseBackups, normalizeGroups, parseGroups, restoreFullDatabaseBackup, runBackup } from '../services/backupService';
import { initBackupScheduler } from '../services/backupScheduler';
import { ensureDefaultData } from '../services/bootstrapService';
import { resetBusinessData } from '../services/maintenanceService';

const router = Router();
const restoreUpload = multer({
  dest: path.join(os.tmpdir(), 'eastern-sweets-restore'),
  fileFilter: (_req, file, cb) => { if (!['application/octet-stream', 'application/x-sqlite3', 'application/vnd.sqlite3'].includes(file.mimetype)) return cb(Object.assign(new Error('File type not allowed'), { status: 400 })); cb(null, true); },
  limits: { fileSize: 1024 * 1024 * 1024 }
});

router.use(authenticate);

router.get('/backup/groups', authorize('ADMIN'), async (_req, res, next) => {
  try {
    const groups = await getBackupGroupsWithSizes();
    res.json({ success: true, ...groups });
  } catch (error) {
    next(error);
  }
});

router.post('/backup/run', authorize('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const backup = await runBackup({
      groups: req.body.groups || [],
      destination: req.body.destination || '',
      type: 'MANUAL',
      userId: req.user?.id
    });
    res.status(201).json({ success: true, data: backup, message: 'Backup created successfully' });
  } catch (error) {
    next(error);
  }
});

router.get('/backup/history', authorize('ADMIN'), async (_req, res, next) => {
  try {
    const history = await prisma.backupHistory.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({
      success: true,
      data: history.map((backup) => ({ ...backup, groups: parseGroups(backup.groups), sizeFormatted: formatBytes(backup.sizeBytes) }))
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/backup/history/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const backup = await deleteBackup(req.params.id);
    if (!backup) return res.status(404).json({ success: false, message: 'Backup not found' });
    res.json({ success: true, message: 'Backup deleted successfully' });
  } catch (error) {
    next(error);
  }
});

router.get('/backup/download/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const backup = await prisma.backupHistory.findUnique({ where: { id: req.params.id } });
    if (!backup || !fs.existsSync(backup.filePath)) return res.status(404).json({ success: false, message: 'Backup file not found' });
    return res.download(backup.filePath, backup.filename);
  } catch (error) {
    next(error);
  }
});

const restoreFields = restoreUpload.fields([
  { name: 'backup', maxCount: 1 },
  { name: 'backups', maxCount: 20 }
]);

router.post('/backup/restore', authorize('ADMIN'), restoreFields, async (req, res, next) => {
  const files = [
    ...(((req.files as any)?.backup || []) as Express.Multer.File[]),
    ...(((req.files as any)?.backups || []) as Express.Multer.File[])
  ];
  try {
    if (!files.length) return res.status(400).json({ success: false, message: 'Backup file is required' });
    const result = files.length === 1
      ? await restoreFullDatabaseBackup(files[0].path)
      : await mergeFullDatabaseBackups(files.map((file) => file.path));
    files.forEach((file) => fs.unlink(file.path, () => undefined));
    await ensureDefaultData();
    res.json({
      success: true,
      data: result,
      message: files.length === 1
        ? 'Backup restored successfully. Please login again to refresh the session.'
        : 'Backups merged successfully. Please login again to refresh the session.'
    });
  } catch (error) {
    files.forEach((file) => fs.unlink(file.path, () => undefined));
    next(error);
  }
});

router.post('/data/reset', authorize('ADMIN'), async (_req, res, next) => {
  try {
    const result = await resetBusinessData();
    await ensureDefaultData();
    res.json({
      success: true,
      data: result,
      message: 'Business data has been reset. Users, settings, accounts, and backup history were kept.'
    });
  } catch (error) {
    next(error);
  }
});

router.get('/backup/schedule', authorize('ADMIN'), async (_req, res, next) => {
  try {
    const schedule = await prisma.backupSchedule.findFirst();
    res.json({
      success: true,
      data: schedule
        ? { ...schedule, groups: parseGroups(schedule.groups) }
        : {
            enabled: false,
            frequency: 'DAILY',
            time: '23:00',
            dayOfWeek: 0,
            dayOfMonth: 1,
            keepLast: 10,
            destination: '',
            groups: normalizeGroups([])
          }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/backup/schedule', authorize('ADMIN'), async (req, res, next) => {
  try {
    const data = {
      enabled: Boolean(req.body.enabled),
      frequency: req.body.frequency || 'DAILY',
      time: req.body.time || '23:00',
      dayOfWeek: req.body.dayOfWeek === undefined || req.body.dayOfWeek === '' ? null : Number(req.body.dayOfWeek),
      dayOfMonth: req.body.dayOfMonth === undefined || req.body.dayOfMonth === '' ? null : Number(req.body.dayOfMonth),
      keepLast: Math.max(Number(req.body.keepLast || 10), 1),
      destination: req.body.destination || '',
      groups: JSON.stringify(normalizeGroups(req.body.groups || []))
    };
    const existing = await prisma.backupSchedule.findFirst();
    const schedule = existing
      ? await prisma.backupSchedule.update({ where: { id: existing.id }, data })
      : await prisma.backupSchedule.create({ data });
    await initBackupScheduler();
    res.json({ success: true, data: { ...schedule, groups: parseGroups(schedule.groups) }, message: 'Backup schedule saved' });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req, res) => {
  let settings = await prisma.shopSettings.findFirst();
  if (!settings) {
    settings = await prisma.shopSettings.create({
      data: { shopName: 'Eastern Sweets', city: 'Sukkur', currency: 'PKR' }
    });
  }
  res.json({ success: true, data: settings });
});

router.put('/', authorize('ADMIN'), async (req, res) => {
  const { shopName, address, phone, city, taxRate } = req.body;
  let settings = await prisma.shopSettings.findFirst();
  if (!settings) {
    settings = await prisma.shopSettings.create({ data: { shopName, address, phone, city, taxRate: parseFloat(taxRate || '0') } });
  } else {
    settings = await prisma.shopSettings.update({
      where: { id: settings.id },
      data: { shopName, address, phone, city, taxRate: parseFloat(taxRate || '0') }
    });
  }
  res.json({ success: true, data: settings });
});

// User management
router.get('/users', authorize('ADMIN'), async (req, res) => {
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true } });
  res.json({ success: true, data: users });
});

router.post('/users', authorize('ADMIN'), body('email').isString().trim().isEmail().toLowerCase(), body('name').isString().trim().notEmpty(), body('password').isString().isLength({ min: 6, max: 72 }), body('role').isIn(['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'CASHIER', 'STAFF']), validateAuth, async (req, res) => {
  const bcrypt = await import('bcryptjs');
  const { name, email, password, role } = req.body;
  const hashed = await bcrypt.default.hash(password, 12);
  const user = await prisma.user.create({ data: { name, email, password: hashed, role }, select: publicUserSelect });
  const u = user;
  res.status(201).json({ success: true, data: u });
});

router.patch('/users/:id', authorize('ADMIN'), body('password').optional({ values: 'falsy' }).isString().isLength({ min: 6, max: 72 }), body('role').optional().isIn(['ADMIN', 'MANAGER', 'PRODUCTION_MANAGER', 'CASHIER', 'STAFF']), body('isActive').optional().isBoolean({ strict: true }), validateAuth, async (req, res) => {
  const bcrypt = await import('bcryptjs');
  const { isActive, role, password } = req.body;
  const data: any = {};
  if (isActive !== undefined) data.isActive = isActive;
  if (role) data.role = role;
  if (password) data.password = await bcrypt.default.hash(password, 12);
  const user = await prisma.user.update({ where: { id: req.params.id }, data, select: publicUserSelect });
  const u = user;
  res.json({ success: true, data: u });
});

export default router;
