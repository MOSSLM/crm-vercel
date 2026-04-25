import { ensureServiceRunning, getCurrentIP } from "@/lib/aws/gmaps-ip";
import { GMAPS_API_TOKEN } from "@/env";

export type ProxyOptions = {
  method?: "GET" | "POST";
  body?: BodyInit | null;
  /** Optional querystring to append (e.g. `?format=csv`). Includes the leading `?`. */
  search?: string;
  /** Forward the original Authorization header as `x-user-auth` so the upstream can attribute the call. */
  forwardAuthFromReq?: Request;
};

const HEADERS_TO_STRIP = ["authorization", "x-user-auth"] as const;

/**
 * Proxies a request to the gmaps crawler service.
 *
 * Replaces 4 near-identical handlers (crawl, job, results, scale-down) that
 * each duplicated: ensureServiceRunning → getCurrentIP → fetch with bearer +
 * x-user-auth → strip sensitive response headers.
 */
export const proxyToGmaps = async (path: string, opts: ProxyOptions = {}): Promise<Response> => {
  await ensureServiceRunning();
  const base = await getCurrentIP();
  const url = new URL(`${path}${opts.search ?? ""}`, base);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${GMAPS_API_TOKEN}`,
  };
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (opts.forwardAuthFromReq) {
    const forwarded = opts.forwardAuthFromReq.headers.get("authorization");
    if (forwarded) headers["x-user-auth"] = forwarded;
  }

  const upstream = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body,
  });

  const safeHeaders = new Headers(upstream.headers);
  for (const h of HEADERS_TO_STRIP) safeHeaders.delete(h);

  return new Response(upstream.body, { status: upstream.status, headers: safeHeaders });
};
