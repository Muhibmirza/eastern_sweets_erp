# Security audit — Eastern Sweets ERP v1.6.6

Audit date: 2026-09-07. Scope: first-party source, scripts, manifests, local environment configuration, route declarations, data flows, and the newly built release. Dependency packages, Git history, historical installers, and existing shop database records are not rewritten. No UI or database-engine migration is included.

## Secret inventory (values intentionally withheld)

| Original location | Finding | Replacement |
|---|---|---|
| `desktop/main.js` | Shared access-token signing fallback | `JWT_SECRET`; random per installation, persisted in runtime `server/.env` |
| `desktop/main.js` | Shared refresh-token signing fallback | `JWT_REFRESH_SECRET`; independent random per installation |
| `prisma/seed.ts`, copied `server/prisma/seed.ts`, `server/src/services/bootstrapService.ts` | Initial admin password literal | `SEED_ADMIN_PASSWORD` |
| Same seed/bootstrap files | Initial cashier password literal | `SEED_CASHIER_PASSWORD` |
| Same seed/bootstrap files | Initial production-manager password literal | `SEED_PRODUCTION_PASSWORD` |
| Seed console output | Passwords and account emails printed | Removed |
| `docker-compose.yml`, `desktop/scripts/start-db.bat` | PostgreSQL password literal | `POSTGRES_PASSWORD` in `server/.env`; existing DB credential preserved |
| Root `.env`, `.env.production`, `server/.env` | Local configuration duplicated; weak/shared JWT configuration | Consolidated secrets into ignored `server/.env`; both JWT keys regenerated independently with 48 random bytes |

The SQLite `file:` URL identifies a local file and contains no password. It remains environment configuration; desktop computes the existing userData database path. Account email addresses identify bootstrap users and are not authentication secrets. No third-party API credential or private key was found in first-party source. No sensitive VITE_ or REACT_APP_ variable was found; VITE_API_URL is public API routing configuration. Example files contain deliberate placeholders only.

`.env` and `.env.*` are ignored at every level; `.env.example` files are tracked. Production packaging contains only non-secret NODE_ENV, PORT and CLIENT_URL settings. Old shared JWT keys are no longer accepted, so existing sessions must sign in again. Existing account passwords were not changed. Git history and historical installers may still contain the old credentials; never redistribute those artifacts as the hardened release.

## Personal-data flow

| Data | Collection and storage | Authorized use |
|---|---|---|
| Login email/password | Login form -> auth controller -> User lookup/bcrypt comparison | Public login; no password in response or logs |
| User name/email/role/password | Settings user endpoints -> User | ADMIN only; explicit public selections, bcryptjs cost 12 |
| Customer name/phone/address | Customer and order forms -> Customer/Order | ADMIN/CASHIER customer records; authenticated shop order workflow |
| Employee phone/CNIC/address/wages | Employee form -> Employee | ADMIN-only employee and related HR APIs |
| Attendance/leave | HR forms -> Attendance/LeaveRequest | ADMIN-only backend routes |
| Salary, advances, loans, fines | Payroll and employee forms -> Salary/EmployeeAdvance/EmployeeLoan/EmployeeFine | ADMIN-only HR, salary, accounting and payroll reports |
| Supplier contacts/payments/advances | Supplier/purchase forms -> supplier and purchase records | Existing shared shop purchasing reads; writes retain their existing role restrictions |
| Backups and audit history | Server-generated files/database records | ADMIN only; backups necessarily include data and password hashes needed for restoration |

Normal JSON responses recursively omit password/hash fields. Login and password-change queries explicitly select the hash only for bcrypt comparison; it is never returned. Refresh/authentication queries use public selections. No authentication cookies are used, so cookie flags are not applicable. Tokens retain the existing client storage flow. Ordinary app entity IDs are retained because the UI needs them for detail views, updates, receipts and relationships. Sensitive employee data is protected at route boundaries. Production-manager dashboard responses omit sales totals while preserving production and stock metrics.

## Production protections

- Startup rejects missing DATABASE_URL, JWT_SECRET or JWT_REFRESH_SECRET; weak, equal or placeholder JWT secrets also fail validation.
- JWTs use jsonwebtoken.verify; lifetimes remain 15 minutes / 30 days.
- Helmet CSP and other default headers are enabled. Local HTTP retains `upgradeInsecureRequests: null` to avoid breaking the offline desktop origin. No inline scripts are allowed; existing inline styles, data/blob images remain supported.
- Specific CORS origin, credentials enabled; desktop uses its actual localhost port. The untrusted requesting origin is never reflected.
- Login and refresh share a limit of 10 requests per IP per 15 minutes. General API: 200/minute/IP. These are in-memory counters for the existing single-process deployment.
- Express 4 asynchronous errors reach the global handler through express-async-errors. Server failures return a generic JSON message; route-level caught errors expose only explicit safe messages. Logs omit request bodies, credentials, query details and personal data.
- Auth and user-management writes use express-validator with value-free validation errors. Numeric fields from the Prisma schema plus request-only numeric aliases are checked recursively before writes, including multipart product submissions. Non-finite, malformed and negative non-balance numbers are rejected. Existing optional empty values and legitimate signed balances remain supported.
- Product uploads accept JPEG/PNG/WebP MIME values, retain the existing 5 MiB limit, and get server-generated names/extensions. Backup uploads accept binary/SQLite MIME values with the existing 1 GiB limit and retain SQLite signature validation. Images are served as static data; uploaded code is not executed. MIME declarations alone are not a malware scanner.
- Sensitive HR/accounting/audit/user-management routes enforce ADMIN; sale/token APIs allow ADMIN or CASHIER. Employee deletion, data reset and accounting writes remain ADMIN only. No public test/debug/seed HTTP endpoint exists. The existing intentional data-reset feature is retained behind ADMIN authorization.
- Prisma raw SQL uses tagged templates. Dynamic SQLite identifiers are quoted; restore tables are restricted to Prisma models and columns to the intersection of source/destination schema. Values such as backup paths are bound parameters. A dedicated single-connection client keeps ATTACH/merge/DETACH on the same SQLite connection.

## Compatibility and blueprint discrepancies

The live schema uses SQLite, not PostgreSQL. Optional Docker/PostgreSQL backup support exists, but the Windows desktop does not require Docker. The requested blueprint's universal 20/100 pagination is a target convention, not existing behavior: several selectors and reports intentionally return complete lists. Adding universal pagination would alter app behavior and was not performed. Refresh-token and health checks are intentional public entry points in addition to login. There is no MANAGER role; existing ADMIN, PRODUCTION_MANAGER, CASHIER and STAFF values are preserved.

## Verification

`npm run build --prefix server` passed. `node scripts/security-smoke.cjs` passed 98 assertions against a disposable database: valid role logins, bcrypt storage, token lifetimes, refresh, all mounted protected API groups, sensitive ID and role denial, malformed auth/numbers, rejected upload MIME types, async error masking, CSP/CORS, production dashboard minimization, quoted-path SQLite backup/merge, both rate limits, and a valid cashier sale with stock movement. Release build and artifact checks are recorded in the release delivery message.

## Release artifact verification

The requested `scripts\build-release.bat` completed successfully. A final desktop-only packaging pass included removal of the migration engine's RUST_LOG debug flag.

- Installer: `desktop/release/Eastern Sweets Setup 1.6.6.exe`, 360,099,665 bytes.
- Portable directory: `desktop/release/win-unpacked/`, containing both the main ERP and backup-tool executables.
- Update metadata: `desktop/release/latest.yml`; version, filename, size, and both SHA-512 entries match the installer.
- Windows executable version: 1.6.6; product version: 1.6.6.0.
- The packaged launcher matches final source; packaged backend and frontend match the verified build outputs.
- All 5,320 packaged text files checked contained none of the local JWT, bootstrap, or PostgreSQL secrets.
- The packaged server passed the same 98 isolated security/valid-sale assertions. Packaged desktop dependencies initialized successfully in a hidden Electron 30.5.1 test process without opening the ERP or shop database.
- Unconfigured example JWT secrets and seed passwords fail the existing validation; templates cannot serve as usable default credentials.
- The blueprint PDF was rendered and visually verified across nine pages.

## Dependency audit findings

The requested source hardening is not a clean dependency-audit claim. Existing dependency versions were retained under the instruction to implement only the listed changes; no broad or breaking dependency upgrades were applied.

| Dependency scope | Reported outstanding advisories |
|---|---|
| Server production dependencies | 5 moderate: body-parser, express, node-cron, qs, uuid |
| Desktop production dependencies | 2 high: axios, js-yaml |
| Backup-tool production dependencies | None reported |
| Full desktop dependency tree, including development/build tools | 14 total: 1 moderate, 12 high, 1 critical |
| Full backup-tool dependency tree, including development/build tools | 13 total: 1 moderate, 11 high, 1 critical |

Counts reflect npm audit during this build on 2026-09-07 and include transitive packages; they are not a count of independently demonstrated exploits. The runtime and full-tree rows overlap and must not be summed.

## Route inventory

Access below includes router-level middleware. Mount aliases are declared in `server/src/index.ts`; re-exported HR and combined routers retain their listed protection. Public `GET /api/health` returns only service health and is required by Electron startup. Each write also passes the shared numeric guard, and multipart product writes validate again after parsing.

| Source | Method | Router path | Required access |
|---|---|---|---|
| `accounting.routes.ts` | GET | `/chart-of-accounts` | ADMIN |
| `accounting.routes.ts` | POST | `/chart-of-accounts` | ADMIN |
| `accounting.routes.ts` | PUT | `/chart-of-accounts/:id` | ADMIN |
| `accounting.routes.ts` | GET | `/journal-entries` | ADMIN |
| `accounting.routes.ts` | GET | `/journal-entries/:id` | ADMIN |
| `accounting.routes.ts` | POST | `/journal-entries` | ADMIN |
| `accounting.routes.ts` | GET | `/trial-balance` | ADMIN |
| `accounting.routes.ts` | GET | `/profit-loss` | ADMIN |
| `accounting.routes.ts` | GET | `/balance-sheet` | ADMIN |
| `accounting.routes.ts` | GET | `/cash-book` | ADMIN |
| `accounting.routes.ts` | GET | `/general-ledger/:accountId` | ADMIN |
| `accounting.routes.ts` | GET | `/supplier-ledger/:supplierId` | ADMIN |
| `accounting.routes.ts` | GET | `/employee-ledger/:employeeId` | ADMIN |
| `advance.routes.ts` | GET | `/` | ADMIN |
| `advance.routes.ts` | GET | `/employee/:employeeId` | ADMIN |
| `advance.routes.ts` | POST | `/` | ADMIN |
| `advance.routes.ts` | PATCH | `/:id/deduct` | ADMIN |
| `advance.routes.ts` | PATCH | `/:id/recover` | ADMIN |
| `audit.routes.ts` | GET | `/` | ADMIN |
| `auth.routes.ts` | POST | `/login` | Public; credentials/token validated |
| `auth.routes.ts` | POST | `/refresh-token` | Public; credentials/token validated |
| `auth.routes.ts` | POST | `/logout` | Authenticated |
| `auth.routes.ts` | GET | `/me` | Authenticated |
| `auth.routes.ts` | PUT | `/change-password` | Authenticated |
| `category.routes.ts` | GET | `/` | Authenticated |
| `category.routes.ts` | POST | `/` | ADMIN |
| `category.routes.ts` | PUT | `/:id` | ADMIN |
| `category.routes.ts` | DELETE | `/:id` | ADMIN |
| `combined.routes.ts` | GET | `/` | Authenticated |
| `combined.routes.ts` | POST | `/` | ADMIN |
| `combined.routes.ts` | GET | `/returns/all` | Authenticated |
| `combined.routes.ts` | PATCH | `/advances/:advanceId/recover` | ADMIN |
| `combined.routes.ts` | GET | `/:id/advances` | Authenticated |
| `combined.routes.ts` | POST | `/:id/advances` | ADMIN |
| `combined.routes.ts` | GET | `/:id/payment-summary` | Authenticated |
| `combined.routes.ts` | GET | `/:id/receipt` | Authenticated |
| `combined.routes.ts` | GET | `/:id/ledger` | Authenticated |
| `combined.routes.ts` | GET | `/:id/outstanding` | Authenticated |
| `combined.routes.ts` | POST | `/:id/payment` | ADMIN |
| `combined.routes.ts` | GET | `/:id/payments` | Authenticated |
| `combined.routes.ts` | GET | `/:id/returns` | Authenticated |
| `combined.routes.ts` | POST | `/:id/return` | ADMIN, PRODUCTION_MANAGER |
| `combined.routes.ts` | PUT | `/:id` | ADMIN |
| `combined.routes.ts` | DELETE | `/:id` | ADMIN |
| `combined.routes.ts` | GET | `/` | Authenticated |
| `combined.routes.ts` | POST | `/` | ADMIN, PRODUCTION_MANAGER |
| `combined.routes.ts` | PUT | `/:id` | ADMIN |
| `combined.routes.ts` | DELETE | `/:id` | ADMIN |
| `combined.routes.ts` | GET | `/movements` | Authenticated |
| `combined.routes.ts` | GET | `/expiry-report` | Authenticated |
| `combined.routes.ts` | POST | `/movements` | ADMIN, PRODUCTION_MANAGER |
| `combined.routes.ts` | POST | `/adjust` | ADMIN, PRODUCTION_MANAGER |
| `combined.routes.ts` | GET | `/alerts` | Authenticated |
| `combined.routes.ts` | GET | `/` | Authenticated |
| `combined.routes.ts` | POST | `/` | ADMIN |
| `combined.routes.ts` | PUT | `/:id` | ADMIN |
| `combined.routes.ts` | DELETE | `/:id` | ADMIN |
| `combined.routes.ts` | GET | `/` | Authenticated |
| `combined.routes.ts` | POST | `/` | ADMIN, PRODUCTION_MANAGER |
| `combined.routes.ts` | PUT | `/:id` | ADMIN, PRODUCTION_MANAGER |
| `combined.routes.ts` | DELETE | `/:id` | ADMIN |
| `customer.routes.ts` | GET | `/` | ADMIN, CASHIER |
| `customer.routes.ts` | GET | `/:id` | ADMIN, CASHIER |
| `customer.routes.ts` | GET | `/:id/orders` | ADMIN, CASHIER |
| `customer.routes.ts` | GET | `/:id/sales` | ADMIN, CASHIER |
| `customer.routes.ts` | POST | `/` | ADMIN, CASHIER |
| `customer.routes.ts` | PUT | `/:id` | ADMIN, CASHIER |
| `customer.routes.ts` | DELETE | `/:id` | ADMIN, CASHIER |
| `dashboard.routes.ts` | GET | `/stats` | ADMIN, PRODUCTION_MANAGER |
| `dashboard.routes.ts` | GET | `/revenue-chart` | ADMIN, PRODUCTION_MANAGER |
| `dashboard.routes.ts` | GET | `/top-products` | ADMIN, PRODUCTION_MANAGER |
| `dashboard.routes.ts` | GET | `/recent-orders` | ADMIN, PRODUCTION_MANAGER |
| `hr.routes.ts` | GET | `/` | ADMIN |
| `hr.routes.ts` | POST | `/` | ADMIN |
| `hr.routes.ts` | PUT | `/:id` | ADMIN |
| `hr.routes.ts` | PATCH | `/:id/status` | ADMIN |
| `hr.routes.ts` | DELETE | `/:id` | ADMIN |
| `hr.routes.ts` | GET | `/:id/payslip/:month/:year` | ADMIN |
| `hr.routes.ts` | GET | `/:id/salary-revisions` | ADMIN |
| `hr.routes.ts` | POST | `/:id/salary-revisions` | ADMIN |
| `hr.routes.ts` | GET | `/:id/advances` | ADMIN |
| `hr.routes.ts` | GET | `/:id/loans` | ADMIN |
| `hr.routes.ts` | GET | `/:id/fines` | ADMIN |
| `hr.routes.ts` | GET | `/:id/ledger` | ADMIN |
| `hr.routes.ts` | GET | `/:id` | ADMIN |
| `hr.routes.ts` | GET | `/` | ADMIN |
| `hr.routes.ts` | GET | `/today` | ADMIN |
| `hr.routes.ts` | GET | `/monthly` | ADMIN |
| `hr.routes.ts` | POST | `/` | ADMIN |
| `hr.routes.ts` | GET | `/:id` | ADMIN |
| `hr.routes.ts` | GET | `/` | ADMIN |
| `hr.routes.ts` | POST | `/calculate` | ADMIN |
| `hr.routes.ts` | POST | `/generate` | ADMIN |
| `hr.routes.ts` | GET | `/:id/payslip` | ADMIN |
| `hr.routes.ts` | PATCH | `/:id/pay` | ADMIN |
| `hr.routes.ts` | POST | `/` | ADMIN |
| `hr.routes.ts` | PATCH | `/supplier/:id` | ADMIN |
| `hr.routes.ts` | POST | `/:id/recover` | ADMIN |
| `hr.routes.ts` | POST | `/` | ADMIN |
| `leave.routes.ts` | GET | `/employee/:employeeId` | ADMIN |
| `leave.routes.ts` | GET | `/balance/:employeeId` | ADMIN |
| `leave.routes.ts` | GET | `/` | ADMIN |
| `leave.routes.ts` | GET | `/:id` | ADMIN |
| `leave.routes.ts` | POST | `/` | ADMIN |
| `leave.routes.ts` | PATCH | `/:id/approve` | ADMIN |
| `leave.routes.ts` | PATCH | `/:id/reject` | ADMIN |
| `order.routes.ts` | GET | `/` | Authenticated |
| `order.routes.ts` | GET | `/kanban` | Authenticated |
| `order.routes.ts` | GET | `/today-deliveries` | Authenticated |
| `order.routes.ts` | GET | `/:id` | Authenticated |
| `order.routes.ts` | POST | `/` | ADMIN |
| `order.routes.ts` | PUT | `/:id` | ADMIN |
| `order.routes.ts` | PATCH | `/:id/status` | ADMIN, CASHIER |
| `order.routes.ts` | DELETE | `/:id` | ADMIN |
| `product.routes.ts` | GET | `/` | Authenticated |
| `product.routes.ts` | GET | `/low-stock` | Authenticated |
| `product.routes.ts` | GET | `/barcode/:barcode` | Authenticated |
| `product.routes.ts` | GET | `/:id` | Authenticated |
| `product.routes.ts` | POST | `/` | ADMIN, PRODUCTION_MANAGER |
| `product.routes.ts` | POST | `/:id/add-stock` | ADMIN, PRODUCTION_MANAGER |
| `product.routes.ts` | PUT | `/:id` | ADMIN |
| `product.routes.ts` | DELETE | `/:id` | ADMIN |
| `production.routes.ts` | GET | `/today` | Authenticated |
| `production.routes.ts` | GET | `/` | Authenticated |
| `production.routes.ts` | GET | `/:id` | Authenticated |
| `production.routes.ts` | POST | `/` | ADMIN, PRODUCTION_MANAGER |
| `production.routes.ts` | PUT | `/:id` | ADMIN |
| `production.routes.ts` | DELETE | `/:id` | ADMIN |
| `production.routes.ts` | PATCH | `/:id/start` | ADMIN, PRODUCTION_MANAGER |
| `production.routes.ts` | PATCH | `/:id/complete` | ADMIN, PRODUCTION_MANAGER |
| `production.routes.ts` | PATCH | `/:id/cancel` | ADMIN, PRODUCTION_MANAGER |
| `rawMaterial.routes.ts` | GET | `/` | Authenticated |
| `rawMaterial.routes.ts` | GET | `/:id` | Authenticated |
| `rawMaterial.routes.ts` | POST | `/` | ADMIN, PRODUCTION_MANAGER |
| `rawMaterial.routes.ts` | PUT | `/:id` | ADMIN |
| `rawMaterial.routes.ts` | DELETE | `/:id` | ADMIN |
| `rawMaterial.routes.ts` | POST | `/:id/stock-in` | ADMIN, PRODUCTION_MANAGER |
| `rawMaterial.routes.ts` | POST | `/:id/stock-out` | ADMIN, PRODUCTION_MANAGER |
| `recipe.routes.ts` | GET | `/` | Authenticated |
| `recipe.routes.ts` | GET | `/:id/cost` | Authenticated |
| `recipe.routes.ts` | GET | `/:id` | Authenticated |
| `recipe.routes.ts` | POST | `/` | ADMIN, PRODUCTION_MANAGER |
| `recipe.routes.ts` | PUT | `/:id` | ADMIN |
| `recipe.routes.ts` | DELETE | `/:id` | ADMIN |
| `report.routes.ts` | GET | `/daily` | ADMIN |
| `report.routes.ts` | GET | `/weekly` | ADMIN |
| `report.routes.ts` | GET | `/monthly` | ADMIN |
| `report.routes.ts` | GET | `/cash-book` | ADMIN |
| `report.routes.ts` | GET | `/profit-loss` | ADMIN |
| `report.routes.ts` | GET | `/payroll` | ADMIN |
| `report.routes.ts` | GET | `/supplier-outstanding` | ADMIN |
| `report.routes.ts` | GET | `/stock-valuation` | ADMIN |
| `report.routes.ts` | GET | `/product-sales` | ADMIN |
| `sale.routes.ts` | GET | `/` | ADMIN, CASHIER |
| `sale.routes.ts` | GET | `/items` | ADMIN, CASHIER |
| `sale.routes.ts` | GET | `/invoices` | ADMIN, CASHIER |
| `sale.routes.ts` | GET | `/by-invoice/:invoiceNo` | ADMIN, CASHIER |
| `sale.routes.ts` | GET | `/daily-summary` | ADMIN, CASHIER |
| `sale.routes.ts` | GET | `/returns` | ADMIN, CASHIER |
| `sale.routes.ts` | POST | `/daily-closing` | ADMIN, CASHIER |
| `sale.routes.ts` | GET | `/daily-closing/:date` | ADMIN, CASHIER |
| `sale.routes.ts` | GET | `/:id/receipt` | ADMIN, CASHIER |
| `sale.routes.ts` | POST | `/:id/return` | ADMIN, CASHIER |
| `sale.routes.ts` | GET | `/:id` | ADMIN, CASHIER |
| `sale.routes.ts` | POST | `/` | ADMIN, CASHIER |
| `settings.routes.ts` | GET | `/backup/groups` | ADMIN |
| `settings.routes.ts` | POST | `/backup/run` | ADMIN |
| `settings.routes.ts` | GET | `/backup/history` | ADMIN |
| `settings.routes.ts` | DELETE | `/backup/history/:id` | ADMIN |
| `settings.routes.ts` | GET | `/backup/download/:id` | ADMIN |
| `settings.routes.ts` | POST | `/backup/restore` | ADMIN |
| `settings.routes.ts` | POST | `/data/reset` | ADMIN |
| `settings.routes.ts` | GET | `/backup/schedule` | ADMIN |
| `settings.routes.ts` | POST | `/backup/schedule` | ADMIN |
| `settings.routes.ts` | GET | `/` | Authenticated |
| `settings.routes.ts` | PUT | `/` | ADMIN |
| `settings.routes.ts` | GET | `/users` | ADMIN |
| `settings.routes.ts` | POST | `/users` | ADMIN |
| `settings.routes.ts` | PATCH | `/users/:id` | ADMIN |
| `token.routes.ts` | GET | `/` | ADMIN, CASHIER |
| `token.routes.ts` | GET | `/counter/next` | ADMIN, CASHIER |
| `token.routes.ts` | POST | `/counter/reset` | ADMIN, CASHIER |
| `token.routes.ts` | GET | `/:id` | ADMIN, CASHIER |
| `token.routes.ts` | POST | `/` | ADMIN, CASHIER |
| `token.routes.ts` | PATCH | `/:id/complete` | ADMIN, CASHIER |
| `token.routes.ts` | PATCH | `/:id/cancel` | ADMIN, CASHIER |
