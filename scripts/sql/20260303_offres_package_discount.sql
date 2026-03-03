-- Add package discount fields for automatic package total logic
begin;

alter table public.offres
  add column if not exists package_discount_type text,
  add column if not exists package_discount_value numeric(12,2);

alter table public.offres
  drop constraint if exists offres_package_discount_type_check;

alter table public.offres
  add constraint offres_package_discount_type_check
  check (
    package_discount_type is null
    or package_discount_type in ('percent', 'fixed')
  );

alter table public.offres
  drop constraint if exists offres_package_discount_value_check;

alter table public.offres
  add constraint offres_package_discount_value_check
  check (
    package_discount_value is null
    or package_discount_value >= 0
  );

commit;
