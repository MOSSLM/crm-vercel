import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns a singleton Supabase client created with the service-role key.
 *
 * Service-role bypasses RLS by design — only use this from server code that
 * has already validated the caller (see `requireUser`). Never reach for this
 * from a route handler that hasn't authenticated the request.
 *
 * Lazy: avoids importing `@/env` at module-load time so unit tests can mock
 * `@supabase/supabase-js` without needing real env vars.
 */
let cached: SupabaseClient | null = null;

export const getServiceClient = (): SupabaseClient => {
  if (cached) return cached;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const env = require("@/env") as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  return cached;
};

/** Test-only: reset the cached client between cases. */
export const __resetServiceClientForTests = () => {
  cached = null;
};
