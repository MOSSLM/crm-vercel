import "server-only";
import { GoogleAuth } from "google-auth-library";

/**
 * Thin wrapper around the GA4 Data API (`runReport` / `runRealtimeReport`).
 *
 * Auth: a service-account JWT (GA4_SERVICE_ACCOUNT_KEY, the full JSON key
 * content) scoped read-only, granted Viewer access on the property in
 * GA4 → Admin → Property Access Management. See .env.example for the setup
 * steps — this module does nothing useful until both env vars are set.
 */

const SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];

let authClient: GoogleAuth | null = null;

function getAuth(serviceAccountKeyJson: string): GoogleAuth {
  if (authClient) return authClient;
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(serviceAccountKeyJson);
  } catch {
    throw new Error("GA4_SERVICE_ACCOUNT_KEY n'est pas un JSON valide (colle le contenu complet du fichier de clé)");
  }
  authClient = new GoogleAuth({ credentials, scopes: SCOPES });
  return authClient;
}

async function accessToken(serviceAccountKeyJson: string): Promise<string> {
  const auth = getAuth(serviceAccountKeyJson);
  const client = await auth.getClient();
  const res = await client.getAccessToken();
  if (!res.token) throw new Error("Impossible d'obtenir un jeton d'accès GA4 (vérifie GA4_SERVICE_ACCOUNT_KEY)");
  return res.token;
}

export interface Ga4Dimension {
  name: string;
}
export interface Ga4Metric {
  name: string;
}
export interface Ga4DateRange {
  startDate: string;
  endDate: string;
}
export interface Ga4RunReportRequest {
  dateRanges: Ga4DateRange[];
  dimensions?: Ga4Dimension[];
  metrics: Ga4Metric[];
  dimensionFilter?: Record<string, unknown>;
  orderBys?: Record<string, unknown>[];
  limit?: number;
}

export interface Ga4ReportRow {
  dimensionValues: Array<{ value: string }>;
  metricValues: Array<{ value: string }>;
}
export interface Ga4RunReportResponse {
  dimensionHeaders?: Array<{ name: string }>;
  metricHeaders?: Array<{ name: string; type: string }>;
  rows?: Ga4ReportRow[];
  rowCount?: number;
  /** `ResponseMetaData` — on n'en lit que le fuseau, cf. `ga4ReportTimeZone`. */
  metadata?: { timeZone?: string; currencyCode?: string };
}

async function callGa4(
  propertyId: string,
  serviceAccountKeyJson: string,
  endpoint: "runReport" | "runRealtimeReport",
  body: Record<string, unknown>,
): Promise<Ga4RunReportResponse> {
  const token = await accessToken(serviceAccountKeyJson);
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:${endpoint}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(`GA4 Data API ${endpoint} a répondu ${res.status}: ${details.slice(0, 500)}`);
  }
  return (await res.json()) as Ga4RunReportResponse;
}

export function runGa4Report(
  propertyId: string,
  serviceAccountKeyJson: string,
  req: Ga4RunReportRequest,
): Promise<Ga4RunReportResponse> {
  return callGa4(propertyId, serviceAccountKeyJson, "runReport", { ...req });
}

export function runGa4RealtimeReport(
  propertyId: string,
  serviceAccountKeyJson: string,
  req: { dimensions?: Ga4Dimension[]; metrics: Ga4Metric[]; limit?: number },
): Promise<Ga4RunReportResponse> {
  return callGa4(propertyId, serviceAccountKeyJson, "runRealtimeReport", { ...req });
}

/** Turns GA4's columnar rows into an array of plain objects keyed by dimension/metric name. */
export function ga4RowsToObjects(report: Ga4RunReportResponse): Array<Record<string, string>> {
  const dims = (report.dimensionHeaders ?? []).map((d) => d.name);
  const mets = (report.metricHeaders ?? []).map((m) => m.name);
  return (report.rows ?? []).map((row) => {
    const o: Record<string, string> = {};
    dims.forEach((name, i) => (o[name] = row.dimensionValues[i]?.value ?? ""));
    mets.forEach((name, i) => (o[name] = row.metricValues[i]?.value ?? ""));
    return o;
  });
}

export function ga4DateRangeFromDays(days: number): Ga4DateRange {
  return { startDate: `${days}daysAgo`, endDate: "today" };
}

/**
 * Le fuseau de la propriété, tel que GA4 le renvoie avec chaque rapport.
 *
 * C'est LUI qui donne son sens aux dimensions temporelles : `dateHourMinute`
 * vaut « YYYYMMDDHHMM » à l'heure de la propriété, pas en UTC. Sans ce fuseau,
 * une fenêtre glissante (« les 60 dernières minutes ») se décalerait d'une à
 * deux heures selon la saison — on afficherait des visites d'il y a trois
 * heures comme si elles venaient d'avoir lieu.
 *
 * `null` quand la réponse ne le porte pas : à l'appelant de dire qu'il ne sait
 * pas plutôt que de deviner.
 */
export function ga4ReportTimeZone(report: Ga4RunReportResponse): string | null {
  const tz = report.metadata?.timeZone;
  return typeof tz === "string" && tz.length > 0 ? tz : null;
}

/**
 * L'horodatage `dateHourMinute` (YYYYMMDDHHMM) d'un instant, dans un fuseau.
 *
 * Les deux se comparent alors comme des chaînes — l'ordre lexicographique de ce
 * format est l'ordre chronologique. Une réserve, assumée : aux deux
 * changements d'heure, l'heure locale n'est pas monotone, et une fenêtre
 * glissante peut se tromper d'une heure pendant une heure, deux fois par an.
 */
export function ga4MinuteStamp(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  // Intl peut rendre « 24 » pour minuit selon l'implémentation.
  const heure = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}${get("month")}${get("day")}${heure}${get("minute")}`;
}

export interface Ga4Config {
  propertyId: string;
  serviceAccountKey: string;
}

export function getGa4Config(): Ga4Config | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const env = require("@/env") as { GA4_PROPERTY_ID?: string; GA4_SERVICE_ACCOUNT_KEY?: string };
  if (!env.GA4_PROPERTY_ID || !env.GA4_SERVICE_ACCOUNT_KEY) return null;
  return { propertyId: env.GA4_PROPERTY_ID, serviceAccountKey: env.GA4_SERVICE_ACCOUNT_KEY };
}
