import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 800;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const signal = init?.signal
    ? (AbortSignal as unknown as { any: (signals: AbortSignal[]) => AbortSignal }).any([init.signal, controller.signal])
    : controller.signal;
  return fetch(input, { ...init, signal }).finally(() => clearTimeout(timer));
}

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const isReadOnly = !init?.method || init.method.toUpperCase() === 'GET' || init.method.toUpperCase() === 'HEAD';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchWithTimeout(input, init);
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      if (isLast || !isReadOnly) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
    }
  }
  throw new Error('unreachable');
}

export const supabase = createSupabaseClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey,
  { global: { fetch: fetchWithRetry } }
);

// Export the createClient function for compatibility
export const createClient = () => supabase;

export default supabase;