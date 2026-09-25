# Eastern Sweets ERP Deployment

Eastern Sweets ERP runs as a normal Windows desktop app. The main computer launches `Eastern Sweets ERP.exe`, starts the bundled backend server, opens the ERP in a native Electron window, and stores shop data in a writable Windows app-data database.

## Requirements

- Windows 10/11 64-bit
- No Docker, Node.js, PostgreSQL, or browser setup is required for users

## Data Safety

The ERP database is separate from the installed app files.

- App files live in the install/live folder.
- Database lives in:

```text
%APPDATA%\eastern-sweets-erp\runtime\server\data\eastern-sweets.db
```

Updating the app replaces program files only. Sales, products, stock, recipes, accounting, users, and settings remain untouched in the app-data database.

For routine code updates, users do not need to uninstall, reinstall, backup, or restore data manually. Backups are still recommended for shop safety.

## Build Release

Run from the project root:

```bat
scripts\build-release.bat
```

The script builds:

- Frontend production files in `client/dist`
- Backend production files in `server/dist`
- Main installer in `desktop/release`
- Standalone backup tool in `backup-tool/release`

## Install Or Portable Run

Installer:

1. Run `desktop\release\Eastern Sweets ERP Setup 1.0.0.exe`.
2. Launch from the desktop shortcut.

Portable:

1. Copy `desktop\release\win-unpacked`.
2. Run `Eastern Sweets ERP.exe`.
3. No extra services are required.

On first launch the app creates its database in `%APPDATA%`, starts the backend on port `5000`, and opens the ERP in a native desktop window.

## Multi-Device Access

The main desktop app also serves the ERP to other devices on the same WiFi or LAN.

1. Open the tray icon menu and read `Network Address`.
2. On another device, open a browser and visit:

```text
http://<main-computer-ip>:5000
```

Separate installs on separate laptops have separate databases. For one shared shop database, run the ERP on one main computer and let other devices connect by IP.

## Standalone Backup Tool

The release includes:

```text
Eastern Sweets - Backup Tool.exe
```

Keep it in the same live folder as `Eastern Sweets ERP.exe`. It reads the same app-data database, supports manual backup, auto backup scheduling, and grouped backup sizes for Admin, Production Manager, and Cashier data.

## Auto Updates

The desktop app includes `electron-updater`.

Current publish mode is generic static hosting:

```json
{
  "provider": "generic",
  "url": "https://updates.easternsweets.com/erp/"
}
```

To publish an update:

1. Make code changes in `C:\ERP`.
2. Bump `desktop/package.json` version, for example `1.0.0` to `1.0.1`.
3. Run:

```bat
scripts\build-release.bat
```

4. Upload these generated files to the update server URL:
   - `desktop\release\Eastern Sweets ERP Setup <version>.exe`
   - `desktop\release\latest.yml`
   - any `.blockmap` file generated beside the installer
5. Client apps check on launch and every 4 hours.
6. Admin can also open Settings and click `Check for Updates`.

When an update is installed, only app files are replaced. The database in `%APPDATA%` remains untouched.

## Switching To GitHub Releases

In `desktop/package.json`, replace the generic `publish` config with:

```json
{
  "provider": "github",
  "owner": "your-github-username",
  "repo": "eastern-sweets-erp",
  "private": false
}
```

Then publish with a valid `GH_TOKEN`:

```bat
cd desktop
npm run dist -- --publish always
```
