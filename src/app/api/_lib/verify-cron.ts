/**
 * Shared cron authentication. Accepts either:
 *   - `Authorization: Bearer ${CRON_SECRET}`  (Vercel Cron), or
 *   - `x-pg-cron-secret: ${PG_CRON_SECRET}`   (Supabase pg_cron).
 *
 * Fail-closed in production when neither secret is configured; fail-open in
 * dev/test so local flows work without secrets. Mirrors the original inline
 * check in /api/cron/process-scheduled-actions.
 */
export const verifyCron = (req: Request): boolean => {
  const cronSecret = process.env.CRON_SECRET;
  const pgCronSecret = process.env.PG_CRON_SECRET;

  if (process.env.NODE_ENV === "production" && !cronSecret && !pgCronSecret) {
    return false;
  }
  if (!cronSecret && !pgCronSecret) return true;

  const auth = req.headers.get("authorization");
  const pgHeader = req.headers.get("x-pg-cron-secret");
  const validVercel = !!cronSecret && auth === `Bearer ${cronSecret}`;
  const validPgCron = !!pgCronSecret && pgHeader === pgCronSecret;
  return validVercel || validPgCron;
};
