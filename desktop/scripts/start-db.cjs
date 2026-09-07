const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('../../server/node_modules/dotenv');
dotenv.config({ path: path.resolve(__dirname, '../../server/.env') });
if (!process.env.POSTGRES_PASSWORD) {
  console.error('Set POSTGRES_PASSWORD in server/.env');
  process.exit(1);
}
const result = spawnSync('docker', ['run', '--name', 'darbar-sweets-db',
  '-e', 'POSTGRES_USER=postgres', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=darbar_sweets_erp',
  '-p', '5432:5432', '-v', 'darbar_sweets_data:/var/lib/postgresql/data', '-d', 'postgres:15'
], { stdio: 'inherit', windowsHide: true, env: process.env });
process.exit(result.status ?? 1);
