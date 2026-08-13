"use client";
// AnalyticsRadarApp.tsx — coque, plage de dates, onglets (port de an-app.jsx)
//
// "Parcours détaillés" (liste de sessions + timeline par page) est bâti sur
// GA4 → BigQuery Export (src/app/api/analytics-radar/sessions/route.ts) —
// ni GA4 Data API ni Clarity Data Export API n'exposent de données
// session-par-session en agrégat, seul le raw event export le permet. Pas de
// lecteur d'enregistrement en revanche : Clarity Data Export n'expose que des
// agrégats par dimension, aucun identifiant de session à recouper avec GA4.
import React from "react";
import { authedFetch } from "@/utils/authedFetch";
import "./analytics-radar.css";
import { Icon } from "./icons";
import { Kpi, Panel } from "./parts";
import { anDur, anNum, anPct } from "./format";
import { GlobeStage, RealtimePanel, TopCities, DayTrack } from "./radar-tab";
import { SitesTab, BehaviourTab } from "./tables-tab";
import { SessionsTab } from "./sessions-tab";
import type { AnalyticsRadarPayload, AnalyticsRadarUnconfigured } from "./types";

type Tab = "radar" | "sites" | "beh" | "parcours";

// Le seul morceau vraiment "temps réel" (visites en cours, globe) a besoin
// d'être rafraîchi tout seul — sans ça la page ne bouge qu'au changement de
// plage. 45s : assez court pour sentir le direct, assez long pour rester loin
// des quotas GA4 (25k requêtes/jour/propriété) même laissé ouvert des heures.
const REFRESH_MS = 45_000;

function useAnalyticsRadar(days: number) {
  const [data, setData] = React.useState<AnalyticsRadarPayload | AnalyticsRadarUnconfigured | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    let firstLoad = true;

    const load = () => {
      if (firstLoad) setLoading(true);
      authedFetch(`/api/analytics-radar?days=${days}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((json) => {
          if (cancelled) return;
          setData(json);
          setError(null);
        })
        .catch((e: unknown) => {
          // Un refresh périodique qui échoue ne doit pas effacer les données déjà
          // affichées — seul le tout premier chargement bloque sur une erreur.
          if (cancelled) return;
          if (firstLoad) setError(e instanceof Error ? e.message : "Erreur inconnue");
        })
        .finally(() => {
          if (cancelled) return;
          if (firstLoad) setLoading(false);
          firstLoad = false;
        });
    };

    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [days]);

  return { data, error, loading };
}

function NotConfigured({ data }: { data: AnalyticsRadarUnconfigured }) {
  return (
    <div className="an-radar-surface">
      <div className="a-root">
        <header className="a-top">
          <div className="a-brand">
            <span className="mk">SA</span>
            <div>
              <div className="tt">Radar analytics · sites démo</div>
              <div className="sub">GA4 · Microsoft Clarity</div>
            </div>
          </div>
        </header>
        <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ maxWidth: 520 }}>
            <Panel title="GA4 n'est pas encore configuré" icon="warning">
              <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--tx-2)" }}>
                Cette page a besoin d'un compte de service GA4 (variables <code>GA4_PROPERTY_ID</code> et{" "}
                <code>GA4_SERVICE_ACCOUNT_KEY</code>) pour lire de vraies données. {data.totalSites} site
                {data.totalSites > 1 ? "s" : ""} démo {data.totalSites > 1 ? "sont" : "est"} déjà publié
                {data.totalSites > 1 ? "s" : ""} et prêt{data.totalSites > 1 ? "s" : ""} à remonter du trafic dès que
                c'est branché. Voir <code>.env.example</code> pour la procédure.
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsRadarApp() {
  const [tab, setTab] = React.useState<Tab>("radar");
  const [days, setDays] = React.useState(7);
  const { data, error, loading } = useAnalyticsRadar(days);

  // Dérivé du payload temps réel — memoïsé pour ne changer de référence QUE
  // quand un nouveau snapshot arrive (toutes les REFRESH_MS), pas à chaque
  // rendu (changement d'onglet, etc.) : c'est ce qui déclenche un ping par
  // ville dans GlobeStage sans le faire spammer sur chaque interaction.
  const realtimeVisits = data && "configured" in data && data.configured.ga4 ? (data as AnalyticsRadarPayload).realtime.visits : undefined;
  const liveCities = React.useMemo(
    () => Array.from(new Set((realtimeVisits ?? []).map((v) => v.city).filter(Boolean))),
    [realtimeVisits],
  );

  const TABS: Array<{ k: Tab; n: string; ic: string; nb?: number }> = [
    { k: "radar", n: "Radar mondial", ic: "globe" },
    { k: "sites", n: "Sites démo", ic: "kanban", nb: data && data.configured.ga4 ? (data as AnalyticsRadarPayload).sites.length : undefined },
    { k: "beh", n: "Comportement", ic: "gauge" },
    { k: "parcours", n: "Parcours détaillés", ic: "activity" },
  ];

  if (loading && !data) {
    return (
      <div className="an-radar-surface">
        <div className="a-root" style={{ display: "grid", placeItems: "center" }}>
          <span style={{ color: "var(--tx-3)", fontSize: 13 }}>Chargement…</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="an-radar-surface">
        <div className="a-root" style={{ display: "grid", placeItems: "center" }}>
          <span style={{ color: "var(--red)", fontSize: 13 }}>Erreur : {error ?? "réponse vide"}</span>
        </div>
      </div>
    );
  }

  if (!data.configured.ga4) {
    return <NotConfigured data={data as AnalyticsRadarUnconfigured} />;
  }

  const d = data as AnalyticsRadarPayload;
  const rangeLabel = days === 1 ? "Aujourd'hui" : `${days} derniers jours`;

  return (
    <div className="an-radar-surface">
      <div className="a-root">
        <header className="a-top">
          <div className="a-brand">
            <span className="mk">SA</span>
            <div>
              <div className="tt">Radar analytics · sites démo</div>
              <div className="sub">GA4 · Microsoft Clarity · temps réel</div>
            </div>
          </div>
          <nav className="a-tabs">
            {TABS.map((t) => (
              <button key={t.k} aria-selected={tab === t.k} onClick={() => setTab(t.k)}>
                <Icon name={t.ic} className="ico s" />
                {t.n}
                {t.nb != null ? <span className="nb">{t.nb}</span> : null}
              </button>
            ))}
          </nav>
          <div className="a-topr">
            <span className="a-src">
              <i className="d" />
              GA4
            </span>
            <span className="a-src vio">
              <i className="d" />
              Clarity {d.configured.clarity ? "" : "· non configuré"}
            </span>
            {loading ? <span className="a-live"><i />chargement</span> : null}
          </div>
        </header>

        <div className="a-kpis">
          <Kpi tone="ac" icon="globe" label="Sites démo visités" value={d.kpis.sitesVisited} unit={`/ ${d.totalSites}`} />
          <Kpi
            icon="users"
            label="Sessions"
            value={d.kpis.processing ? "—" : anNum(d.kpis.sessions)}
            note={d.kpis.processing ? "traitement GA4 en cours" : undefined}
          />
          <Kpi
            tone="vi"
            icon="doc"
            label="Pages / visite"
            value={d.kpis.processing ? "—" : d.kpis.pagesPerSession.toFixed(1)}
            note={d.kpis.processing ? "traitement GA4 en cours" : <>{anNum(d.kpis.pageViews)} pages vues</>}
          />
          <Kpi
            tone="wn"
            icon="clock"
            label="Engagement moy."
            value={d.kpis.processing ? "—" : anDur(d.kpis.avgSessionDurationSec)}
            note={d.kpis.processing ? "traitement GA4 en cours" : <>taux d'engagement {anPct(d.kpis.engagementRate)}</>}
          />
          <Kpi tone="ok" icon="fileText" label="Formulaire testé" value={d.kpis.formsStarted} note={<><b>{d.kpis.formsSubmitted}</b> envoyés</>} />
          <Kpi icon="flash" label="Visiteurs actifs" value={d.realtime.activeUsers} unit="maintenant" />
          <div className="a-kpi">
            <div className="k">
              <span className="sq">
                <Icon name="clock" className="ico s" />
              </span>
              Plage
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 9 }}>
              {[1, 7, 14, 30].map((n) => (
                <button key={n} className="a-btn sm" aria-pressed={days === n} onClick={() => setDays(n)}>
                  {n === 1 ? "24h" : `${n} j`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {tab === "radar" ? (
          <div className="a-radar">
            <GlobeStage
              hubRows={d.hubs}
              onSelectCity={() => setTab("sites")}
              rangeLabel={rangeLabel}
              total={d.kpis.sessions}
              liveCities={liveCities}
            />
            <div className="a-rail">
              <Panel title="En ce moment" icon="radio" src="GA4 realtime" style={{ flex: 1 }} bodyClass="tight">
                <RealtimePanel activeUsers={d.realtime.activeUsers} feed={d.realtime.feed} formActivity={d.realtime.formActivity} />
              </Panel>
              <Panel title="Villes les plus actives" icon="mappin" count={d.hubs.length} style={{ flex: "0 0 auto", maxHeight: 250 }}>
                <TopCities hubRows={d.hubs} onPick={() => {}} />
              </Panel>
            </div>
            <div className="a-tl">
              <div className="hd">
                <span className="lb">Plage analysée</span>
                <span className="sel">
                  {rangeLabel}
                  <u>
                    {anNum(d.kpis.sessions)} sessions · {d.kpis.sitesVisited} sites
                  </u>
                </span>
              </div>
              <DayTrack counts={d.timeseries} />
            </div>
          </div>
        ) : null}

        {tab === "sites" ? <SitesTab data={d} /> : null}
        {tab === "beh" ? <BehaviourTab data={d} /> : null}
        {tab === "parcours" ? <SessionsTab days={days} active={tab === "parcours"} /> : null}
      </div>
    </div>
  );
}

export default AnalyticsRadarApp;
