# Dashboard admins and handover

The dashboard has exactly one owner. The owner can add/remove admins and hand over ownership. Regular admins can manage restaurant operations but cannot view or change the access list. Local shared-password demo mode does not manage real accounts.

## First owner

Apply `supabase/migrations/202610200003_admin_handover.sql` after the existing migrations. Create and confirm the initial owner's email/password account in Supabase Authentication. Then run `supabase/bootstrap-owner.sql` once with the confirmed email. The script refuses to replace an existing owner. The owner sets their password directly in Supabase; passwords are never part of SQL or source code.

## Add an admin

1. The owner signs in at `/admin` and opens **Admins**.
2. Enter the recipient's email and select **Add admin**.
3. A confirmed existing account gets dashboard access. For a new/pending account, a private one-time setup link appears. Copy it and share it directly with the intended person; no email is sent automatically. The link is not stored in browser storage and disappears on page reload, sign-out or account change.
4. The recipient opens the link, chooses their own password (12-128 characters), and enters the dashboard. A first successful dashboard sign-in is recorded.

If the link expires, add the same pending email again for a fresh link. Supabase's token expiry applies. Setup links use the server-only [Supabase generateLink API](https://supabase.com/docs/reference/javascript/auth-admin-generatelink); secret keys are never returned to the browser. Only the owner receives the generated setup link.

Configure Supabase Authentication Site URL as the deployed HTTPS origin and allow the exact `https://YOUR_ORIGIN/accept-invite` redirect. This release uses `https://nuvora-app-one.vercel.app` and its `/accept-invite` path. Update those settings and `PUBLIC_ORIGIN` when changing domains.

## Remove an admin

Select **Remove access** for that account and confirm the dialog. Existing sessions immediately lose API/dashboard access because membership is checked on every request. The Auth login and historical orders are preserved. The owner can add the account back later. An owner cannot remove themselves with this action.

## Transfer ownership and remove yourself

1. Add the replacement admin and have them complete setup and sign in.
2. Refresh **Admins**. **Hand over** becomes available after email confirmation and first dashboard sign-in.
3. Select **Hand over**, type the replacement email, and enter your current owner password.
4. Confirm **Hand over and sign out**. The database promotes the replacement and removes the outgoing owner from the access list in one serialized transaction. Your browser cookie is cleared and your other existing sessions also lose dashboard/API access.

The replacement is the sole owner and can manage admins, including adding you back if that is explicitly desired. Access changes are recorded in the private `admin_access_events` table. A failed handover leaves ownership unchanged.

## Full project handover

Dashboard ownership does not transfer the Supabase organization, Vercel team/project, GitHub repository, domain registrar/DNS, billing, backups or credentials held outside the app. Transfer those services separately and remove outgoing collaborators there. A former developer who retains infrastructure/service-secret access can bypass app-level permissions; removing that infrastructure access is part of a complete project handover.

## Validation

- 15 Node tests cover authorization, origin checks, setup links, password confirmation and removed-session rejection, alongside existing restaurant tests.
- `supabase/tests/admin-handover.sql` verifies database ownership invariants and access grants using fixtures that roll back. It refuses to run when an owner exists; use a dedicated test project after bootstrapping.
- SQL tests passed before first-owner bootstrap on the deployed schema; fixture users, roles and audit rows were confirmed absent afterward.
- Desktop/mobile browser testing uses isolated simulated accounts; no real invitations or real ownership transfers are performed by those UI tests.
