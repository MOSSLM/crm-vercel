import "server-only";

/**
 * Client for the Microsoft Clarity Data Export API.
 *
 * Two hard constraints from Microsoft's docs (verify against a live response
 * once CLARITY_API_TOKEN is set — the network sandbox this was written in
 * couldn't reach learn.microsoft.com to double-check the exact response
 * shape, so parsing below is defensive on purpose):
 *   - 10 requests/day/project. NEVER call this from a user-facing request —
 *     only from src/app/api/cron/analytics-radar-clarity-sync, on a schedule
 *     safely under quota (see sql/20260818_analytics_radar_clarity_cache.sql).
 *   - numOfDays only accepts 1, 2 or 3 — there is no way to ask for a wider
 *     window than the last 3 days.
 */

const ENDPOINT = "https://www.clarity.ms/export-data/api/v1/project-live-insights";

export type ClarityDimension = "Browser" | "Device" | "OS" | "Country" | "Source" | "Channel" | "URL";

export interface ClarityInsight {
  metricName: string;
  information: Array<Record<string, unknown>>;
}

/**
 * Raw fetch — returns whatever JSON Clarity sends back, typed as unknown so
 * callers must defensively read fields rather than trust an assumed shape.
 */
export async function fetchClarityInsights(
  token: string,
  numOfDays: 1 | 2 | 3,
  dimensions: ClarityDimension[] = [],
): Promise<unknown> {
  const params = new URLSearchParams({ numOfDays: String(numOfDays) });
  dimensions.slice(0, 3).forEach((d, i) => params.set(`dimension${i + 1}`, d));

  const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(`Clarity Data Export API a répondu ${res.status}: ${details.slice(0, 500)}`);
  }
  return res.json();
}

/** Loosely coerces a raw response into the documented { metricName, information[] } shape. */
export function normalizeClarityResponse(raw: unknown): ClarityInsight[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => ({
      metricName: typeof entry.metricName === "string" ? entry.metricName : "unknown",
      information: Array.isArray(entry.information)
        ? (entry.information as Array<Record<string, unknown>>)
        : [],
    }));
}

/** Best-effort numeric read across the several field-name spellings Clarity's docs have used. */
export function clarityInfoNumber(info: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const v = info[key];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return 0;
}

export function getClarityToken(): string | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const env = require("@/env") as { CLARITY_API_TOKEN?: string };
  return env.CLARITY_API_TOKEN ?? null;
}
