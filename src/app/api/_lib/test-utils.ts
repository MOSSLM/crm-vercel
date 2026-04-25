/**
 * Shared helpers for /api/* route tests.
 *
 * Three things every route test needs:
 *  - a `Request` (with a Bearer token by default so requireUser passes)
 *  - a Supabase client mock that returns canned data for `.from(...)` chains
 *  - the same mock surfaced to `auth.getUser` so requireUser succeeds
 *
 * The only mock you must call from the test file is `jest.mock('@supabase/supabase-js', ...)`
 * — the helpers below assume the mock exposes `setAuthGetUser` and `setFromImpl`.
 */

import { ContactDirection, ContactOutcome } from "@/types";

const DEFAULT_TOKEN = "test-token";

export type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Override the Authorization header (defaults to a valid Bearer test-token). */
  authorization?: string | null;
  search?: string;
};

/** Build a Next-style Request with a Bearer token by default. */
export const makeRequest = (path = "http://localhost/api/test", opts: RequestOptions = {}): Request => {
  const headers = new Headers({ "Content-Type": "application/json", ...(opts.headers ?? {}) });
  if (opts.authorization === undefined) {
    headers.set("Authorization", `Bearer ${DEFAULT_TOKEN}`);
  } else if (opts.authorization !== null) {
    headers.set("Authorization", opts.authorization);
  }

  const url = `${path}${opts.search ?? ""}`;
  return new Request(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
};

/** Default `auth.getUser` mock that returns a fixed user — overridden in unauth tests. */
export const defaultAuthGetUser = jest.fn().mockResolvedValue({
  data: { user: { id: "user-1", email: "user@test" } },
  error: null,
});

/** `auth.getUser` that fails — for unauthorized tests. */
export const failingAuthGetUser = jest.fn().mockResolvedValue({
  data: { user: null },
  error: { message: "invalid_token" },
});

/**
 * Standard supabase-js mock factory.
 *
 * Call from a test file's `jest.mock`:
 *
 *     const { createMockSupabase } = require('@/app/api/_lib/test-utils');
 *     const mock = createMockSupabase();
 *     jest.mock('@supabase/supabase-js', () => ({ createClient: () => mock.client }));
 *
 * Then in `beforeEach`, configure `mock.fromImpl` and `mock.authGetUser` per test.
 */
export const createMockSupabase = () => {
  const fromImpl = jest.fn();
  const authGetUser = jest.fn().mockResolvedValue({
    data: { user: { id: "user-1", email: "user@test" } },
    error: null,
  });

  return {
    client: {
      from: fromImpl,
      auth: { getUser: (...args: unknown[]) => authGetUser(...args) },
    },
    fromImpl,
    authGetUser,
  };
};

/** Re-exports so route test files don't need separate type imports. */
export { ContactDirection, ContactOutcome };
