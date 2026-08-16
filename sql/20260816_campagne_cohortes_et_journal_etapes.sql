-- Campagne du 17 au 26 août 2026 — de quoi mesurer l'entonnoir, et par cohorte.
--
-- POURQUOI CE FICHIER EXISTE
-- Le CRM ne sait pas dire où il perd. `opportunites` ne porte que `created_at` et
-- `updated_at` : aucune date de passage d'étape. `pipeline_events` a 18 lignes,
-- toutes écrites le 10/04/2026 entre 16h15 et 16h17, et n'est plus alimentée.
-- Résultat mesuré le 16/08 : 329 opportunités garées sur « Qualifié », zéro sur
-- RDV, devis, signature ou perte. Un tel état ne se distingue pas d'un pipeline
-- qui marche mais dont personne n'a bougé les cartes.
--
-- La campagne compare deux cohortes AU MÊME ÂGE (J+1, J+3, J+7, J+14). Comparer
-- à date fixe opposerait cinq jours de relances à un seul. Il faut donc deux
-- choses qui n'existent pas : à quelle cohorte appartient une entreprise, et
-- quand elle a été touchée pour la première fois.
--
-- Tout ici est ADDITIF : aucune colonne existante n'est modifiée, aucune ligne
-- n'est supprimée. Le rollback est dans ROLLBACK_20260816_campagne_cohortes.sql.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. La cohorte et la première touche, sur l'entreprise
-- ─────────────────────────────────────────────────────────────────────────────
-- Portées par `entreprises` et non par `opportunites` parce qu'on démarche une
-- entreprise avant qu'elle ait une affaire : l'étage « ciblée » du futur
-- entonnoir précède la création de l'opportunité.

alter table public.entreprises
  add column if not exists cohorte_demarchage text,
  add column if not exists premiere_touche_le timestamptz;

comment on column public.entreprises.cohorte_demarchage is
  'Cohorte de la campagne du 17-26/08/2026 : A_site_faible ou B_sans_site. Null hors campagne.';
comment on column public.entreprises.premiere_touche_le is
  'Horodatage de la PREMIÈRE touche sortante. Socle de la comparaison des cohortes au même âge : sans lui on compare des groupes d''âges différents.';

-- Partiel : 600 lignes marquées sur 60 000, un index plein coûterait plus qu'il
-- ne rapporte.
create index if not exists entreprises_cohorte_demarchage_idx
  on public.entreprises (cohorte_demarchage)
  where cohorte_demarchage is not null;

create index if not exists entreprises_premiere_touche_idx
  on public.entreprises (premiere_touche_le)
  where premiere_touche_le is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Les quotas quotidiens de démarchage, réglables sans redéploiement
-- ─────────────────────────────────────────────────────────────────────────────
-- `DAILY_QUOTA = {call:20, whatsapp:20, linkedin:20}` était une constante du
-- code : la file plafonnait donc à 60 entreprises par jour quand la campagne en
-- vise 100. Une constante ne se change pas un lundi matin.
-- Null = on retombe sur le défaut du code, qui reste la référence.

alter table public.agent_settings
  add column if not exists quotas_demarchage jsonb;

comment on column public.agent_settings.quotas_demarchage is
  'Quotas quotidiens de premiers contacts par canal, ex. {"call":20,"whatsapp":60,"linkedin":20}. Null = défaut du code.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Le journal des passages d'étape
-- ─────────────────────────────────────────────────────────────────────────────
-- ON STOCKE LE `stage_id` BRUT, PAS UN RÔLE.
-- Le classement d'une étape en nouveau/approche/rdv/perdu… vit déjà dans
-- `stageRole()` (src/lib/opportunites/stage-roles.ts), testé, et il évolue —
-- « Lost » vient d'y être ajouté. Le recopier ici en SQL créerait deux vérités
-- qui divergeraient au premier renommage d'étape. Le journal date les faits ;
-- le sens se donne à la lecture.
--
-- Et c'est aussi pourquoi on n'utilise pas `pipeline_events` : sa colonne
-- `stage` est un enum figé (lead_trouve…acompte) qui ne sait pas exprimer une
-- perte. Or la perte est justement ce qu'on veut mesurer.
--
-- `stage_id` est un SMALLINT dans `opportunites` — pas un uuid.

create table if not exists public.opportunite_etapes_journal (
  id              bigserial primary key,
  opportunite_id  uuid     not null references public.opportunites(id) on delete cascade,
  entreprise_id   bigint,
  owner_id        uuid,
  stage_avant     smallint,
  stage_apres     smallint not null,
  survenu_le      timestamptz not null default now()
);

comment on table public.opportunite_etapes_journal is
  'Un passage d''étape = une ligne datée. La seule source possible d''une durée ou d''une déperdition datée dans ce CRM.';

create index if not exists opportunite_etapes_journal_opp_idx
  on public.opportunite_etapes_journal (opportunite_id, survenu_le);
create index if not exists opportunite_etapes_journal_date_idx
  on public.opportunite_etapes_journal (survenu_le);
create index if not exists opportunite_etapes_journal_ent_idx
  on public.opportunite_etapes_journal (entreprise_id);

-- RLS active sans policy : seule la clé de service lit, comme pour
-- `prospection_tasks`. Le déclencheur est SECURITY DEFINER — sans ça, une
-- écriture d'étape faite par un agent échouerait sur la policy manquante et
-- FERAIT ÉCHOUER LA MISE À JOUR DE L'OPPORTUNITÉ. Le journal doit être invisible
-- quand il tombe, jamais bloquant.
alter table public.opportunite_etapes_journal enable row level security;

create or replace function public.tg_journaliser_etape_opportunite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Une mise à jour qui ne touche pas l'étape n'est pas un passage d'étape.
  -- `is not distinct from` et pas `=` : deux NULL sont ici la même chose.
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    return new;
  end if;

  if new.stage_id is null then
    return new;
  end if;

  insert into public.opportunite_etapes_journal
    (opportunite_id, entreprise_id, owner_id, stage_avant, stage_apres, survenu_le)
  values
    (new.id,
     new.entreprise_id,
     new.owner_id,
     case when tg_op = 'UPDATE' then old.stage_id else null end,
     new.stage_id,
     now());

  return new;
end;
$$;

drop trigger if exists trg_journaliser_etape_opportunite on public.opportunites;
create trigger trg_journaliser_etape_opportunite
  after insert or update of stage_id on public.opportunites
  for each row execute function public.tg_journaliser_etape_opportunite();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Rattrapage : une ligne d'origine par opportunité existante
-- ─────────────────────────────────────────────────────────────────────────────
-- Sans elle, les 363 opportunités déjà en base seraient absentes de l'entonnoir
-- jusqu'à ce que quelqu'un les bouge — c'est-à-dire, pour la plupart, jamais.
-- `stage_avant` reste NULL : on ne sait pas d'où elles venaient, et l'inventer
-- serait pire que l'ignorer. `survenu_le` prend `created_at`, la seule date
-- vraie dont on dispose.

insert into public.opportunite_etapes_journal
  (opportunite_id, entreprise_id, owner_id, stage_avant, stage_apres, survenu_le)
select o.id, o.entreprise_id, o.owner_id, null, o.stage_id, o.created_at
  from public.opportunites o
 where o.stage_id is not null
   and not exists (
     select 1 from public.opportunite_etapes_journal j where j.opportunite_id = o.id
   );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Rattrapage de la première touche
-- ─────────────────────────────────────────────────────────────────────────────
-- La plus ancienne trace sortante réelle par entreprise : une tâche de
-- démarchage bouclée, ou un message journalisé. Une entreprise dont on ne
-- trouve rien reste NULL — « jamais touchée » et « touchée à une date inconnue »
-- ne se confondent pas.

with plus_ancienne as (
  select entreprise_id, min(quand) as quand
    from (
      select entreprise_id, done_at as quand
        from public.prospection_tasks
       where status = 'done' and done_at is not null and entreprise_id is not null
      union all
      select entreprise_id, coalesce(sent_at, created_at) as quand
        from public.email_logs
       where entreprise_id is not null
         and coalesce(blocked_reason, '') = ''
    ) t
   where quand is not null
   group by entreprise_id
)
update public.entreprises e
   set premiere_touche_le = p.quand
  from plus_ancienne p
 where p.entreprise_id = e.id
   and e.premiere_touche_le is null;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôles à lire après application
-- ─────────────────────────────────────────────────────────────────────────────
-- select count(*) from public.opportunite_etapes_journal;                -- ≈ 363
-- select count(*) from public.entreprises where premiere_touche_le is not null;
-- select tgname, tgenabled from pg_trigger
--  where tgrelid = 'public.opportunites'::regclass and not tgisinternal;
