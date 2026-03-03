-- Optional SQL refinement for offres/opportunites MRR vs ponctuel behavior
begin;

-- Normalize billing_period values used by UI
update public.offres
set billing_period = 'one_shot'
where billing_period is null or trim(billing_period) = '';

update public.offres
set billing_period = 'monthly'
where lower(billing_period) in ('mrr', 'mensuel', 'month', 'monthly_recurring');

update public.offres
set billing_period = 'one_shot'
where lower(billing_period) in ('ponctuel', 'one-shot', 'one shot', 'once');

alter table public.offres
  alter column billing_period set default 'one_shot';

-- Keep this permissive but validated
alter table public.offres
  drop constraint if exists offres_billing_period_check;

alter table public.offres
  add constraint offres_billing_period_check
  check (billing_period in ('one_shot', 'monthly', 'yearly'));

commit;
