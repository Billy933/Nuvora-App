# Nuvora deployment

Target repository: https://github.com/Billy933/Nuvora-App

Existing Vercel project: https://vercel.com/lidet-digital/nuvora-app

Target Supabase project: `qghtkklxewsbeaqhpkfy`

Test hostname: `nuvora.lidetdigital.com` (DNS record is not created yet).

The owner has created the Vercel project and configured Supabase environment variables there. The linked repository, deployed URL, environment variable names, applied schema and live application behavior still need verification. Adding variables alone does not apply the database migration.

## 1. Supabase

1. Inspect the target project first to confirm it is dedicated to Nuvora and does not already contain conflicting `menu`, `orders`, or other tables from this migration.
2. Apply [the migration](supabase/migrations/202610200001_nuvora.sql). It creates menu, orders, settings, admin allowlist, persistent rate limiting and a `menu-photos` Storage bucket. Apply once; do not rerun the same migration over an existing schema.
   Then apply [the additive storefront-content migration](supabase/migrations/202610200002_storefront_content.sql). It adds the JSON content column used by the dashboard Storefront editor and preserves existing menu items and orders. Existing installations need only this second migration if the first is already applied.
3. Run [the transactional SQL checks](supabase/tests/checkout.sql). Their test data rolls back.
4. Create the owner's email/password account in Supabase Authentication. Disable public signups for this owner-only dashboard. The app itself has no registration endpoint.
5. Grant just that account admin access (replace the placeholder with the confirmed owner's email):

```sql
insert into public.admin_users(user_id)
select id from auth.users where lower(email)=lower('OWNER_EMAIL_HERE')
on conflict do nothing;
```

Verify exactly one intended user is present in `admin_users`. A normal Supabase user alone is insufficient for dashboard access.

The Data API must expose the `public` schema. The migration grants service_role access; it grants no anon/authenticated table access. Both functions are executable only by service_role. Menu photos are public; orders, names, phones and delivery addresses are private. The server validates admin membership before any admin operation.

## 2. GitHub

Publish the project source to the supplied repository. Check existing repository contents first, preserve any unrelated work, and keep credentials/local data out of Git. `.gitignore` excludes `.env*`, `.vercel`, SQLite data, local Android paths and Gradle caches. `.env.example` contains names and placeholders only.

## 3. Vercel

Import that repository, then configure:

| Setting | Value |
| --- | --- |
| Root Directory | `web` |
| Framework Preset | Other |
| Build Command | `npm run check` (declared in `web/vercel.json`) |
| Output Directory | `public` |
| Node.js | A supported version matching `web/package.json`, e.g. 24.x |

Create these **server-side** environment variables in Vercel Settings, not in source:

- `SUPABASE_URL`: `https://qghtkklxewsbeaqhpkfy.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: the project's publishable API key
- `SUPABASE_SECRET_KEY`: the project's secret API key
- `RATE_LIMIT_SECRET`: at least 32 random characters (generate locally, do not reuse a password)
- `PUBLIC_ORIGIN`: `https://nuvora.lidetdigital.com`, once the domain is ready

The server also accepts integration-style names: `NEXT_PUBLIC_SUPABASE_URL` for the URL; `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the publishable/legacy anon key; and `SUPABASE_SERVICE_ROLE_KEY` for the server-only secret/legacy service-role key. Explicit SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY values take precedence. Never put the service-role or secret key in a NEXT_PUBLIC variable. RATE_LIMIT_SECRET is a separate app secret and must also be configured.

Owner-provided deployment URL: https://nuvora-app-one.vercel.app/

Until the custom subdomain is ready, set `PUBLIC_ORIGIN` to `https://nuvora-app-one.vercel.app` (without a trailing slash) to allow dashboard mutations from this stable Vercel alias. `VERCEL_URL` may identify a different deployment-specific hostname.

For the initial deployment, leave PUBLIC_ORIGIN unset: the app permits the exact deployment origin from VERCEL_URL. After adding a production domain, set PUBLIC_ORIGIN and redeploy. Do not connect untrusted pull-request preview deployments to the restaurant's live database. For a test deployment, use a dedicated test Supabase project; switch to the intended production project deliberately.

All API calls use a Vercel Node function; no SQLite or in-memory admin sessions are used in Vercel. Admin cookies are HttpOnly, SameSite=Strict, Secure and expire within an hour; sign in again after expiration. Server-side Auth checks and the database allowlist protect each admin request. Login and checkout have database-backed request limits.

## 4. Domain

Add `nuvora.lidetdigital.com` to the Vercel project. In the authoritative DNS zone (cPanel if its nameservers serve this domain), create the CNAME for `nuvora` using the **exact target returned by Vercel**. Replace only a conflicting record for this new subdomain. Preserve root-domain, email, and existing site records. Wait for Vercel to verify DNS and HTTPS.

## 5. Verify the deployed app

- Storefront and `/admin` load over HTTPS. `/api/menu` and `/api/settings` return successfully.
- Unauthenticated `/api/admin/orders` returns 401; signing in as a non-owner cannot access orders or menu writes.
- Owner can create, edit, sell out and delete a test dish, including a photo.
- Owner can save storefront text, upload a logo/banner photo, and see those changes on the customer page. Confirm settings edits preserve storefront content and content edits preserve restaurant settings.
- Confirm restaurant details and rates in the settings. Fresh cloud installs are **paused for orders** by default. Enable orders only for a supervised test, then pause again until ready.
- During opening hours, submit pickup and delivery test orders, verify the dashboard sees them, update status, and verify customer tracking. Check authoritative totals and delivery-fee disclosure.
- Confirm the database persists across Vercel redeployments.
- Configure and test the chosen Supabase backup/restore approach; no backup schedule has been provisioned by this code.

## Current business behavior

Pickup: Bole, Selam City Mall. Contact: +251919158071. Hours: 07:00–23:00 Addis Ababa time. Coverage: up to 50 km. Rates: ETB 5/km nearby and ETB 10/km farther out, stored in integer santim. These values are editable.

The 15 km nearby cutoff is provisional. Delivery pricing confirmation is off initially, so unconfirmed rates are not advertised to customers. Even after rates are confirmed, the app does not calculate route distance or automatic delivery fees: it clearly asks customers to expect a phone confirmation before food preparation. No map pin, routing service or driver dispatch is configured.

Payments remain at pickup or delivery. There is no payment gateway or paid-state workflow yet. Orders refresh while pages are open; no SMS/push/email alert is wired. Admin list displays the latest 200 orders; pagination/reporting is not implemented.

## Android release

After the domain works, build with:

```powershell
.\gradlew.bat assembleRelease -PnuvoraUrl=https://nuvora.lidetdigital.com
```

Release signing and device testing are still required. Debug uses the local emulator endpoint by default.
