-- Les vues de tâches : un filtrage de la file enregistré sous un nom.
--
-- POURQUOI CETTE TABLE EXISTE
-- Le grief est nommé : « page Démarchage trop chargée, trop rigide ; la barre de
-- gauche filtre mal ». Il est mesurable — 659 tâches en attente, dont 640 appels,
-- toutes échues, sur 636 entreprises. Aucun écran ne permet aujourd'hui de dire
-- « montre-moi les appels de la cohorte B que personne n'a rappelés » : on refait
-- le tri à la main, chaque matin, et on le perd chaque soir.
--
-- COPIE CONFORME DE `segments_entreprises`, ET C'EST VOULU. Même forme, mêmes
-- garanties, même invariante : ON STOCKE LES CRITÈRES, JAMAIS LES RÉSULTATS.
-- Une vue nommée « Mes appels du jour » est une QUESTION, pas une liste : la
-- tâche qui devient échue ce matin y entre toute seule, celle qu'on vient de
-- boucler en sort. Stocker les identifiants trouvés ferait une photo qui se
-- croit vivante — le pire des deux mondes, déjà écrit une fois pour les segments.
--
-- LA FORME DES CRITÈRES EST CELLE DU MODULE PUR, volontairement :
--   {"mode":"et"|"ou","filtres":[{"champ":…,"operateur":…,"valeurs":[…]}],
--    "colonnes":[…],"tri":{"colonne":…,"sens":"asc"|"desc"}}
-- exactement ce que `filtrerTaches` (`src/lib/prospection/vue-taches.ts`)
-- accepte. Aucune traduction à écrire, et le jour où un champ s'ajoute, les
-- vues existantes continuent de marcher sans migration.
--
-- PARTAGÉES, PAS PERSONNELLES — même raisonnement que pour les segments. À
-- trois, « Sans réponse J+7 » est un actif d'équipe. `cree_par` note qui l'a
-- écrite ; `agent_id` sert à autre chose : c'est la vue qu'un agent retrouve
-- épinglée sur SON écran, pas un cloisonnement.

begin;

create table if not exists public.vues_taches (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  criteres    jsonb not null,
  /** L'agent pour qui cette vue est épinglée. NULL = vue d'équipe, visible par tous. */
  agent_id    uuid,
  cree_par    uuid,
  cree_le     timestamptz not null default now(),
  utilise_le  timestamptz
);

comment on table public.vues_taches is
  'Un filtrage de la file de prospection enregistré sous un nom. DYNAMIQUE : on stocke les CRITÈRES, jamais les résultats — une tâche entre et sort de la vue toute seule quand son échéance ou son statut change. Copie conforme de segments_entreprises, même invariante.';

comment on column public.vues_taches.criteres is
  'Les critères tels que filtrerTaches() les accepte : {"mode":"et"|"ou","filtres":[…],"colonnes":[…],"tri":{…}}. Volontairement la MÊME forme que le module pur, pour qu''une vue se rejoue sans traduction.';

comment on column public.vues_taches.agent_id is
  'La vue est épinglée sur l''écran de cet agent. NULL = vue d''équipe. Ce n''est PAS un cloisonnement : tout le monde voit toutes les vues, celle-ci apparaît juste en premier chez son agent.';

comment on column public.vues_taches.utilise_le is
  'Dernière fois qu''on a ouvert cette vue. Une vue jamais rouverte depuis des semaines est une vue à supprimer, pas à garder par politesse.';

-- Le même nom à la casse et aux espaces près est la même vue — sans cet index
-- on aurait « Mes appels », « mes appels » et « Mes appels  », trois entrées et
-- trois définitions qui divergeront. Porté sur le couple (agent, nom) : deux
-- agents ont le droit d'appeler chacun la sienne « Ma journée », et
-- `coalesce` fait entrer les vues d'équipe dans le même index.
create unique index if not exists vues_taches_nom_unique
  on public.vues_taches (coalesce(agent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(nom)));

-- RLS active SANS policy : seule la clé de service lit et écrit, comme pour
-- `segments_entreprises` et `prospection_tasks` elle-même. Les routes qui
-- l'utilisent portent leur propre contrôle de rôle.
alter table public.vues_taches enable row level security;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôles à lire après application
-- ─────────────────────────────────────────────────────────────────────────────
-- select count(*) from public.vues_taches;
-- select relrowsecurity from pg_class where oid = 'public.vues_taches'::regclass;  -- t
-- select indexdef from pg_indexes where tablename = 'vues_taches';

-- ─────────────────────────────────────────────────────────────────────────────
-- Les quatre vues de départ
-- ─────────────────────────────────────────────────────────────────────────────
-- « On ne part jamais d'une page blanche » est un principe de lemlist, et c'est
-- celui qui manque le plus à un écran de filtres : personne n'écrit sa première
-- vue devant un tableau vide. Ces quatre-là sont choisies sur ce que la file
-- contient RÉELLEMENT au 20/08/2026 — 640 appels en attente, 626 premiers
-- contacts, 144 tâches dont le prospect a répondu, 698 hors de toute campagne —
-- et pas sur un catalogue théorique. Appliquées en prod le 20/08.

insert into public.vues_taches (nom, criteres) values
('Appels à passer', '{"mode":"et","filtres":[
   {"champ":"canal","operateur":"est","valeurs":["call"]},
   {"champ":"statut","operateur":"est","valeurs":["pending"]}],
   "tri":{"colonne":"echeance","sens":"asc"}}'::jsonb),
('Premiers contacts', '{"mode":"et","filtres":[
   {"champ":"contact","operateur":"est","valeurs":["premier"]},
   {"champ":"statut","operateur":"est","valeurs":["pending"]}],
   "colonnes":["canal","entreprise","cohorte","ville","echeance","agent"],
   "tri":{"colonne":"entreprise","sens":"asc"}}'::jsonb),
('Ont répondu', '{"mode":"et","filtres":[
   {"champ":"reponse","operateur":"est","valeurs":["oui"]}],
   "colonnes":["canal","entreprise","titre","echeance","campagne","statut","reponse"],
   "tri":{"colonne":"echeance","sens":"desc"}}'::jsonb),
('Hors campagne', '{"mode":"et","filtres":[
   {"champ":"campagne","operateur":"vide","valeurs":[]},
   {"champ":"statut","operateur":"est","valeurs":["pending"]}],
   "colonnes":["canal","entreprise","titre","echeance","agent","motif"],
   "tri":{"colonne":"echeance","sens":"asc"}}'::jsonb)
on conflict do nothing;
