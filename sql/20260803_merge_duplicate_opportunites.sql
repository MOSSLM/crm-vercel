-- Fusion des opportunités en double : une entreprise = une affaire.
--
-- POURQUOI
-- `assignProspectToAgent` ne cherchait une affaire réutilisable que dans le
-- pipeline « Agent SAMA », et seulement si elle appartenait déjà à l'agent ou à
-- personne. Une entreprise dont l'affaire vivait dans « Streak Mars/Avril »
-- n'avait donc aucun candidat : l'attribution ouvrait une SECONDE affaire.
-- Attribuer 47 entreprises le 3 août a produit 47 doublons d'un coup — chacun
-- déclenchant en plus `opportunity_created`, donc ses automatisations.
--
-- C'est la cause de ce que `sql/20260731_one_lead_magnet_project_per_company.sql`
-- avait traité un cran plus bas : on y avait réparé le symptôme (dossier lead
-- magnet en double) sans réparer la cause (l'affaire en double).
--
-- CE QUE FAIT CETTE MIGRATION
-- Elle installe `public.merge_duplicate_opportunites()`, qui pour chaque
-- entreprise portant plus d'une affaire :
--   1. désigne comme SURVIVANTE la PLUS ANCIENNE — celle qui porte l'historique
--      (montant négocié, notes, audits, inscriptions en séquence) ;
--   2. complète les colonnes vides de la survivante avec celles des doublons —
--      jamais l'inverse, une valeur déjà saisie n'est jamais écrasée ;
--   3. REPOINTE VERS LA SURVIVANTE toutes les lignes filles des doublons, en
--      parcourant le CATALOGUE POSTGRES (`pg_constraint`) plutôt qu'une liste
--      écrite à la main : les dossiers lead magnet, pages, avis et contenus, les
--      audits, les tâches, les inscriptions en séquence, les appels, les
--      événements d'agenda… tout ce qui référence `opportunites(id)` suit, y
--      compris les tables absentes du dossier `sql/` ;
--   4. supprime les doublons devenus vides.
--
-- SANS PERTE DE DONNÉES : rien n'est supprimé avant que ses lignes filles aient
-- été rattachées à la survivante. Une ligne fille qui entre en collision avec un
-- index unique (la survivante possède déjà son équivalent : `sales_pipeline_state`
-- a `opportunite_id` en clé primaire, `lead_magnet_projects` un unique) est
-- supprimée APRÈS que la version de la survivante a été constatée — on ne perd
-- que du dérivé, jamais de l'unique.
--
-- ORDRE D'APPLICATION
--   1. cette migration (installe la fonction, ne modifie aucune donnée) ;
--   2. select * from public.merge_duplicate_opportunites();            -- simulation
--   3. select * from public.merge_duplicate_opportunites(p_dry_run => false);
--   4. sql/20260803_one_opportunity_per_company.sql                    -- index unique
--
-- L'étape 4 ÉCHOUE tant qu'il reste un doublon. C'est voulu : mieux vaut refuser
-- l'index que perdre des données en douce.
--
-- Pour voir l'état des lieux sans rien modifier :
--
--   select entreprise_id, count(*) as affaires, array_agg(id) as opportunite_ids
--     from public.opportunites
--    where entreprise_id is not null and coalesce(is_test, false) = false
--    group by entreprise_id
--   having count(*) > 1
--    order by count(*) desc;

create or replace function public.merge_duplicate_opportunites(
  p_dry_run boolean default true,
  -- Déplace la survivante dans le pipeline « Agent SAMA » quand l'entreprise est
  -- attribuée à un agent. `false` par défaut : l'affaire garde son pipeline et
  -- son étape d'origine, donc son avancement réel. Passer `true` reproduit le
  -- rangement de l'ancienne attribution, au prix de la position dans le pipeline
  -- historique.
  p_move_to_agent_pipeline boolean default false
)
returns table (
  entreprise_id bigint,
  survivor_id uuid,
  merged_ids uuid[],
  rows_repointed bigint,
  rows_dropped bigint,
  moved_to_agent_pipeline boolean
)
language plpgsql
as $function$
declare
  g               record;
  fk              record;
  v_ctids         tid[];
  v_ctid          tid;
  v_survivor      uuid;
  v_losers        uuid[];
  v_moved         bigint;
  v_dropped       bigint;
  v_count         bigint;
  v_agent_pipe    uuid;
  v_agent_stage   integer;
  v_owner         uuid;
  v_moved_pipe    boolean;
begin
  select p.id into v_agent_pipe from public.pipelines p where p.nom = 'Agent SAMA';
  if v_agent_pipe is not null then
    select e.id into v_agent_stage
      from public.etapes_pipeline e
     where e.pipeline_id = v_agent_pipe
     order by e.ordre asc
     limit 1;
  end if;

  for g in
    select o.entreprise_id                            as ent,
           array_agg(o.id order by o.created_at asc, o.id asc) as ids
      from public.opportunites o
     where o.entreprise_id is not null
       and coalesce(o.is_test, false) = false
     group by o.entreprise_id
    having count(*) > 1
     order by o.entreprise_id
  loop
    -- La plus ancienne survit : c'est elle qui porte l'histoire du prospect.
    v_survivor := g.ids[1];
    v_losers   := g.ids[2:array_length(g.ids, 1)];
    v_moved    := 0;
    v_dropped  := 0;
    v_moved_pipe := false;

    if not p_dry_run then
      -- 1. Le survivant récupère ce qu'il n'a pas. `coalesce` ne remplit que les
      --    trous : une valeur déjà présente sur le survivant est intouchable.
      update public.opportunites s
         set contact_id              = coalesce(s.contact_id, d.contact_id),
             name                    = coalesce(s.name, d.name),
             montant                 = coalesce(s.montant, d.montant),
             priorite                = coalesce(s.priorite, d.priorite),
             type                    = coalesce(s.type, d.type),
             mrr                     = coalesce(s.mrr, d.mrr),
             recurrence_months       = coalesce(s.recurrence_months, d.recurrence_months),
             note_base               = coalesce(s.note_base, d.note_base),
             date_prochain_suivi     = coalesce(s.date_prochain_suivi, d.date_prochain_suivi),
             offre_id                = coalesce(s.offre_id, d.offre_id),
             offre_nom_snapshot      = coalesce(s.offre_nom_snapshot, d.offre_nom_snapshot),
             offre_prix_ht_snapshot  = coalesce(s.offre_prix_ht_snapshot, d.offre_prix_ht_snapshot),
             offre_devise_snapshot   = coalesce(s.offre_devise_snapshot, d.offre_devise_snapshot),
             -- `tags` et `flags` passent par une sous-requête scalaire, pas par
             -- `array_agg(...)[1]` : agréger une colonne TABLEAU (`tags` est un
             -- `text[]`) donne un tableau à deux dimensions, dont l'indice `[1]`
             -- rend un `text` — d'où « COALESCE types text[] and text cannot be
             -- matched ». Le type de la colonne est ici préservé quel qu'il soit.
             tags = coalesce(s.tags, (
               select o2.tags from public.opportunites o2
                where o2.id = any(v_losers) and o2.tags is not null
                order by o2.created_at asc, o2.id asc limit 1)),
             flags = coalesce(s.flags, (
               select o2.flags from public.opportunites o2
                where o2.id = any(v_losers) and o2.flags is not null
                order by o2.created_at asc, o2.id asc limit 1)),
             -- Un drapeau d'avancement ne redescend jamais.
             lead_magnet             = coalesce(s.lead_magnet, false) or coalesce(d.lead_magnet, false)
        from (
          select (array_agg(contact_id)             filter (where contact_id is not null))[1]             as contact_id,
                 (array_agg(name)                   filter (where name is not null))[1]                   as name,
                 (array_agg(montant)                filter (where montant is not null))[1]                as montant,
                 (array_agg(priorite)               filter (where priorite is not null))[1]               as priorite,
                 (array_agg(type)                   filter (where type is not null))[1]                   as type,
                 (array_agg(mrr)                    filter (where mrr is not null))[1]                    as mrr,
                 (array_agg(recurrence_months)      filter (where recurrence_months is not null))[1]      as recurrence_months,
                 (array_agg(note_base)              filter (where note_base is not null))[1]              as note_base,
                 (array_agg(date_prochain_suivi)    filter (where date_prochain_suivi is not null))[1]    as date_prochain_suivi,
                 (array_agg(offre_id)               filter (where offre_id is not null))[1]               as offre_id,
                 (array_agg(offre_nom_snapshot)     filter (where offre_nom_snapshot is not null))[1]     as offre_nom_snapshot,
                 (array_agg(offre_prix_ht_snapshot) filter (where offre_prix_ht_snapshot is not null))[1] as offre_prix_ht_snapshot,
                 (array_agg(offre_devise_snapshot)  filter (where offre_devise_snapshot is not null))[1]  as offre_devise_snapshot,
                 bool_or(coalesce(lead_magnet, false))                                                    as lead_magnet
            from public.opportunites
           where id = any(v_losers)
        ) d
       where s.id = v_survivor;
    end if;

    -- 2. Toutes les lignes filles suivent le survivant.
    --
    -- La liste des tables vient du CATALOGUE, pas d'une énumération écrite à la
    -- main : `sql/` ne contient que des migrations, le schéma complet (audits,
    -- lead_magnet_pages, lead_magnet_content, lead_magnet_reviews…) y est
    -- partiellement absent. Toute table qui référence `opportunites(id)` est
    -- traitée, aujourd'hui comme demain.
    for fk in
      select c.conrelid::regclass::text as child_table,
             a.attname::text            as child_column
        from pg_constraint c
        join lateral unnest(c.conkey) as k(attnum) on true
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
       where c.contype = 'f'
         and c.confrelid = 'public.opportunites'::regclass
         and array_length(c.conkey, 1) = 1
    loop
      if p_dry_run then
        -- Simulation : on compte ce qui SERAIT repointé, en cumulant table après
        -- table (une affectation directe écraserait le total à chaque FK).
        execute format(
          'select count(*) from %s where %I = any($1)',
          fk.child_table, fk.child_column
        ) into v_count using v_losers;
        v_moved := v_moved + coalesce(v_count, 0);
      else
        -- Ligne par ligne, par `ctid` : le nom de la clé primaire de la table
        -- fille est inconnu, et un UPDATE en bloc échouerait entièrement sur la
        -- première collision d'index unique — ce qui bloquerait toute la fusion.
        --
        -- Les `ctid` sont FIGÉS AVANT la moindre écriture : on modifie la table
        -- qu'on parcourt, et un `ctid` change à chaque UPDATE. Boucler sur un
        -- curseur ouvert sur cette même table reviendrait à scier la branche.
        execute format(
          'select coalesce(array_agg(ctid), ''{}''::tid[]) from %s where %I = any($1)',
          fk.child_table, fk.child_column
        ) into v_ctids using v_losers;

        foreach v_ctid in array v_ctids
        loop
          begin
            execute format(
              'update %s set %I = $1 where ctid = $2',
              fk.child_table, fk.child_column
            ) using v_survivor, v_ctid;
            v_moved := v_moved + 1;
          exception when unique_violation then
            -- Le survivant possède déjà son équivalent (état de pipeline, dossier
            -- lead magnet, page par défaut…). La ligne du doublon est dérivée :
            -- la supprimer ne perd rien d'unique.
            execute format('delete from %s where ctid = $1', fk.child_table)
              using v_ctid;
            v_dropped := v_dropped + 1;
          end;
        end loop;
      end if;
    end loop;

    -- 3. Rangement optionnel dans le pipeline agent, pour les prospects attribués.
    select o.owner_id into v_owner from public.opportunites o where o.id = v_survivor;
    if p_move_to_agent_pipeline
       and v_owner is not null
       and v_agent_pipe is not null
       and v_agent_stage is not null then
      v_moved_pipe := true;
      if not p_dry_run then
        -- `stage_id` suffit : `trg_sync_opportunity_pipeline_from_stage` en dérive
        -- `pipeline_id`. On les écrit tous les deux pour que l'intention soit lisible.
        update public.opportunites
           set pipeline_id = v_agent_pipe,
               stage_id    = v_agent_stage
         where id = v_survivor;
      end if;
    end if;

    -- 4. Les doublons, désormais sans aucune ligne fille, disparaissent.
    if not p_dry_run then
      delete from public.opportunites where id = any(v_losers);
    end if;

    entreprise_id           := g.ent;
    survivor_id             := v_survivor;
    merged_ids              := v_losers;
    rows_repointed          := v_moved;
    rows_dropped            := v_dropped;
    moved_to_agent_pipeline := v_moved_pipe;
    return next;
  end loop;
end;
$function$;

comment on function public.merge_duplicate_opportunites(boolean, boolean) is
  'Fusionne les opportunités en double d''une même entreprise sur la plus ancienne, '
  'en repointant toutes les lignes filles via pg_constraint. Simulation par défaut.';
