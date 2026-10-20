-- Additive migration. Run after 202610200001_nuvora.sql. Existing menu and orders are preserved.
begin;
alter table public.restaurant_settings add column if not exists content jsonb not null default '{}'::jsonb;
commit;
