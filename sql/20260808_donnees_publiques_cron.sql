-- Le passage automatique des données publiques, câblé sur pg_cron.
--
-- Même dispositif que les trois jobs déjà en place (`automations-tick`,
-- `process-scheduled-actions`, `email-verify-tick`) : `net.http_post` vers une
-- route Next.js, authentifiée par l'en-tête `x-pg-cron-secret`. On ne réinvente
-- rien — un quatrième mécanisme serait un quatrième truc à savoir.
--
-- CADENCE : toutes les heures.
-- L'ADEME publie quotidiennement et le TTL du RGE est à 24 h ; l'horaire donne
-- 24 passages par jour à 40 fiches, soit 960 places pour un parc de 190. Large
-- marge : un passage qui n'a rien à faire ne fait rien, et coûte une requête.
-- La minute 7 évite de tomber en même temps que `process-scheduled-actions`,
-- qui part à la minute 0.
--
-- Le bouton d'une fiche (`/api/donnees-publiques/hydrate`) reste le recours
-- quand on ne veut pas attendre le prochain tour.
--
-- VÉRIFIER QUE ÇA TOURNE : `cron.job_run_details` ne dit QUE si la requête a
-- été postée. La vraie réponse est dans `net._http_response`, et le compte
-- rendu métier dans `donnees_publiques_runs`.
--
-- Idempotent : on décroche l'ancien job avant de le reposer.

begin;

select cron.unschedule('donnees-publiques-tick')
where exists (select 1 from cron.job where jobname = 'donnees-publiques-tick');

select cron.schedule(
  'donnees-publiques-tick',
  '7 * * * *',
  $job$
  select net.http_post(
    url        := 'https://www.samadigitalstudio.fr/api/cron/donnees-publiques',
    headers    := '{"content-type":"application/json","x-pg-cron-secret":"9068c752-8c71-4132-b00c-46fa79ae9ff0"}'::jsonb,
    body       := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) as request_id;
  $job$
);

commit;
