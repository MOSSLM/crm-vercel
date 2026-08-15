// radar-tab.tsx — globe, top villes, frise temporelle (port de an-radar.jsx)
// La ex-LiveFeed (an-radar.jsx) rejouait un flux d'événements par session — un
// niveau de détail que ni GA4 ni Clarity n'exposent par API (cf. la
// contrainte documentée dans src/app/api/analytics-radar/route.ts). Le panneau
// "Flux" ici affiche la place réelle la plus proche : GA4 Realtime
// (utilisateurs actifs sur les 30 dernières minutes), pas un journal d'events.
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { anNum } from "./format";
import { createAnGlobe, type AnGlobeHandle, type GlobeHubRow } from "./Globe";
import { LOW_VOLUME_TOTAL, PER_VISIT_KM, SHADES, SHARE_STOPS } from "./globe-scale";
import { MAP_RANGES, MAP_RANGE_ORDER, type RadarMapRange } from "@/lib/analytics-radar/map-range";

export function GlobeStage({
  hubRows,
  onSelectCity,
  range,
  setRange,
  realtimeOnly = false,
  liveCities = [],
}: {
  hubRows: GlobeHubRow[];
  onSelectCity: (city: string) => void;
  /** La fenêtre de temps de la carte — indépendante de la plage de la page. */
  range: RadarMapRange;
  setRange: (r: RadarMapRange) => void;
  /** Ces villes viennent du seul temps réel : GA4 n'y filtre pas les domaines. */
  realtimeOnly?: boolean;
  /** Villes avec au moins un visiteur actif là, maintenant (GA4 Realtime) —
   *  chacune déclenche un ping (onde bleue) sur le globe à chaque rafraîchissement. */
  liveCities?: string[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const globeRef = useRef<AnGlobeHandle | null>(null);
  const [tip, setTip] = useState<(GlobeHubRow & { x: number; y: number }) | null>(null);
  const [spin, setSpin] = useState(true);

  useEffect(() => {
    const g = createAnGlobe();
    globeRef.current = g;
    if (box.current) {
      g.mount(box.current, { onHover: setTip, onSelect: onSelectCity, origin: { c: "Nantes", lat: 47.2184, lon: -1.5536 } });
      g.setData(hubRows);
    }
    return () => g.dispose();
  }, []);

  useEffect(() => {
    globeRef.current?.setData(hubRows);
  }, [hubRows]);

  // Un ping par ville active à chaque nouveau snapshot temps réel (cf.
  // REFRESH_MS dans AnalyticsRadarApp) — seulement pour les villes que le
  // globe connaît déjà (celles présentes dans hubRows, donc dotées d'un
  // marqueur). `liveCities` change de référence à chaque poll, donc cet
  // effet se redéclenche naturellement toutes les 45s sans dépendance cachée.
  useEffect(() => {
    if (!liveCities.length) return;
    const known = new Set(hubRows.map((h) => h.c));
    liveCities.forEach((c) => {
      if (known.has(c)) globeRef.current?.ping(c);
    });
  }, [liveCities]);

  const top = hubRows[0];
  const territoires = new Set(hubRows.map((h) => h.rg)).size;
  // Même règle que le globe : sous ce volume, l'échelle de nuances n'a pas de
  // sens statistique et tout s'affiche au plus foncé — la légende doit le dire
  // plutôt que d'annoncer une graduation qui n'est pas appliquée.
  const placedTotal = hubRows.reduce((s, h) => (h.lat != null && h.lon != null ? s + h.n : s), 0);
  const lowVolume = placedTotal < LOW_VOLUME_TOTAL;

  return (
    <div className="a-stage">
      <div className="grid" />
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      <div className="vg" />
      <div className="a-ghd">
        <div className="t">Connexions mondiales</div>
        <div className="s">
          {MAP_RANGES[range].label} · {anNum(placedTotal)} visite{placedTotal > 1 ? "s" : ""} situé
          {placedTotal > 1 ? "es" : "e"} · {hubRows.length} ville{hubRows.length > 1 ? "s" : ""}
        </div>
        {realtimeOnly ? (
          // Le direct ne peut venir que de GA4 Realtime, qui n'expose pas
          // `hostName` : ces villes sont classées sur le titre de la page, pas
          // filtrées par domaine comme les autres fenêtres. Autant le dire là où
          // ça se regarde, plutôt que de le laisser croire mesuré pareil.
          <div className="w">temps réel · périmètre déduit du titre de page</div>
        ) : null}
      </div>
      {/* La fenêtre de la carte. Elle ne touche à rien d'autre sur l'écran :
          voir qui est là maintenant ne doit pas remettre à zéro les moyennes du
          mois affichées juste au-dessus. */}
      <div className="a-grange" role="group" aria-label="Fenêtre de la carte">
        {MAP_RANGE_ORDER.map((k) => (
          <button
            key={k}
            className={"a-btn sm" + (k === "live" ? " live" : "")}
            aria-pressed={range === k}
            onClick={() => setRange(k)}
            title={MAP_RANGES[k].label}
          >
            {k === "live" ? <i className="dot" /> : null}
            {MAP_RANGES[k].short}
          </button>
        ))}
      </div>
      <div className="a-gctl">
        <button
          className="a-btn sm"
          aria-pressed={spin}
          onClick={() => {
            const v = !spin;
            setSpin(v);
            globeRef.current?.setSpin(v);
          }}
          title="Rotation auto"
        >
          <Icon name="refresh" className="ico s" />
          Rotation
        </button>
        <button className="a-btn sm" onClick={() => globeRef.current?.zoomBy(-0.6)} title="Zoomer">
          <Icon name="plus" className="ico s" />
        </button>
        <button className="a-btn sm" onClick={() => globeRef.current?.zoomBy(0.6)} title="Dézoomer">
          <Icon name="minus" className="ico s" />
        </button>
        <button className="a-btn sm" onClick={() => globeRef.current?.reset()} title="Recadrer">
          <Icon name="target" className="ico s" />
          Europe
        </button>
      </div>
      <div className="a-glg">
        <div className="rw">
          <span style={{ display: "inline-flex", gap: 2, marginRight: 2 }}>
            {SHADES.map((c) => (
              <i key={c} style={{ width: 9, height: 7, borderRadius: 2, background: c, display: "block" }} />
            ))}
          </span>
          {lowVolume
            ? `sous ${LOW_VOLUME_TOTAL} visites : tout au plus foncé`
            : `part des visites · ${Math.round(SHARE_STOPS[SHARE_STOPS.length - 1] * 100)} % et + = plus foncé`}
        </div>
        <div className="rw">
          <span className="bars">
            <i style={{ height: 4 }} />
            <i style={{ height: 8 }} />
            <i style={{ height: 14 }} />
          </span>
          +{PER_VISIT_KM} km de relief par visite
        </div>
        <div className="rw">
          <Icon name="drag" className="ico s" />
          glisser pour tourner · molette pour zoomer
        </div>
      </div>
      <div className="a-gstat">
        <div>
          <div className="k">Villes</div>
          <div className="v">{hubRows.length}</div>
        </div>
        <div>
          <div className="k">Territoires</div>
          <div className="v">{territoires}</div>
        </div>
        <div>
          <div className="k">Pic</div>
          <div className="v" style={{ color: "var(--acc-2)" }}>
            {top ? top.c : "—"}
          </div>
        </div>
      </div>
      {tip ? (
        <div className="a-gtip" style={{ left: tip.x, top: tip.y }}>
          <div className="c">
            <Icon name="mappin" className="ico s" />
            {tip.c}
            <span className="a-tag ac" style={{ marginLeft: "auto" }}>
              {Math.round((tip.share ?? 0) * 100)} %
            </span>
          </div>
          <div className="r">
            <span>{tip.rg}</span>
            <b>
              {tip.n} visite{tip.n > 1 ? "s" : ""}
            </b>
          </div>
          <div className="bar">
            <i style={{ width: Math.min(100, (tip.n / (hubRows[0] ? hubRows[0].n : 1)) * 100) + "%" }} />
          </div>
          <div className="r" style={{ marginTop: 5 }}>
            <span>Sites démo consultés d'ici</span>
            <b>{tip.visitedSites ?? 0}</b>
          </div>
          {tip.citySites ? (
            <div className="r">
              <span>Sites démo livrés dans la ville</span>
              <b>{tip.citySites}</b>
            </div>
          ) : null}
          <div className="r">
            <span>Relief</span>
            <b>{anNum(tip.n * PER_VISIT_KM)} km</b>
          </div>
          <div className="r" style={{ marginTop: 6, fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".07em" }}>
            <span>cliquer pour voir les sites démo</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export interface RealtimeVisit {
  screenName: string;
  companyName: string | null;
  hostname: string | null;
  device: string;
  city: string;
  country: string;
  activeUsers: number;
  pageViews: number;
  sinceMinutes: number;
}

export interface RealtimeFeedItem {
  kind: "pv" | "fm" | "rg";
  text: string;
  companyName: string | null;
  screenName: string;
  city: string;
  device: string;
  minutesAgo: number;
}

const deviceIcon = (device: string) => (device === "mobile" ? "phone" : device === "tablet" ? "square" : "panel");
const agoLabel = (m: number) => (m <= 0 ? "à l'instant" : `il y a ${m} min`);

/**
 * Équivalent réel du LiveFeed de la maquette (an-radar.jsx) : un flux
 * chronologique d'activité réelle, construit sur GA4 Realtime au lieu d'un
 * flux de sessions simulé. Chaque ligne vient d'un vrai snapshot par minute
 * (page consultée) ou d'un vrai événement (formulaire) — voir buildRealtime
 * dans route.ts pour le détail de ce qui est mesuré vs. déduit.
 */
export function RealtimePanel({
  activeUsers,
  feed,
  formActivity,
  scope = "demos",
  scopeIsApproximate = false,
}: {
  activeUsers: number;
  feed: RealtimeFeedItem[];
  formActivity: { starts: number; submits: number };
  scope?: "demos" | "vitrine";
  scopeIsApproximate?: boolean;
}) {
  const where = scope === "vitrine" ? "sur le site" : "sur les sites démo";
  if (activeUsers === 0 && feed.length === 0) {
    return <div className="a-empty">Personne {where} en ce moment.</div>;
  }
  return (
    <div className="a-feed">
      {scopeIsApproximate ? (
        // GA4 Realtime n'expose pas le domaine : ce classement se fait sur le
        // titre de la page, contrairement au reste de l'écran qui est filtré
        // par GA4 lui-même. Autant le dire.
        <div className="a-hint" style={{ padding: "6px 13px", borderBottom: "1px solid var(--line)", fontSize: 10.5 }}>
          Tri par titre de page — GA4 temps réel ne distingue pas les domaines.
        </div>
      ) : null}
      {(formActivity.starts > 0 || formActivity.submits > 0) && (
        <div className="a-hint" style={{ padding: "8px 13px", borderBottom: "1px solid var(--line)" }}>
          30 dernières minutes : <b>{formActivity.starts}</b> formulaire{formActivity.starts > 1 ? "s" : ""} testé
          {formActivity.starts > 1 ? "s" : ""}, <b>{formActivity.submits}</b> envoyé{formActivity.submits > 1 ? "s" : ""}
        </div>
      )}
      {feed.map((e, i) => (
        <div className={"a-ev " + e.kind} key={e.minutesAgo + e.screenName + e.kind + i}>
          <span className="sq">
            <Icon name={e.kind === "fm" ? "fileText" : deviceIcon(e.device)} className="ico s" />
          </span>
          <div>
            <div className="t">
              <b>{e.companyName ?? e.screenName ?? "un site démo"}</b> — {e.text}
              {!e.companyName && e.screenName ? <span style={{ color: "var(--tx-3)" }}> ({e.screenName})</span> : null}
            </div>
            <div className="m">
              {/* Jamais « France » par défaut : GA4 laisse la ville vide quand
                  il ne sait pas, ce n'est pas une information sur le pays. */}
              {e.city || "ville inconnue"}
              {e.device ? ` · ${e.device}` : ""}
            </div>
          </div>
          <span className="h">{agoLabel(e.minutesAgo)}</span>
        </div>
      ))}
    </div>
  );
}

export function TopCities({ hubRows, onPick }: { hubRows: GlobeHubRow[]; onPick: (city: string) => void }) {
  const max = hubRows[0] ? hubRows[0].n : 1;
  return (
    <div className="a-top5">
      {hubRows.slice(0, 8).map((h, i) => (
        <div className="a-t5" key={h.c} onClick={() => onPick(h.c)} title={`Recadrer sur ${h.c}`}>
          <span className="rk">{String(i + 1).padStart(2, "0")}</span>
          <span className="nm">
            {h.c} <span style={{ color: "var(--tx-4)", fontSize: 10.5 }}>{h.rg}</span>
          </span>
          <span className="n">{h.n}</span>
          <span className="bar">
            <i style={{ width: (h.n / max) * 100 + "%" }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export interface DayCount {
  date: string;
  sessions: number;
}

export function DayTrack({ counts }: { counts: DayCount[] }) {
  const el = useRef<HTMLDivElement>(null);
  const max = Math.max(1, ...counts.map((c) => c.sessions));
  return (
    <div className="a-track" ref={el}>
      {counts.map((d, i) => {
        const dt = new Date(d.date + "T00:00:00Z");
        const dow = dt.getUTCDay();
        const we = dow === 0 || dow === 6;
        const lb = String(dt.getUTCDate()).padStart(2, "0") + "/" + String(dt.getUTCMonth() + 1).padStart(2, "0");
        return (
          <div className={"dy" + (we ? " we" : "") + (i === counts.length - 1 ? " cur on" : " on")} key={d.date} title={`${lb} · ${d.sessions} connexions`}>
            <i style={{ height: Math.max(3, (d.sessions / max) * 48) }} />
            {i % 3 === 0 ? <span className="lbl">{lb}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
