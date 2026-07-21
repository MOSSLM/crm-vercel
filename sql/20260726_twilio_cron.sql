-- Register a per-minute pg_cron job that drives the telephony tick
-- (/api/twilio/cron): applies On/Off schedules and, from Phase 4, flushes
-- scheduled SMS. Same mechanism as `automations-tick` /
-- `process-scheduled-actions`.
--
-- The <PG_CRON_SECRET> placeholder MUST be substituted at apply time with the
-- same value passed as PG_CRON_SECRET to the Next.js runtime (checked via the
-- `x-pg-cron-secret` header in src/app/api/_lib/verify-cron.ts). Applied via
-- Supabase MCP so the real secret never lands in the repo.
--
-- To rotate: update the Vercel/runtime env, then
--   SELECT cron.unschedule('twilio-tick');
-- and re-run this CREATE with the new value.
SELECT cron.schedule(
  'twilio-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url        := 'https://crm-vercel.vercel.app/api/twilio/cron',
    headers    := '{"content-type":"application/json","x-pg-cron-secret":"<PG_CRON_SECRET>"}'::jsonb,
    body       := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);
