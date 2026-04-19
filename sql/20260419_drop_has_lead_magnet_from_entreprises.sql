-- Move the lead_magnet flag off the entreprises table.
-- The lead_magnet state now lives only on public.opportunites.lead_magnet
-- (mirrored by lead_magnet_projects.pret_pour_lm). Having the same flag on
-- entreprises was redundant and created an impossible-to-keep-in-sync source
-- of truth (a company has many opportunities; the readiness is per deal).

-- 1) Rewrite the trigger function so it no longer updates entreprises.has_lead_magnet.
create or replace function public.ensure_lead_magnet_project_for_opportunity()
returns trigger
language plpgsql
as $function$
declare
  v_project_id uuid;
begin
  if new.entreprise_id is null then
    return new;
  end if;

  insert into public.lead_magnet_projects (
    opportunite_id,
    entreprise_id,
    pret_pour_lm,
    statut,
    meta_title_default,
    meta_description_default
  )
  values (
    new.id,
    new.entreprise_id,
    coalesce(new.lead_magnet, false),
    case when coalesce(new.lead_magnet, false) then 'ready' else 'draft' end,
    null,
    null
  )
  on conflict (opportunite_id) do update
    set entreprise_id = excluded.entreprise_id
  returning id into v_project_id;

  perform public.lm_create_default_pages(v_project_id, new.entreprise_id);
  perform public.lm_sync_reviews_for_project(v_project_id);

  return new;
end;
$function$;

-- 2) Drop the column from entreprises.
alter table public.entreprises
  drop column if exists has_lead_magnet;
