# Restaurant order alerts

The Android app is the customer storefront. Staff use `/admin` in a browser.

## Staff setup

1. Sign in on each kitchen phone/computer. Tap **Enable sound** in the dashboard and keep that tab open with device volume on. Sound repeats roughly every 45 seconds while the tab is visible and loaded orders remain Received. Reloading requires enabling sound again.
2. Tap **Enable device notifications** and allow the browser notification prompt. Tap **Send test notification** and verify it appears on that device. On iPhone/iPad, first add the dashboard to the Home Screen and launch it there.
3. A new order produces a generic notification without a customer name, phone, address or tracking token. Tapping it opens the web dashboard; sign in again if the session expired.
4. Change Received to Preparing to accept an order, or Cancelled to decline. Waiting banners and sound reminders stop after the refreshed status changes. Browser push is an alert, not proof that a staff member saw or accepted an order.
5. Use **Turn off device notifications** or sign out before leaving a shared device. Removing an admin or transferring ownership deletes that account's subscriptions and queued notifications.

The dashboard refreshes every 10 seconds while visible and on return to the tab. Its current order list is limited to the latest 200 cloud orders; the waiting banner describes that loaded list. Phone sleep, browser termination, notification blocking, network loss and OS focus/battery settings can delay or suppress delivery. Keep a staffed dashboard open during service. Email/SMS escalation is not included.

## Server configuration

- Apply `supabase/migrations/202610200004_order_notifications.sql` once after the admin-handover migration. Run `supabase/tests/order-notifications.sql` to verify queue operations with rollback fixtures; it needs an existing owner and sends no network notifications.
- Generate a VAPID key pair using the `web-push` package and a separate random 32-byte worker secret. Store production-only Vercel variables `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (the site's HTTPS origin) and `NOTIFICATION_WORKER_SECRET`. Never rotate the VAPID pair casually: existing devices must subscribe again after rotation.
- In Supabase Vault, save the same worker secret as `nuvora_notification_worker_secret`. Run `supabase/schedule-notifications.sql` once to enable a one-minute retry job. Update its fixed origin when moving domains. The Vault value and private VAPID key stay outside source control.
- Deploy the application. `/api/notifications/dispatch` accepts POST with the worker Bearer secret only. Browser subscription/test endpoints require a current admin session and valid origin.
- Run `npm --prefix web test` and `npm --prefix web run check`.

An order INSERT and its per-device notification records commit together. Checkout attempts immediate delivery of up to 10 queued notifications; the scheduled worker drains further batches and retries. Claims use row locks, a two-minute lease and a lease token to reject stale completions. Sends have a five-second timeout. Failures retry with exponential delay, up to eight attempts, and jobs older than 24 hours or for accepted orders expire. HTTP 404/410 from a push provider removes the expired device. History older than seven days is removed during dispatch.

Delivery is at least once: if the process dies after sending but before saving success, a retry may duplicate a notification. Notifications use an order-specific tag to replace an existing notification for the same order. The worker rechecks current admin membership and Received status before each send. A status change racing an in-flight provider request can still produce a late alert; the dashboard remains authoritative.

Inspect `cron.job_run_details` for scheduler failures and `net._http_response` for HTTP outcomes. Both the cron run and an HTTP 200 from the dispatch endpoint should be checked: successful scheduling alone does not prove delivery. Inspect private `push_deliveries` state/attempts to diagnose repeated failures; never expose subscriptions or queue tables to customers.

## Android artifacts

`gradlew.bat assembleDebug assembleRelease -PnuvoraUrl=https://nuvora-app-one.vercel.app`

- `app/build/outputs/apk/debug/app-debug.apk`: installable debug-signed APK using the live storefront by default.
- `app/build/outputs/apk/release/app-release-unsigned.apk`: unsigned production build; requires the eventual publisher's signing key before distribution.
- For emulator development only, override debug with `-PnuvoraDevUrl=http://10.0.2.2:3000`.

The supplied Nuvora logo is the launcher icon. Admin and invitation links open in the browser. The customer app does not request notification permission: these notifications are for restaurant staff using the web dashboard. Final publisher application ID, release signing, privacy policy and physical-device checkout/navigation/offline tests must be completed before store publication.
