# Core restaurant build - 20 October 2026

The single-restaurant storefront and owner dashboard are implemented, validated locally, and deployed at https://nuvora-app-one.vercel.app/ from application commit e86b398. The additive storefront-content migration is applied to Supabase project qghtkklxewsbeaqhpkfy. This is not a signed Android release.

## Implemented

- Responsive discovery/menu, category and text search, food details, device-local favorites, persistent bag, pickup/delivery checkout, and private order-status tracking.
- Desktop cart and mobile drawer with background isolation, focus containment, Escape dismissal and focus restoration.
- Responsive owner login, overview, seven-day order chart, order filtering/search/status updates, menu editor/photos/availability, restaurant settings, and storefront content editor.
- Supplied Nuvora logo in storefront and dashboard navigation; saved logos update both interfaces. Banner images, headings, about text and empty-state copy are editable.
- Local admin origin validation now runs before settings/content writes. Settings and content saves preserve each other's data.

## Validation

| Check | Result |
| --- | --- |
| `npm.cmd --prefix web test` | 15 tests pass, including local/cloud content persistence, authorization, origin rejection and image handling |
| `npm.cmd --prefix web run check` | JavaScript syntax and Vercel configuration pass |
| `git diff --check` | Pass |
| Chrome desktop/mobile | Reviewed storefront, login, dashboard, menu editor, orders, settings and content editor |
| Responsive widths | No document horizontal overflow in checked storefront/editor views at 320, 768, 1024 and 1536 pixels; visual review at 390 pixels |
| Browser order flow | Admin creates a disposable dish; mobile customer orders two at ETB 250; ETB 500 total appears in admin; changing status to Preparing appears in customer tracking |
| Content/settings | Saved banner headline and pickup address appear after reload; content and settings preserve each other |
| Real image payload | Supplied 1,056,388-byte PNG saves and reads back exactly through local content API |
| Mobile keyboard | Drawer focuses its close button; Escape closes it and restores focus to the bag button |
| Android `assembleDebug` | BUILD SUCCESSFUL, 38 tasks executed; APK at `app/build/outputs/apk/debug/app-debug.apk` |

Browser tests used a separate in-memory database on port 3087. They did not alter the restaurant's local SQLite database or cloud data. Screenshots contain disposable test dishes/orders and are in `tmp/build-validation/`.

Browser-extension file-picker upload testing was blocked because the extension does not have local file access. The image API payload and mocked cloud Storage handling passed; perform one actual photo selection/upload on the deployed dashboard. Android compiled successfully using Android Studio's bundled JDK, but emulator/physical-device runtime testing has not been performed. The debug APK now points at the live storefront; local emulator access is an explicit build override.

## Cloud verification - 20 October 2026

- GitHub main contains application commit `e86b398`; Vercel reported deployment success.
- Live storefront, `/admin`, `/layout.css`, supplied logo, `/api/settings`, and `/api/menu` return HTTP 200. Unauthenticated `/api/admin/orders` returns HTTP 401.
- Live settings include default Nuvora content. Orders remain paused; no customer/menu/order data was created during cloud checks.
- SQL confirmed the new `content jsonb NOT NULL DEFAULT '{}'` column. Direct anonymous/authenticated order reads and anonymous checkout-function execution are denied.
- Initial cloud verification found zero users/admins. The intended owner has since created and confirmed their Auth account; the first owner role was granted with explicit approval and verified as the sole owner. Menu and orders remain empty.
- The dedicated-test-project transactional SQL suite has not been run against this production project. No Android device/emulator was connected (`adb devices -l` returned an empty list).
- Evidence screenshots are in `tmp/release-validation/`.

## Before opening to customers

1. Verify live dashboard login for the confirmed, bootstrapped owner. Password entry stays with the user.
2. Complete the live owner-login/photo-upload/content/settings and pickup/delivery checks; keep orders paused outside supervised tests.
3. Run the transactional SQL checks against a dedicated test project, as specified in that test file.
4. Enter the actual menu, prices, food photos and approved restaurant information. Confirm delivery rates, opening hours and order availability.
5. Build/sign an Android release with the verified HTTPS origin and test on a real device. Configure production monitoring/backups and the privacy/retention policy.

Customer accounts, multi-restaurant discovery, maps/ETA, automated delivery fees, online payment, driver dispatch remain outside this core build. Payments are at pickup/on delivery; delivery availability and fees are confirmed by phone. Overview aggregates use the latest 200 cloud orders and are not payment or accounting reports.


## Admin management and handover

Owner/admin roles, private access-change history and serialized transfer functions are applied with migration `202610200003_admin_handover.sql`. The transactional SQL suite passed and fixture users/roles/audit entries were verified rolled back. The intended owner Auth account is email-confirmed; the initial owner role was explicitly approved, granted and verified as unique.

The **Admins** page adds existing users or generates a private one-time setup link for new users, removes access, and transfers ownership with typed-email confirmation and current-password reauthentication. Transfers require the replacement's confirmed email and first dashboard sign-in, promote exactly one owner and remove outgoing access atomically. No automated invitation email is sent; setup links are shared by the owner. Supabase's HTTPS Site URL and exact `/accept-invite` redirect are configured.

All 15 tests and syntax/configuration checks pass. Isolated Chrome UI tests covered new-account setup-link display, removal confirmation, wrong-password rejection, handover sign-out and replacement-owner access. Regular admins have no access-management controls. The team page has no document horizontal overflow at 320, 390, 768 and 1536 pixels. Evidence: `tmp/admin-handover-validation/`. Real account setup-link consumption and live owner session testing still require the intended users to interact with their own credentials. See HANDOVER.md for the complete workflow and infrastructure handover scope.

## Customer Android and staff notifications - 20 October 2026

The customer Android debug APK now opens the live storefront, uses the supplied logo and routes dashboard/invitation links to the browser. Debug and unsigned release builds pass, including release lint checks. No phone/emulator is connected; signing and physical-device validation remain required.

The web dashboard adds opt-in sound with repeated reminders, a Received-order banner/count, 10-second foreground refresh, device push opt-in, a test notification action and a service worker. Push delivery is queued atomically with each order, retried with leases and exponential backoff, and stopped for accepted orders or removed admins. No customer private details enter the push payload. The notification migration and transactional SQL tests passed on Supabase with rollback fixtures. Production-only push keys are configured in Vercel and the one-minute worker schedule is active in Supabase. Browser tests on an isolated in-memory kitchen verified order arrival, alert navigation and acceptance clearing the banner; mobile width 390 had no document overflow. See NOTIFICATIONS.md for delivery limits and setup. Actual device permission and receipt of a live test push still require verification.

Deployment verification: application commit `93765cd` is pushed and Vercel reports Ready. The live dashboard contains the notification controls and has no captured JavaScript errors on the signed-out page. Supabase cron successfully called the new worker with HTTP 200 at 14:40 UTC. Fixture counts were verified as zero after rollback. The current Node suite has 21 passing tests.
