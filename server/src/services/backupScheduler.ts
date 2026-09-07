import fs from 'fs';
import cron from 'node-cron';
import prisma from '../utils/prisma';
import { parseGroups, runBackup } from './backupService';

let currentTask: cron.ScheduledTask | null = null;

export async function initBackupScheduler() {
  const schedule = await prisma.backupSchedule.findFirst();
  if (currentTask) {
    currentTask.stop();
    currentTask = null;
  }
  if (!schedule || !schedule.enabled) return;

  const cronExpression = buildCronExpression(schedule);
  currentTask = cron.schedule(cronExpression, async () => {
    try {
      await runBackup({ groups: parseGroups(schedule.groups), destination: schedule.destination, type: 'AUTO' });
      await cleanupOldBackups(schedule.keepLast);
    } catch (error) {
      console.error('Scheduled backup failed [REDACTED]');
    }
  });
}

function buildCronExpression(schedule: { frequency: string; time: string; dayOfWeek?: number | null; dayOfMonth?: number | null }) {
  const [hour = 23, minute = 0] = schedule.time.split(':').map(Number);
  if (schedule.frequency === 'WEEKLY') return `${minute} ${hour} * * ${schedule.dayOfWeek ?? 0}`;
  if (schedule.frequency === 'MONTHLY') return `${minute} ${hour} ${schedule.dayOfMonth ?? 1} * *`;
  return `${minute} ${hour} * * *`;
}

async function cleanupOldBackups(keepLast: number) {
  const backups = await prisma.backupHistory.findMany({ where: { type: 'AUTO' }, orderBy: { createdAt: 'desc' } });
  const oldBackups = backups.slice(Math.max(keepLast, 1));
  for (const backup of oldBackups) {
    if (fs.existsSync(backup.filePath)) fs.unlinkSync(backup.filePath);
    await prisma.backupHistory.delete({ where: { id: backup.id } });
  }
}
