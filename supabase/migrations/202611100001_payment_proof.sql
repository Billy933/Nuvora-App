-- Payment proof stays in the private order payload; no public storage bucket.
create or replace function public.nuvora_place_order(p_id text,p_token_hash text,p_order jsonb)
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
  if coalesce(length(p_order->>'transaction_reference'),0)>100 or
     coalesce(length(p_order->>'payment_screenshot'),0)>670000 or
     (coalesce(p_order->>'payment_screenshot','')<>'' and
      (p_order->>'payment_screenshot') !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$') then
    raise exception 'Invalid payment proof';
  end if;
  snapshot=jsonb_build_object('name',trim(p_order->>'name'),'phone',p_order->>'phone','mode',p_order->>'mode',
    'address',case when p_order->>'mode'='delivery' then p_order->>'address' else '' end,
    'transaction_reference',coalesce(p_order->>'transaction_reference',''),'payment_screenshot',coalesce(p_order->>'payment_screenshot',''),'notes',coalesce(p_order->>'notes',''),'items',items,'total',subtotal,'delivery_fee',null,
    'delivery_fee_status',case when p_order->>'mode'='delivery' then 'Requires confirmation by phone' else 'Not applicable' end);
  insert into public.orders(id,token_hash,payload) values(p_id,p_token_hash,snapshot);
  return jsonb_build_object('id',p_id,'status','Received')||snapshot;
end;
$$;
