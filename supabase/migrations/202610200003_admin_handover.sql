-- Run after the core and storefront-content migrations. Bootstrap the first owner separately.
begin;
alter table public.admin_users add column if not exists role text not null default 'admin' check (role in ('owner','admin'));
alter table public.admin_users add column if not exists created_at timestamptz not null default now();
alter table public.admin_users add column if not exists last_login_at timestamptz;
create unique index if not exists admin_users_single_owner on public.admin_users(role) where role='owner';
create table if not exists public.admin_access_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid not null, target_id uuid not null,
  action text not null check(action in ('add','remove','transfer'))
);
alter table public.admin_access_events enable row level security;
revoke all on public.admin_access_events from anon,authenticated;
grant all on public.admin_access_events to service_role;
grant usage,select on sequence public.admin_access_events_id_seq to service_role;

create or replace function public.nuvora_list_admins(p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.admin_users where user_id=p_actor and role='owner') then
    raise exception 'Only the owner can manage admins';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',a.user_id,'email',u.email,'role',a.role,'created_at',a.created_at,
    'confirmed',u.email_confirmed_at is not null,'last_login_at',a.last_login_at
  ) order by a.role desc,a.created_at) from public.admin_users a join auth.users u on u.id=a.user_id),'[]'::jsonb);
end;
$$;

create or replace function public.nuvora_manage_admin(p_actor uuid,p_action text,p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target_id uuid; confirmed boolean; signed_in timestamptz; target_role text;
begin
  -- Serialize owner checks and all role changes, including concurrent handovers.
  lock table public.admin_users in exclusive mode;
  if not exists(select 1 from public.admin_users where user_id=p_actor and role='owner') then
    raise exception 'Only the owner can manage admins';
  end if;
  if p_action not in ('inspect','add','remove','transfer') or p_action is null or
     p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Check the action and email address';
  end if;
  select id,email_confirmed_at is not null into target_id,confirmed from auth.users
    where lower(email)=lower(trim(p_email));
  if p_action='inspect' then
    return jsonb_build_object('exists',target_id is not null,'confirmed',coalesce(confirmed,false));
  end if;
  if target_id is null then raise exception 'Create or invite this user first'; end if;
  if target_id=p_actor then raise exception 'Choose a different account; use handover to leave'; end if;
  select role,last_login_at into target_role,signed_in from public.admin_users where user_id=target_id;
  if p_action='add' then
    insert into public.admin_users(user_id,role) values(target_id,'admin') on conflict(user_id) do nothing;
    if found then insert into public.admin_access_events(actor_id,target_id,action) values(p_actor,target_id,'add'); end if;
  elsif p_action='remove' then
    if target_role is null then raise exception 'This account is not an admin'; end if;
    if target_role='owner' then raise exception 'The owner cannot be removed; use handover'; end if;
    delete from public.admin_users where user_id=target_id;
    insert into public.admin_access_events(actor_id,target_id,action) values(p_actor,target_id,'remove');
  elsif p_action='transfer' then
    if target_role is distinct from 'admin' or not confirmed or signed_in is null then
      raise exception 'The replacement admin must confirm their email and sign in to the dashboard first';
    end if;
    update public.admin_users set role='admin' where user_id=p_actor;
    update public.admin_users set role='owner' where user_id=target_id;
    delete from public.admin_users where user_id=p_actor;
    insert into public.admin_access_events(actor_id,target_id,action) values(p_actor,target_id,'transfer');
  end if;
  return jsonb_build_object('ok',true,'action',p_action);
end;
$$;
revoke all on function public.nuvora_list_admins(uuid),public.nuvora_manage_admin(uuid,text,text) from public,anon,authenticated;
grant execute on function public.nuvora_list_admins(uuid),public.nuvora_manage_admin(uuid,text,text) to service_role;
commit;
