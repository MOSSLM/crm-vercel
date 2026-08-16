-- Les segments : une recherche d'entreprises enregistrée sous un nom.
--
-- POURQUOI CETTE TABLE EXISTE
-- La règle fondamentale de la vision du CRM tient en deux objets qu'il ne faut
-- jamais confondre :
--
--   · un SEGMENT est dynamique. C'est une requête, pas une liste. Une
--     entreprise en sort toute seule dès qu'elle est enrichie — et c'est même
--     le signe que l'enrichissement a marché.
--   · un LOT est figé. La sélection est photographiée à un instant T et ne
--     bouge plus, parce qu'on mesure une campagne dessus. Si le lot suivait les
--     données, le dénominateur changerait sous les pieds de la mesure.
--
-- Le lot existe déjà, en creux : `entreprises.cohorte_demarchage` plus la table
-- `archive_cohortes_20260816`. Le segment, lui, n'existait NULLE PART : chaque
-- sélection faite jusqu'ici était une requête SQL tapée à la main, lancée, puis
-- jetée. Les 600 entreprises des cohortes A et B ont été choisies par des CTE
-- qui ne sont écrites nulle part — impossible de refaire la même sélection, ni
-- même de dire précisément ce qu'elle contenait.
--
-- ON STOCKE LES CRITÈRES, JAMAIS LES RÉSULTATS. C'est toute la différence entre
-- un segment et un lot, et c'est une ligne de code : `criteres jsonb`. Stocker
-- les identifiants trouvés ferait un lot qui s'ignore, et le pire des deux
-- mondes — une liste qui a l'air vivante et qui ne l'est pas.
--
-- LA FORME DES CRITÈRES EST CELLE DE L'URL, volontairement :
--   {"q": texte|null, "flags": [...], "sources": [...]}
-- exactement ce que `/api/entreprises/explorer` accepte en paramètres. Un
-- segment se rejoue donc sans traduction, et le jour où l'explorateur gagne un
-- filtre, les segments existants continuent de marcher sans migration.
--
-- PARTAGÉS, PAS PERSONNELS. `cree_par` note qui l'a écrit, mais tout le monde
-- les voit. À deux, un segment nommé « Sans site + sans fiche Google » est un
-- actif d'équipe : le cloisonner obligerait chacun à le recréer, et on aurait
-- deux définitions du même mot.

begin;

create table if not exists public.segments_entreprises (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  criteres    jsonb not null,
  cree_par    uuid,
  cree_le     timestamptz not null default now(),
  utilise_le  timestamptz
);

comment on table public.segments_entreprises is
  'Une recherche d''entreprises enregistrée sous un nom. DYNAMIQUE : on stocke les CRITÈRES, jamais les résultats — une entreprise entre et sort du segment toute seule quand ses données changent. C''est ce qui la distingue d''un lot figé (entreprises.cohorte_demarchage), dont la population ne bouge plus pour rester mesurable.';

comment on column public.segments_entreprises.criteres is
  'Les critères tels que /api/entreprises/explorer les accepte : {"q":texte|null,"flags":[...],"sources":[...]}. Volontairement la MÊME forme que l''URL, pour qu''un segment se rejoue sans traduction.';

comment on column public.segments_entreprises.utilise_le is
  'Dernière fois qu''on a rejoué ce segment. Un segment jamais rouvert depuis des semaines est un segment à supprimer, pas à garder par politesse.';

-- Le même nom à la casse et aux espaces près est le même segment. Sans cet
-- index, on se retrouve avec « Sans site », « sans site » et « Sans site  » —
-- trois entrées, trois définitions qui divergeront.
create unique index if not exists segments_entreprises_nom_unique
  on public.segments_entreprises (lower(btrim(nom)));

-- RLS active SANS policy : seule la clé de service lit et écrit, comme pour
-- `prospection_tasks` et `opportunite_etapes_journal`. La route qui l'utilise
-- est réservée aux admins — la fonction `chercher_entreprises` qu'un segment
-- rejoue cherche sur tout le corpus, sans filtre de propriétaire.
alter table public.segments_entreprises enable row level security;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôles à lire après application
-- ─────────────────────────────────────────────────────────────────────────────
-- select count(*) from public.segments_entreprises;
-- select relrowsecurity from pg_class where oid = 'public.segments_entreprises'::regclass;  -- t
--
-- Vérifié le 17/08 par sonde, dans une transaction annulée : deux noms qui ne
-- diffèrent que par la casse et les espaces sont bien refusés par l'index.
