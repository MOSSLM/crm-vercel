-- =====================================================================
-- pg_cron : passage automatique de l'analyseur de sites
-- =====================================================================
-- ⚠️ REMPLACER `<PG_CRON_SECRET>` AVANT D'EXÉCUTER.
--
-- La valeur est celle de la variable d'environnement `PG_CRON_SECRET` posée
-- côté Vercel. Elle N'EST PAS écrite ici, et ne doit jamais l'être :
-- `sql/20260808_donnees_publiques_cron.sql:35` contient le secret EN CLAIR,
-- il est donc dans l'historique git, et il doit être tourné. Les quatre
-- autres migrations cron utilisent bien un placeholder — c'est la règle.
--
-- Minute 23 : les jobs existants occupent `*` (tick), `0`, `*/5` et `7`
-- (données publiques). Un créneau propre évite que deux jobs longs se
-- marchent dessus sur le même pool de connexions.
--
-- Rejouable : le job est désinstallé avant d'être réinstallé.
-- =====================================================================

begin;

select cron.unschedule('audit-site-tick')
where exists (select 1 from cron.job where jobname = 'audit-site-tick');

select cron.schedule(
  'audit-site-tick',
  '23 * * * *',
  $job$
  select net.http_post(
    url        := 'https://www.samadigitalstudio.fr/api/cron/audit-site',
    headers    := '{"content-type":"application/json","x-pg-cron-secret":"<PG_CRON_SECRET>"}'::jsonb,
    body       := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) as request_id;
  $job$
);

commit;

-- Vérification :
--   select jobname, schedule, active from cron.job where jobname = 'audit-site-tick';
--
-- Suivi des exécutions :
--   select status, return_message, start_time
--   from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'audit-site-tick')
--   order by start_time desc limit 10;
