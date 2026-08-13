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
import { scoreIntent, type IntentSignals } from "@/lib/analytics-radar/intent";
import { SITE_DOMAIN } from "@/lib/site-domain";

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
export type RadarScope = "demos" | "vitrine";

// Événements GA4 dignes d'une ligne dans le flux — le reste (user_engagement,
// scroll…) se déclenche en continu et noierait le flux sous du bruit.
// Les clés doivent être les noms d'événements RÉELLEMENT émis par
// FormRuntime.tsx (`analytics_radar_*`) : avec `form_start`/`form_submit`,
// aucune ligne formulaire n'atteignait jamais le flux, alors que le bandeau
// juste au-dessus en annonçait depuis la même requête.
const FEED_EVENT_LABELS: Record<string, { text: string; kind: "pv" | "fm" | "rg" }> = {
  analytics_radar_form_start: { text: "a testé le formulaire", kind: "fm" },
  analytics_radar_form_submit: { text: "a envoyé le formulaire", kind: "fm" },
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
  /** Requête sans dimension : le seul compte d'utilisateurs actifs correct. */
  totalRows: Ga4Row[],
  matchSite: (screenName: string) => DemoSiteLike | null,
  /** Garde le flux dans le périmètre choisi (démos ou vitrine). */
  inScope: (screenName: string) => boolean,
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
    .filter((r) => inScope(r.unifiedScreenName || ""))
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
    if (!inScope(screen)) return;
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
    // Surtout PAS visits.reduce(...) : `activeUsers` n'est pas additif entre
    // les lignes d'une requête multi-dimensions (voir la requête sans
    // dimension côté appelant).
    activeUsers: num(totalRows[0]?.activeUsers),
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
  // Deux périmètres qui ne se mélangent jamais : les sites démo envoyés aux
  // prospects, ou notre propre vitrine. Le filtre part de l'hôte, donc la
  // séparation est faite par GA4 lui-même et non par un tri approximatif.
  const scope: RadarScope = url.searchParams.get("scope") === "vitrine" ? "vitrine" : "demos";

  const sb = getServiceClient();
  const sites = await listDemoSites(sb).catch(() => []);
  // Un site peut répondre sur plusieurs hôtes (sous-domaine + domaine du
  // client) : la table d'attribution les couvre tous, sinon les visites sur le
  // domaine personnalisé seraient perdues.
  const hostToSite = new Map(sites.flatMap((s) => s.hostnames.map((h) => [h, s] as const)));
  const demoHostnames = [...hostToSite.keys()];
  // La vitrine, c'est l'apex et son www — surtout pas les sous-domaines, qui
  // sont justement les sites démo.
  const vitrineHostnames = [SITE_DOMAIN, `www.${SITE_DOMAIN}`];
  const scopeHostnames = scope === "vitrine" ? vitrineHostnames : demoHostnames;

  // Signaux CRM qui complètent la mesure GA4 : une séquence en attente de
  // réponse, ou une séquence relancée parce que le prospect a répondu. Une
  // lecture ratée ne doit pas faire tomber l'écran : on repart sans ces
  // signaux plutôt que d'échouer.
  const awaitingReplyCompanies = new Set<string>();
  const repliedCompanies = new Set<string>();
  try {
    const { data: enrollments } = await sb
      .from("sequence_enrollments")
      .select("status, hold_reason, entreprises(name)")
      .in("status", ["active", "exited"]);
    (enrollments ?? []).forEach((e) => {
      const row = e as unknown as { hold_reason: string | null; entreprises: { name: string | null } | null };
      const name = row.entreprises?.name;
      if (!name) return;
      if (row.hold_reason === "awaiting_reply") awaitingReplyCompanies.add(name);
      else repliedCompanies.add(name);
    });
  } catch {
    // pas de signal CRM ce coup-ci — le score se fera sur GA4 seul
  }

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

  // Un appel GA4 qui échoue ne doit JAMAIS se lire comme « mesuré à zéro ».
  // On compte les échecs pour les remonter au client (`degraded`), sinon un
  // quota dépassé afficherait « aucun prospect n'a ouvert sa démo » alors que
  // GA4 n'a simplement pas répondu.
  let failedReports = 0;

  // La propriété GA4 reçoit aussi les aperçus (/preview/**) et les rapports
  // d'audit (rapport.<domaine>), qui portent le même tag. Sans ce filtre, le
  // trafic interne de l'équipe est compté comme des visites de prospects sur
  // les sites démo. GA4 filtre côté serveur, donc c'est exact et gratuit.
  const demoSitesFilter = scopeHostnames.length
    ? { filter: { fieldName: "hostName", inListFilter: { values: scopeHostnames } } }
    : undefined;

  const report = (dimensions: string[], metrics: string[], limit = 250) =>
    runGa4Report(propertyId, serviceAccountKey, {
      dateRanges,
      dimensions: dimensions.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })),
      ...(demoSitesFilter ? { dimensionFilter: demoSitesFilter } : {}),
      limit,
    }).then(ga4RowsToObjects).catch((e: unknown) => {
      console.error("[analytics-radar] GA4 report failed", dimensions, e);
      failedReports += 1;
      return [] as Array<Record<string, string>>;
    });

  // GA4 Realtime n'expose pas `hostName` : impossible d'y appliquer le même
  // filtre. Les chiffres temps réel restent donc à l'échelle de la propriété,
  // et l'UI doit le dire plutôt que de les présenter comme du trafic démo.
  const realtimeReport = (dimensions: string[], metrics: string[]) =>
    runGa4RealtimeReport(propertyId, serviceAccountKey, {
      dimensions: dimensions.map((name) => ({ name })),
      metrics: metrics.map((name) => ({ name })),
    }).then(ga4RowsToObjects).catch((e: unknown) => {
      console.error("[analytics-radar] GA4 realtime report failed", dimensions, e);
      failedReports += 1;
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
    realtimeTotal,
    realtimeByCity,
    byHostDevice,
    byHostHour,
    byHostDate,
    byHostPage,
    byHostEvent,
  ] = await Promise.all([
    report(["date"], ["sessions", "screenPageViews", "engagedSessions", "userEngagementDuration"]),
    report(["city", "country"], ["sessions"], 100),
    // Ville × site démo : alimente « combien de sites démo distincts ont été
    // consultés depuis cette ville » dans l'infobulle du globe.
    report(["city", "hostName"], ["sessions"], 500),
    report(["hostName"], ["sessions", "screenPageViews", "userEngagementDuration", "engagementRate", "totalUsers"], 500),
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
    // `activeUsers` est un compte d'utilisateurs DÉ-DUPLIQUÉ, dédupliqué
    // seulement à l'intérieur d'une ligne : additionner les lignes d'une
    // requête à 4 dimensions compte 3 fois un visiteur qui a vu 3 pages. Ces
    // deux requêtes (sans dimension, et par ville) donnent les vrais totaux.
    realtimeReport([], ["activeUsers"]),
    realtimeReport(["city"], ["activeUsers"]),
    // Signaux d'intention, par site : appareils, heures, jours, pages, et les
    // événements de formulaire rattachés à leur hôte (le rapport global par
    // eventName ne dit pas SUR QUEL site le formulaire a été rempli).
    report(["hostName", "deviceCategory"], ["sessions"], 500),
    report(["hostName", "hour"], ["sessions"], 1000),
    report(["hostName", "date"], ["sessions"], 1000),
    report(["hostName", "pagePath"], ["screenPageViews"], 1000),
    report(["hostName", "eventName"], ["eventCount"], 1000),
  ]);

  // "Accueil — Fluide CPC" → matches the site named "Fluide CPC". Falls back to
  // null (still shown, just without a site/hostname attached) when the title
  // doesn't carry a recognizable company name (e.g. before the template sets it).
  //
  // Piège : la page de rapport d'audit (rapport.<domaine>) porte le même tag
  // GA4 et s'intitule « {Entreprise} — analyse de votre site », avec le MÊME
  // nom d'entreprise. Sans cette exclusion, relire un audit en interne
  // comptait comme « le prospect a ouvert sa démo ».
  const NON_DEMO_TITLE = /analyse de votre site|aperçu|preview/i;
  const demoSiteForTitle = (screenName: string) => {
    if (!screenName || NON_DEMO_TITLE.test(screenName)) return null;
    return sites.find((s) => s.companyName && screenName.toLowerCase().includes(s.companyName.toLowerCase())) ?? null;
  };
  // GA4 Realtime n'expose PAS `hostName` (vérifié : l'API répond 400), donc le
  // temps réel ne peut pas être filtré par domaine comme le reste. On classe
  // chaque ligne par son titre de page : soit elle correspond à un site démo,
  // soit non — ce qui, en périmètre vitrine, revient à garder tout ce qui n'est
  // ni une démo ni un rapport d'audit. C'est une approximation, contrairement
  // au reste de l'écran qui est filtré côté GA4 ; l'UI le signale.
  const matchSiteByScreenName = (screenName: string) => {
    const demo = demoSiteForTitle(screenName);
    if (scope === "vitrine") return null;
    return demo;
  };
  const inScopeRealtime = (screenName: string) =>
    scope === "vitrine" ? !demoSiteForTitle(screenName) && !NON_DEMO_TITLE.test(screenName) : !!demoSiteForTitle(screenName);

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
    realtimeTotal,
    matchSiteByScreenName,
    inScopeRealtime,
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
  // Compte par ville pris sur la requête dédiée `["city"] → activeUsers` :
  // GA4 y déduplique par ville, alors qu'additionner les lignes de
  // `realtimeMain` (4 dimensions) compterait plusieurs fois un même visiteur.
  const realtimeCountryByCity = new Map(realtimeMain.map((r) => [r.city, r.country || ""]));
  const realtimeCityAgg = new Map<string, { country: string; activeUsers: number }>();
  realtimeByCity.forEach((r) => {
    if (!r.city || num(r.activeUsers) <= 0) return;
    realtimeCityAgg.set(r.city, {
      country: realtimeCountryByCity.get(r.city) ?? "",
      activeUsers: num(r.activeUsers),
    });
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

  // ── Signaux d'intention, par site démo ──────────────────────────────────
  // Chaque valeur vient d'un rapport GA4 filtré sur les hôtes du site : rien
  // n'est déduit d'un autre site ni d'une moyenne.
  const groupByHost = <T>(rows: Ga4Row[], pick: (r: Ga4Row) => T | null) => {
    const m = new Map<string, T[]>();
    rows.forEach((r) => {
      const site = r.hostName ? hostToSite.get(r.hostName) : undefined;
      if (!site) return;
      const v = pick(r);
      if (v == null) return;
      const arr = m.get(site.hostname) ?? [];
      arr.push(v);
      m.set(site.hostname, arr);
    });
    return m;
  };
  const devicesByHost = groupByHost(byHostDevice, (r) => (num(r.sessions) > 0 ? r.deviceCategory || null : null));
  const hoursByHost = groupByHost(byHostHour, (r) => (num(r.sessions) > 0 && r.hour !== "" ? Number(r.hour) : null));
  const daysByHost = groupByHost(byHostDate, (r) => (num(r.sessions) > 0 ? isoDate(r.date) : null));
  const pagesByHost = groupByHost(byHostPage, (r) => (num(r.screenPageViews) > 0 ? r.pagePath || null : null));
  const eventsByHost = groupByHost(byHostEvent, (r) => (num(r.eventCount) > 0 ? r.eventName || null : null));

  // Le rapport d'audit vit sur son propre sous-domaine et porte le même tag
  // GA4 : on sait donc qui a ouvert son audit, par le titre de la page.
  const auditViewedCompanies = new Set(
    byPage
      .filter((r) => NON_DEMO_TITLE.test(r.pagePath || ""))
      .map((r) => r.pagePath || ""),
  );

  const usersByHost = new Map(
    byHost.filter((r) => r.hostName && hostToSite.has(r.hostName)).map((r) => [hostToSite.get(r.hostName)!.hostname, num(r.totalUsers)]),
  );

  const intent = sitePerf
    .map((p) => {
      const events = eventsByHost.get(p.hostname) ?? [];
      const signals: IntentSignals = {
        sessions: p.sessions,
        visitors: usersByHost.get(p.hostname) ?? 0,
        engagementSec: p.avgEngagementSec * p.sessions,
        pageViews: p.pageViews,
        pages: [...new Set(pagesByHost.get(p.hostname) ?? [])],
        devices: [...new Set(devicesByHost.get(p.hostname) ?? [])],
        hours: [...new Set(hoursByHost.get(p.hostname) ?? [])],
        days: [...new Set(daysByHost.get(p.hostname) ?? [])],
        formStarted: events.includes("analytics_radar_form_start"),
        formSubmitted: events.includes("analytics_radar_form_submit"),
        auditViewed: [...auditViewedCompanies].some((t) => t.toLowerCase().includes(p.companyName.toLowerCase())),
        awaitingReply: awaitingReplyCompanies.has(p.companyName),
        replied: repliedCompanies.has(p.companyName),
      };
      const verdict = scoreIntent(signals);
      return {
        hostname: p.hostname,
        companyName: p.companyName,
        city: p.city,
        sessions: p.sessions,
        pageViews: p.pageViews,
        engagementSec: Math.round(signals.engagementSec),
        lastDay: signals.days.slice().sort().pop() ?? null,
        ...verdict,
      };
    })
    .filter((r) => r.tier !== "none")
    .sort((a, b) => b.score - a.score);

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
      scope,
      // Le temps réel est le seul bloc que GA4 ne sait pas filtrer par
      // domaine : il est classé par titre de page, donc approximatif. L'écran
      // doit le dire plutôt que de le présenter au même niveau de certitude
      // que le reste.
      realtimeScopeIsApproximate: true,
      // Nombre d'appels GA4 qui ont échoué pour cette réponse. Non nul = les
      // chiffres ci-dessous sont incomplets et l'UI doit le dire : un quota
      // dépassé ne doit pas s'afficher comme « zéro visite mesurée ».
      degraded: failedReports > 0 ? { failedReports } : null,
      range: { days },
      // En vue vitrine il n'y a pas de « parc de sites démo » à couvrir : le
      // dénominateur du KPI « sites visités » n'aurait aucun sens.
      totalSites: scope === "vitrine" ? 0 : sites.length,
      kpis: {
        sessions: totalSessions,
        pageViews: totalPageViews,
        pagesPerSession: totalSessions > 0 ? totalPageViews / totalSessions : 0,
        engagementRate: totalSessions > 0 ? totalEngaged / totalSessions : 0,
        avgSessionDurationSec: totalSessions > 0 ? totalEngagementSec / totalSessions : 0,
        sitesVisited: scope === "vitrine" ? 0 : visitedHostnames.size,
        formsStarted,
        formsSubmitted,
        processing,
      },
      timeseries: daily
        .map((r) => ({ date: isoDate(r.date), sessions: num(r.sessions) }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      hubs: hubsWithShare,
      /** Liste d'appel : le plus chaud d'abord, avec la raison mesurée. */
      intent: scope === "vitrine" ? [] : intent,
      sites: scope === "vitrine" ? [] : sitePerf,
      notVisitedSites: scope === "vitrine" ? [] : notVisited.map((s) => ({ hostname: s.hostname, companyName: s.companyName })),
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
