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

export function GlobeStage({
  hubRows,
  onSelectCity,
  rangeLabel,
  total,
}: {
  hubRows: GlobeHubRow[];
  onSelectCity: (city: string) => void;
  rangeLabel: string;
  total: number;
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

  const top = hubRows[0];
  const territoires = new Set(hubRows.map((h) => h.rg)).size;

  return (
    <div className="a-stage">
      <div className="grid" />
      <div ref={box} style={{ position: "absolute", inset: 0 }} />
      <div className="vg" />
      <div className="a-ghd">
        <div className="t">Connexions mondiales</div>
        <div className="s">
          {rangeLabel} · {anNum(total)} sessions · relief en cubes de 25 km
        </div>
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
          <span className="ramp" />
          faible → forte densité de connexions
        </div>
        <div className="rw">
          <span className="bars">
            <i style={{ height: 4 }} />
            <i style={{ height: 8 }} />
            <i style={{ height: 14 }} />
          </span>
          1 cube ≈ 25 km · +100 km de relief par visite
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
              {Math.round((tip.n / Math.max(1, total)) * 100)} %
            </span>
          </div>
          <div className="r">
            <span>{tip.rg}</span>
            <b>{tip.n} connexions</b>
          </div>
          <div className="bar">
            <i style={{ width: Math.min(100, (tip.n / (hubRows[0] ? hubRows[0].n : 1)) * 100) + "%" }} />
          </div>
          <div className="r" style={{ marginTop: 6, fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".07em" }}>
            <span>cliquer pour voir les sites démo</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RealtimePanel({ activeUsers, byCountry }: { activeUsers: number; byCountry: Array<{ country: string; city: string; activeUsers: number }> }) {
  if (activeUsers === 0) {
    return <div className="a-empty">Personne sur les sites démo en ce moment.</div>;
  }
  return (
    <div className="a-feed">
      {byCountry
        .filter((r) => r.activeUsers > 0)
        .map((r) => (
          <div className="a-ev pv" key={r.country + r.city}>
            <span className="sq">
              <Icon name="radio" className="ico s" />
            </span>
            <div>
              <div className="t">
                <b>{r.activeUsers}</b> visiteur{r.activeUsers > 1 ? "s" : ""} actif{r.activeUsers > 1 ? "s" : ""}
              </div>
              <div className="m">
                {r.city ? `${r.city}, ` : ""}
                {r.country}
              </div>
            </div>
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
