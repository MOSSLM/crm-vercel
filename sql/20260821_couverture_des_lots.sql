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
