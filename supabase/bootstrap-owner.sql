-- One-time bootstrap after all migrations and creation of the owner's Auth account.
-- Replace OWNER_EMAIL_HERE with the confirmed owner's email. Never paste passwords here.
begin;
do $$
declare owner_id uuid;
begin
  lock table public.admin_users in exclusive mode;
  if exists(select 1 from public.admin_users where role='owner') then
    raise exception 'An owner already exists; use the dashboard handover flow';
  end if;
  select id into owner_id from auth.users
    where lower(email)=lower('OWNER_EMAIL_HERE') and email_confirmed_at is not null;
  if owner_id is null then raise exception 'Create and confirm the intended owner Auth account first';end if;
  insert into public.admin_users(user_id,role) values(owner_id,'owner')
    on conflict(user_id) do update set role='owner';
  insert into public.admin_access_events(actor_id,target_id,action) values(owner_id,owner_id,'add');
end;
$$;
commit;
