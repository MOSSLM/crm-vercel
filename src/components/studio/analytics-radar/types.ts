// types.ts — shape of GET /api/analytics-radar's JSON payload (kept in sync by hand).
import type { GlobeHubRow } from "./Globe";

/** Les deux périmètres du radar, jamais mélangés (cf. le paramètre `scope`). */
export type RadarScope = "demos" | "vitrine";

/** Une ligne de la liste d'appel, triée par intention décroissante. */
export interface AnalyticsRadarIntentRow {
  hostname: string;
  companyName: string;
  city: string | null;
  sessions: number;
  pageViews: number;
  engagementSec: number;
  lastDay: string | null;
  score: number;
  tier: "none" | "tiede" | "chaud" | "tres_chaud" | "brulant";
  flame: string;
  callWhen: "maintenant" | "aujourdhui" | "j1" | "j2" | "plus_tard";
  /** Justifications, chacune adossée à une mesure réelle. */
  reasons: string[];
}

export interface AnalyticsRadarSitePerf {
  hostname: string;
  companyName: string;
  city: string | null;
  sector: string | null;
  sessions: number;
  pageViews: number;
  avgEngagementSec: number;
  engagementRate: number;
  /** True when this row only exists thanks to GA4 Realtime — the standard
   *  report (sessions/duration/engagement) hasn't processed this visit yet. */
  pending: boolean;
}

export interface AnalyticsRadarPageRow {
  path: string;
  views: number;
  avgEngagementSec: number;
  bounceRate: number;
}

export interface AnalyticsRadarPayload {
  configured: { ga4: boolean; clarity: boolean };
  /** Périmètre mesuré : sites démo envoyés aux prospects, ou notre vitrine. */
  scope: RadarScope;
  /** GA4 Realtime ne sait pas filtrer par domaine : le bloc temps réel est
   *  classé par titre de page, donc approximatif, contrairement au reste. */
  realtimeScopeIsApproximate: boolean;
  /** Non null quand des appels GA4 ont échoué : les chiffres sont incomplets
   *  et l'UI doit le dire au lieu de les présenter comme des zéros mesurés. */
  degraded: { failedReports: number } | null;
  range: { days: number };
  totalSites: number;
  kpis: {
    sessions: number;
    pageViews: number;
    pagesPerSession: number;
    engagementRate: number;
    avgSessionDurationSec: number;
    sitesVisited: number;
    formsStarted: number;
    formsSubmitted: number;
    /** True when there's real GA4 Realtime activity but the standard report
     *  hasn't caught up yet — sessions/duration/engagement below are still 0
     *  because of that latency, not because nothing happened. */
    processing: boolean;
  };
  timeseries: Array<{ date: string; sessions: number }>;
  hubs: Array<GlobeHubRow & { country: string; share: number; visitedSites: number; citySites: number }>;
  intent: AnalyticsRadarIntentRow[];
  sites: AnalyticsRadarSitePerf[];
  notVisitedSites: Array<{ hostname: string; companyName: string }>;
  devices: Array<{ device: string; sessions: number }>;
  sources: Array<{ source: string; sessions: number }>;
  pages: AnalyticsRadarPageRow[];
  heatmap: number[][];
  realtime: {
    activeUsers: number;
    visits: Array<{
      screenName: string;
      companyName: string | null;
      hostname: string | null;
      device: string;
      city: string;
      country: string;
      activeUsers: number;
      pageViews: number;
      sinceMinutes: number;
    }>;
    feed: Array<{
      kind: "pv" | "fm" | "rg";
      text: string;
      companyName: string | null;
      screenName: string;
      city: string;
      device: string;
      minutesAgo: number;
    }>;
    formActivity: { starts: number; submits: number };
  };
  clarity: { asOf: string; byDimension: Record<string, Array<Record<string, unknown>>> } | null;
}

/** Shape returned when GA4 isn't configured yet — a strict subset. */
export interface AnalyticsRadarUnconfigured {
  configured: { ga4: false; clarity: boolean };
  range: { days: number };
  totalSites: number;
  sites: Array<{ hostname: string; companyName: string; city: string | null; sector: string | null }>;
}
