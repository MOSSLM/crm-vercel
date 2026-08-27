-- « Qui fait quoi », en un aller-retour — la vue d'équipe de l'admin.
--
-- ── LE PIÈGE QUE CETTE FONCTION ÉVITE : `skipped` NE DIT PAS QUI ─────────
-- Sur les 1 057 lignes de `prospection_tasks` au 27/08, 722 sont `skipped`.
-- Un écran d'équipe qui les compterait comme des gestes d'agent mentirait de
-- 70 % : QUATRE chemins de code écrivent ce statut, et deux ne sont pas humains.
--
--   humains  · PATCH /api/agent/taches        — « écarter » depuis le tableau
--            · PATCH /api/agent/tasks         — idem depuis la file
--   machine  · api/admin/_assign.ts           — réattribution d'un contact
--            · api/agent/demarchage/hors-canal — canal devenu impossible
--            · components/automations/prospection-db — inscription annulée
--
-- AUCUNE COLONNE NE LES DISTINGUE : ni `done_at` (les deux en posent), ni
-- `routing_reason` (nul dans les deux cas). La preuve est dans les données :
-- 706 des 722 sont des tâches `call` sans `routing_reason`, créées du 28/07 au
-- 20/08 — l'abandon en masse du canal téléphone, pas 706 refus d'agents.
--
-- D'où la règle tenue ici : `taches_ecartees` est rendu, mais SÉPARÉ des
-- gestes et nommé « toutes causes ». L'écran ne doit jamais l'additionner au
-- travail fait. Le jour où un `ecarte_par` existera, ce commentaire tombera.
--
-- ── CE QUI COMPTE VRAIMENT COMME UN GESTE ───────────────────────────────
-- `agent_activity_events` : écrite UNIQUEMENT par les routes agent, une ligne
-- par décision (`qualify`, `skip`, `enrich`, `create_site`…). C'est la seule
-- table dont chaque ligne a un auteur humain certain.
--
-- ── AUCUN VERDICT ICI ────────────────────────────────────────────────────
-- La fonction rend des NOMBRES et des DATES, jamais « actif » ou « en
-- sommeil ». Le classement vit dans `src/lib/equipe/activite.ts`, pour la même
-- raison que les seuils de pourrissement d'une affaire : un seuil d'équipe
-- change, et il ne doit pas coûter une migration.
--
-- ── LE JOUR COMMENCE À PARIS ─────────────────────────────────────────────
-- `date_trunc` en UTC ferait basculer « aujourd'hui » à 2 h du matin l'été, et
-- les gestes de fin de soirée compteraient pour la veille. Même règle que
-- `dayStartIso` côté TypeScript.
begin;

create or replace function public.activite_des_agents()
returns table (
  agent_id            uuid,
  nom                 text,
  email               text,
  role                text,
  taches_en_attente   bigint,
  taches_en_retard    bigint,
  taches_reportees    bigint,
  taches_faites_jour  bigint,
  taches_faites_7j    bigint,
  taches_faites_total bigint,
  taches_ecartees     bigint,
  gestes_7j           bigint,
  gestes_total        bigint,
  gestes_par_action   jsonb,
  dernier_signe       timestamptz
)
language sql
stable
-- `search_path` épinglé : cette fonction n'a aucun prédicat à faire reconnaître
-- par un index partiel, contrairement à `chercher_entreprises` — l'épingler ne
-- coûte donc rien et ferme le chemin de recherche de l'appelant.
set search_path to 'public', 'extensions'
as $function$
  with jour as (
    select date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris' as debut
  ),
  membres as (
    select p.id, coalesce(p.full_name, split_part(p.email, '@', 1)) as nom, p.email, p.role
      from public.user_profiles p
     where p.role in ('admin', 'freelance')
  ),
  taches as (
    select t.assignee_id                                                        as id,
           count(*) filter (where t.status = 'pending')                         as en_attente,
           count(*) filter (where t.status = 'pending' and t.due_at < now())    as en_retard,
           count(*) filter (where t.status = 'snoozed')                         as reportees,
           count(*) filter (where t.status = 'done'
                              and t.done_at >= (select debut from jour))        as faites_jour,
           count(*) filter (where t.status = 'done'
                              and t.done_at >= now() - interval '7 days')       as faites_7j,
           count(*) filter (where t.status = 'done')                            as faites_total,
           count(*) filter (where t.status = 'skipped')                         as ecartees,
           max(t.done_at) filter (where t.status = 'done')                      as derniere
      from public.prospection_tasks t
     where t.assignee_id is not null
     group by 1
  ),
  gestes as (
    select e.agent_id                                                        as id,
           count(*) filter (where e.created_at >= now() - interval '7 days') as sur_7j,
           count(*)                                                          as total,
           max(e.created_at)                                                 as dernier
      from public.agent_activity_events e
     group by 1
  ),
  -- Le détail par nature de geste, en DEUX temps : un `group by` sur (agent,
  -- action) puis un `jsonb_object_agg` par agent. Le faire en un seul temps
  -- avec une fenêtre marcherait — `jsonb_object_agg` garde la dernière valeur
  -- d'une clé répétée — mais construirait un objet de 545 paires pour en
  -- rendre 12, et masquerait la duplication au prochain lecteur.
  --
  -- Trente jours : au-delà, ce n'est plus « ce qu'il fait », c'est son
  -- historique — et l'historique a déjà son écran, fiche par fiche.
  detail as (
    select agent_id as id, jsonb_object_agg(action, n) as par_action
      from (
        select agent_id, action, count(*) as n
          from public.agent_activity_events
         where created_at >= now() - interval '30 days'
         group by 1, 2
      ) x
     group by 1
  )
  select m.id,
         m.nom,
         m.email,
         m.role,
         coalesce(t.en_attente, 0),
         coalesce(t.en_retard, 0),
         coalesce(t.reportees, 0),
         coalesce(t.faites_jour, 0),
         coalesce(t.faites_7j, 0),
         coalesce(t.faites_total, 0),
         coalesce(t.ecartees, 0),
         coalesce(g.sur_7j, 0),
         coalesce(g.total, 0),
         coalesce(d.par_action, '{}'::jsonb),
         greatest(t.derniere, g.dernier)
    from membres m
    left join taches t on t.id = m.id
    left join gestes g on g.id = m.id
    left join detail d on d.id = m.id
   order by m.role, m.nom;
$function$;

comment on function public.activite_des_agents() is
  'Une ligne par membre interne : sa file, ce qu''il a terminé, ses gestes journalisés. Rend des nombres, jamais un verdict — le classement vit dans src/lib/equipe/activite.ts. `taches_ecartees` est TOUTES CAUSES : quatre chemins écrivent ce statut, dont deux machines.';

commit;
