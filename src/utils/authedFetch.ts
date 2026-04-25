"use client";
import { supabase } from "./supabase/client";

/**
 * Same shape as `fetch`, but attaches the current Supabase session's
 * `access_token` as `Authorization: Bearer <token>` (when one is present and
 * the caller hasn't already set its own Authorization header).
 *
 * Use for every same-origin call to /api/* that requires auth. The server-side
 * `requireUser` helper validates whatever token arrives.
 */
export const authedFetch = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> => {
  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
};
