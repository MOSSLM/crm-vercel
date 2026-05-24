import type { ZodSchema } from "zod";
import { requireUser } from "./auth";
import { corsHeadersFor, preflight, type CorsOptions } from "./cors";
import { jsonError } from "./respond";
import { requireRole, type UserRole } from "./require-role";

export type AuthedContext<TBody> = {
  user: { id: string; email?: string };
  accessToken: string;
  body: TBody;
  req: Request;
  cors: Record<string, string>;
};

export type WithAuthOptions<TBody> = {
  role?: UserRole;
  body?: ZodSchema<TBody>;
  cors?: CorsOptions;
};

export type RouteHandler<TBody> = (ctx: AuthedContext<TBody>) => Promise<Response> | Response;

/**
 * Higher-order wrapper that handles the standard auth + CORS + body-validation
 * preamble every authenticated API route was duplicating.
 *
 * Behavior:
 *   - OPTIONS request                                  → 204 with CORS headers
 *   - Missing/invalid bearer token                     → 401 unauthorized
 *   - `role` set but profile missing or role mismatch  → 403 forbidden
 *   - `body` set but JSON is malformed                 → 400 invalid_body
 *   - `body` set and Zod parse fails                   → 400 invalid_body + details
 *   - inner handler throws                             → 500 internal_error
 *   - otherwise: inner handler runs with parsed context
 *
 * All non-OK responses include the same CORS headers the success path would,
 * so cross-origin clients can read the status.
 */
export const withAuth = <TBody = undefined>(
  opts: WithAuthOptions<TBody>,
  handler: RouteHandler<TBody>,
) => {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return preflight(req, opts.cors);

    const cors = corsHeadersFor(req, opts.cors);

    const auth = await requireUser(req, cors);
    if (!auth.ok) return auth.response;

    if (opts.role) {
      const roleCheck = await requireRole(auth.user, opts.role, cors);
      if (!roleCheck.ok) return roleCheck.response;
    }

    let body: TBody = undefined as TBody;
    if (opts.body) {
      let raw: unknown;
      try {
        raw = await req.json();
      } catch {
        return jsonError("invalid_body", 400, {}, cors);
      }
      const parsed = opts.body.safeParse(raw);
      if (!parsed.success) {
        return jsonError("invalid_body", 400, { details: parsed.error.flatten() }, cors);
      }
      body = parsed.data;
    }

    try {
      return await handler({ user: auth.user, accessToken: auth.accessToken, body, req, cors });
    } catch {
      return jsonError("internal_error", 500, {}, cors);
    }
  };
};
