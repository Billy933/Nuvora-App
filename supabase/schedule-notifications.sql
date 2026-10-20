-- First store NOTIFICATION_WORKER_SECRET in Supabase Vault under the name
-- nuvora_notification_worker_secret (same value as Vercel). Do not commit the value.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('nuvora-order-notifications','* * * * *',$job$
  select net.http_post(
    url:='https://nuvora-app-one.vercel.app/api/notifications/dispatch',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
      (select decrypted_secret from vault.decrypted_secrets where name='nuvora_notification_worker_secret' limit 1)),
    body:='{}'::jsonb,timeout_milliseconds:=20000
  );
$job$);
