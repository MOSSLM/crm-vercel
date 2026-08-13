import { json } from "@/app/api/_lib/respond";
import { preflight } from "@/app/api/_lib/cors";
import { withAuth } from "@/app/api/_lib/with-auth";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { listDemoSites } from "@/lib/analytics-radar/demo-sites";
import { geocodeCity } from "@/lib/analytics-radar/city-geo";
import {
  ga4DateRangeFromDays,
  ga4RowsToObjects,
  getGa4Config,
  runGa4RealtimeReport,
  runGa4Report,
} from "@/lib/analytics-radar/ga4-client";
import { clarityInfoNumber } from "@/lib/analytics-radar/clarity-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const OPTIONS = (req: Request) => preflight(req);

const num = (v: string | undefined) => (v ? Number(v) || 0 : 0);
// GA4's `date` dimension comes back as "YYYYMMDD" — the frontend timeline
// (DayTrack) parses ISO "YYYY-MM-DD".
const isoDate = (yyyymmdd: string) =>
  /^\d{8}$/.test(yyyymmdd) ? `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}` : yyyymmdd;

/**
 * GET /api/analytics-radar?days=7|14|30
 *
 * Real GA4 + Clarity data for the radar analytics dashboard — no fabricated
 * numbers. Returns `configured.ga4`/`configured.clarity` so the UI can render
 * an honest "not set up yet" state per source instead of zeros that look like
 * real zeros. See .env.example for the credentials this needs.
 */
export const GET = withAuth({}, async ({ req, cors }) => {
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days")) || 7));

  const sb = getServiceClient();
  const sites = await listDemoSites(sb).catch(() => []);
  const hostToSite = new Map(sites.map((s) => [s.hostname, s]));

  const ga4 = getGa4Config();
  if (!ga4) {
    return json({
      configured: { ga4: false, clarity: false },
      range: { days },
      totalSites: sites.length,
      sites: sites.map((s) => ({ hostname: s.hostname, companyName: s.companyName, city: s.city, sector: s.sector })),
    }, { headers: cors });
  }

  const dateRanges = [ga4DateRangeFromDays(days)];
  const { propertyId, serviceAccountKey } = ga4;
  const report = (dimensions: string[], metrics: string[], limit = 250) =>
    runGa4Report(propertyId, serviceAccountKey, {
      dateRanges,
      dimensions: dimensions.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })),
      limit,
    }).then(ga4RowsToObjects).catch((e: unknown) => {
      console.error("[analytics-radar] GA4 report failed", dimensions, e);
      return [] as Array<Record<string, string>>;
    });

  const [daily, byCity, byHost, byDevice, bySource, byPage, byHour, formEvents, realtime] = await Promise.all([
    report(["date"], ["sessions", "screenPageViews", "engagedSessions", "userEngagementDuration"]),
    report(["city", "country"], ["sessions"], 100),
    report(["hostName"], ["sessions", "screenPageViews", "userEngagementDuration", "engagementRate"], 500),
    report(["deviceCategory"], ["sessions"]),
    report(["sessionSourceMedium"], ["sessions"], 30),
    report(["pagePath"], ["screenPageViews", "userEngagementDuration", "bounceRate"], 50),
    report(["dayOfWeek", "hour"], ["sessions"], 500),
    report(["eventName"], ["eventCount"], 20),
    runGa4RealtimeReport(propertyId, serviceAccountKey, {
      dimensions: [{ name: "unifiedScreenName" }, { name: "country" }, { name: "city" }],
      metrics: [{ name: "activeUsers" }],
    }).then(ga4RowsToObjects).catch(() => [] as Array<Record<string, string>>),
  ]);

  const totalSessions = daily.reduce((s, r) => s + num(r.sessions), 0);
  const totalPageViews = daily.reduce((s, r) => s + num(r.screenPageViews), 0);
  const totalEngaged = daily.reduce((s, r) => s + num(r.engagedSessions), 0);
  const totalEngagementSec = daily.reduce((s, r) => s + num(r.userEngagementDuration), 0);
  const formStarts = formEvents.find((e) => e.eventName === "analytics_radar_form_start");
  const formSubmits = formEvents.find((e) => e.eventName === "analytics_radar_form_submit");

  const hubs = byCity
    .map((r) => {
      const geo = geocodeCity(r.city);
      return {
        c: r.city || "Inconnue",
        country: r.country || "",
        n: num(r.sessions),
        lat: geo?.lat ?? null,
        lon: geo?.lon ?? null,
        rg: geo?.region ?? r.country ?? "",
      };
    })
    .sort((a, b) => b.n - a.n);

  const visitedHostnames = new Set<string>();
  const sitePerf = byHost
    .filter((r) => r.hostName && hostToSite.has(r.hostName))
    .map((r) => {
      visitedHostnames.add(r.hostName);
      const site = hostToSite.get(r.hostName)!;
      return {
        hostname: site.hostname,
        companyName: site.companyName,
        city: site.city,
        sector: site.sector,
        sessions: num(r.sessions),
        pageViews: num(r.screenPageViews),
        avgEngagementSec: num(r.sessions) > 0 ? num(r.userEngagementDuration) / num(r.sessions) : 0,
        engagementRate: num(r.engagementRate),
      };
    })
    .sort((a, b) => b.sessions - a.sessions);

  const notVisited = sites.filter((s) => !visitedHostnames.has(s.hostname));

  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  byHour.forEach((r) => {
    const dow = Number(r.dayOfWeek); // GA4: 0 = Sunday
    const hour = Number(r.hour);
    if (Number.isInteger(dow) && Number.isInteger(hour) && heatmap[dow]) heatmap[dow][hour] = num(r.sessions);
  });

  // Clarity's cache is refreshed by a cron on a schedule that respects its
  // 10-req/day quota (see the cron route + sql migration) — read-only here.
  const { data: clarityRows } = await sb
    .from("analytics_radar_clarity_cache")
    .select("metric_name, dimension1, payload, fetched_at")
    .order("fetched_at", { ascending: false });
  const clarityConfigured = !!clarityRows && clarityRows.length > 0;
  const clarity = clarityConfigured
    ? {
        asOf: clarityRows![0].fetched_at as string,
        byDimension: (clarityRows ?? []).reduce<Record<string, Array<Record<string, unknown>>>>((acc, row) => {
          const key = `${row.metric_name}:${row.dimension1 ?? ""}`;
          const payload = Array.isArray(row.payload) ? (row.payload as Array<Record<string, unknown>>) : [];
          acc[key] = payload.map((p) => ({
            ...p,
            _rage: clarityInfoNumber(p, "RageClickCount", "rageClickCount"),
            _dead: clarityInfoNumber(p, "DeadClickCount", "deadClickCount"),
          }));
          return acc;
        }, {}),
      }
    : null;

  return json(
    {
      configured: { ga4: true, clarity: clarityConfigured },
      range: { days },
      totalSites: sites.length,
      kpis: {
        sessions: totalSessions,
        pageViews: totalPageViews,
        pagesPerSession: totalSessions > 0 ? totalPageViews / totalSessions : 0,
        engagementRate: totalSessions > 0 ? totalEngaged / totalSessions : 0,
        avgSessionDurationSec: totalSessions > 0 ? totalEngagementSec / totalSessions : 0,
        sitesVisited: sitePerf.length,
        formsStarted: num(formStarts?.eventCount),
        formsSubmitted: num(formSubmits?.eventCount),
      },
      timeseries: daily
        .map((r) => ({ date: isoDate(r.date), sessions: num(r.sessions) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      hubs,
      sites: sitePerf,
      notVisitedSites: notVisited.map((s) => ({ hostname: s.hostname, companyName: s.companyName })),
      devices: byDevice.map((r) => ({ device: r.deviceCategory, sessions: num(r.sessions) })),
      sources: bySource.map((r) => ({ source: r.sessionSourceMedium, sessions: num(r.sessions) })),
      pages: byPage.map((r) => ({
        path: r.pagePath,
        views: num(r.screenPageViews),
        avgEngagementSec: num(r.screenPageViews) > 0 ? num(r.userEngagementDuration) / num(r.screenPageViews) : 0,
        bounceRate: num(r.bounceRate),
      })),
      heatmap,
      realtime: {
        activeUsers: realtime.reduce((s, r) => s + num(r.activeUsers), 0),
        byCountry: realtime.map((r) => ({
          country: r.country,
          city: r.city,
          screenName: r.unifiedScreenName || "",
          activeUsers: num(r.activeUsers),
        })),
      },
      clarity,
    },
    { headers: cors },
  );
});
