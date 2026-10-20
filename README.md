# Nuvora

Addis Ababa restaurant ordering website, owner dashboard, and Android WebView shell. The cloud adapter uses Vercel Functions with Supabase Database, Auth and Storage. The local demo retains SQLite for development. Money is stored as integer santim and displayed in ETB. No real menu is seeded.

Deployment target and exact setup steps: [DEPLOYMENT.md](DEPLOYMENT.md). Cloud deployment files are prepared; connecting accounts, applying the migration and deploying are separate steps.

## Run locally

Requires Node.js 22.13 or later (tested on Node 26). No npm dependencies.

```powershell
cd web
$env:ADMIN_PASSWORD = 'choose-a-long-private-password'
npm.cmd start
```

Customer website: http://127.0.0.1:3000

Owner dashboard: http://127.0.0.1:3000/admin

Without ADMIN_PASSWORD, the local demo prints a random temporary password. Enter any valid email with that demo password. Local demo sessions expire after eight hours and on restart. SQLite data is in `web/data/nuvora.sqlite`. Do not expose the demo server publicly.

To develop against Supabase instead, copy `web/.env.example` to `web/.env.local`, fill in values locally, and run the same start command. When SUPABASE_URL is set, API requests use the cloud adapter and actual owner email/password sign-in. The migration and admin allowlist must already exist. Never commit `.env.local`.

```powershell
cd web
npm.cmd test
npm.cmd run check
```

## Android

Start the web server and run the debug app in Android Studio's emulator. The shell points at `http://10.0.2.2:3000` (the emulator's address for the host computer). HTTP is permitted for that development address only. A physical phone requires a reachable hosted website.

For release, first deploy the Node server behind HTTPS, then build with the hosted origin:

```powershell
.\gradlew.bat assembleRelease -PnuvoraUrl=https://your-domain.example
```

Configure Android release signing before distribution. The release task rejects an absent or non-HTTPS origin.

## Before opening to customers

- Follow the Supabase/Vercel setup in DEPLOYMENT.md, verify the live system, and configure backups.
- Add the actual menu, prices and photos. Restaurant contact, hours, order availability, coverage and rates can be edited in the dashboard. Confirm the provisional nearby cutoff before publishing rates.
- Current delivery orders request an address and landmark. The checkout explicitly says the owner will call to confirm delivery availability and its fee before preparation. The total covers food only.
- Payment is at pickup or on delivery. There is no payment processing, map pin, push/SMS notification, scheduling, driver dispatch, or automated delivery fee calculation yet.
- Customer menu, storefront content and order status refresh every 20 seconds while the page is visible; admin orders refresh every 20 seconds. Order tracking and favorites are remembered in that browser/device only.
- The dashboard Storefront page edits the restaurant name, logo, banner image, headings and about text. Apply the additive storefront-content migration before using it in the cloud. Desktop, tablet and mobile layouts are included for the storefront and dashboard.
- Cloud login and checkout have persistent request limits. Configure monitoring, backups and a privacy/retention policy before launch.

Local API tests cover menu CRUD, authoritative totals, sold-out checks, checkout validation, tracking privacy and fulfillment updates. Cloud tests use mocked Supabase responses to check authentication, secure cookies, origin checks, rate limits, token hashing, settings validation and photo uploads. Transactional SQL checks are supplied separately and must run against Supabase after applying the migration. Neither mocked tests nor syntax checks prove live deployment, browser behavior or Android compatibility.

Latest local build evidence and remaining release steps: [BUILD_STATUS.md](BUILD_STATUS.md).

Owner-only admin management, private setup links and outgoing-owner removal are documented in [HANDOVER.md](HANDOVER.md). Apply the admin-handover migration and bootstrap the first confirmed owner before using this feature in the cloud.

Restaurant push notifications and customer APK setup: [NOTIFICATIONS.md](NOTIFICATIONS.md).
