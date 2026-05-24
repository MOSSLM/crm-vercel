-- Register an hourly pg_cron job that calls the Vercel
-- /api/cron/process-scheduled-actions endpoint.
--
-- Why pg_cron instead of vercel.json: Vercel hobby plans only allow daily
-- cron schedules. The retry/attempts logic in the cron route is built around
-- a sub-daily tick (transient failures would otherwise wait 24h to retry),
-- so we drive the cadence from Supabase pg_cron instead. Same setup that
-- already drives `automations-tick` every 5 minutes.
--
-- The <PG_CRON_SECRET> placeholder below MUST be substituted with the same
-- value passed as PG_CRON_SECRET to the Next.js runtime — the route in
-- src/app/api/cron/process-scheduled-actions/route.ts accepts a request when
-- the `x-pg-cron-secret` header matches. The applied job (via Supabase MCP
-- apply_migration) uses the actual secret; this file keeps the placeholder
-- so the secret never lives in the repo.
--
-- To rotate the secret: update Vercel env, then
--   SELECT cron.unschedule('process-scheduled-actions');
-- followed by this CREATE with the new value.
SELECT cron.schedule(
  'process-scheduled-actions',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url        := 'https://crm-vercel.vercel.app/api/cron/process-scheduled-actions',
    headers    := '{"content-type":"application/json","x-pg-cron-secret":"<PG_CRON_SECRET>"}'::jsonb,
    body       := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);
