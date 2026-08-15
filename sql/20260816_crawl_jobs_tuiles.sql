-- Mémoriser QUELLES tuiles ont été parcourues, et ce qu'elles ont rendu.
--
-- POURQUOI
-- `crawl_jobs` savait dire « 4 tuiles sur 12 », jamais lesquelles. C'est
-- suffisant pour une barre de progression, pas pour reprendre une ville là où
-- on l'avait laissée : une seconde passe qui veut combler les tuiles non faites
-- n'a aucun moyen de savoir lesquelles le sont.
--
-- FORME
-- `tuiles` est un tableau JSON dense indexé sur (numéro de tuile − 1), la même
-- forme que celle publiée par le contrat HTTP :
--   null → tuile pas encore parcourue
--   0    → parcourue, aucune entreprise
--   n    → parcourue, n entreprises
-- La distinction entre `null` et `0` est le cœur du sujet : « rien ici » et
-- « pas encore regardé » appellent des décisions opposées.
--
-- `tuile_en_cours` est la position dans la grille de la tuile lue à l'instant.
-- Elle est distincte de `tuiles_faites` (un compte) depuis que les tuiles se
-- parcourent par éloignement et non plus rangée par rangée.

alter table public.crawl_jobs
  add column if not exists tuiles jsonb not null default '[]'::jsonb,
  add column if not exists tuile_en_cours integer not null default 0;

comment on column public.crawl_jobs.tuiles is
  'Fiches par tuile, indexé sur (numéro de tuile − 1). null = non parcourue, 0 = parcourue et vide.';
comment on column public.crawl_jobs.tuile_en_cours is
  'Position dans la grille de la tuile en cours de lecture. Distincte de tuiles_faites, qui est un compte.';
