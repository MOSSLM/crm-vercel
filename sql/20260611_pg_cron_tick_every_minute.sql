-- Passe le job pg_cron `automations-tick` de */5 à chaque minute.
--
-- Pourquoi : les emails de séquence sont désormais espacés par créneaux
-- aléatoires de 2 à 7 minutes (cf. SendThrottle dans
-- src/lib/automations/engine.ts). Avec un tick toutes les 5 minutes, la
-- granularité réelle des envois resterait ~5-10 min ; à la minute, les
-- écarts suivent fidèlement les créneaux. Le tick sort immédiatement
-- quand rien n'est dû.
--
-- `cron.alter_job` ne touche que la planification : la commande existante
-- (http_post vers /api/automations/tick avec le header x-pg-cron-secret)
-- est conservée telle quelle — aucun secret n'a besoin d'apparaître ici.
-- Appliqué via Supabase MCP.

select cron.alter_job(
  (select jobid from cron.job where jobname = 'automations-tick'),
  schedule := '* * * * *'
);
