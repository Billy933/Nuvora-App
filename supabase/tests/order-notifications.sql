-- Transactional fixtures: no push requests are sent, and every fixture rolls back.
begin;
set local role service_role;
do $$
declare actor uuid; jobs jsonb; old_lease uuid; new_lease uuid; delivery_id bigint;
begin
  select user_id into actor from public.admin_users where role='owner';
  if actor is null then raise exception 'Create the initial owner before running this check'; end if;
  if exists(select 1 from public.orders where id='FFFFFFFFFFF1') then raise exception 'Fixture order already exists'; end if;
  if has_function_privilege('anon','public.nuvora_claim_push(text)','execute') or has_table_privilege('authenticated','public.push_subscriptions','select') then raise exception 'Public push access'; end if;
  perform public.nuvora_save_push(actor,jsonb_build_object('endpoint','https://fcm.googleapis.com/fcm/send/nuvora-rollback-fixture','keys',jsonb_build_object('p256dh','test','auth','test')));
  insert into public.orders(id,token_hash,payload) values('FFFFFFFFFFF1',repeat('a',64),'{}');
  if not exists(select 1 from public.push_deliveries where order_id='FFFFFFFFFFF1') then raise exception 'Missing atomic enqueue'; end if;
  jobs:=public.nuvora_claim_push('FFFFFFFFFFF1');
  select (x->>'id')::bigint,(x->>'lease')::uuid into delivery_id,old_lease from jsonb_array_elements(jobs) x where x->'subscription'->>'endpoint'='https://fcm.googleapis.com/fcm/send/nuvora-rollback-fixture';
  if delivery_id is null then raise exception 'Missing claim'; end if;
  if jsonb_array_length(public.nuvora_claim_push('FFFFFFFFFFF1'))<>0 then raise exception 'Double claim'; end if;
  perform public.nuvora_finish_push(delivery_id,old_lease,'retry');
  if not exists(select 1 from public.push_deliveries where id=delivery_id and state='pending' and next_attempt>now()) then raise exception 'Missing retry delay'; end if;
  update public.push_deliveries set next_attempt=now() where id=delivery_id;
  jobs:=public.nuvora_claim_push('FFFFFFFFFFF1');new_lease:=(jobs->0->>'lease')::uuid;
  perform public.nuvora_finish_push(delivery_id,old_lease,'sent');
  if not exists(select 1 from public.push_deliveries where id=delivery_id and state='pending') then raise exception 'Stale lease accepted'; end if;
  perform public.nuvora_finish_push(delivery_id,new_lease,'gone');
  if exists(select 1 from public.push_subscriptions where endpoint='https://fcm.googleapis.com/fcm/send/nuvora-rollback-fixture') then raise exception 'Expired endpoint retained'; end if;
  perform public.nuvora_save_push(actor,jsonb_build_object('endpoint','https://fcm.googleapis.com/fcm/send/nuvora-rollback-fixture','keys',jsonb_build_object('p256dh','test','auth','test')));
  insert into public.push_deliveries(order_id,endpoint) values('FFFFFFFFFFF1','https://fcm.googleapis.com/fcm/send/nuvora-rollback-fixture');
  update public.orders set status='Preparing' where id='FFFFFFFFFFF1';
  if jsonb_array_length(public.nuvora_claim_push('FFFFFFFFFFF1'))<>0 then raise exception 'Accepted order still queued'; end if;
end;
$$;
rollback;
select 'Notification queue, retry, lease fencing, endpoint expiry and acceptance checks passed; fixtures rolled back' as result;
