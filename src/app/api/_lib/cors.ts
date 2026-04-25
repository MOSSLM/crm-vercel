/**
 * Shared CORS helpers for /api/* routes.
 *
 * Default policy: same-origin only (no CORS headers emitted unless an Origin
 * is present and matches the allowlist). The frontend calls every non-public
 * route same-origin, so this is restrictive by default and explicit by
 * environment when we need to open it up.
 *
 * Public routes (e.g. embeddable widgets) should pass `{ allowAny: true }`.
 */

const PUBLIC_ALLOW_ANY = "*" as const;

const parseAllowlist = (): string[] => {
  const raw = process.env.API_ALLOWED_ORIGINS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

const baseHeaders = {
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

export type CorsOptions = {
  /** Public route (e.g. embeddable widget); echoes `*`. */
  allowAny?: boolean;
};

/**
 * Returns CORS headers for the given request:
 *  - allowAny:true       → "*"
 *  - origin in allowlist → echo the origin
 *  - otherwise           → omit the header (browser will block cross-origin)
 */
export const corsHeadersFor = (req: Request, opts: CorsOptions = {}): Record<string, string> => {
  if (opts.allowAny) {
    return { ...baseHeaders, "Access-Control-Allow-Origin": PUBLIC_ALLOW_ANY };
  }

  const origin = req.headers.get("origin");
  if (origin && parseAllowlist().includes(origin)) {
    return { ...baseHeaders, "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  }

  return { ...baseHeaders };
};

/** OPTIONS preflight response. */
export const preflight = (req: Request, opts: CorsOptions = {}): Response =>
  new Response(null, { status: 204, headers: corsHeadersFor(req, opts) });
