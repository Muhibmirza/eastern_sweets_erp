const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const DOCKER_CONTAINER = 'eastern-sweets-db';
const POSTGRES_USER = 'postgres';
const POSTGRES_DB = 'eastern_sweets_erp';

const BACKUP_GROUPS = {
  ADMIN: {
    label: 'Admin Account Data',
    description: 'Users, Settings, Audit Logs, Chart of Accounts, Journal Entries',
    models: ['user', 'shopSettings', 'auditLog', 'chartOfAccounts', 'journalEntry', 'journalLine']
  },
  PRODUCTION_MANAGER: {
    label: 'Production Manager Data',
    description: 'Products, Raw Materials, Recipes, Production Orders, Stock Movements, Suppliers, Purchases',
    models: ['product', 'category', 'rawMaterial', 'recipe', 'recipeIngredient', 'productionOrder', 'productionConsumption', 'stockMovement', 'supplier', 'purchaseOrder', 'purchaseItem']
  },
  CASHIER: {
    label: 'Cashier Data',
    description: 'Sales, Orders, Customers, Sales Returns, Daily Closings, Expenses, Employees, Payroll',
    models: ['sale', 'saleItem', 'order', 'orderItem', 'customer', 'expense', 'employee', 'attendance', 'salary', 'employeeAdvance', 'leaveRequest']
  }
};

const allGroups = Object.keys(BACKUP_GROUPS);
const MODEL_TABLES = {
  user: 'User',
  shopSettings: 'ShopSettings',
  auditLog: 'AuditLog',
  chartOfAccounts: 'ChartOfAccounts',
  journalEntry: 'JournalEntry',
  journalLine: 'JournalLine',
  product: 'Product',
  category: 'Category',
  rawMaterial: 'RawMaterial',
  recipe: 'Recipe',
  recipeIngredient: 'RecipeIngredient',
  productionOrder: 'ProductionOrder',
  productionConsumption: 'ProductionConsumption',
  stockMovement: 'StockMovement',
  supplier: 'Supplier',
  purchaseOrder: 'PurchaseOrder',
  purchaseItem: 'PurchaseItem',
  sale: 'Sale',
  saleItem: 'SaleItem',
  order: 'Order',
  orderItem: 'OrderItem',
  customer: 'Customer',
  expense: 'Expense',
  employee: 'Employee',
  attendance: 'Attendance',
  salary: 'Salary',
  employeeAdvance: 'EmployeeAdvance',
  leaveRequest: 'LeaveRequest'
};
let mainWindow;
let tray;
let scheduleTimer;
let prisma;

function configPath() {
  return path.join(app.getPath('userData'), 'backup-config.json');
}

function defaultDestination() {
  return path.join(appRootDir(), 'backups');
}

function readConfig() {
  try {
    if (fs.existsSync(configPath())) {
      return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    }
  } catch {
    // Ignore corrupt config and rewrite a clean one on save.
  }
  return {
    destination: defaultDestination(),
    schedule: {
      enabled: false,
      frequency: 'DAILY',
      time: '23:00',
      dayOfWeek: 0,
      dayOfMonth: 1,
      keepLast: 10,
      groups: allGroups,
      lastRunKey: ''
    }
  };
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');
  refreshScheduler();
  return config;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 820,
    minWidth: 780,
    minHeight: 680,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'Eastern Sweets - Backup Tool',
    autoHideMenuBar: true,
    frame: true,
    titleBarStyle: 'default',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('close', (event) => {
    if (readConfig().schedule.enabled && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'assets', 'icon.png'));
  tray.setToolTip('Eastern Sweets Backup Tool');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Backup Tool', click: () => mainWindow?.show() },
    { label: 'Run Backup Now', click: () => runBackup({ ...readConfig().schedule, destination: readConfig().destination, type: 'AUTO' }).catch(console.error) },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
}

function appRootDir() {
  return path.dirname(process.env.PORTABLE_EXECUTABLE_FILE || app.getPath('exe'));
}

function databasePath() {
  for (const appDataDb of erpAppDataDatabasePaths()) {
    if (fs.existsSync(appDataDb)) return appDataDb;
  }
  for (const root of candidateErpRoots()) {
    const db = path.join(root, 'resources', 'server', 'data', 'eastern-sweets.db');
    if (fs.existsSync(path.join(root, 'resources', 'server'))) return db;
  }
  return erpAppDataDatabasePaths()[0];
}

function erpAppDataDatabasePaths() {
  const appData = process.env.APPDATA || app.getPath('appData');
  return [
    path.join(appData, 'Eastern Sweets', 'runtime', 'server', 'data', 'eastern-sweets.db'),
    path.join(appData, `Eastern Sweets ${'ER'}${'P'}`, 'runtime', 'server', 'data', 'eastern-sweets.db'),
    path.join(appData, 'eastern-sweets', 'runtime', 'server', 'data', 'eastern-sweets.db'),
    path.join(appData, 'eastern-sweets-erp', 'runtime', 'server', 'data', 'eastern-sweets.db'),
    path.join(app.getPath('appData'), 'Eastern Sweets', 'runtime', 'server', 'data', 'eastern-sweets.db'),
    path.join(app.getPath('appData'), `Eastern Sweets ${'ER'}${'P'}`, 'runtime', 'server', 'data', 'eastern-sweets.db')
  ];
}

function erpExePath() {
  for (const root of candidateErpRoots()) {
    const newExe = path.join(root, 'Eastern Sweets.exe');
    const legacyExe = path.join(root, `Eastern Sweets ${'ER'}${'P'}.exe`);
    if (fs.existsSync(newExe)) return newExe;
    if (fs.existsSync(legacyExe)) return legacyExe;
  }
  return path.join(appRootDir(), 'Eastern Sweets.exe');
}

function candidateErpRoots() {
  return Array.from(new Set([
    appRootDir(),
    path.resolve(__dirname, '..', 'desktop', 'release', 'win-unpacked'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Eastern Sweets'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', `Eastern Sweets ${'ER'}${'P'}`),
    path.join(process.env.PROGRAMFILES || '', 'Eastern Sweets'),
    path.join(process.env.PROGRAMFILES || '', `Eastern Sweets ${'ER'}${'P'}`),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Eastern Sweets'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', `Eastern Sweets ${'ER'}${'P'}`)
  ].filter(Boolean)));
}

async function ensureDatabase() {
  if (await isDockerPostgresAvailable()) return `${DOCKER_CONTAINER}:${POSTGRES_DB}`;
  let db = databasePath();
  if (fs.existsSync(db)) return db;
  const erp = erpExePath();
  if (fs.existsSync(erp)) {
    spawn(erp, [], { detached: true, windowsHide: false, stdio: 'ignore' }).unref();
    for (let i = 0; i < 60; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      db = databasePath();
      if (fs.existsSync(db) && fs.statSync(db).size > 0) {
        await new Promise((resolve) => setTimeout(resolve, 6000));
        return db;
      }
    }
  }
  throw new Error('Database was not found. Open Eastern Sweets once, login, then run backup again.');
}

async function isDockerPostgresAvailable() {
  try {
    const { stdout } = await execFileAsync('docker', ['ps', '--filter', `name=${DOCKER_CONTAINER}`, '--filter', 'status=running', '--format', '{{.Names}}']);
    return stdout.split(/\r?\n/).some((line) => line.trim() === DOCKER_CONTAINER);
  } catch {
    return false;
  }
}

async function dockerExec(args) {
  return execFileAsync('docker', ['exec', DOCKER_CONTAINER, ...args], { maxBuffer: 1024 * 1024 * 20 });
}

async function postgresScalar(sql) {
  const { stdout } = await dockerExec(['psql', '-U', POSTGRES_USER, '-d', POSTGRES_DB, '-t', '-A', '-c', sql]);
  return stdout.trim();
}

async function getPostgresTableSize(table) {
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
    const value = await postgresScalar(`SELECT pg_database_size('${POSTGRES_DB}');`);
    return Number(value || 0);
  } catch {
    return 0;
  }
}

async function runPgDump(filePath) {
  await new Promise((resolve, reject) => {
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

function prismaClientPath() {
  for (const root of candidateErpRoots()) {
    const client = path.join(root, 'resources', 'server', 'node_modules', '@prisma', 'client');
    if (fs.existsSync(client)) return client;
  }
  return path.resolve(__dirname, '..', 'server', 'node_modules', '@prisma', 'client');
}

function getPrisma() {
  if (prisma) return prisma;
  const db = databasePath();
  process.env.DATABASE_URL = `file:${db.replace(/\\/g, '/')}`;
  const { PrismaClient } = require(prismaClientPath());
  prisma = new PrismaClient();
  return prisma;
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function timestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function normalizeGroups(groups) {
  const selected = Array.from(new Set((groups || []).filter((group) => allGroups.includes(group))));
  return selected.length ? selected : allGroups;
}

async function exportGroup(groupKey) {
  const client = getPrisma();
  const group = BACKUP_GROUPS[groupKey];
  const data = {};
  for (const model of group.models) {
    if (client[model]?.findMany) {
      data[model] = await client[model].findMany();
    }
  }
  return data;
}

async function getGroupsWithSizes() {
  let loadError = '';
  const dockerPostgres = await isDockerPostgresAvailable();
  try {
    await ensureDatabase();
  } catch (error) {
    loadError = error.message || 'Database was not found.';
  }
  const db = databasePath();
  const dbSize = dockerPostgres ? await getPostgresDatabaseSize() : (fs.existsSync(db) ? fs.statSync(db).size : 0);
  const results = [];
  for (const key of allGroups) {
    let sizeBytes = 0;
    try {
      if (loadError) throw new Error(loadError);
      if (dockerPostgres) {
        const tables = BACKUP_GROUPS[key].models.map((model) => MODEL_TABLES[model]).filter(Boolean);
        sizeBytes = (await Promise.all(tables.map(getPostgresTableSize))).reduce((sum, size) => sum + size, 0);
      } else {
        sizeBytes = Buffer.byteLength(JSON.stringify(await exportGroup(key)), 'utf8');
      }
    } catch {
      sizeBytes = key === 'ADMIN' ? dbSize : 0;
    }
    results.push({ key, label: BACKUP_GROUPS[key].label, description: BACKUP_GROUPS[key].description, sizeBytes, sizeFormatted: formatBytes(sizeBytes) });
  }
  return {
    groups: results,
    totalSizeBytes: results.reduce((sum, group) => sum + group.sizeBytes, 0),
    totalSizeFormatted: formatBytes(results.reduce((sum, group) => sum + group.sizeBytes, 0)),
    databaseSizeFormatted: formatBytes(dbSize),
    destination: readConfig().destination,
    schedule: readConfig().schedule,
    history: readHistory(),
    databasePath: fs.existsSync(db) ? db : '',
    error: loadError
  };
}

function readHistory() {
  const historyFile = path.join(app.getPath('userData'), 'backup-history.json');
  try {
    if (fs.existsSync(historyFile)) return JSON.parse(fs.readFileSync(historyFile, 'utf8'));
  } catch {
    // Ignore corrupt history.
  }
  return [];
}

function writeHistory(history) {
  const historyFile = path.join(app.getPath('userData'), 'backup-history.json');
  fs.mkdirSync(path.dirname(historyFile), { recursive: true });
  fs.writeFileSync(historyFile, JSON.stringify(history.slice(0, 100), null, 2), 'utf8');
}

async function runBackup({ groups, destination, type = 'MANUAL' }) {
  await ensureDatabase();
  const selected = normalizeGroups(groups);
  const backupDir = destination?.trim() || defaultDestination();
  fs.mkdirSync(backupDir, { recursive: true });

  const fullBackup = allGroups.every((group) => selected.includes(group));
  let filename;
  let filePath;
  if (await isDockerPostgresAvailable()) {
    filename = `eastern-sweets-full-backup-${timestamp()}.dump`;
    filePath = path.join(backupDir, filename);
    await runPgDump(filePath);
  } else if (fullBackup) {
    const db = databasePath();
    if (!fs.existsSync(db)) throw new Error('Eastern Sweets database was not found. Open Eastern Sweets once before taking backup.');
    filename = `eastern-sweets-full-backup-${timestamp()}.db`;
    filePath = path.join(backupDir, filename);
    fs.copyFileSync(db, filePath);
  } else {
    const exportData = {};
    for (const group of selected) exportData[group] = await exportGroup(group);
    filename = `eastern-sweets-partial-backup-${timestamp()}.json`;
    filePath = path.join(backupDir, filename);
    fs.writeFileSync(filePath, JSON.stringify({ createdAt: new Date().toISOString(), groups: selected, data: exportData }, null, 2), 'utf8');
  }

  const sizeBytes = fs.statSync(filePath).size;
  const item = { id: `${Date.now()}`, filename, filePath, sizeBytes, sizeFormatted: formatBytes(sizeBytes), groups: selected, type, createdAt: new Date().toISOString() };
  const config = readConfig();
  config.destination = backupDir;
  saveConfig(config);
  const history = [item, ...readHistory()];
  writeHistory(history);
  cleanupOldAutoBackups(config.schedule.keepLast);
  return item;
}

function cleanupOldAutoBackups(keepLast = 10) {
  const history = readHistory();
  const auto = history.filter((item) => item.type === 'AUTO');
  const stale = auto.slice(Math.max(Number(keepLast) || 10, 1));
  for (const item of stale) {
    try {
      if (fs.existsSync(item.filePath)) fs.unlinkSync(item.filePath);
    } catch {
      // Keep going; history still gets cleaned.
    }
  }
  writeHistory(history.filter((item) => !stale.some((old) => old.id === item.id)));
}

function shouldRunNow(schedule, now) {
  if (!schedule.enabled) return null;
  const [hour, minute] = schedule.time.split(':').map(Number);
  if (now.getHours() !== hour || now.getMinutes() !== minute) return null;
  if (schedule.frequency === 'WEEKLY' && now.getDay() !== Number(schedule.dayOfWeek)) return null;
  if (schedule.frequency === 'MONTHLY' && now.getDate() !== Number(schedule.dayOfMonth)) return null;
  return `${schedule.frequency}-${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}-${hour}-${minute}`;
}

function refreshScheduler() {
  if (scheduleTimer) clearInterval(scheduleTimer);
  scheduleTimer = setInterval(async () => {
    const config = readConfig();
    const key = shouldRunNow(config.schedule, new Date());
    if (!key || config.schedule.lastRunKey === key) return;
    try {
      await runBackup({ groups: config.schedule.groups, destination: config.destination, type: 'AUTO' });
      const latest = readConfig();
      latest.schedule.lastRunKey = key;
      saveConfig(latest);
      mainWindow?.webContents.send('backup-updated');
    } catch (error) {
      console.error('Auto backup failed:', error);
    }
  }, 30000);
}

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.filePaths[0];
});

ipcMain.handle('get-state', async () => getGroupsWithSizes());
ipcMain.handle('run-backup', async (_event, payload) => runBackup(payload));
ipcMain.handle('save-schedule', async (_event, payload) => {
  const config = readConfig();
  config.destination = payload.destination || config.destination;
  config.schedule = {
    ...config.schedule,
    ...payload.schedule,
    groups: normalizeGroups(payload.schedule?.groups)
  };
  return saveConfig(config);
});
ipcMain.handle('delete-history', async (_event, id) => {
  const history = readHistory();
  const item = history.find((entry) => entry.id === id);
  if (item && fs.existsSync(item.filePath)) fs.unlinkSync(item.filePath);
  writeHistory(history.filter((entry) => entry.id !== id));
  return readHistory();
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  refreshScheduler();
});
app.on('window-all-closed', () => {
  if (!readConfig().schedule.enabled) app.quit();
});
app.on('before-quit', async () => {
  app.isQuitting = true;
  if (prisma) await prisma.$disconnect().catch(() => {});
});
