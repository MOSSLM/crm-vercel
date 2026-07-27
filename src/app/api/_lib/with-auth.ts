import type { ZodSchema } from "zod";
import { requireUser } from "./auth";
import { corsHeadersFor, preflight, type CorsOptions } from "./cors";
import { jsonError } from "./respond";
import { requireRole, type UserRole } from "./require-role";
import { requireCapability, type AgentCapability, type AgentContext } from "./require-capability";

export type AuthedContext<TBody, TParams> = {
  user: { id: string; email?: string };
  accessToken: string;
  body: TBody;
  params: TParams;
  req: Request;
  cors: Record<string, string>;
  /** Rôle + capacités du caller. Résolu seulement si `capability` est demandée. */
  agent: AgentContext | null;
};

export type WithAuthOptions<TBody> = {
  role?: UserRole;
  /**
   * Capacité déléguée exigée (cf. `require-capability`). Un admin passe
   * toujours ; un freelance doit l'avoir reçue dans `agent_settings`.
   */
  capability?: AgentCapability;
  body?: ZodSchema<TBody>;
  cors?: CorsOptions;
};

export type RouteHandler<TBody, TParams> = (ctx: AuthedContext<TBody, TParams>) => Promise<Response> | Response;

/**
 * Higher-order wrapper that handles the standard auth + CORS + body-validation
 * preamble every authenticated API route was duplicating.
 *
 * Behavior:
 *   - OPTIONS request                                  → 204 with CORS headers
 *   - Missing/invalid bearer token                     → 401 unauthorized
 *   - `role` set but profile missing or role mismatch  → 403 forbidden
 *   - `capability` set but not granted to the caller   → 403 capability_refusee
 *   - `body` set but JSON is malformed                 → 400 invalid_body
 *   - `body` set and Zod parse fails                   → 400 invalid_body + details
 *   - inner handler throws                             → 500 internal_error
 *   - otherwise: inner handler runs with parsed context
 *
 * All non-OK responses include the same CORS headers the success path would,
 * so cross-origin clients can read the status.
 */
export const withAuth = <TBody = undefined, TParams = Record<string, string>>(
  opts: WithAuthOptions<TBody>,
  handler: RouteHandler<TBody, TParams>,
) => {
  return async (
    req: Request,
    nextCtx?: { params: Promise<TParams> },
  ): Promise<Response> => {
    if (req.method === "OPTIONS") return preflight(req, opts.cors);

    const cors = corsHeadersFor(req, opts.cors);

    const auth = await requireUser(req, cors);
    if (!auth.ok) return auth.response;

    if (opts.role) {
      const roleCheck = await requireRole(auth.user, opts.role, cors);
      if (!roleCheck.ok) return roleCheck.response;
    }

    let agent: AgentContext | null = null;
    if (opts.capability) {
      const capCheck = await requireCapability(auth.user, opts.capability, cors);
      if (!capCheck.ok) return capCheck.response;
      agent = capCheck.context;
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

    const params = (nextCtx?.params ? await nextCtx.params : ({} as TParams));

    try {
      return await handler({ user: auth.user, accessToken: auth.accessToken, body, params, req, cors, agent });
    } catch {
      return jsonError("internal_error", 500, {}, cors);
    }
  };
};
