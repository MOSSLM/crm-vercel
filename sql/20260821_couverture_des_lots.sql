-- La couverture d'un lot : ce qui manque à ces entreprises, axe par axe.
--
-- POURQUOI SUR LES LOTS ET PAS SUR LES SEGMENTS. Un segment est une requête
-- vivante : son effectif bouge à mesure que l'enrichissement travaille — c'est
-- même le signe qu'il a marché. Lancer un traitement de trois heures sur une
-- population qui change en cours de route donne un résultat que personne ne
-- peut reproduire, et un dénominateur qui bouge sous la mesure. Un lot est une
-- photo : sa composition est écrite, ligne par ligne, dans `lots_entreprises`.
-- On mesure et on traite le lot ; le segment sert à le fabriquer.
--
-- UNE SEULE FONCTION POUR TOUS LES LOTS. Une requête par lot ferait N
-- allers-retours pour un écran qui les compare — et c'est la comparaison qui
-- est le sujet : lequel de mes lots est le plus près d'être attaquable.
--
-- LES SEPT AXES SUIVENT L'ORDRE DU PLAN DE LISSAGE, et ce n'est pas cosmétique :
-- sans SIRET on ne sait pas qui c'est, sans identité on ne cherche pas son
-- site, sans constat on ne sait pas quoi lui promettre, sans démo on ne peut
-- pas la lui montrer. L'écran lit cet ordre pour dire le PROCHAIN geste.
--
-- Contrôles à relire après application :
--   select * from couverture_des_lots();
--   -- chaque `total` doit égaler count(*) de lots_entreprises pour ce lot.

create or replace function couverture_des_lots()
returns table (
  lot_id            bigint,
  nom               text,
  note              text,
  cree_le           timestamptz,
  total             bigint,
  avec_siret        bigint,
  avec_donnees      bigint,
  avec_constat      bigint,
  avec_demo         bigint,
  avec_audit        bigint,
  avec_proprietaire bigint,
  en_sequence       bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.nom,
    l.note,
    l.cree_le,
    count(le.entreprise_id) as total,
    count(*) filter (where e.siret is not null)                    as avec_siret,
    count(*) filter (where dp.entreprise_id is not null)            as avec_donnees,
    count(*) filter (where cp.entreprise_id is not null)            as avec_constat,
    count(*) filter (where si.enterprise_id is not null)            as avec_demo,
    count(*) filter (where au.entreprise_id is not null)            as avec_audit,
    count(*) filter (where e.owner_id is not null)                  as avec_proprietaire,
    count(*) filter (where se.entreprise_id is not null)            as en_sequence
  from lots l
  left join lots_entreprises le on le.lot_id = l.id
  left join entreprises e on e.id = le.entreprise_id
  -- Chaque axe est une EXISTENCE, jamais un compte de lignes filles : une
  -- entreprise avec trois constats n'est pas trois fois couverte.
  left join lateral (
    select 1 as entreprise_id from entreprises_donnees_publiques x
     where x.entreprise_id = e.id limit 1) dp on true
  left join lateral (
    select 1 as entreprise_id from constats_presence x
     where x.entreprise_id = e.id limit 1) cp on true
  left join lateral (
    select 1 as enterprise_id from sites x
     where x.enterprise_id = e.id and x.is_published
       and coalesce(x.is_template, false) = false limit 1) si on true
  left join lateral (
    select 1 as entreprise_id from audits a
     join opportunites o on o.id::text = a.opportunite_id
     where o.entreprise_id = e.id and a.statut = 'ready' limit 1) au on true
  left join lateral (
    select 1 as entreprise_id from sequence_enrollments x
     where x.entreprise_id = e.id and x.status in ('active','paused') limit 1) se on true
  group by l.id, l.nom, l.note, l.cree_le
  order by l.cree_le desc;
$$;

grant execute on function couverture_des_lots() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Le CONTENU d'un lot : une ligne par entreprise, avec son étape de séquence.
--
-- POURQUOI UNE SECONDE FONCTION PLUTÔT QU'UNE JOINTURE DEPUIS L'APPEL. La
-- couverture agrège, celle-ci détaille : elles n'ont ni la même cardinalité ni
-- la même fréquence d'appel. L'écran des lots charge la première à l'ouverture ;
-- la seconde ne part QUE quand on déplie une ligne. Les fondre ferait payer le
-- détail de tous les lots à chaque affichage.
--
-- L'INSCRIPTION RETENUE EST LA PLUS RÉCEMMENT TOUCHÉE. Une entreprise peut en
-- porter plusieurs — S1 close, S2 en cours. Prendre la première venue
-- afficherait l'étape d'une séquence terminée, donc une position fausse.
--
-- `garee` est DÉRIVÉ, jamais stocké : active, sans échéance. C'est exactement
-- ce que le régulateur ignore (`.lte('next_run_at', ...)` ne retient jamais un
-- NULL), et le dire ici évite d'inventer une colonne d'état de plus.
--
-- Contrôles à relire après application :
--   select count(*) from contenu_du_lot(<id>, 20000, 0);
--   -- doit égaler le `total` que `couverture_des_lots()` annonce pour ce lot.

create or replace function contenu_du_lot(p_lot_id bigint, p_limite int default 500, p_decalage int default 0)
returns table (
  entreprise_id bigint, nom text, ville text,
  a_siret boolean, a_donnees boolean, a_constat boolean, a_demo boolean, a_audit boolean,
  proprietaire text,
  sequence text, etape text, etape_genre text, rang int,
  inscription_statut text, hold_reason text, next_run_at timestamptz, garee boolean,
  tache_genre text, tache_echeance timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    e.id, e.name, e.ville,
    e.siret is not null,
    dp.x is not null, cp.x is not null, si.x is not null, au.x is not null,
    coalesce(up.full_name, up.email),
    a.name,
    a.definition->'steps'->en.current_step->>'id',
    a.definition->'steps'->en.current_step->>'kind',
    en.current_step,
    en.status, en.hold_reason, en.next_run_at,
    en.id is not null and en.next_run_at is null and en.status = 'active',
    t.kind, t.due_at
  from lots_entreprises le
  join entreprises e on e.id = le.entreprise_id
  left join user_profiles up on up.id = e.owner_id
  left join lateral (select 1 as x from entreprises_donnees_publiques y where y.entreprise_id = e.id limit 1) dp on true
  left join lateral (select 1 as x from constats_presence y where y.entreprise_id = e.id limit 1) cp on true
  left join lateral (select 1 as x from sites y where y.enterprise_id = e.id and y.is_published
                       and coalesce(y.is_template,false) = false limit 1) si on true
  left join lateral (select 1 as x from audits y join opportunites o on o.id::text = y.opportunite_id
                      where o.entreprise_id = e.id and y.statut = 'ready' limit 1) au on true
  left join lateral (select * from sequence_enrollments y
                      where y.entreprise_id = e.id and y.status in ('active','paused')
                      order by y.updated_at desc limit 1) en on true
  left join automations a on a.id = en.automation_id
  left join lateral (select * from prospection_tasks y
                      where y.entreprise_id = e.id and y.status in ('pending','snoozed')
                      order by y.due_at asc limit 1) t on true
  where le.lot_id = p_lot_id
  order by e.name
  limit p_limite offset p_decalage;
$$;

grant execute on function contenu_du_lot(bigint,int,int) to authenticated, service_role;
