import { json } from "@/app/api/_lib/respond";
import { preflight } from "@/app/api/_lib/cors";
import { withAuth } from "@/app/api/_lib/with-auth";
import { requireStaff } from "@/app/api/_lib/require-staff";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { listDemoSites } from "@/lib/analytics-radar/demo-sites";
import { getGa4Config } from "@/lib/analytics-radar/ga4-client";
import { BigQueryDatasetNotReadyError, bqStringParam, getBigQueryLink, runBigQuery } from "@/lib/analytics-radar/bigquery-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => preflight(req);

const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");

// One row per (user_pseudo_id, ga_session_id) — GA4's own BigQuery export
// schema (stable, documented at
// support.google.com/analytics/answer/7029846), reconstructed here because
// neither GA4's Data API nor Realtime API expose session-by-session detail,
// only pre-aggregated reports. `events_intraday_*` (today, streamed) is kept
// disjoint from `events_*` (backfilled days) by excluding today's date from
// the first table's suffix range, so a session is never counted twice while
// today's `events_<today>` daily table doesn't exist yet.
//
// `TO_JSON_STRING` flattens the per-page timeline into one STRING column —
// the REST API's row encoding for real nested STRUCT/ARRAY columns is not
// worth decoding generically for a single query like this.
const SESSIONS_SQL = (project: string, dataset: string) => `
WITH events AS (
  SELECT
    user_pseudo_id,
    (SELECT COALESCE(value.int_value, SAFE_CAST(value.string_value AS INT64)) FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    event_name,
    event_timestamp,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title') AS page_title,
    device.category AS device_category,
    device.operating_system AS os,
    device.web_info.browser AS browser,
    device.web_info.hostname AS hostname,
    geo.city AS city,
    geo.country AS country,
    traffic_source.source AS source,
    traffic_source.medium AS medium
  FROM \`${project}.${dataset}.events_*\`
  WHERE _TABLE_SUFFIX BETWEEN @startDate AND @endDate AND _TABLE_SUFFIX != @today
  UNION ALL
  SELECT
    user_pseudo_id,
    (SELECT COALESCE(value.int_value, SAFE_CAST(value.string_value AS INT64)) FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    event_name,
    event_timestamp,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_location') AS page_location,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'page_title') AS page_title,
    device.category AS device_category,
    device.operating_system AS os,
    device.web_info.browser AS browser,
    device.web_info.hostname AS hostname,
    geo.city AS city,
    geo.country AS country,
    traffic_source.source AS source,
    traffic_source.medium AS medium
  FROM \`${project}.${dataset}.events_intraday_*\`
  WHERE _TABLE_SUFFIX = @today
)
SELECT
  user_pseudo_id,
  session_id,
  ANY_VALUE(hostname) AS hostname,
  ANY_VALUE(device_category) AS device_category,
  ANY_VALUE(os) AS os,
  ANY_VALUE(browser) AS browser,
  ANY_VALUE(city) AS city,
  ANY_VALUE(country) AS country,
  ANY_VALUE(source) AS source,
  ANY_VALUE(medium) AS medium,
  MIN(event_timestamp) AS start_ts,
  MAX(event_timestamp) AS end_ts,
  COUNTIF(event_name = 'page_view') AS page_views,
  LOGICAL_OR(event_name = 'analytics_radar_form_start') AS form_started,
  LOGICAL_OR(event_name = 'analytics_radar_form_submit') AS form_submitted,
  TO_JSON_STRING(ARRAY_AGG(STRUCT(event_timestamp, event_name, page_location, page_title) ORDER BY event_timestamp)) AS steps_json
FROM events
WHERE session_id IS NOT NULL
GROUP BY user_pseudo_id, session_id
ORDER BY start_ts DESC
LIMIT 150
`;

export interface SessionStep {
  atMs: number;
  eventName: string;
  pagePath: string | null;
  pageTitle: string | null;
}

export interface SessionRow {
  hostname: string | null;
  companyName: string | null;
  /** The demo site's own HQ city (from the `entreprises` record) — compare
   *  against `city` (the visitor's) to spot an out-of-area visit. */
  companyCity: string | null;
  deviceCategory: string;
  os: string;
  browser: string;
  city: string;
  country: string;
  source: string;
  medium: string;
  startMs: number;
  durationSec: number;
  pageViews: number;
  formStarted: boolean;
  formSubmitted: boolean;
  steps: SessionStep[];
}

function pathFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

/**
 * GET /api/analytics-radar/sessions?days=1-14
 *
 * "Parcours détaillés" — real, session-by-session GA4 data via BigQuery
 * export. Deliberately separate from /api/analytics-radar: BigQuery bills
 * per byte scanned, so this is meant to be fetched lazily (only when the
 * tab is actually open), not on the same 45s poll as the rest of the
 * dashboard. Returns `configured: false` with a `reason` the UI can render
 * distinctly (not linked / export not run yet / real error) instead of a
 * blank crash — all three are realistic states for a freshly-linked export.
 */
export const GET = withAuth({}, async ({ req, cors, user }) => {
  // Même périmètre que /api/analytics-radar : tout le parc, donc staff
  // uniquement. Ici le garde-fou protège aussi la facture BigQuery, facturée
  // à l'octet scanné à chaque appel.
  const staff = await requireStaff(user, cors);
  if (!staff.ok) return staff.response;

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(14, Number(url.searchParams.get("days")) || 3));

  const ga4 = getGa4Config();
  if (!ga4) {
    return json({ configured: false, reason: "ga4_not_configured", sessions: [] }, { headers: cors });
  }

  const sb = getServiceClient();
  const sites = await listDemoSites(sb).catch(() => []);
  const hostToSite = new Map(sites.map((s) => [s.hostname, s]));

  let link;
  try {
    link = await getBigQueryLink(ga4.propertyId, ga4.serviceAccountKey);
  } catch (e) {
    console.error("[analytics-radar/sessions] getBigQueryLink failed", e);
    return json({ configured: false, reason: "error", sessions: [] }, { headers: cors });
  }
  if (!link) {
    return json({ configured: false, reason: "not_linked", sessions: [] }, { headers: cors });
  }

  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days);

  let rows: Array<Record<string, string | null>>;
  try {
    rows = await runBigQuery(ga4.serviceAccountKey, link, SESSIONS_SQL(link.projectId, link.datasetId), {
      startDate: bqStringParam(yyyymmdd(start)),
      endDate: bqStringParam(yyyymmdd(now)),
      today: bqStringParam(yyyymmdd(now)),
    });
  } catch (e) {
    if (e instanceof BigQueryDatasetNotReadyError) {
      return json({ configured: false, reason: "pending_export", sessions: [] }, { headers: cors });
    }
    console.error("[analytics-radar/sessions] BigQuery query failed", e);
    return json({ configured: false, reason: "error", sessions: [] }, { headers: cors });
  }

  const sessions: SessionRow[] = rows
    .map((r) => {
      const site = r.hostname ? hostToSite.get(r.hostname) : undefined;
      const startTs = Number(r.start_ts) / 1000; // BigQuery event_timestamp is microseconds
      const endTs = Number(r.end_ts) / 1000;
      let steps: SessionStep[] = [];
      try {
        const raw = JSON.parse(r.steps_json || "[]") as Array<{ event_timestamp: string; event_name: string; page_location: string | null; page_title: string | null }>;
        steps = raw.map((s) => ({
          atMs: Number(s.event_timestamp) / 1000,
          eventName: s.event_name,
          pagePath: pathFromUrl(s.page_location),
          pageTitle: s.page_title,
        }));
      } catch {
        steps = [];
      }
      return {
        hostname: r.hostname,
        companyName: site?.companyName ?? null,
        companyCity: site?.city ?? null,
        deviceCategory: r.device_category || "",
        os: r.os || "",
        browser: r.browser || "",
        city: r.city || "",
        country: r.country || "",
        source: r.source || "",
        medium: r.medium || "",
        startMs: startTs,
        durationSec: Math.max(0, Math.round((endTs - startTs) / 1000)),
        pageViews: Number(r.page_views) || 0,
        formStarted: r.form_started === "true",
        formSubmitted: r.form_submitted === "true",
        steps,
      };
    })
    // Only keep sessions on a hostname we actually recognize as a demo site
    // — a raw BigQuery export can carry stray/bot traffic on unknown hosts.
    .filter((s) => s.hostname && hostToSite.has(s.hostname));

  return json({ configured: true, reason: null, sessions }, { headers: cors });
});
