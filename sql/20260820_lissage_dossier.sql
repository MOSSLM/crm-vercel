-- 20260820_lissage_dossier.sql — ce qu'un outil amont dépose pour l'aval.
--
-- POURQUOI CETTE COLONNE MANQUAIT
-- `dossier-web.mjs` — l'outil qui monte les candidats de site — écrit dans
-- `.prospection/dossiers`, SUR LA MACHINE LOCALE, et rien en base. C'est
-- délibéré : « chercher et écrire sont deux scripts séparés », et c'est cette
-- séparation qui rend une collecte relançable sans conséquence.
--
-- Mais une file qui vit en base ne peut pas voir un fichier posé sur un disque.
-- Sans ce pont, l'étape de relecture humaine serait proposée sur un prospect
-- dont le serveur ignore s'il y a quoi que ce soit à relire — exactement l'écran
-- vide que le module pur refuse déjà par son préalable `candidat`.
--
-- L'exécuteur local dépose donc ici ce qu'il a TROUVÉ, jamais ce qu'il a DÉCIDÉ.
-- La forme est libre par outil ; seule `candidats` est lue par la file.

alter table public.lissage_leads
  add column if not exists dossier jsonb not null default '{}'::jsonb;

comment on column public.lissage_leads.dossier is
  'Ce que les outils amont ont trouvé, pour les outils aval de la MÊME passe. '
  '`candidats` (tableau) est le seul champ que la file lit : il satisfait le '
  'préalable `candidat` de la relecture humaine. Aucun verdict ici — les '
  'verdicts vont dans constats_presence.';

-- ── À relire APRÈS application ────────────────────────────────────────────
--   select column_name, data_type, column_default from information_schema.columns
--   where table_schema='public' and table_name='lissage_leads' and column_name='dossier';
