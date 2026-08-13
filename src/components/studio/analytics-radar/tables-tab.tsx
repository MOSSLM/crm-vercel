// tables-tab.tsx — onglets « Sites démo » et « Comportement » (port de an-tables.jsx)
// Colonnes/pannneaux dépendant de données session-par-session (villes touchées,
// liens cliqués, entonnoir par visiteur) ont été retirés : ni GA4 Data API ni
// Clarity Data Export API ne les exposent en agrégat. Voir la note dans
// src/app/api/analytics-radar/route.ts.
import React from "react";
import { Icon } from "./icons";
import { Panel, Av } from "./parts";
import { anDur, anNum, anPct, anDeviceLabel, anSourceIcon } from "./format";
import type { AnalyticsRadarPayload } from "./types";

export function SitesTab({ data }: { data: AnalyticsRadarPayload }) {
  const [sort, setSort] = React.useState<{ k: keyof (typeof data)["sites"][number]; d: 1 | -1 }>({ k: "sessions", d: -1 });
  const sites = data.sites ?? [];
  const sorted = React.useMemo(() => {
    const arr = [...sites];
    arr.sort((a, b) => {
      const va = a[sort.k];
      const vb = b[sort.k];
      const cmp = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : (Number(va) || 0) - (Number(vb) || 0);
      return cmp * sort.d;
    });
    return arr;
  }, [sites, sort]);

  const th = (k: keyof (typeof data)["sites"][number], lb: string, right?: boolean) => (
    <th className={right ? "r" : ""} onClick={() => setSort((s) => ({ k, d: s.k === k ? ((-s.d) as 1 | -1) : -1 }))}>
      {lb}
      {sort.k === k ? <span className="ar">{sort.d < 0 ? "▾" : "▴"}</span> : null}
    </th>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 12, padding: "12px 14px 14px" }}>
      <Panel
        title="Sites démo — performance sur la période"
        icon="globe"
        src="GA4"
        count={`${sites.length}/${data.totalSites} visités`}
        bodyClass="tight"
        style={{ flex: 1 }}
        right={<span className="a-hint" style={{ marginLeft: 8 }}>trier une colonne</span>}
      >
        <div className="a-tblw">
          <table className="a-tbl">
            <thead>
              <tr>
                {th("companyName", "Site démo")}
                {th("sessions", "Sessions", true)}
                {th("pageViews", "Pages vues", true)}
                {th("avgEngagementSec", "Engagement moy.", true)}
                {th("engagementRate", "Taux d'engagement", true)}
              </tr>
            </thead>
            <tbody>
              {sorted.map((o) => (
                <tr key={o.hostname}>
                  <td>
                    <div className="co">
                      <Av name={o.companyName} color="#2F7AE0" size={26} radius={8} />
                      <div className="t">
                        <div className="n">{o.companyName}</div>
                        <div className="u">{o.hostname}</div>
                      </div>
                    </div>
                  </td>
                  <td className="r">{o.sessions}</td>
                  <td className="r">{o.pageViews}</td>
                  <td className="r">{anDur(o.avgEngagementSec)}</td>
                  <td className="r">{anPct(o.engagementRate)}</td>
                </tr>
              ))}
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="a-empty">
                    Aucune visite sur les sites démo pour cette période.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
      {data.notVisitedSites.length ? (
        <Panel title="Sites démo livrés, jamais ouverts sur la période" icon="warning" count={data.notVisitedSites.length}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {data.notVisitedSites.map((s) => (
              <span className="a-chip" key={s.hostname}>
                <Icon name="link" className="ico s" />
                {s.companyName}
              </span>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

export function BehaviourTab({ data }: { data: AnalyticsRadarPayload }) {
  const pages = data.pages ?? [];
  const heat = data.heatmap;
  const hmax = Math.max(1, ...heat.flat());
  const order = [1, 2, 3, 4, 5, 6, 0];
  const dl: Record<number, string> = { 1: "Lun", 2: "Mar", 3: "Mer", 4: "Jeu", 5: "Ven", 6: "Sam", 0: "Dim" };

  const funnel = [
    { t: "Sessions sur les sites démo", v: data.kpis.sessions },
    { t: "Sessions engagées", v: Math.round(data.kpis.sessions * data.kpis.engagementRate) },
    { t: "Formulaire testé", v: data.kpis.formsStarted },
    { t: "Formulaire envoyé", v: data.kpis.formsSubmitted },
  ];

  const regions = React.useMemo(() => {
    const m = new Map<string, number>();
    data.hubs.forEach((h) => {
      const key = h.rg || h.country;
      m.set(key, (m.get(key) || 0) + h.n);
    });
    return [...m.entries()].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v).slice(0, 8);
  }, [data.hubs]);
  const rmax = regions[0] ? regions[0].v : 1;

  const clarityFrictions = React.useMemo(() => {
    if (!data.clarity) return [];
    const rows = Object.values(data.clarity.byDimension).flat();
    return rows
      .map((r) => ({ label: String(r.dimensionValue ?? r.Device ?? r.Source ?? r.Country ?? "—"), rage: Number(r._rage ?? 0), dead: Number(r._dead ?? 0) }))
      .filter((r) => r.rage + r.dead > 0)
      .sort((a, b) => b.rage + b.dead - (a.rage + a.dead))
      .slice(0, 5);
  }, [data.clarity]);

  return (
    <div className="a-beh">
      <div className="col">
        <Panel title="Pages du template démo" icon="doc" src="GA4" count={pages.length} bodyClass="tight">
          <div className="a-pgr" style={{ background: "var(--panel-2)", fontFamily: "var(--font-mono)", fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tx-3)" }}>
            <span>Page</span>
            <span style={{ textAlign: "right" }}>Vues</span>
            <span style={{ textAlign: "right" }}>Rebond</span>
            <span style={{ textAlign: "right" }}>Engagement</span>
          </div>
          {pages.map((p) => (
            <div className="a-pgr" key={p.path} style={{ gridTemplateColumns: "minmax(0,1fr) 74px 74px 74px" }}>
              <div className="nm">
                {p.path}
              </div>
              <div className="n">
                {p.views}
                <u>vues</u>
              </div>
              <div className="n">
                {anPct(p.bounceRate)}
                <u>rebond</u>
              </div>
              <div className="n">
                {anDur(p.avgEngagementSec)}
                <u>moyen</u>
              </div>
            </div>
          ))}
          {pages.length === 0 ? <div className="a-empty">Aucune page vue sur la période.</div> : null}
        </Panel>
        <Panel title="Heures de connexion" icon="clock" src="GA4">
          <div className="a-heat">
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span className="hh" key={h}>
                {h % 3 === 0 ? h : ""}
              </span>
            ))}
            {order.map((d) => (
              <React.Fragment key={d}>
                <span className="hl">{dl[d]}</span>
                {heat[d].map((v, h) => (
                  <span
                    className="cl"
                    key={h}
                    title={`${dl[d]} ${String(h).padStart(2, "0")}h · ${v} connexions`}
                    style={v ? { background: "var(--heat)", opacity: (0.14 + 0.86 * Math.pow(v / hmax, 0.7)).toFixed(3), boxShadow: v / hmax > 0.6 ? "0 0 10px var(--heat-glow)" : "none" } : undefined}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        </Panel>
        <Panel title="Entonnoir de la démo" icon="target" src="GA4">
          <div className="a-funnel">
            {funnel.map((x, i) => (
              <div className="a-fn" key={i}>
                <i style={{ width: (x.v / Math.max(1, funnel[0].v)) * 100 + "%" }} />
                <span className="t">{x.t}</span>
                <span className="n">
                  {anNum(x.v)}
                  <u>
                    {anPct(x.v / Math.max(1, funnel[0].v))}
                    {i ? ` · ${anPct(x.v / Math.max(1, funnel[i - 1].v))} de l'étape` : ""}
                  </u>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="col">
        <Panel title="Appareils" icon="phone" src="GA4">
          <div className="a-split">
            {data.devices.map((d) => {
              const label = anDeviceLabel(d.device);
              const n = data.kpis.sessions || 1;
              return (
                <React.Fragment key={d.device}>
                  <div className="a-sp">
                    <span className="sq">
                      <Icon name={label.ic} className="ico s" />
                    </span>
                    <span className="lb">
                      <span>{label.n}</span>
                      <span className="n">{anPct(d.sessions / n)}</span>
                    </span>
                    <span className="n">{d.sessions}</span>
                  </div>
                  <div className="a-sp">
                    <span />
                    <span className="bar">
                      <i style={{ width: (d.sessions / n) * 100 + "%", background: "var(--acc)" }} />
                    </span>
                    <span />
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </Panel>
        <Panel title="Origine des visites" icon="share" src="GA4">
          <div className="a-split">
            {data.sources.map((d) => {
              const n = data.kpis.sessions || 1;
              return (
                <React.Fragment key={d.source}>
                  <div className="a-sp">
                    <span className="sq">
                      <Icon name={anSourceIcon(d.source)} className="ico s" />
                    </span>
                    <span className="lb">
                      <span>{d.source}</span>
                      <span className="n">{anPct(d.sessions / n)}</span>
                    </span>
                    <span className="n">{d.sessions}</span>
                  </div>
                  <div className="a-sp">
                    <span />
                    <span className="bar">
                      <i style={{ width: (d.sessions / n) * 100 + "%", background: "var(--vio)" }} />
                    </span>
                    <span />
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </Panel>
        <Panel title="Frictions détectées" icon="flash" src="Clarity">
          {data.clarity ? (
            clarityFrictions.length ? (
              <div className="a-split">
                {clarityFrictions.map((p) => (
                  <React.Fragment key={p.label}>
                    <div className="a-sp">
                      <span className="sq">
                        <Icon name="warning" className="ico s" />
                      </span>
                      <span className="lb">
                        <span>{p.label}</span>
                        <span className="n">
                          {p.rage} rage · {p.dead} dead
                        </span>
                      </span>
                      <span />
                    </div>
                    <div className="a-sp">
                      <span />
                      <span className="bar">
                        <i style={{ width: Math.min(100, ((p.rage + p.dead) / Math.max(1, clarityFrictions[0].rage + clarityFrictions[0].dead)) * 100) + "%", background: "var(--red)" }} />
                      </span>
                      <span />
                    </div>
                  </React.Fragment>
                ))}
              </div>
            ) : (
              <div className="a-empty">Aucune friction détectée sur les 3 derniers jours (fenêtre Clarity).</div>
            )
          ) : (
            <div className="a-empty">Clarity n'est pas configuré (CLARITY_API_TOKEN manquant).</div>
          )}
        </Panel>
        <Panel title="Territoires" icon="mappin" src="GA4">
          <div className="a-top5">
            {regions.map((r, i) => (
              <div className="a-t5" key={r.k}>
                <span className="rk">{String(i + 1).padStart(2, "0")}</span>
                <span className="nm">{r.k}</span>
                <span className="n">{r.v}</span>
                <span className="bar">
                  <i style={{ width: (r.v / rmax) * 100 + "%" }} />
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
