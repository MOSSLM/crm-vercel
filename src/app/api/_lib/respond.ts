/**
 * Tiny JSON response helpers for /api/* routes.
 *
 * `json` lets callers compose CORS / cache / custom headers without each
 * route hand-rolling the `JSON.stringify + Content-Type` boilerplate.
 */

export type JsonOptions = {
  status?: number;
  headers?: Record<string, string>;
};

export const json = (body: unknown, opts: JsonOptions = {}): Response =>
  new Response(JSON.stringify(body), {
    status: opts.status ?? 200,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });

export const jsonError = (
  error: string,
  status: number,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response => json({ error, ...extra }, { status, headers });
