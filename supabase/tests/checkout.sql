-- Run after the migration in a dedicated test project. All changes roll back.
begin;
do $$
declare item_id bigint; result jsonb; blocked boolean=false;
begin
  if has_table_privilege('anon','public.orders','SELECT') or
     has_table_privilege('authenticated','public.orders','SELECT') or
     has_function_privilege('anon','public.nuvora_place_order(text,text,jsonb)','EXECUTE') then
    raise exception 'Private database access is exposed';
  end if;
  update public.restaurant_settings set accepting_orders=true,opening_time='00:00',closing_time='24:00' where id=1;
  insert into public.menu(name,category,price) values('SQL test only','Test',25000) returning id into item_id;
  result=public.nuvora_place_order('000000000001',repeat('a',64),jsonb_build_object(
    'name','SQL test','phone','0911234567','mode','pickup','total',1,
    'items',jsonb_build_array(jsonb_build_object('id',item_id,'quantity',2,'price',1))));
  if (result->>'total')::integer<>50000 then raise exception 'Client price was trusted'; end if;
  update public.menu set available=false where id=item_id;
  begin
    perform public.nuvora_place_order('000000000002',repeat('b',64),jsonb_build_object(
      'name','SQL test','phone','0911234567','mode','pickup',
      'items',jsonb_build_array(jsonb_build_object('id',item_id,'quantity',1))));
  exception when raise_exception then blocked=true;
  end;
  if not blocked then raise exception 'Sold-out item was accepted'; end if;
  if exists(select 1 from public.orders where id='000000000002') then raise exception 'Failed order was saved'; end if;
  if not public.nuvora_rate_limit(repeat('f',64),1,600) or public.nuvora_rate_limit(repeat('f',64),1,600) then
    raise exception 'Rate limit did not block repeated requests';
  end if;
end;
$$;
rollback;
