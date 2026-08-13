import "server-only";
import { GoogleAuth } from "google-auth-library";

/**
 * Real session-by-session data for "Parcours détaillés" — GA4's own Data API
 * (ga4-client.ts) only exposes pre-aggregated reports, never one row per
 * visit. The GA4 → BigQuery export streams raw events instead, which is the
 * only real (non-fabricated) way to reconstruct "this visitor opened these
 * pages, in this order, for this long, and did/didn't touch the form".
 *
 * Two things this needs that ga4-client.ts's GA4_PROPERTY_ID/KEY don't cover
 * on their own:
 *  - which GCP project + region BigQuery actually lands in (read live from
 *    the GA4 Admin API's bigQueryLinks — it's whatever the user picked when
 *    linking, not something to hardcode)
 *  - the service account needs two BigQuery IAM roles granted in that GCP
 *    project (`BigQuery Data Viewer` + `BigQuery Job User`) — GA4 creating
 *    the export dataset does not by itself grant any other principal access
 *    to it. See getBigQueryLink()'s callers for the exact error surfaced
 *    when either of these isn't set up yet.
 */

const BQ_SCOPES = ["https://www.googleapis.com/auth/bigquery.readonly"];
const ADMIN_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];

let bqAuth: GoogleAuth | null = null;
let adminAuth: GoogleAuth | null = null;

function parseCredentials(serviceAccountKeyJson: string): Record<string, unknown> {
  try {
    return JSON.parse(serviceAccountKeyJson);
  } catch {
    throw new Error("GA4_SERVICE_ACCOUNT_KEY n'est pas un JSON valide");
  }
}

async function accessToken(auth: GoogleAuth): Promise<string> {
  const client = await auth.getClient();
  const res = await client.getAccessToken();
  if (!res.token) throw new Error("Impossible d'obtenir un jeton d'accès Google");
  return res.token;
}

export interface BigQueryLink {
  projectId: string;
  datasetId: string;
  location: string;
}

/** Thrown when the query fails specifically because the export dataset
 *  doesn't exist yet — GA4 hasn't run its first export since the BigQuery
 *  link was created (can take from a few minutes up to ~24-48h for the
 *  first daily table; intraday/streaming tables usually appear sooner). This
 *  is an expected, self-resolving wait, not a config error. */
export class BigQueryDatasetNotReadyError extends Error {}

/**
 * Reads the live GA4 → BigQuery link config (GA4 Admin API, v1alpha — this
 * resource isn't in v1beta). Returns null if BigQuery isn't linked at all.
 */
export async function getBigQueryLink(propertyId: string, serviceAccountKeyJson: string): Promise<BigQueryLink | null> {
  const credentials = parseCredentials(serviceAccountKeyJson);
  if (!adminAuth) adminAuth = new GoogleAuth({ credentials, scopes: ADMIN_SCOPES });
  const token = await accessToken(adminAuth);
  const res = await fetch(
    `https://analyticsadmin.googleapis.com/v1alpha/properties/${encodeURIComponent(propertyId)}/bigQueryLinks`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(`GA4 Admin API bigQueryLinks a répondu ${res.status}: ${details.slice(0, 300)}`);
  }
  const json = (await res.json()) as { bigqueryLinks?: Array<{ project: string; datasetLocation: string }> };
  const link = json.bigqueryLinks?.[0];
  if (!link) return null;
  return {
    projectId: link.project.replace(/^projects\//, ""),
    datasetId: `analytics_${propertyId}`,
    location: link.datasetLocation,
  };
}

type BqParamValue = { type: string; value: string };

interface BqField {
  name: string;
  type: string;
  mode?: string;
}
interface BqQueryResponse {
  schema?: { fields: BqField[] };
  rows?: Array<{ f: Array<{ v: unknown }> }>;
  jobComplete?: boolean;
  jobReference?: { projectId: string; jobId: string; location?: string };
  errors?: Array<{ message: string }>;
  error?: { message: string };
}

async function pollUntilComplete(token: string, link: BigQueryLink, job: BqQueryResponse): Promise<BqQueryResponse> {
  let cur = job;
  let attempts = 0;
  while (!cur.jobComplete && attempts < 8) {
    attempts += 1;
    await new Promise((r) => setTimeout(r, 1000));
    const ref = cur.jobReference!;
    const res = await fetch(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${ref.projectId}/queries/${ref.jobId}?location=${encodeURIComponent(ref.location ?? link.location)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    cur = (await res.json()) as BqQueryResponse;
  }
  return cur;
}

/** Runs a parametrized query and returns plain objects keyed by column name.
 *  Nested/repeated columns should be pre-flattened to JSON strings in the SQL
 *  itself (`TO_JSON_STRING(...)`) — the BigQuery REST API's row encoding for
 *  actual nested STRUCT/ARRAY columns is painful to decode generically. */
export async function runBigQuery(
  serviceAccountKeyJson: string,
  link: BigQueryLink,
  query: string,
  params: Record<string, BqParamValue>,
): Promise<Array<Record<string, string | null>>> {
  const credentials = parseCredentials(serviceAccountKeyJson);
  if (!bqAuth) bqAuth = new GoogleAuth({ credentials, scopes: BQ_SCOPES });
  const token = await accessToken(bqAuth);

  const res = await fetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${link.projectId}/queries`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      useLegacySql: false,
      location: link.location,
      parameterMode: "NAMED",
      queryParameters: Object.entries(params).map(([name, p]) => ({
        name,
        parameterType: { type: p.type },
        parameterValue: { value: p.value },
      })),
      timeoutMs: 20000,
    }),
  });

  let body = (await res.json().catch(() => ({}))) as BqQueryResponse;
  if (!res.ok) {
    const message = body.error?.message || body.errors?.[0]?.message || `BigQuery a répondu ${res.status}`;
    if (/not found: dataset/i.test(message)) throw new BigQueryDatasetNotReadyError(message);
    throw new Error(message);
  }

  if (!body.jobComplete) body = await pollUntilComplete(token, link, body);
  if (!body.jobComplete) throw new Error("BigQuery : la requête n'a pas terminé à temps");

  const fields = body.schema?.fields ?? [];
  return (body.rows ?? []).map((row) => {
    const o: Record<string, string | null> = {};
    fields.forEach((f, i) => {
      const v = row.f[i]?.v;
      o[f.name] = v === null || v === undefined ? null : String(v);
    });
    return o;
  });
}

export function bqStringParam(value: string): BqParamValue {
  return { type: "STRING", value };
}
