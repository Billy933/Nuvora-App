-- Editable advance-payment accounts, served by the existing settings API.
alter table public.restaurant_settings
  add column if not exists telebirr_phone text not null default '+251919158071'
    check (telebirr_phone ~ '^(\+251|0)[79][0-9]{8}$'),
  add column if not exists cbe_account text not null default '1000012315554'
    check (cbe_account ~ '^[0-9]{10,20}$');
