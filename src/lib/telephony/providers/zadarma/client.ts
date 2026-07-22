/**
 * Minimal, dependency-free Zadarma REST client.
 *
 * Zadarma authenticates every request with a signed header rather than OAuth:
 *
 *   paramsString = urlencode(ksort(params))                    // sorted, RFC-1738
 *   signature    = base64( hmac_sha1_hex( method + paramsString + md5(paramsString), secret ) )
 *   Authorization: <key>:<signature>
 *
 * Note the `hmac_sha1_hex` then `base64` (Zadarma's PHP/Python SDKs base64 the
 * *hex* digest string, not the raw bytes — matched here). The exact string-to-
 * sign and encoding are the details most likely to need confirmation against the
 * live OpenAPI spec; `signRequest` is exported pure so it can be unit-tested in
 * isolation.
 *
 * Keys never leave the server. This module is server-only.
 */

import { createHash, createHmac } from "crypto";

export const ZADARMA_API_BASE = "https://api.zadarma.com";

export type ZadarmaParams = Record<string, string | number | boolean | undefined | null>;

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

/**
 * Build the query string Zadarma signs over: keys sorted ascending, encoded the
 * PHP `http_build_query` way (spaces as `+`, RFC-1738).
 */
export function buildParamsString(params: ZadarmaParams): string {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k, String(v)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return entries
    .map(([k, v]) => `${rfc1738(k)}=${rfc1738(v)}`)
    .join("&");
}

/** PHP-style RFC-1738 encoding: like encodeURIComponent but spaces become `+`. */
function rfc1738(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

export interface SignedRequest {
  paramsString: string;
  signature: string;
  authorization: string;
}

/** Pure signer — no I/O, unit-testable. `method` is the API path, e.g. `/v1/request/callback/`. */
export function signRequest(
  method: string,
  params: ZadarmaParams,
  key: string,
  secret: string,
): SignedRequest {
  const paramsString = buildParamsString(params);
  const md5 = createHash("md5").update(paramsString).digest("hex");
  const hmacHex = createHmac("sha1", secret)
    .update(method + paramsString + md5)
    .digest("hex");
  const signature = Buffer.from(hmacHex).toString("base64");
  return { paramsString, signature, authorization: `${key}:${signature}` };
}

export interface ZadarmaClientOptions {
  key: string;
  secret: string;
  baseUrl?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

export class ZadarmaClient {
  private readonly key: string;
  private readonly secret: string;
  private readonly baseUrl: string;
  private readonly fetchImpl?: typeof fetch;

  constructor(opts: ZadarmaClientOptions) {
    this.key = opts.key;
    this.secret = opts.secret;
    this.baseUrl = opts.baseUrl ?? ZADARMA_API_BASE;
    // Resolved lazily in `request()` so constructing the client never depends on
    // a global `fetch` being present (e.g. in a jsdom test env).
    this.fetchImpl = opts.fetchImpl;
  }

  /**
   * Signed request against the Zadarma API. `path` must include the trailing
   * slash Zadarma expects (e.g. `/v1/request/callback/`) since it is part of the
   * signed string.
   */
  async request<T = unknown>(
    path: string,
    params: ZadarmaParams = {},
    httpMethod: HttpMethod = "GET",
  ): Promise<T> {
    const { paramsString, authorization } = signRequest(path, params, this.key, this.secret);

    const isBodyMethod = httpMethod !== "GET" && httpMethod !== "DELETE";
    const url =
      this.baseUrl + path + (!isBodyMethod && paramsString ? `?${paramsString}` : "");

    const headers: Record<string, string> = { Authorization: authorization };
    if (isBodyMethod) headers["Content-Type"] = "application/x-www-form-urlencoded";

    const doFetch = this.fetchImpl ?? globalThis.fetch;
    if (typeof doFetch !== "function") {
      throw new Error("No fetch implementation available for ZadarmaClient");
    }

    const res = await doFetch(url, {
      method: httpMethod,
      headers,
      body: isBodyMethod ? paramsString : undefined,
    });

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      const message =
        (parsed as { message?: string })?.message ?? `zadarma_http_${res.status}`;
      throw new Error(`Zadarma API error (${res.status}): ${message}`);
    }
    // Zadarma envelopes responses with `status: "success" | "error"`.
    const status = (parsed as { status?: string })?.status;
    if (status === "error") {
      const message = (parsed as { message?: string })?.message ?? "zadarma_error";
      throw new Error(`Zadarma API error: ${message}`);
    }
    return parsed as T;
  }
}
