-- Un seul dossier lead magnet par entreprise.
--
-- POURQUOI
-- `lead_magnet_projects` portait une ligne par OPPORTUNITÉ : le trigger
-- `ensure_lead_magnet_project_for_opportunity` insère à chaque deal créé, avec
-- `on conflict (opportunite_id)`. Rien n'était unique sur `entreprise_id`.
-- Or tout ce que cette table stocke est par ENTREPRISE — chiffres clés, logo,
-- ville SEO, tags de service, avis, et le site démo qui les lit. Attribuer un
-- prospect à un agent ouvre un second deal (pipeline « Agent SAMA ») quand
-- l'entreprise n'en avait que dans un autre pipeline : un second dossier vide
-- naissait alors, et l'information se répartissait entre les deux lignes selon
-- la carte utilisée. Symptôme vécu : des chiffres clés bien saisis sur la fiche
-- et absents du site, qui lisait l'autre ligne.
--
-- CE QUE FAIT CETTE MIGRATION
--   1. le trigger RÉUTILISE le dossier de l'entreprise au lieu d'en créer un
--      second — l'entreprise garde ses deux deals, mais un seul dossier ;
--   2. un index unique sur `entreprise_id` rend le doublon impossible.
--
-- ORDRE D'APPLICATION — IMPORTANT
--   1. GET  /api/marketing-pipeline/merge-duplicate-projects        (état des lieux)
--   2. POST /api/marketing-pipeline/merge-duplicate-projects  {}     (simulation)
--   3. POST /api/marketing-pipeline/merge-duplicate-projects  {"dryRun": false}
--   4. cette migration.
--
-- L'index unique de l'étape 2 ÉCHOUE tant qu'il reste deux lignes pour une même
-- entreprise (`ERROR: 23505 … Key (entreprise_id)=(2743) is duplicated`). C'est
-- voulu : mieux vaut refuser l'index que perdre des données en douce.
--
-- Pour voir quelles entreprises bloquent, sans rien modifier :
--
--   select entreprise_id, count(*) as dossiers, array_agg(id) as project_ids
--     from public.lead_magnet_projects
--    where entreprise_id is not null
--    group by entreprise_id
--   having count(*) > 1
--    order by count(*) desc;

-- ---------------------------------------------------------------------------
-- 1. Le trigger réutilise le dossier existant de l'entreprise
-- ---------------------------------------------------------------------------
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

  -- Un dossier existe déjà pour cette entreprise : on le réutilise. On ne
  -- réécrit surtout pas son `opportunite_id` — le dossier reste rattaché à
  -- l'opportunité qui l'a créé, et les écrans historiques qui lisent cette
  -- colonne continuent de fonctionner.
  select id into v_project_id
  from public.lead_magnet_projects
  where entreprise_id = new.entreprise_id
  order by
    -- même classement que le code applicatif (resolve-project-id.ts) :
    -- validé, puis prêt, puis avancé, puis récent.
    (coalesce(enrichment_validated, false)) desc,
    (coalesce(pret_pour_lm, false)) desc,
    (statut in ('framer', 'ready', 'published')) desc,
    updated_at desc nulls last,
    created_at desc nulls last,
    id asc
  limit 1;

  if v_project_id is null then
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
  elsif coalesce(new.lead_magnet, false) then
    -- Le deal est marqué « prêt pour LM » : le dossier de l'entreprise le
    -- devient aussi. On ne rétrograde jamais dans l'autre sens.
    update public.lead_magnet_projects
       set pret_pour_lm = true,
           statut = case when statut = 'draft' then 'ready' else statut end
     where id = v_project_id
       and coalesce(pret_pour_lm, false) = false;
  end if;

  perform public.lm_create_default_pages(v_project_id, new.entreprise_id);
  perform public.lm_sync_reviews_for_project(v_project_id);

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Le doublon devient impossible
--    (échoue tant que la fusion n'a pas été passée — c'est le garde-fou)
-- ---------------------------------------------------------------------------
create unique index if not exists lead_magnet_projects_entreprise_unique
  on public.lead_magnet_projects (entreprise_id)
  where entreprise_id is not null;
