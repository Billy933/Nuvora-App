-- Apply to a dedicated Nuvora Supabase project using migrations or SQL Editor.
begin;
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.menu (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null check (length(trim(category)) between 1 and 80),
  description text not null default '' check (length(description)<=1000),
  price integer not null check (price between 1 and 10000000),
  image text not null default '', available boolean not null default true
);
create table public.restaurant_settings (
  id integer primary key default 1 check(id=1),
  pickup_address text not null default 'Bole, Selam City Mall',
  contact_phone text not null default '+251919158071',
  opening_time text not null default '07:00', closing_time text not null default '23:00',
  accepting_orders boolean not null default false,
  delivery_max_km numeric not null default 50 check(delivery_max_km>0 and delivery_max_km<=100),
  nearby_limit_km numeric not null default 15 check(nearby_limit_km>0 and nearby_limit_km<=delivery_max_km),
  nearby_rate integer not null default 500 check(nearby_rate>=0),
  far_rate integer not null default 1000 check(far_rate>=nearby_rate),
  delivery_pricing_confirmed boolean not null default false
);
insert into public.restaurant_settings(id) values(1);
create table public.orders (
  id text primary key,
  token_hash text not null,
  created timestamptz not null default now(),
  status text not null default 'Received' check(status in ('Received','Preparing','Ready for pickup','Out for delivery','Completed','Cancelled')),
  payload jsonb not null
);
create index orders_created_idx on public.orders(created desc);
create table public.rate_limits (
  key text primary key, window_start timestamptz not null, attempts integer not null
);

-- No customer or generic signed-in account can directly read private records or write data.
-- All API operations run through our server after authorization/validation.
alter table public.admin_users enable row level security;
alter table public.menu enable row level security;
alter table public.restaurant_settings enable row level security;
alter table public.orders enable row level security;
alter table public.rate_limits enable row level security;
revoke all on table public.admin_users,public.menu,public.restaurant_settings,public.orders,public.rate_limits from anon,authenticated;
grant all on table public.admin_users,public.menu,public.restaurant_settings,public.orders,public.rate_limits to service_role;
grant usage,select on sequence public.menu_id_seq to service_role;

create function public.nuvora_rate_limit(p_key text,p_max integer,p_seconds integer)
returns boolean language plpgsql set search_path='' as $$
declare n integer;
begin
  if p_max<1 or p_seconds<1 or length(p_key)<>64 then raise exception 'Invalid limit'; end if;
  insert into public.rate_limits as r(key,window_start,attempts) values(p_key,now(),1)
  on conflict(key) do update set
    attempts=case when r.window_start <= now()-make_interval(secs=>p_seconds) then 1 else r.attempts+1 end,
    window_start=case when r.window_start <= now()-make_interval(secs=>p_seconds) then now() else r.window_start end
  returning attempts into n;
  -- Bound storage without retaining raw IP addresses.
  delete from public.rate_limits where window_start<now()-interval '1 day';
  return n<=p_max;
end;
$$;

create function public.nuvora_place_order(p_id text,p_token_hash text,p_order jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare s public.restaurant_settings; m public.menu; i jsonb; items jsonb='[]'::jsonb;
  subtotal bigint=0; quantity integer; snapshot jsonb; local_time text;
begin
  select * into s from public.restaurant_settings where id=1 for share;
  local_time=to_char(now() at time zone 'Africa/Addis_Ababa','HH24:MI');
  if not found or not s.accepting_orders or local_time<s.opening_time or local_time>=s.closing_time then
    raise exception 'The kitchen is closed for orders right now';
  end if;
  if p_id !~ '^[A-F0-9]{12}$' or p_token_hash !~ '^[a-f0-9]{64}$' or
     p_order->>'mode' not in ('pickup','delivery') or
     coalesce(length(trim(p_order->>'name')),0) not between 1 and 120 or
     coalesce(p_order->>'phone','') !~ '^(\+251|0)[79][0-9]{8}$' or
     jsonb_typeof(p_order->'items') is distinct from 'array' then raise exception 'Invalid order'; end if;
  if jsonb_array_length(p_order->'items') not between 1 and 50 then raise exception 'Invalid cart'; end if;
  if p_order->>'mode'='delivery' and coalesce(length(trim(p_order->>'address')),0) not between 8 and 1000 then raise exception 'Enter a delivery address'; end if;
  if coalesce(length(p_order->>'notes'),0)>1000 then raise exception 'Instructions are too long'; end if;
  if (select count(distinct x->>'id') from jsonb_array_elements(p_order->'items') x) <> jsonb_array_length(p_order->'items') then raise exception 'Duplicate cart item'; end if;
  -- Lock menu rows in stable order. Snapshot authoritative prices in the same transaction.
  for i in select value from jsonb_array_elements(p_order->'items') order by (value->>'id')::bigint loop
    if i->>'quantity' !~ '^[0-9]+$' then raise exception 'Invalid quantity'; end if;
    quantity=(i->>'quantity')::integer;
    if quantity not between 1 and 30 then raise exception 'Invalid quantity'; end if;
    select * into m from public.menu where id=(i->>'id')::bigint for share;
    if not found or not m.available then raise exception 'A menu item is no longer available'; end if;
    subtotal=subtotal+(m.price::bigint*quantity);
    items=items||jsonb_build_array(jsonb_build_object('id',m.id,'name',m.name,'price',m.price,'quantity',quantity));
  end loop;
  snapshot=jsonb_build_object('name',trim(p_order->>'name'),'phone',p_order->>'phone','mode',p_order->>'mode',
    'address',case when p_order->>'mode'='delivery' then p_order->>'address' else '' end,
    'notes',coalesce(p_order->>'notes',''),'items',items,'total',subtotal,'delivery_fee',null,
    'delivery_fee_status',case when p_order->>'mode'='delivery' then 'Requires confirmation by phone' else 'Not applicable' end);
  insert into public.orders(id,token_hash,payload) values(p_id,p_token_hash,snapshot);
  return jsonb_build_object('id',p_id,'status','Received')||snapshot;
end;
$$;
revoke all on function public.nuvora_place_order(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.nuvora_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.nuvora_place_order(text,text,jsonb) to service_role;
grant execute on function public.nuvora_rate_limit(text,integer,integer) to service_role;

-- Public bucket contains menu photos only. Uploads pass through the authenticated server.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('menu-photos','menu-photos',true,1500000,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
commit;
