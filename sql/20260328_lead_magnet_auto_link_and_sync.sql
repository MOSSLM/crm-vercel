-- Ensure one production lead magnet per opportunity + sync ready state with opportunites.lead_magnet

insert into public.production_templates (nom)
select 'Template par défaut'
where not exists (select 1 from public.production_templates);

create or replace function public.create_lead_magnet_for_opportunity(_opportunity_id uuid)
returns void
language plpgsql
as $$
declare
  v_template_id uuid;
  v_opportunity_name text;
  v_lead_magnet_ready boolean;
begin
  if _opportunity_id is null then
    return;
  end if;

  select id
  into v_template_id
  from public.production_templates
  order by created_at asc
  limit 1;

  if v_template_id is null then
    return;
  end if;

  select name, coalesce(lead_magnet, false)
  into v_opportunity_name, v_lead_magnet_ready
  from public.opportunites
  where id = _opportunity_id;

  insert into public.production_lead_magnets (opportunite_id, template_id, nom, statut)
  values (
    _opportunity_id,
    v_template_id,
    nullif(trim(coalesce(v_opportunity_name, '')), ''),
    case when v_lead_magnet_ready then 'pret' else 'a_faire' end
  )
  on conflict (opportunite_id) do nothing;
end;
$$;

create or replace function public.ensure_lead_magnet_for_new_opportunity()
returns trigger
language plpgsql
as $$
begin
  perform public.create_lead_magnet_for_opportunity(new.id);
  return new;
end;
$$;

drop trigger if exists trg_ensure_lead_magnet_for_new_opportunity on public.opportunites;
create trigger trg_ensure_lead_magnet_for_new_opportunity
after insert on public.opportunites
for each row
execute function public.ensure_lead_magnet_for_new_opportunity();

create or replace function public.sync_opportunity_lead_magnet_from_production()
returns trigger
language plpgsql
as $$
begin
  update public.opportunites
  set lead_magnet = (new.statut = 'pret'),
      updated_at = now()
  where id = new.opportunite_id;

  return new;
end;
$$;

drop trigger if exists trg_sync_opportunity_lead_magnet_from_production on public.production_lead_magnets;
create trigger trg_sync_opportunity_lead_magnet_from_production
after insert or update of statut on public.production_lead_magnets
for each row
execute function public.sync_opportunity_lead_magnet_from_production();

create or replace function public.sync_production_lead_magnet_from_opportunity()
returns trigger
language plpgsql
as $$
begin
  update public.production_lead_magnets
  set statut = case when coalesce(new.lead_magnet, false) then 'pret' else 'en_cours' end,
      updated_at = now()
  where opportunite_id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_sync_production_lead_magnet_from_opportunity on public.opportunites;
create trigger trg_sync_production_lead_magnet_from_opportunity
after update of lead_magnet on public.opportunites
for each row
execute function public.sync_production_lead_magnet_from_opportunity();

-- Backfill missing lead magnets for existing opportunities.
select public.create_lead_magnet_for_opportunity(o.id)
from public.opportunites o
left join public.production_lead_magnets lm on lm.opportunite_id = o.id
where lm.id is null;
