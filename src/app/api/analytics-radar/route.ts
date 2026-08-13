import { json } from "@/app/api/_lib/respond";
import { preflight } from "@/app/api/_lib/cors";
import { withAuth } from "@/app/api/_lib/with-auth";
import { requireStaff } from "@/app/api/_lib/require-staff";
import { getServiceClient } from "@/app/api/_lib/service-client";
import { listDemoSites } from "@/lib/analytics-radar/demo-sites";
import { geocodeCitiesFromCommunes, geocodeCity, type CityGeo } from "@/lib/analytics-radar/city-geo";
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

type Ga4Row = Record<string, string>;
type DemoSiteLike = { hostname: string; companyName: string };

// Événements GA4 dignes d'une ligne dans le flux — le reste (user_engagement,
// scroll…) se déclenche en continu et noierait le flux sous du bruit.
const FEED_EVENT_LABELS: Record<string, { text: string; kind: "pv" | "fm" | "rg" }> = {
  form_start: { text: "a testé le formulaire", kind: "fm" },
  form_submit: { text: "a envoyé le formulaire", kind: "fm" },
  first_visit: { text: "nouvelle visite", kind: "pv" },
};

export interface RealtimeFeedItem {
  kind: "pv" | "fm" | "rg";
  text: string;
  companyName: string | null;
  screenName: string;
  city: string;
  device: string;
  minutesAgo: number;
}

/**
 * Merges 5 separate GA4 Realtime queries into one "who's here right now" view.
 * Split up because Realtime rejects most dimension combinations together
 * (e.g. screenName + eventName in one query 400s) — each query below was
 * verified individually against a live property.
 */
function buildRealtime(
  main: Ga4Row[],
  minutes: Ga4Row[],
  events: Ga4Row[],
  perMinute: Ga4Row[],
  eventsByMinute: Ga4Row[],
  matchSite: (screenName: string) => DemoSiteLike | null,
) {
  const num = (v: string | undefined) => (v ? Number(v) || 0 : 0);

  // "Depuis combien de temps" est une approximation par page, pas par
  // visiteur individuel (Realtime n'expose pas d'identifiant de session) :
  // le plus vieux `minutesAgo` où cette page a eu de l'activité.
  const sinceByScreen = new Map<string, number>();
  minutes.forEach((r) => {
    const m = Number(r.minutesAgo);
    if (!Number.isFinite(m)) return;
    const prev = sinceByScreen.get(r.unifiedScreenName) ?? 0;
    if (m > prev) sinceByScreen.set(r.unifiedScreenName, m);
  });

  const visits = main
    .map((r) => {
      const site = matchSite(r.unifiedScreenName || "");
      return {
        screenName: r.unifiedScreenName || "",
        companyName: site?.companyName ?? null,
        hostname: site?.hostname ?? null,
        device: r.deviceCategory || "",
        city: r.city || "",
        country: r.country || "",
        activeUsers: num(r.activeUsers),
        pageViews: num(r.screenPageViews),
        sinceMinutes: sinceByScreen.get(r.unifiedScreenName) ?? 0,
      };
    })
    .filter((v) => v.activeUsers > 0)
    .sort((a, b) => b.activeUsers - a.activeUsers);

  const eventCount = (name: string) => num(events.find((e) => e.eventName === name)?.eventCount);

  // Le flux chronologique (équivalent réel du "LiveFeed" de la maquette) :
  // une ligne par (page, minute) réellement active, plus une ligne par
  // événement notable (form_start/submit…) réellement survenu.
  const feed: RealtimeFeedItem[] = [];

  // minutesAgo → écrans distincts actifs cette minute-là, pour tenter de
  // rattacher un événement (form_start…) à un site quand un seul candidat
  // existe à cette minute précise. Au-delà de 1 candidat, on ne devine pas.
  const screensAtMinute = new Map<string, Set<string>>();

  perMinute.forEach((r) => {
    const m = Number(r.minutesAgo);
    if (!Number.isFinite(m) || num(r.activeUsers) <= 0) return;
    const screen = r.unifiedScreenName || "";
    const set = screensAtMinute.get(r.minutesAgo) ?? new Set<string>();
    set.add(screen);
    screensAtMinute.set(r.minutesAgo, set);
    const site = matchSite(screen);
    feed.push({
      kind: "pv",
      text: "a consulté",
      companyName: site?.companyName ?? null,
      screenName: screen,
      city: r.city || "",
      device: r.deviceCategory || "",
      minutesAgo: m,
    });
  });

  eventsByMinute.forEach((r) => {
    const label = FEED_EVENT_LABELS[r.eventName];
    if (!label) return;
    const m = Number(r.minutesAgo);
    if (!Number.isFinite(m)) return;
    const candidates = screensAtMinute.get(r.minutesAgo);
    const screen = candidates && candidates.size === 1 ? [...candidates][0] : "";
    const site = screen ? matchSite(screen) : null;
    feed.push({
      kind: label.kind,
      text: label.text,
      companyName: site?.companyName ?? null,
      screenName: screen,
      city: "",
      device: "",
      minutesAgo: m,
    });
  });

  feed.sort((a, b) => a.minutesAgo - b.minutesAgo);

  return {
    activeUsers: visits.reduce((s, v) => s + v.activeUsers, 0),
    visits,
    feed: feed.slice(0, 20),
    formActivity: {
      starts: eventCount("analytics_radar_form_start"),
      submits: eventCount("analytics_radar_form_submit"),
    },
  };
}

/**
 * GET /api/analytics-radar?days=7|14|30
 *
 * Real GA4 + Clarity data for the radar analytics dashboard — no fabricated
 * numbers. Returns `configured.ga4`/`configured.clarity` so the UI can render
 * an honest "not set up yet" state per source instead of zeros that look like
 * real zeros. See .env.example for the credentials this needs.
 */
export const GET = withAuth({}, async ({ req, cors, user }) => {
  // Cette route expose les analytics de TOUS les sites démo, tous prospects
  // confondus — donc admin et agents freelance seulement. Un compte `client`
  // possède un jeton Supabase valide et passerait sans ce garde-fou.
  const staff = await requireStaff(user, cors);
  if (!staff.ok) return staff.response;

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

  const realtimeReport = (dimensions: string[], metrics: string[]) =>
    runGa4RealtimeReport(propertyId, serviceAccountKey, {
      dimensions: dimensions.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })),
    }).then(ga4RowsToObjects).catch((e: unknown) => {
      console.error("[analytics-radar] GA4 realtime report failed", dimensions, e);
      return [] as Array<Record<string, string>>;
    });

  const [
    daily,
    byCity,
    byCityHost,
    byHost,
    byDevice,
    bySource,
    byPage,
    byHour,
    formEvents,
    realtimeMain,
    realtimeMinutes,
    realtimeEvents,
    realtimePerMinute,
    realtimeEventsByMinute,
  ] = await Promise.all([
    report(["date"], ["sessions", "screenPageViews", "engagedSessions", "userEngagementDuration"]),
    report(["city", "country"], ["sessions"], 100),
    // Ville × site démo : alimente « combien de sites démo distincts ont été
    // consultés depuis cette ville » dans l'infobulle du globe.
    report(["city", "hostName"], ["sessions"], 500),
    report(["hostName"], ["sessions", "screenPageViews", "userEngagementDuration", "engagementRate"], 500),
    report(["deviceCategory"], ["sessions"]),
    report(["sessionSourceMedium"], ["sessions"], 30),
    report(["pagePath"], ["screenPageViews", "userEngagementDuration", "bounceRate"], 50),
    report(["dayOfWeek", "hour"], ["sessions"], 500),
    report(["eventName"], ["eventCount"], 20),
    // GA4 Realtime's dimension set is much narrower than the standard Data API
    // (no hostName, and most dimension combos are rejected together — see the
    // 5 separate queries below), so "which site" is derived by matching the
    // page title (unifiedScreenName, e.g. "Accueil — Fluide CPC") against the
    // real demo sites list rather than queried directly.
    realtimeReport(["unifiedScreenName", "deviceCategory", "city", "country"], ["activeUsers", "screenPageViews"]),
    realtimeReport(["unifiedScreenName", "minutesAgo"], ["activeUsers"]),
    realtimeReport(["eventName"], ["eventCount"]),
    // Per-minute breakdown → the chronological "flux" feed (real equivalent of
    // the design's simulated LiveFeed).
    realtimeReport(["unifiedScreenName", "minutesAgo", "city", "deviceCategory"], ["activeUsers"]),
    realtimeReport(["eventName", "minutesAgo"], ["eventCount"]),
  ]);

  // "Accueil — Fluide CPC" → matches the site named "Fluide CPC". Falls back to
  // null (still shown, just without a site/hostname attached) when the title
  // doesn't carry a recognizable company name (e.g. before the template sets it).
  const matchSiteByScreenName = (screenName: string) =>
    sites.find((s) => s.companyName && screenName.toLowerCase().includes(s.companyName.toLowerCase())) ?? null;

  const totalSessions = daily.reduce((s, r) => s + num(r.sessions), 0);
  const totalPageViews = daily.reduce((s, r) => s + num(r.screenPageViews), 0);
  const totalEngaged = daily.reduce((s, r) => s + num(r.engagedSessions), 0);
  const totalEngagementSec = daily.reduce((s, r) => s + num(r.userEngagementDuration), 0);
  const formStarts = formEvents.find((e) => e.eventName === "analytics_radar_form_start");
  const formSubmits = formEvents.find((e) => e.eventName === "analytics_radar_form_submit");
  const realtime = buildRealtime(
    realtimeMain,
    realtimeMinutes,
    realtimeEvents,
    realtimePerMinute,
    realtimeEventsByMinute,
    matchSiteByScreenName,
  );
  // form_start/form_submit are standard GA4 events too, so they're subject to
  // the exact same processing latency as everything else in `formEvents` —
  // Realtime already counts them correctly (real GA4 numbers, not derived),
  // so use whichever source currently has the higher count instead of
  // waiting on the standard report to catch up.
  const formsStarted = Math.max(num(formStarts?.eventCount), realtime.formActivity.starts);
  const formsSubmitted = Math.max(num(formSubmits?.eventCount), realtime.formActivity.submits);

  // Sites démo distincts réellement consultés depuis chaque ville (GA4), et
  // sites démo publiés pour des entreprises basées dans cette ville (base CRM).
  // Deux chiffres différents et volontairement séparés : « on a livré 4 sites
  // à des entreprises de Nantes » n'est pas « 2 sites démo ont été ouverts
  // depuis Nantes » — un prospect peut consulter depuis n'importe où.
  const visitedSitesByCity = new Map<string, Set<string>>();
  byCityHost.forEach((r) => {
    if (!r.hostName || !hostToSite.has(r.hostName)) return;
    const city = r.city || "Inconnue";
    const set = visitedSitesByCity.get(city) ?? new Set<string>();
    set.add(r.hostName);
    visitedSitesByCity.set(city, set);
  });
  const citySiteCount = new Map<string, number>();
  sites.forEach((s) => {
    if (!s.city) return;
    citySiteCount.set(s.city, (citySiteCount.get(s.city) ?? 0) + 1);
  });

  // Géocodage sur le vrai référentiel des communes (34 900 entrées en base),
  // pas sur une liste écrite en dur : une visite depuis une petite commune
  // doit apparaître sur le globe comme n'importe quelle métropole.
  const cityNames = [...byCity.map((r) => r.city), ...realtimeMain.map((r) => r.city)].filter(Boolean);
  const geoByCity = await geocodeCitiesFromCommunes(sb, cityNames).catch(() => new Map<string, CityGeo>());
  const geoFor = (city: string) => geoByCity.get(city) ?? geocodeCity(city);

  const hubs = byCity.map((r) => {
    const geo = geoFor(r.city);
    const city = r.city || "Inconnue";
    return {
      c: city,
      country: r.country || "",
      n: num(r.sessions),
      lat: geo?.lat ?? null,
      lon: geo?.lon ?? null,
      rg: geo?.region ?? r.country ?? "",
      visitedSites: visitedSitesByCity.get(city)?.size ?? 0,
      citySites: citySiteCount.get(city) ?? 0,
    };
  });

  // Same processing-latency gap as sites above: a city with real active
  // visitors right now but no standard-report rows yet would otherwise be
  // completely absent from the globe. Only added when the city has no
  // standard-report row at all yet, so a city already tracked by `byCity`
  // is never double-counted between the two sources.
  const hubCities = new Set(hubs.map((h) => h.c));
  const realtimeCityAgg = new Map<string, { country: string; activeUsers: number }>();
  realtimeMain.forEach((r) => {
    if (!r.city || num(r.activeUsers) <= 0) return;
    const cur = realtimeCityAgg.get(r.city) ?? { country: r.country || "", activeUsers: 0 };
    cur.activeUsers += num(r.activeUsers);
    realtimeCityAgg.set(r.city, cur);
  });
  realtimeCityAgg.forEach(({ country, activeUsers }, city) => {
    if (hubCities.has(city)) return;
    const geo = geoFor(city);
    hubs.push({
      c: city,
      country,
      n: activeUsers,
      lat: geo?.lat ?? null,
      lon: geo?.lon ?? null,
      rg: geo?.region ?? country,
      visitedSites: visitedSitesByCity.get(city)?.size ?? 0,
      citySites: citySiteCount.get(city) ?? 0,
    });
  });
  hubs.sort((a, b) => b.n - a.n);

  // Part de chaque ville, calculée sur le total des hubs eux-mêmes. Diviser
  // par kpis.sessions donnerait des pourcentages > 100 % : une ville peut
  // venir du temps réel alors que le rapport standard compte encore 0 session.
  const hubTotal = hubs.reduce((s, h) => s + h.n, 0);
  const hubsWithShare = hubs.map((h) => ({ ...h, share: hubTotal > 0 ? h.n / hubTotal : 0 }));

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
        pending: false,
      };
    })
    .sort((a, b) => b.sessions - a.sessions);

  // GA4's standard Data API (runReport, used for everything above) has real
  // processing latency on Google's side — a session from a few minutes ago
  // can take hours to show up in `byHost`/`daily`/`byCity`. Realtime
  // (`realtimeMain`) is the only thing that sees it instantly, but only
  // exposes activeUsers/pageViews — no session count, duration or engagement
  // rate. Rather than let a just-happened visit read as "not visited" until
  // Google's pipeline catches up, surface it now with what Realtime actually
  // knows, clearly marked `pending` so the UI doesn't pass it off as final.
  const realtimeSiteAgg = new Map<string, { site: (typeof sites)[number]; pageViews: number; activeUsers: number }>();
  realtimeMain.forEach((r) => {
    const site = matchSiteByScreenName(r.unifiedScreenName || "");
    if (!site) return;
    const cur = realtimeSiteAgg.get(site.hostname) ?? { site, pageViews: 0, activeUsers: 0 };
    cur.pageViews += num(r.screenPageViews);
    cur.activeUsers += num(r.activeUsers);
    realtimeSiteAgg.set(site.hostname, cur);
  });
  realtimeSiteAgg.forEach(({ site, pageViews }, hostname) => {
    visitedHostnames.add(hostname);
    if (sitePerf.some((s) => s.hostname === hostname)) return; // standard data already landed for this one
    sitePerf.push({
      hostname: site.hostname,
      companyName: site.companyName,
      city: site.city,
      sector: site.sector,
      sessions: 0,
      pageViews,
      avgEngagementSec: 0,
      engagementRate: 0,
      pending: true,
    });
  });

  const notVisited = sites.filter((s) => !visitedHostnames.has(s.hostname));

  // Sessions/pageViews/duration/engagement genuinely have no realtime
  // equivalent (GA4 Realtime doesn't expose those metrics at all) — when
  // there's real activity but the standard report hasn't processed it yet,
  // flag it so the UI can say "en cours de traitement" instead of a bare 0.
  const processing = totalSessions === 0 && (realtime.activeUsers > 0 || realtimeSiteAgg.size > 0);

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
        sitesVisited: visitedHostnames.size,
        formsStarted,
        formsSubmitted,
        processing,
      },
      timeseries: daily
        .map((r) => ({ date: isoDate(r.date), sessions: num(r.sessions) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      hubs: hubsWithShare,
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
      realtime,
      clarity,
    },
    { headers: cors },
  );
});
