begin;
create table public.push_subscriptions (
  endpoint text primary key, user_id uuid not null references public.admin_users(user_id) on delete cascade,
  subscription jsonb not null, updated_at timestamptz not null default now()
);
create table public.push_deliveries (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders(id) on delete cascade,
  endpoint text not null references public.push_subscriptions(endpoint) on delete cascade,
  created_at timestamptz not null default now(), next_attempt timestamptz not null default now(),
  attempts integer not null default 0, lease uuid,
  state text not null default 'pending' check(state in ('pending','sent','expired')),
  unique(order_id,endpoint)
);
create index push_deliveries_due on public.push_deliveries(next_attempt) where state='pending';
alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;
revoke all on public.push_subscriptions,public.push_deliveries from public,anon,authenticated;
grant all on public.push_subscriptions,public.push_deliveries to service_role;
grant usage,select on sequence public.push_deliveries_id_seq to service_role;

create function public.nuvora_enqueue_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.push_deliveries(order_id,endpoint)
    select new.id,endpoint from public.push_subscriptions;
  return new;
end;
$$;
create trigger order_push_queue after insert on public.orders for each row execute function public.nuvora_enqueue_push();

create function public.nuvora_save_push(p_actor uuid,p_subscription jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.admin_users where user_id=p_actor for update;
  if not found then raise exception 'Dashboard access is required'; end if;
  if length(p_subscription->>'endpoint') not between 1 and 2048 then raise exception 'Invalid subscription'; end if;
  if (select count(*) from public.push_subscriptions where user_id=p_actor and endpoint<>p_subscription->>'endpoint')>=10 then
    raise exception 'Remove an old notification device before adding another';
  end if;
  insert into public.push_subscriptions(endpoint,user_id,subscription) values(p_subscription->>'endpoint',p_actor,p_subscription)
    on conflict(endpoint) do update set user_id=excluded.user_id,subscription=excluded.subscription,updated_at=now();
end;
$$;
create function public.nuvora_claim_push(p_order_id text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  -- Retain a bounded history, and stop reminders after acceptance or 24 hours.
  delete from public.push_deliveries where created_at<now()-interval '7 days';
  update public.push_deliveries d set state='expired' where state='pending' and
    (created_at<now()-interval '24 hours' or (attempts>=8 and next_attempt<=now()) or not exists(select 1 from public.orders o where o.id=d.order_id and o.status='Received'));
  with candidates as (
    select id from public.push_deliveries where state='pending' and next_attempt<=now()
      and (p_order_id is null or order_id=p_order_id) order by next_attempt,id for update skip locked limit 10
  ), claimed as (
    update public.push_deliveries d set attempts=attempts+1,lease=gen_random_uuid(),next_attempt=now()+interval '2 minutes'
      from candidates c where d.id=c.id returning d.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'lease',c.lease,'order_id',c.order_id,'user_id',s.user_id,'subscription',s.subscription)),'[]'::jsonb)
    into result from claimed c join public.push_subscriptions s on s.endpoint=c.endpoint;
  return result;
end;
$$;
create function public.nuvora_finish_push(p_id bigint,p_lease uuid,p_outcome text) returns void
language plpgsql security definer set search_path='' as $$
declare target text;
begin
  if p_outcome not in ('sent','expired','retry','gone') then raise exception 'Invalid delivery outcome'; end if;
  update public.push_deliveries set state=case when p_outcome='retry' and attempts<8 then 'pending' when p_outcome='sent' then 'sent' else 'expired' end,
    next_attempt=now()+make_interval(secs=>least(3600,(15*power(2,attempts))::integer)),lease=null
    where id=p_id and lease=p_lease returning endpoint into target;
  if p_outcome='gone' and target is not null then delete from public.push_subscriptions where endpoint=target; end if;
end;
$$;
revoke all on function public.nuvora_enqueue_push(),public.nuvora_save_push(uuid,jsonb),public.nuvora_claim_push(text),public.nuvora_finish_push(bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.nuvora_save_push(uuid,jsonb),public.nuvora_claim_push(text),public.nuvora_finish_push(bigint,uuid,text) to service_role;
commit;
