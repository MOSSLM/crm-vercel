-- =====================================================================
-- pg_cron : fabrication anticipée des cartes de partage
-- =====================================================================
-- ⚠️ REMPLACER `<PG_CRON_SECRET>` AVANT D'EXÉCUTER.
--
-- POURQUOI UN JOB À PART. Ce travail protège les envois AUTOMATIQUES : une
-- séquence qui envoie un lien de démo n'ouvre aucun dialogue, donc ne
-- déclenche aucune fabrication. Et le rattrapage pendant l'unfurl est
-- impossible — un robot de messagerie abandonne en quelques secondes là où
-- une carte demande 20 à 45 s. Sans ce passage, tout lien parti
-- automatiquement s'affiche en URL nue, définitivement pour son
-- destinataire.
--
-- Greffé sur le cron d'analyse, il n'avait aucune chance : les deux
-- travaux se partageaient 45 s, dont 8 revenaient aux cartes — moins que
-- la moitié d'UNE capture.
--
-- Minute 41 : les autres jobs occupent `*`, 0, 7, 23 et `*/5`.
--
-- Rejouable : le job est désinstallé avant d'être réinstallé.
-- =====================================================================

begin;

select cron.unschedule('og-cards-tick')
where exists (select 1 from cron.job where jobname = 'og-cards-tick');

select cron.schedule(
  'og-cards-tick',
  '41 * * * *',
  $job$
  select net.http_post(
    url        := 'https://www.samadigitalstudio.fr/api/cron/og-cards',
    headers    := '{"content-type":"application/json","x-pg-cron-secret":"<PG_CRON_SECRET>"}'::jsonb,
    body       := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) as request_id;
  $job$
);

commit;

-- Suivi : `restantes` dit si la file se vide ou si elle s'accumule.
--   select status, return_message, start_time
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'og-cards-tick')
--   order by start_time desc limit 10;
