-- Le décompte d'une campagne, en une ligne par campagne.
--
-- POURQUOI UNE VUE PLUTÔT QU'UNE LECTURE EN MÉMOIRE
-- L'écran de liste des campagnes affiche, pour chacune : combien de leads en
-- tout, combien attendent d'être lancés, combien sont inscrits, combien sont
-- écartés. Le faire côté Node oblige à ramener UNE LIGNE PAR LEAD pour n'en
-- garder qu'un compte — sur une campagne de 10 000 prospects, c'est une page
-- qui met dix secondes à s'ouvrir pour afficher quatre nombres.
--
-- `security_invoker` : la vue n'accorde rien de plus que la table qu'elle lit.
-- `campagne_leads` a RLS active sans policy — seule la clé de service passe, et
-- la vue doit garder cette règle plutôt que la contourner.
--
-- Appliquée en production le 19/08/2026 via execute_sql. Idempotente.

create or replace view public.v_campagne_leads_compte
with (security_invoker = true) as
select
  automation_id,
  count(*)                                          as total,
  count(*) filter (where statut = 'a_lancer')       as a_lancer,
  count(*) filter (where statut = 'inscrit')        as inscrits,
  count(*) filter (where statut = 'ecarte')         as ecartes,
  count(*) filter (where statut = 'termine')        as termines,
  count(*) filter (where statut = 'ecarte'
                     and motif_ecart in ('sans_canal', 'public_non_atteint',
                                         'deja_inscrit', 'sans_affaire')) as ecartes_rattrapables,
  max(ajoute_le)                                    as dernier_ajout
from public.campagne_leads
group by automation_id;

comment on view public.v_campagne_leads_compte is
  'Décompte par campagne des lignes de campagne_leads. La liste des motifs rattrapables est le miroir SQL de ecartRattrapable() (src/lib/automations/campagne.ts) : si l''une bouge, l''autre doit bouger.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôle à lire après application
-- ─────────────────────────────────────────────────────────────────────────────
-- select * from public.v_campagne_leads_compte;   -- vide tant qu'aucune campagne n'a de liste

-- ─────────────────────────────────────────────────────────────────────────────
-- Le décompte des INSCRIPTIONS de la campagne — l'autre moitié de l'écran
-- ─────────────────────────────────────────────────────────────────────────────
--
-- La liste dit qui doit partir ; celle-ci dit ce que sont devenus ceux qui sont
-- partis. Deux vues plutôt qu'une jointure : `campagne_leads` peut être vide
-- alors que 153 inscriptions vivent déjà (c'est exactement l'état du parc au
-- 19/08/2026), et l'écran doit savoir le dire.
--
-- TROIS COLONNES QUI VALENT PLUS QUE LEUR CALCUL
--
--   ont_repondu          Lit `vars.replies`, et NULLE PART AILLEURS.
--                        `sales_pipeline_state.replied` vaut false sur 153
--                        lignes sur 153 alors que 62 inscriptions portent une
--                        réponse. Miroir SQL d'`aRepondu()` (campagne-db.ts) :
--                        si l'une bouge, l'autre doit bouger.
--
--   attente_sans_reveil  Les inscriptions garées sur une attente-réponse que
--                        PLUS RIEN ne réveillera (`replyTimeoutDays: 0` →
--                        `next_run_at = null`). C'est LE compteur qui manquait :
--                        59 inscriptions ont dormi des semaines sans que rien,
--                        nulle part, ne le montre.
--
--   enlisees             Ni réveil, ni motif de gel, ni tâche en attente :
--                        invisibles partout. Une inscription sans réveil qui
--                        attend une tâche manuelle est NORMALE — 33 des 34
--                        candidates le sont — et n'entre pas dans ce compte.
--                        Il en reste une, dont la tâche a été close le 13/08
--                        sans que l'inscription avance. C'est la bonne taille
--                        pour ce compteur : il doit valoir zéro.

drop view if exists public.v_campagne_inscriptions;

create view public.v_campagne_inscriptions
with (security_invoker = true) as
select
  e.automation_id,
  count(*)                                                                as inscriptions,
  count(*) filter (where e.status in ('active','paused'))                 as vivantes,
  count(*) filter (where e.status = 'active')                             as actives,
  count(*) filter (where jsonb_typeof(e.vars->'replies') = 'object'
                     and e.vars->'replies' <> '{}'::jsonb)                as ont_repondu,
  count(*) filter (where e.hold_reason is not null)                       as gelees,
  count(*) filter (where e.hold_reason = 'awaiting_reply'
                     and e.next_run_at is null)                           as attente_sans_reveil,
  count(*) filter (where e.status = 'active' and e.next_run_at is null
                     and e.hold_reason is null and t.en_attente = 0)      as enlisees,
  min(e.next_run_at) filter (where e.status = 'active')                   as prochain_reveil,
  max(e.last_email_at)                                                    as dernier_email
from public.sequence_enrollments e
left join lateral (
  select count(*) as en_attente
  from public.prospection_tasks t
  where t.enrollment_id = e.id and t.status in ('pending','snoozed')
) t on true
group by e.automation_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôle lu après application, le 19/08/2026 — la vue dit vrai
-- ─────────────────────────────────────────────────────────────────────────────
-- inscriptions 153 · vivantes 132 · ont_repondu 62 · gelees 93
-- attente_sans_reveil 59  ← les 59 connues, retrouvées sans les chercher
-- enlisees 1              ← « Adiana Services » (entreprise 3275) : tâche close
--                            le 13/08 à 11 h 01, inscription restée à l'étape 0.
--                            À traiter avec le dégel des 59, même dry-run.
