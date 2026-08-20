-- Les veilles : un segment, un déclencheur, et la mémoire de ce qu'on a déjà vu.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- CE QU'UNE VEILLE EST, ET CE QU'ELLE N'EST PAS
-- ─────────────────────────────────────────────────────────────────────────────
-- Une veille SURVEILLE et MONTRE. Elle n'inscrit personne, n'envoie rien, ne
-- crée aucune tâche. C'est délibéré : la couche 0 a coûté 59 inscriptions
-- gelées parce qu'un mécanisme avançait sans que personne le voie. Un signal
-- qui déclencherait un envoi ferait exactement la même chose, en pire — il
-- partirait.
--
-- Ce qu'on fait d'un signal (verser dans une campagne, appeler, ignorer) reste
-- un geste humain, et la table `campagne_leads` est déjà là pour le recevoir.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LA TABLE QUI COMPTE EST LA SECONDE : UN SIGNAL EST UN ÉVÉNEMENT
-- ─────────────────────────────────────────────────────────────────────────────
-- Presque toute notre matière est un ÉTAT, pas un événement : « son RGE expire
-- dans 90 jours » est vrai aujourd'hui, demain, et tous les jours jusqu'à
-- l'échéance. Une veille qui relit l'état à chaque passe ressort les mêmes 98
-- entreprises indéfiniment — et un écran qui répète est un écran qu'on cesse de
-- lire.
--
-- `veille_constats` est la mémoire qui transforme l'état en événement : on note
-- la PREMIÈRE fois qu'on a vu cette entreprise satisfaire ce déclencheur, et
-- les passes suivantes ne rendent que le delta. L'unicité `(veille_id,
-- entreprise_id)` fait tout le travail — l'idempotence est une INSERTION qui
-- échoue, pas une lecture préalable, exactement comme `email_logs.message_id`
-- pour la réception (`sql/20260820_reception.sql`).
--
-- ⚠️ LA PREMIÈRE PASSE N'EST PAS UNE VEILLE, C'EST UNE REPRISE. Elle ramasse
-- l'arriéré : 220 sites injoignables ne sont pas tombés cette nuit. La colonne
-- `reprise` porte cette distinction, et l'écran doit la dire — sinon on lit
-- « 220 signaux » comme une catastrophe qui vient d'arriver.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LES CRITÈRES, JAMAIS LES RÉSULTATS
-- ─────────────────────────────────────────────────────────────────────────────
-- Même invariante que `segments_entreprises` et `vues_taches` : une veille
-- porte une QUESTION. Elle pointe un segment quand il existe (`segment_id`),
-- sinon elle porte ses critères en dur, dans la forme exacte de l'URL de
-- `/api/entreprises/explorer` — pour qu'un segment se rejoue sans traduction.
--
-- `veille_constats`, elle, stocke bien des résultats : c'est son objet. Ce ne
-- sont pas les membres d'une liste, ce sont des faits datés — « le 20/08, cette
-- entreprise a franchi ce seuil ». Un fait ne se recalcule pas.

begin;

create table if not exists public.veilles (
  id                 uuid primary key default gen_random_uuid(),
  nom                text not null,
  -- La clé du catalogue de `src/lib/prospection/signaux.ts`. Pas de contrainte
  -- d'énumération en base : le catalogue vit dans le code, avec sa densité
  -- mesurée et son accroche. Une `check` ici obligerait à migrer la base pour
  -- ajouter un déclencheur, et les deux listes divergeraient au premier oubli.
  declencheur        text not null,
  segment_id         uuid references public.segments_entreprises (id) on delete set null,
  criteres           jsonb,
  -- 'attribuees' (les 908 qu'on démarche) ou 'parc' (les 60 456). Le parc n'est
  -- pas une coquetterie : le RGE qui expire touche 7 948 entreprises, soit
  -- quatre-vingts fois plus que sur les attribuées — c'est de la matière à
  -- constituer une campagne, pas seulement à relancer.
  perimetre          text not null default 'attribuees',
  actif              boolean not null default true,
  cree_par           uuid,
  cree_le            timestamptz not null default now(),
  premiere_passe_le  timestamptz,
  derniere_passe_le  timestamptz,
  -- Ce que la dernière passe a rendu, pour que l'écran distingue « rien trouvé »
  -- de « jamais tourné » de « la lecture a échoué ». Sans ça, les trois
  -- s'affichent en un seul vide — le piège que ce projet a déjà payé huit fois.
  derniere_passe_bilan jsonb
);

comment on table public.veilles is
  'Une veille = un périmètre (segment ou parc) + un déclencheur. Elle MONTRE et n''agit jamais : aucune inscription, aucun envoi, aucune tâche. Ce qu''on fait du signal reste un geste humain.';

comment on column public.veilles.declencheur is
  'Clé du catalogue de src/lib/prospection/signaux.ts. Volontairement non contrainte en base : le catalogue porte la densité mesurée et l''accroche, il vit dans le code.';

comment on column public.veilles.premiere_passe_le is
  'La première passe ramasse l''ARRIÉRÉ, pas des événements du jour. Cette date est ce qui permet à l''écran de le dire.';

-- Deux veilles du même nom sont deux définitions du même mot : le même piège
-- que les segments, et la même parade.
create unique index if not exists veilles_nom_unique
  on public.veilles (lower(btrim(nom)));

create index if not exists veilles_actives_idx
  on public.veilles (actif) where actif;

create table if not exists public.veille_constats (
  id            bigserial primary key,
  veille_id     uuid not null references public.veilles (id) on delete cascade,
  entreprise_id bigint not null references public.entreprises (id) on delete cascade,
  vu_le         timestamptz not null default now(),
  -- true = ramassé par la première passe. Un arriéré, pas un événement.
  reprise       boolean not null default false,
  -- Ce qui a déclenché, tel qu'on l'a lu : la date de fin du RGE, la note, le
  -- nombre de vues. Sans ça, un signal est une ligne sans preuve — et personne
  -- ne peut décider quoi en faire sans rouvrir la fiche.
  valeur        jsonb,
  traite_le     timestamptz,
  traite_par    uuid,
  unique (veille_id, entreprise_id)
);

comment on table public.veille_constats is
  'La mémoire d''une veille : la PREMIÈRE fois qu''on a vu cette entreprise satisfaire le déclencheur. C''est elle qui transforme un état permanent (« son RGE expire ») en événement (« il vient d''entrer dans les 90 jours »). L''unicité (veille_id, entreprise_id) EST l''idempotence.';

comment on column public.veille_constats.reprise is
  'Ramassé par la première passe : de l''arriéré. 220 sites injoignables ne sont pas tombés cette nuit.';

-- Le fil de lecture de l'écran : les non traités d'une veille, du plus récent
-- au plus ancien.
create index if not exists veille_constats_a_traiter_idx
  on public.veille_constats (veille_id, vu_le desc) where traite_le is null;

-- RLS active SANS policy, comme `segments_entreprises` et `vues_taches` : seule
-- la clé de service lit et écrit, et les routes sont en `role: 'admin'`. Une
-- veille balaie tout le corpus, sans filtre de propriétaire.
alter table public.veilles          enable row level security;
alter table public.veille_constats  enable row level security;

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Contrôles à lire après application
-- ─────────────────────────────────────────────────────────────────────────────
-- select count(*) from public.veilles;                      -- 0 au départ
-- select count(*) from public.veille_constats;              -- 0
-- select relrowsecurity from pg_class
--   where oid in ('public.veilles'::regclass,'public.veille_constats'::regclass);  -- t, t
--
-- La matière, relevée le 20/08/2026 — c'est elle qui dit si une veille sert :
--   RGE qui expire sous 90 j ...... 98 attribuées   ·  7 948 au parc
--   Site injoignable .............. 220 attribuées  ·    314 au parc
--   Note d'audit sous 50 .......... 305 attribuées
--   Rapport ou plaquette ouvert ...   3 en tout — le plus rare, et le plus chaud
