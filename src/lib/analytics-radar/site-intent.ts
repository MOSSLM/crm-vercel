import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listDemoSites } from "./demo-sites";
import { ga4DateRangeFromDays, ga4RowsToObjects, getGa4Config, runGa4Report } from "./ga4-client";
import { scoreIntent, type IntentSignals, type IntentVerdict } from "./intent";

/**
 * Intention par entreprise, calculée UNE fois et partagée par tous les écrans
 * qui en ont besoin (radar, file de démarchage, tableau de bord).
 *
 * Pourquoi un module commun plutôt qu'un calcul par écran : si la file de
 * démarchage notait « chaud » et que le radar disait « tiède » pour le même
 * prospect, plus personne ne ferait confiance à aucun des deux. Une seule
 * source, un seul score.
 *
 * Le cache mémoire de 60 s existe pour le quota GA4 : la file de démarchage
 * se recharge à chaque action du commercial, et refaire 5 rapports GA4 à
 * chaque clic épuiserait la propriété en une journée.
 */

export interface SiteIntent extends IntentVerdict {
  entrepriseId: number | null;
  hostname: string;
  companyName: string;
  sessions: number;
  pageViews: number;
  engagementSec: number;
  visitors: number;
  /** Jours distincts avec au moins une visite (ISO, croissant). */
  days: string[];
  lastDay: string | null;
}

const CACHE_MS = 60_000;
let cache: { at: number; rows: SiteIntent[] } | null = null;

const num = (v: string | undefined) => (v ? Number(v) || 0 : 0);
const isoDate = (d: string) => (/^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d);

/**
 * @param days fenêtre analysée. 7 jours par défaut : au-delà, une visite
 *   ancienne ferait remonter un prospect froid en tête de file d'appel.
 */
export async function intentBySite(sb: SupabaseClient, days = 7): Promise<SiteIntent[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;

  const ga4 = getGa4Config();
  const sites = await listDemoSites(sb).catch(() => []);
  if (!ga4 || !sites.length) {
    cache = { at: Date.now(), rows: [] };
    return [];
  }

  const hostToSite = new Map(sites.flatMap((s) => s.hostnames.map((h) => [h, s] as const)));
  const hosts = [...hostToSite.keys()];
  const dimensionFilter = { filter: { fieldName: "hostName", inListFilter: { values: hosts } } };

  const report = (dimensions: string[], metrics: string[], limit = 1000) =>
    runGa4Report(ga4.propertyId, ga4.serviceAccountKey, {
      dateRanges: [ga4DateRangeFromDays(days)],
      dimensions: dimensions.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })),
      dimensionFilter,
      limit,
    })
      .then(ga4RowsToObjects)
      .catch(() => [] as Array<Record<string, string>>);

  const [totals, byDevice, byHour, byDate, byEvent] = await Promise.all([
    report(["hostName"], ["sessions", "totalUsers", "screenPageViews", "userEngagementDuration"], 500),
    report(["hostName", "deviceCategory"], ["sessions"], 500),
    report(["hostName", "hour"], ["sessions"]),
    report(["hostName", "date"], ["sessions"]),
    report(["hostName", "eventName"], ["eventCount"]),
  ]);

  const group = <T>(rows: Array<Record<string, string>>, pick: (r: Record<string, string>) => T | null) => {
    const m = new Map<string, T[]>();
    rows.forEach((r) => {
      const site = r.hostName ? hostToSite.get(r.hostName) : undefined;
      if (!site) return;
      const v = pick(r);
      if (v == null) return;
      m.set(site.hostname, [...(m.get(site.hostname) ?? []), v]);
    });
    return m;
  };

  const devices = group(byDevice, (r) => (num(r.sessions) > 0 ? r.deviceCategory || null : null));
  const hours = group(byHour, (r) => (num(r.sessions) > 0 && r.hour !== "" ? Number(r.hour) : null));
  const daysBy = group(byDate, (r) => (num(r.sessions) > 0 ? isoDate(r.date) : null));
  const events = group(byEvent, (r) => (num(r.eventCount) > 0 ? r.eventName || null : null));

  const rows: SiteIntent[] = [];
  totals.forEach((r) => {
    const site = r.hostName ? hostToSite.get(r.hostName) : undefined;
    if (!site) return;
    const ev = events.get(site.hostname) ?? [];
    const d = [...new Set(daysBy.get(site.hostname) ?? [])].sort();
    const signals: IntentSignals = {
      sessions: num(r.sessions),
      visitors: num(r.totalUsers),
      engagementSec: num(r.userEngagementDuration),
      pageViews: num(r.screenPageViews),
      pages: [],
      devices: [...new Set(devices.get(site.hostname) ?? [])],
      hours: [...new Set(hours.get(site.hostname) ?? [])],
      days: d,
      formStarted: ev.includes("analytics_radar_form_start"),
      formSubmitted: ev.includes("analytics_radar_form_submit"),
      auditViewed: false,
      awaitingReply: false,
      replied: false,
    };
    rows.push({
      entrepriseId: site.enterpriseId,
      hostname: site.hostname,
      companyName: site.companyName,
      sessions: signals.sessions,
      pageViews: signals.pageViews,
      engagementSec: Math.round(signals.engagementSec),
      visitors: signals.visitors,
      days: d,
      lastDay: d[d.length - 1] ?? null,
      ...scoreIntent(signals),
    });
  });

  cache = { at: Date.now(), rows };
  return rows;
}

/** Indexé par entreprise, pour greffer l'intention sur une file de tâches. */
export async function intentByEnterprise(sb: SupabaseClient, days = 7): Promise<Map<number, SiteIntent>> {
  const rows = await intentBySite(sb, days);
  const m = new Map<number, SiteIntent>();
  rows.forEach((r) => {
    if (r.entrepriseId == null) return;
    // Une entreprise peut avoir plusieurs sites : on garde le plus chaud.
    const prev = m.get(r.entrepriseId);
    if (!prev || r.score > prev.score) m.set(r.entrepriseId, r);
  });
  return m;
}

/** À n'utiliser que dans les tests. */
export function __resetIntentCache() {
  cache = null;
}
