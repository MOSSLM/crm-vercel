import { jsonError } from "./respond";
import { getServiceClient } from "./service-client";

export type AuthedUser = {
  id: string;
  email?: string;
};

export type AuthResult =
  | { ok: true; user: AuthedUser; accessToken: string }
  | { ok: false; response: Response };

const BEARER_RE = /^Bearer\s+(.+)$/i;

const extractBearerToken = (req: Request): string | null => {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(BEARER_RE);
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
};

const unauthorized = (extraHeaders: Record<string, string> = {}): { ok: false; response: Response } => ({
  ok: false,
  response: jsonError("unauthorized", 401, {}, extraHeaders),
});

/**
 * Validates that the request carries a valid Supabase access token.
 *
 * On success, returns `{ ok: true, user, accessToken }` so callers can either
 * use `getServiceClient()` (bypassing RLS) or attach the token to their own
 * Supabase calls when RLS-aware reads are wanted.
 *
 * On failure, returns a ready-to-return 401 Response. Callers should merge
 * any CORS headers via the `extraHeaders` parameter so 401s remain reachable
 * from cross-origin clients during preflight + actual requests.
 */
export const requireUser = async (
  req: Request,
  extraHeaders: Record<string, string> = {},
): Promise<AuthResult> => {
  const token = extractBearerToken(req);
  if (!token) return unauthorized(extraHeaders);

  const { data, error } = await getServiceClient().auth.getUser(token);
  if (error || !data?.user) return unauthorized(extraHeaders);

  return {
    ok: true,
    user: { id: data.user.id, email: data.user.email ?? undefined },
    accessToken: token,
  };
};
