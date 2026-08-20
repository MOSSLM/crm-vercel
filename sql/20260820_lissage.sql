-- 20260820_lissage.sql — lisser la base : la file, et le tri-état pour de bon.
--
-- CE QUE ÇA RÉSOUT
-- La base est LARGE ET PEU PROFONDE. Relevé le 20/08/2026 sur 60 726 fiches :
-- 95 % ont un SIRET, mais 4,8 % ont une identité légale rafraîchie, 5,7 % un
-- place_id, 1,2 % un chiffre d'affaires — et **0,5 % un constat de site**.
--
-- LE DÉFAUT LE PLUS GRAVE, ET IL EST DÉJÀ EN PRODUCTION
-- 54 878 fiches portent `rge_rafraichi_le = 2026-08-16 02:17:00.123097+00` :
-- la MÊME estampille à la microseconde près. Un remplissage de masse a écrit
-- « interrogé » sur toute la base sans jamais appeler l'ADEME. Les 2 923 vraies
-- réponses, elles, ont des dates étalées. La base PRÉTEND donc avoir vérifié
-- 57 801 fiches et en a vérifié 2 923.
--
-- Un champ vide aurait été honnête. Une estampille fausse est pire : elle
-- empêche de repasser, parce que tout ce qui trie « les plus anciennes d'abord »
-- les voit comme fraîches. C'est exactement pour ça que ce fichier existe.
--
-- ── CE QU'ON N'A PAS CRÉÉ ─────────────────────────────────────────────────
-- `constats_presence` était DÉJÀ la table tri-état qu'il fallait : elle porte
-- `sujet`, `etat` (present | absent | inconnu), `valeur`, `confiance`, `source`
-- et `preuve`, avec une contrainte qui interdit une valeur sans « present ».
-- Ses 3 041 lignes ne parlent que du site, mais sa contrainte déclarait déjà
-- cinq sujets. Elle n'était pas à refaire — elle était à ÉLARGIR et à utiliser.

-- ── 1. Deux sujets de plus ────────────────────────────────────────────────
alter table public.constats_presence
  drop constraint if exists constats_presence_sujet_check;

alter table public.constats_presence
  add constraint constats_presence_sujet_check
  check (sujet = any (array[
    'site_web'::text, 'fiche_google'::text, 'avis'::text,
    'telephone'::text, 'email'::text,
    'identite'::text, 'rge'::text
  ]));

-- ── 2. La passe : une population figée, un plan ───────────────────────────
create table if not exists public.lissage_passes (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  -- MÊME FORME QUE `segments_entreprises.criteres`, c'est-à-dire l'URL exacte
  -- de /api/entreprises/explorer. Aucune traduction à écrire, et le jour où
  -- l'explorateur gagne un filtre, la passe le gagne aussi.
  criteres jsonb not null default '{}'::jsonb,
  -- Le PlanPasse de `src/lib/lissage/passe.ts` : sujets, exigence de confiance,
  -- outils facturés autorisés, étapes locales autorisées.
  plan jsonb not null default '{}'::jsonb,
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'en_cours', 'en_pause', 'terminee')),
  cree_le timestamptz not null default now(),
  cree_par uuid,
  maj_le timestamptz not null default now()
);

-- ── 3. La file : un prospect, une passe ───────────────────────────────────
create table if not exists public.lissage_leads (
  id bigserial primary key,
  passe_id uuid not null references public.lissage_passes(id) on delete cascade,
  entreprise_id bigint not null references public.entreprises(id) on delete cascade,

  statut text not null default 'a_faire'
    check (statut in ('a_faire', 'en_cours', 'complet', 'sans_prise', 'erreur')),

  -- L'étape proposée, décidée par le module pur. `lieu` sépare ce que le
  -- serveur prend tout seul de ce qui attend une machine locale ou un humain.
  outil text,
  lieu text check (lieu in ('serveur', 'local', 'humain')),

  -- LES OUTILS DÉJÀ TENTÉS SUR CE PROSPECT, dans cette passe. Sans ce tableau,
  -- un outil qui rend « inconnu » — un CAPTCHA, une API muette — serait relancé
  -- indéfiniment sur la même fiche : la file tournerait en rond en ayant l'air
  -- de travailler.
  tentes text[] not null default '{}',

  -- Pourquoi ça s'est arrêté, en toutes lettres. Une ligne qui sort d'une passe
  -- sans être complète et sans motif est exactement le genre de ligne qui dort
  -- trois semaines sans que personne le voie.
  motif text,

  -- LA RÉCLAMATION. `pg_advisory_lock` ne marche pas via PostgREST — la
  -- connexion est rendue au pool aussitôt. On réclame donc par clé primaire et
  -- compteur de tentatives, comme le régulateur, les deux éprouvés en
  -- transaction annulée.
  reclame_par text,
  reclame_le timestamptz,
  tentatives int not null default 0,

  maj_le timestamptz not null default now(),
  unique (passe_id, entreprise_id)
);

create index if not exists lissage_leads_file_idx
  on public.lissage_leads (passe_id, statut);

-- L'index que lit l'exécuteur LOCAL quand Matteo ouvre son localhost : les
-- étapes qui l'attendent, et elles seules.
create index if not exists lissage_leads_local_idx
  on public.lissage_leads (lieu, statut)
  where statut = 'a_faire';

-- ── 4. RLS ────────────────────────────────────────────────────────────────
-- Activée SANS policy : ces deux tables ne se lisent que par la clé de service,
-- donc par les routes. Une table `public` sans RLS est exposée par PostgREST à
-- quiconque a la clé publiable — la règle existe déjà en prod, on la copie.
alter table public.lissage_passes enable row level security;
alter table public.lissage_leads enable row level security;

-- ── À relire APRÈS application ────────────────────────────────────────────
-- Le dépôt n'est pas la vérité sur Supabase. Ces contrôles se relisent en base.
--
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.constats_presence'::regclass
--     and conname = 'constats_presence_sujet_check';
--   -- doit citer 'identite' et 'rge'
--
--   select relname, relrowsecurity from pg_class
--   where relname in ('lissage_passes','lissage_leads');
--   -- relrowsecurity doit valoir true pour les deux
--
--   select count(*) from pg_policies
--   where tablename in ('lissage_passes','lissage_leads');
--   -- doit valoir 0 : clé de service uniquement
