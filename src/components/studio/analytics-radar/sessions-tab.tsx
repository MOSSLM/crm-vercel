// sessions-tab.tsx — "Parcours détaillés" : sessions individuelles réelles
// (site, pages visitées dans l'ordre, formulaire, durée) reconstruites depuis
// le raw event export GA4 → BigQuery (voir src/app/api/analytics-radar/sessions/route.ts).
// Contrairement au reste du dashboard (GA4 Data/Realtime API), BigQuery facture
// au volume scanné : cet onglet ne charge donc qu'à l'ouverture, pas sur le
// polling 45s du reste de la page, et propose un rafraîchissement manuel.
//
// Ce que la maquette d'origine simulait et qui n'a pas d'équivalent réel :
// rage/dead clicks par page, % de scroll, nombre de clics, relecture vidéo
// Clarity synchronisée à la session — Clarity Data Export n'expose que des
// agrégats par dimension (Pays/Appareil/Source), jamais un identifiant de
// session individuel qu'on pourrait recouper avec GA4. Ces éléments sont
// donc absents ici plutôt qu'inventés.
import React from "react";
import { authedFetch } from "@/utils/authedFetch";
import { Icon } from "./icons";
import { Panel, Av } from "./parts";
import { anDur, anHM, anDayLabel, anDeviceLabel, anSourceIcon } from "./format";

export interface SessionStep {
  atMs: number;
  eventName: string;
  pagePath: string | null;
  pageTitle: string | null;
}

export interface SessionRow {
  hostname: string | null;
  companyName: string | null;
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

interface SessionsResponse {
  configured: boolean;
  reason: string | null;
  sessions: SessionRow[];
}

const REASON_LABEL: Record<string, string> = {
  ga4_not_configured: "GA4 n'est pas configuré.",
  not_linked: "Aucun lien BigQuery trouvé sur cette propriété GA4 (GA4 → Admin → Liens BigQuery).",
  pending_export:
    "Le lien BigQuery vient d'être créé — le premier export n'est pas encore arrivé (jusqu'à 24-48h pour l'export quotidien, souvent plus vite pour le streaming). Réessaie plus tard.",
  error:
    "Erreur en interrogeant BigQuery — vérifie que le compte de service a les rôles \"BigQuery Data Viewer\" et \"BigQuery Job User\" sur le projet GCP.",
};

function useSessions(days: number, active: boolean) {
  const [data, setData] = React.useState<SessionsResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    authedFetch(`/api/analytics-radar/sessions?days=${Math.min(14, days)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: SessionsResponse) => {
        if (cancelled) return;
        setData(j);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur inconnue");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [days, active, nonce]);

  return { data, loading, error, refresh: () => setNonce((n) => n + 1) };
}

function SessionListRow({ s, sel, onClick }: { s: SessionRow; sel: boolean; onClick: () => void }) {
  const name = s.companyName ?? s.hostname ?? "Site inconnu";
  const dev = anDeviceLabel(s.deviceCategory);
  const src = anSourceIcon(`${s.source} ${s.medium}`);
  return (
    <div className="a-srow" aria-selected={sel} onClick={onClick}>
      <Av name={name} color="#2F7AE0" size={30} radius={9} />
      <div style={{ minWidth: 0 }}>
        <div className="nm">{name}</div>
        <div className="mt">
          <span>{anDayLabel(s.startMs)} · {anHM(s.startMs)}</span>
          <span>·</span>
          <span>{anDur(s.durationSec)}</span>
          <span>·</span>
          <span>{s.pageViews} p.</span>
        </div>
      </div>
      <div className="rt">
        <span className="a-sig">
          <i className={s.formSubmitted ? "f" : s.formStarted ? "v" : ""} title="formulaire" />
        </span>
        <span style={{ display: "flex", gap: 4, color: "var(--tx-4)" }}>
          <Icon name={dev.ic} className="ico s" />
          <Icon name={src} className="ico s" />
        </span>
      </div>
    </div>
  );
}

function deriveInsights(s: SessionRow) {
  const out: Array<{ ic: string; tone: string; t: string; d: string }> = [];
  if (s.formStarted && !s.formSubmitted) {
    out.push({ ic: "warning", tone: "wn", t: "Formulaire commencé, non envoyé", d: "abandon en cours de route — bon motif de relance directe." });
  }
  if (s.formSubmitted) {
    out.push({ ic: "check", tone: "ok", t: "Formulaire de devis envoyé depuis la démo", d: "le prospect a joué le scénario client jusqu'au bout." });
  }
  if (s.companyCity && s.city && s.companyCity.toLowerCase() !== s.city.toLowerCase()) {
    out.push({ ic: "globe", tone: "vi", t: `Consulté depuis ${s.city}`, d: `hors zone du siège (${s.companyCity}) — lien probablement transféré.` });
  }
  const hour = new Date(s.startMs).getHours();
  if (hour >= 19 || hour < 7) {
    out.push({ ic: "sun", tone: "wn", t: "Consultation en soirée/nuit", d: `${anHM(s.startMs)} — privilégier un rappel après 18h.` });
  }
  if (s.pageViews >= 5) {
    out.push({ ic: "trending", tone: "ac", t: `Parcours profond : ${s.pageViews} pages`, d: `${anDur(s.durationSec)} passées sur le site.` });
  }
  return out.slice(0, 4);
}

function SessionDetail({ s }: { s: SessionRow | null }) {
  if (!s) return <div className="a-empty">Sélectionnez un parcours à gauche.</div>;
  const name = s.companyName ?? s.hostname ?? "Site inconnu";
  const dev = anDeviceLabel(s.deviceCategory);
  const ins = deriveInsights(s);
  const maxDwell = Math.max(1, ...s.steps.map((st, i) => (s.steps[i + 1] ? s.steps[i + 1].atMs - st.atMs : 0)));

  return (
    <div className="a-det">
      <div className="a-dhd">
        <div className="r1">
          <span className="av" style={{ background: "#2F7AE0" }}>
            <Icon name="globe" className="ico s" />
          </span>
          <div style={{ minWidth: 0 }}>
            <h2>{name}</h2>
            <div className="sb">
              <span>{s.hostname}</span>
              <span>
                <b>{anDayLabel(s.startMs)}</b> à {anHM(s.startMs)}
              </span>
              <span>
                {s.city || "ville inconnue"}
                {s.companyCity && s.city && s.companyCity.toLowerCase() !== s.city.toLowerCase() ? ` (siège ${s.companyCity})` : ""}
              </span>
              <span>
                {dev.n}
                {s.os ? ` · ${s.os}` : ""}
                {s.browser ? ` · ${s.browser}` : ""}
              </span>
              <span>via {s.source || "direct"}{s.medium ? ` / ${s.medium}` : ""}</span>
            </div>
          </div>
        </div>
        <div className="a-dmini">
          <div>
            <div className="k">
              <Icon name="doc" className="ico s" />
              Pages
            </div>
            <div className="v">{s.pageViews}</div>
          </div>
          <div>
            <div className="k">
              <Icon name="clock" className="ico s" />
              Durée
            </div>
            <div className="v">{anDur(s.durationSec)}</div>
          </div>
          <div>
            <div className="k">
              <Icon name="check" className="ico s" />
              Formulaire
            </div>
            <div className={"v " + (s.formSubmitted ? "ok" : s.formStarted ? "wn" : "")}>
              {s.formSubmitted ? "envoyé" : s.formStarted ? "commencé" : "non"}
            </div>
          </div>
        </div>
      </div>

      <Panel title="Chronologie du parcours" icon="activity" src="GA4 · BigQuery" count={`${s.steps.length} événements`} bodyClass="tight">
        <div className="a-jrn">
          {s.steps.map((st, i) => {
            const next = s.steps[i + 1];
            const dwell = next ? Math.max(0, Math.round((next.atMs - st.atMs) / 1000)) : 0;
            const last = i === s.steps.length - 1;
            const isForm = st.eventName === "analytics_radar_form_start" || st.eventName === "analytics_radar_form_submit";
            const label =
              st.eventName === "page_view"
                ? st.pageTitle || st.pagePath || "page"
                : st.eventName === "analytics_radar_form_start"
                  ? "Formulaire commencé"
                  : st.eventName === "analytics_radar_form_submit"
                    ? "Formulaire envoyé"
                    : st.eventName;
            return (
              <div className={"a-step " + (isForm ? "form" : last ? "exit" : "")} key={i}>
                <div className="hh">
                  {anHM(st.atMs)}
                  <u>+{anDur(Math.max(0, Math.round((st.atMs - s.startMs) / 1000)))}</u>
                </div>
                <div className="rail">
                  <span className="dot">
                    <Icon name={isForm ? "fileText" : last ? "arrowRight" : "doc"} className="ico s" />
                  </span>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div className="pg">
                    {label}
                    {st.pagePath && st.eventName === "page_view" ? <span className="u">{st.pagePath}</span> : null}
                    {last ? <span className="a-tag mono">sortie</span> : null}
                  </div>
                  {st.eventName === "page_view" && dwell > 0 ? (
                    <>
                      <div className="mt">
                        <span>
                          resté <b>{anDur(dwell)}</b>
                        </span>
                      </div>
                      <div className="dw">
                        <i style={{ width: Math.max(3, (dwell / maxDwell) * 100) + "%" }} />
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
          {s.steps.length === 0 ? <div className="a-empty">Aucun événement détaillé pour ce parcours.</div> : null}
        </div>
      </Panel>

      {ins.length ? (
        <Panel title="Lecture commerciale" icon="sparkles" src="dérivé">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ins.map((o, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 10 }}>
                <span className={"a-tag " + o.tone} style={{ width: 24, height: 24, display: "grid", placeItems: "center", padding: 0 }}>
                  <Icon name={o.ic} className="ico s" />
                </span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{o.t}</div>
                  <div style={{ fontSize: 11, color: "var(--tx-3)", marginTop: 2, lineHeight: 1.45 }}>{o.d}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

export function SessionsTab({ days, active }: { days: number; active: boolean }) {
  const { data, loading, error, refresh } = useSessions(days, active);
  const [selected, setSelected] = React.useState(0);

  if (!active) return null;

  if (loading && !data) {
    return <div className="a-empty">Chargement des parcours (BigQuery)…</div>;
  }

  if (error) {
    return <div className="a-empty">Erreur : {error}</div>;
  }

  if (!data || !data.configured) {
    const reason = data?.reason ? REASON_LABEL[data.reason] ?? data.reason : "Non configuré.";
    return (
      <div style={{ flex: 1, display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 560 }}>
          <Panel title="Parcours détaillés indisponibles pour l'instant" icon="warning">
            <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--tx-2)" }}>{reason}</p>
            <button className="a-btn sm" style={{ marginTop: 10 }} onClick={refresh}>
              <Icon name="refresh" className="ico s" />
              Réessayer
            </button>
          </Panel>
        </div>
      </div>
    );
  }

  const sessions = data.sessions;
  const cur = sessions[selected] ?? null;

  return (
    <div className="a-par">
      <Panel
        title="Parcours récents"
        icon="activity"
        src="BigQuery"
        count={sessions.length}
        bodyClass="tight"
        style={{ minHeight: 0 }}
        right={
          <button className="a-btn sm" onClick={refresh} title="Rafraîchir (relance une requête BigQuery)">
            <Icon name="refresh" className="ico s" />
          </button>
        }
      >
        <div style={{ overflow: "auto", flex: 1 }}>
          {sessions.map((s, i) => (
            <SessionListRow key={i} s={s} sel={i === selected} onClick={() => setSelected(i)} />
          ))}
          {sessions.length === 0 ? <div className="a-empty">Aucun parcours sur cette période.</div> : null}
        </div>
      </Panel>
      <SessionDetail s={cur} />
    </div>
  );
}

export default SessionsTab;
