import { Prisma, PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import prisma from '../utils/prisma';
import { ALL_BACKUP_GROUPS, BACKUP_GROUPS, BackupGroupKey } from '../config/backupGroups';

const execFileAsync = promisify(execFile);
const DOCKER_CONTAINER = process.env.POSTGRES_CONTAINER || 'eastern-sweets-db';
const POSTGRES_USER = process.env.POSTGRES_USER || 'postgres';
const POSTGRES_DB = process.env.POSTGRES_DB || 'eastern_sweets_erp';

const delegateByTable: Record<string, string> = {
  User: 'user',
  ShopSettings: 'shopSettings',
  AuditLog: 'auditLog',
  ChartOfAccounts: 'chartOfAccounts',
  JournalEntry: 'journalEntry',
  JournalLine: 'journalLine',
  Product: 'product',
  Category: 'category',
  RawMaterial: 'rawMaterial',
  Recipe: 'recipe',
  RecipeIngredient: 'recipeIngredient',
  ProductionOrder: 'productionOrder',
  ProductionConsumption: 'productionConsumption',
  StockMovement: 'stockMovement',
  Supplier: 'supplier',
  PurchaseOrder: 'purchaseOrder',
  PurchaseItem: 'purchaseItem',
  Sale: 'sale',
  SaleItem: 'saleItem',
  Order: 'order',
  OrderItem: 'orderItem',
  Customer: 'customer',
  Expense: 'expense',
  Employee: 'employee',
  Attendance: 'attendance',
  Salary: 'salary',
  EmployeeAdvance: 'employeeAdvance',
  LeaveRequest: 'leaveRequest'
};

export function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function isBackupGroup(value: string): value is BackupGroupKey {
  return ALL_BACKUP_GROUPS.includes(value as BackupGroupKey);
}

export function normalizeGroups(groups: string[]) {
  const unique = Array.from(new Set((groups || []).filter(isBackupGroup)));
  if (!unique.length) return [...ALL_BACKUP_GROUPS];
  return unique;
}

export function parseGroups(value: string | string[] | null | undefined): BackupGroupKey[] {
  if (Array.isArray(value)) return normalizeGroups(value);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? normalizeGroups(parsed) : [];
  } catch {
    return normalizeGroups(value.split(','));
  }
}

export function databaseFilePath() {
  const url = process.env.DATABASE_URL || 'file:./eastern-sweets.db';
  const raw = decodeURI(url.replace(/^file:/, ''));
  if (path.isAbsolute(raw)) return raw;
  const schemaRelative = path.resolve(process.cwd(), 'prisma', raw);
  if (fs.existsSync(schemaRelative)) return schemaRelative;
  return path.resolve(process.cwd(), raw);
}

function assertSQLiteDatabase(filePath: string) {
  const header = Buffer.alloc(16);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, header, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (header.toString('utf8') !== 'SQLite format 3\0') {
    throw new Error('Invalid backup file. Please select a full Eastern Sweets .db backup file.');
  }
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}


function sqliteSidecarPaths(dbPath: string) {
  return [`${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`];
}

function removeSQLiteSidecars(dbPath: string) {
  for (const filePath of sqliteSidecarPaths(dbPath)) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

async function isDockerPostgresAvailable() {
  try {
    const { stdout } = await execFileAsync('docker', ['ps', '--filter', `name=${DOCKER_CONTAINER}`, '--filter', 'status=running', '--format', '{{.Names}}']);
    return stdout.split(/\r?\n/).some((line) => line.trim() === DOCKER_CONTAINER);
  } catch {
    return false;
  }
}

async function dockerExec(args: string[]) {
  return execFileAsync('docker', ['exec', DOCKER_CONTAINER, ...args], { maxBuffer: 1024 * 1024 * 20 });
}

async function postgresScalar(sql: string) {
  const { stdout } = await dockerExec(['psql', '-U', POSTGRES_USER, '-d', POSTGRES_DB, '-t', '-A', '-c', sql]);
  return stdout.trim();
}

async function getPostgresTableSize(table: string) {
  try {
    const escaped = table.replace(/"/g, '""');
    const value = await postgresScalar(`SELECT COALESCE(pg_total_relation_size(to_regclass('"${escaped}"')), 0);`);
    return Number(value || 0);
  } catch {
    return 0;
  }
}

async function getPostgresDatabaseSize() {
  try {
    const escaped = POSTGRES_DB.replace(/'/g, "''");
    const value = await postgresScalar(`SELECT pg_database_size('${escaped}');`);
    return Number(value || 0);
  } catch {
    return 0;
  }
}

async function runPgDump(filePath: string) {
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(filePath);
    const dump = spawn('docker', ['exec', DOCKER_CONTAINER, 'pg_dump', '-U', POSTGRES_USER, '-F', 'c', POSTGRES_DB], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    dump.stdout.pipe(output);
    dump.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    dump.on('error', reject);
    output.on('error', reject);
    dump.on('close', (code) => {
      output.close();
      if (code === 0) resolve();
      else reject(new Error(stderr || `pg_dump failed with exit code ${code}`));
    });
  });
}

async function restorePostgresBackup(uploadPath: string) {
  const ext = path.extname(uploadPath).toLowerCase();
  const containerFile = ext === '.sql' ? '/tmp/restore.sql' : '/tmp/restore.dump';
  await execFileAsync('docker', ['cp', uploadPath, `${DOCKER_CONTAINER}:${containerFile}`], { maxBuffer: 1024 * 1024 * 20 });
  try {
    await execFileAsync('docker', ['exec', DOCKER_CONTAINER, 'psql', '-U', POSTGRES_USER, '-d', 'postgres', '-c', `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${POSTGRES_DB}' AND pid<>pg_backend_pid();`], { maxBuffer: 1024 * 1024 * 20 });
    await execFileAsync('docker', ['exec', DOCKER_CONTAINER, 'psql', '-U', POSTGRES_USER, '-d', 'postgres', '-c', `DROP DATABASE IF EXISTS ${POSTGRES_DB};`], { maxBuffer: 1024 * 1024 * 20 });
    await execFileAsync('docker', ['exec', DOCKER_CONTAINER, 'psql', '-U', POSTGRES_USER, '-d', 'postgres', '-c', `CREATE DATABASE ${POSTGRES_DB};`], { maxBuffer: 1024 * 1024 * 20 });
    if (ext === '.sql') {
      await execFileAsync('docker', ['exec', DOCKER_CONTAINER, 'psql', '-U', POSTGRES_USER, '-d', POSTGRES_DB, '-f', containerFile], { maxBuffer: 1024 * 1024 * 100 });
    } else {
      await execFileAsync('docker', ['exec', DOCKER_CONTAINER, 'pg_restore', '-U', POSTGRES_USER, '-d', POSTGRES_DB, '--no-owner', '--clean', '--if-exists', containerFile], { maxBuffer: 1024 * 1024 * 100 });
    }
  } finally {
    await execFileAsync('docker', ['exec', DOCKER_CONTAINER, 'rm', '-f', containerFile]).catch(() => undefined);
  }
}

async function readTable(table: string) {
  const delegateName = delegateByTable[table];
  const delegate = (prisma as any)[delegateName];
  if (!delegate?.findMany) return [];
  return delegate.findMany();
}

async function buildGroupExport(group: BackupGroupKey) {
  const tables: Record<string, unknown[]> = {};
  for (const table of BACKUP_GROUPS[group].tables) {
    tables[table] = await readTable(table);
  }
  return tables;
}

async function buildSelectedExport(groups: BackupGroupKey[]) {
  const payload: Record<string, unknown> = {
    app: 'Eastern Sweets',
    createdAt: new Date().toISOString(),
    groups: {}
  };
  for (const group of groups) {
    (payload.groups as Record<string, unknown>)[group] = await buildGroupExport(group);
  }
  return payload;
}

export async function getBackupGroupsWithSizes() {
  const dockerPostgres = await isDockerPostgresAvailable();
  const data = await Promise.all(
    ALL_BACKUP_GROUPS.map(async (key) => {
      const sizeBytes = dockerPostgres
        ? (await Promise.all(BACKUP_GROUPS[key].tables.map(getPostgresTableSize))).reduce((sum, size) => sum + size, 0)
        : Buffer.byteLength(JSON.stringify(await buildSelectedExport([key])));
      return {
        key,
        label: BACKUP_GROUPS[key].label,
        description: BACKUP_GROUPS[key].description,
        sizeBytes,
        sizeFormatted: formatBytes(sizeBytes)
      };
    })
  );

  const totalSizeBytes = data.reduce((sum, group) => sum + group.sizeBytes, 0);
  const dbPath = databaseFilePath();
  const fullDatabaseSizeBytes = dockerPostgres ? await getPostgresDatabaseSize() : (fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0);
  return {
    data,
    totalSizeBytes,
    totalSizeFormatted: formatBytes(totalSizeBytes),
    fullDatabaseSizeBytes,
    fullDatabaseSizeFormatted: formatBytes(fullDatabaseSizeBytes)
  };
}

function timestamp() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export async function runBackup({
  groups,
  destination,
  type,
  userId
}: {
  groups: string[];
  destination: string;
  type: 'MANUAL' | 'AUTO';
  userId?: string;
}) {
  const selectedGroups = normalizeGroups(groups);
  const isFullBackup = ALL_BACKUP_GROUPS.every((group) => selectedGroups.includes(group));
  const backupDir = destination?.trim() || path.resolve(process.cwd(), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  let filename = `eastern-sweets-backup-${timestamp()}.json`;
  let filePath = path.join(backupDir, filename);

  if (isFullBackup) {
    filename = `eastern-sweets-backup-${timestamp()}.dump`;
    filePath = path.join(backupDir, filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (await isDockerPostgresAvailable()) {
      await runPgDump(filePath);
    } else {
      filename = `eastern-sweets-backup-${timestamp()}.db`;
      filePath = path.join(backupDir, filename);
      const dbPath = databaseFilePath();
      if (!fs.existsSync(dbPath)) throw new Error('Database file was not found for backup.');
      try {
        await prisma.$executeRaw`VACUUM INTO ${filePath}`;
      } catch {
        await prisma.$disconnect();
        removeSQLiteSidecars(filePath);
        fs.copyFileSync(dbPath, filePath);
        await prisma.$connect();
      }
    }
  } else {
    const exportPayload = await buildSelectedExport(selectedGroups);
    fs.writeFileSync(filePath, JSON.stringify(exportPayload, null, 2), 'utf8');
  }

  const sizeBytes = fs.statSync(filePath).size;
  const history = await prisma.backupHistory.create({
    data: {
      filename,
      filePath,
      sizeBytes,
      groups: JSON.stringify(selectedGroups),
      type,
      createdBy: userId
    }
  });

  return { ...history, groups: selectedGroups, sizeFormatted: formatBytes(sizeBytes) };
}

export async function deleteBackup(id: string) {
  const backup = await prisma.backupHistory.findUnique({ where: { id } });
  if (!backup) return null;
  if (fs.existsSync(backup.filePath)) fs.unlinkSync(backup.filePath);
  await prisma.backupHistory.delete({ where: { id } });
  return backup;
}

export async function restoreFullDatabaseBackup(uploadPath: string) {
  if (!fs.existsSync(uploadPath)) throw new Error('Uploaded backup file was not found.');
  const ext = path.extname(uploadPath).toLowerCase();
  if (await isDockerPostgresAvailable()) {
    if (!['.dump', '.sql'].includes(ext)) throw new Error('Please select a PostgreSQL .dump or .sql backup file.');
    await prisma.$disconnect();
    await restorePostgresBackup(uploadPath);
    await prisma.$connect();
    return {
      restoredAt: new Date().toISOString(),
      databasePath: `${DOCKER_CONTAINER}:${POSTGRES_DB}`,
      previousCopy: null
    };
  }
  assertSQLiteDatabase(uploadPath);

  const dbPath = databaseFilePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const restoreDir = path.join(path.dirname(dbPath), 'restore-points');
  fs.mkdirSync(restoreDir, { recursive: true });

  const previousCopy = path.join(restoreDir, `before-restore-${timestamp()}.db`);
  await prisma.$disconnect();

  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, previousCopy);
  }

  removeSQLiteSidecars(dbPath);
  fs.copyFileSync(uploadPath, dbPath);
  removeSQLiteSidecars(dbPath);
  await prisma.$connect();

  return {
    restoredAt: new Date().toISOString(),
    databasePath: dbPath,
    previousCopy: fs.existsSync(previousCopy) ? previousCopy : null
  };
}

export async function mergeFullDatabaseBackups(uploadPaths: string[]) {
  if (!uploadPaths.length) throw new Error('Backup file is required');
  for (const uploadPath of uploadPaths) {
    if (!fs.existsSync(uploadPath)) throw new Error('Uploaded backup file was not found.');
    assertSQLiteDatabase(uploadPath);
  }

  const dbPath = databaseFilePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const restoreDir = path.join(path.dirname(dbPath), 'restore-points');
  fs.mkdirSync(restoreDir, { recursive: true });
  const previousCopy = path.join(restoreDir, `before-merge-restore-${timestamp()}.db`);
  if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, previousCopy);
  removeSQLiteSidecars(dbPath);

  // ATTACH is connection-local; keep the merge on one dedicated SQLite connection.
  const databaseUrl = process.env.DATABASE_URL!;
  const prisma = new PrismaClient({ datasources: { db: { url: `${databaseUrl}${databaseUrl.includes('?') ? '&' : '?'}connection_limit=1` } } });
  await prisma.$executeRaw`PRAGMA foreign_keys = OFF`;

  const mergedTables = new Set<string>();
  try {
    for (let index = 0; index < uploadPaths.length; index += 1) {
      const alias = `restore${index}`;
      await prisma.$executeRaw`ATTACH DATABASE ${uploadPaths[index]} AS ${Prisma.raw(quoteIdentifier(alias))}`;
      try {
        const tables = await prisma.$queryRaw<Array<{ name: string }>>`SELECT name FROM ${Prisma.raw(quoteIdentifier(alias))}.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'`;

        for (const table of tables) {
          const tableName = table.name;
          if (!Prisma.dmmf.datamodel.models.some(model => (model.dbName || model.name) === tableName)) continue;
          const [mainColumns, backupColumns] = await Promise.all([
            prisma.$queryRaw<Array<{ name: string }>>`SELECT name FROM pragma_table_info(${tableName}, 'main')`,
            prisma.$queryRaw<Array<{ name: string }>>`SELECT name FROM pragma_table_info(${tableName}, ${alias})`
          ]);
          const mainColumnNames = new Set(mainColumns.map((column) => column.name));
          const commonColumns = backupColumns.map((column) => column.name).filter((name) => mainColumnNames.has(name));
          if (!commonColumns.length) continue;
          const columnList = commonColumns.map(quoteIdentifier).join(', ');
          await prisma.$executeRaw`INSERT OR REPLACE INTO main.${Prisma.raw(quoteIdentifier(tableName))} (${Prisma.raw(columnList)}) SELECT ${Prisma.raw(columnList)} FROM ${Prisma.raw(quoteIdentifier(alias))}.${Prisma.raw(quoteIdentifier(tableName))}`;
          mergedTables.add(tableName);
        }
      } finally {
        await prisma.$executeRaw`DETACH DATABASE ${Prisma.raw(quoteIdentifier(alias))}`;
      }
    }
  } finally {
    try { await prisma.$executeRaw`PRAGMA foreign_keys = ON`; } finally { await prisma.$disconnect(); }
  }

  return {
    restoredAt: new Date().toISOString(),
    databasePath: dbPath,
    previousCopy: fs.existsSync(previousCopy) ? previousCopy : null,
    mergedFiles: uploadPaths.length,
    mergedTables: Array.from(mergedTables).sort()
  };
}
