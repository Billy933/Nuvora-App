# Core restaurant build - 20 October 2026

The single-restaurant storefront and owner dashboard are implemented and validated locally. This is not a production deployment or a signed Android release. This report records the validated source snapshot; live deployment is tracked separately.

## Implemented

- Responsive discovery/menu, category and text search, food details, device-local favorites, persistent bag, pickup/delivery checkout, and private order-status tracking.
- Desktop cart and mobile drawer with background isolation, focus containment, Escape dismissal and focus restoration.
- Responsive owner login, overview, seven-day order chart, order filtering/search/status updates, menu editor/photos/availability, restaurant settings, and storefront content editor.
- Supplied Nuvora logo in storefront and dashboard navigation; saved logos update both interfaces. Banner images, headings, about text and empty-state copy are editable.
- Local admin origin validation now runs before settings/content writes. Settings and content saves preserve each other's data.

## Validation

| Check | Result |
| --- | --- |
| `npm.cmd --prefix web test` | 10 tests pass, including local/cloud content persistence, authorization, origin rejection and image handling |
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

Browser-extension file-picker upload testing was blocked because the extension does not have local file access. The image API payload and mocked cloud Storage handling passed; perform one actual photo selection/upload on the deployed dashboard. Android compiled successfully using Android Studio's bundled JDK, but emulator/physical-device runtime testing has not been performed. The debug APK points at the local emulator endpoint, not the live website.

## Before release

1. Publish the reviewed application commit. Do not include local IDE state, Gradle caches, test screenshots or reference-design folders by accident.
2. Apply `supabase/migrations/202610200002_storefront_content.sql` after the base migration. Existing production migration state has not been verified.
3. Deploy the web changes and verify owner login, real photo uploads, content/settings persistence and the pickup/delivery order flow against the actual cloud database. Run the transactional SQL checks.
4. Enter the actual menu, prices, food photos and approved restaurant information. Confirm delivery rates, opening hours and order availability.
5. Build/sign an Android release with the verified HTTPS origin and test on a real device. Configure production monitoring/backups and the privacy/retention policy.

Customer accounts, multi-restaurant discovery, maps/ETA, automated delivery fees, online payment, driver dispatch and notifications remain outside this core build. Payments are at pickup/on delivery; delivery availability and fees are confirmed by phone. Overview aggregates use the latest 200 cloud orders and are not payment or accounting reports.
