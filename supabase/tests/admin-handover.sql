-- Transactional fixtures only: no passwords, invitation emails or committed users.
-- Run before bootstrapping the first owner, or in a dedicated test project.
begin;
set local statement_timeout='10s';
do $$
declare
  outgoing uuid='00000000-0000-4000-8000-000000000011';
  incoming uuid='00000000-0000-4000-8000-000000000012';
  outsider uuid='00000000-0000-4000-8000-000000000013';
  blocked boolean; result jsonb;
begin
  if exists(select 1 from public.admin_users where role='owner') then
    raise exception 'Use a dedicated test project: an owner already exists';
  end if;
  if has_function_privilege('anon','public.nuvora_manage_admin(uuid,text,text)','EXECUTE') or
     has_function_privilege('authenticated','public.nuvora_list_admins(uuid)','EXECUTE') or
     has_table_privilege('authenticated','public.admin_users','UPDATE') then
    raise exception 'Direct admin management is exposed';
  end if;
  insert into auth.users(id,email,email_confirmed_at) values
    (outgoing,'handover-outgoing@example.invalid',now()),(incoming,'handover-incoming@example.invalid',now()),
    (outsider,'handover-outsider@example.invalid',now());
  insert into public.admin_users(user_id,role) values(outgoing,'owner');
  -- Exercise the same role as PostgREST, rather than testing only as postgres.
  execute 'set local role service_role';
  blocked=false;
  begin perform public.nuvora_manage_admin(outsider,'add','handover-incoming@example.invalid');
  exception when raise_exception then blocked=true;end;
  if not blocked then raise exception 'Non-owner could add an admin';end if;
  result=public.nuvora_manage_admin(outgoing,'inspect','not-created@example.invalid');
  if (result->>'exists')::boolean then raise exception 'Missing invite account was treated as existing';end if;
  perform public.nuvora_manage_admin(outgoing,'add','handover-incoming@example.invalid');
  blocked=false;
  begin perform public.nuvora_manage_admin(outgoing,'transfer','handover-incoming@example.invalid');
  exception when raise_exception then blocked=true;end;
  if not blocked then raise exception 'Handover accepted before first dashboard sign-in';end if;
  blocked=false;
  begin perform public.nuvora_manage_admin(outgoing,'remove','handover-outgoing@example.invalid');
  exception when raise_exception then blocked=true;end;
  if not blocked then raise exception 'Owner removed themselves';end if;
  update public.admin_users set last_login_at=now() where user_id=incoming;
  perform public.nuvora_manage_admin(outgoing,'transfer','handover-incoming@example.invalid');
  if exists(select 1 from public.admin_users where user_id=outgoing) or
     (select count(*) from public.admin_users where role='owner')<>1 or
     not exists(select 1 from public.admin_users where user_id=incoming and role='owner') then
    raise exception 'Transfer did not remove outgoing access and retain exactly one owner';
  end if;
  blocked=false;
  begin perform public.nuvora_manage_admin(outgoing,'add','handover-outsider@example.invalid');
  exception when raise_exception then blocked=true;end;
  if not blocked then raise exception 'Outgoing owner retained access';end if;
  perform public.nuvora_manage_admin(incoming,'add','handover-outsider@example.invalid');
  perform public.nuvora_manage_admin(incoming,'remove','handover-outsider@example.invalid');
  if exists(select 1 from public.admin_users where user_id=outsider) then raise exception 'Removal failed';end if;
  if (select count(*) from public.admin_access_events where actor_id in(outgoing,incoming))<>4 then
    raise exception 'Access changes were not audited';
  end if;
end;
$$;
rollback;
select 'Admin handover checks passed; fixtures rolled back' as result;
