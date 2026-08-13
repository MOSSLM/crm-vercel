// types.ts — shape of GET /api/analytics-radar's JSON payload (kept in sync by hand).
import type { GlobeHubRow } from "./Globe";

export interface AnalyticsRadarSitePerf {
  hostname: string;
  companyName: string;
  city: string | null;
  sector: string | null;
  sessions: number;
  pageViews: number;
  avgEngagementSec: number;
  engagementRate: number;
}

export interface AnalyticsRadarPageRow {
  path: string;
  views: number;
  avgEngagementSec: number;
  bounceRate: number;
}

export interface AnalyticsRadarPayload {
  configured: { ga4: boolean; clarity: boolean };
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
  };
  timeseries: Array<{ date: string; sessions: number }>;
  hubs: Array<GlobeHubRow & { country: string }>;
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
