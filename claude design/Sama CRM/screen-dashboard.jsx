// screen-dashboard.jsx
function ScreenDashboard() {
  const today = [
    { state: "done", h: "08:30", ttl: "Briefing matinal", det: "Pipeline review · 12 min" },
    { state: "done", h: "09:00", ttl: "Appel — Camille Pelletier", det: "Conf signature PAC ce matin", tags: [{ k: "ok", l: "Conv. → signature" }] },
    { state: "now",  h: "10:30", ttl: "RDV signature — Énergie Solaire 49", det: "Camille Pelletier · Angers · 14 rue des Ormeaux" },
    { state: "next", h: "13:00", ttl: "Déj. partenaire — bureau Renaud" },
    { state: "next", h: "14:30", ttl: "Qualif Solvert Aménagement", det: "Inès Vandamme · Visio" },
    { state: "next", h: "16:00", ttl: "Présentation devis copro VHD", det: "Marion Tessier · La Roche-sur-Yon" },
    { state: "next", h: "17:30", ttl: "Stand-up équipe ventes", det: "Forecast hebdo" },
  ];

  const forecast = [
    { m: "Jan", val: 142, obj: 130 },
    { m: "Fév", val: 168, obj: 150 },
    { m: "Mar", val: 154, obj: 170 },
    { m: "Avr", val: 210, obj: 180 },
    { m: "Mai", val: 184, obj: 200 },
    { m: "Juin", val: 96,  obj: 220, partial: true },
  ];
  const maxF = Math.max(...forecast.map(f => Math.max(f.val, f.obj)));

  const team = [
    { id: "u1", n: "Lucas Bernier",   r: "AE Senior", v: 84200,  pct: 92, c: "#E2552B" },
    { id: "u2", n: "Sarah Mendes",    r: "AE",        v: 56400,  pct: 71, c: "#2B7FB8" },
    { id: "u3", n: "Karim Aït",       r: "SDR Sr.",  v: 42100,  pct: 64, c: "#6B5BD9" },
    { id: "u4", n: "Émilie Roux",     r: "SDR",       v: 28900,  pct: 48, c: "#1F8A5B" },
    { id: "u5", n: "Tom Lasalle",     r: "B. études",v: 18200,  pct: 32, c: "#C8881F" },
  ];

  const activity = [
    { who: "Camille Pelletier",   v: "a confirmé le RDV signature pour", e: "PAC + PV (27 602 €)", t: "il y a 14 min", ic: "win" },
    { who: "Sarah Mendes",        v: "a envoyé un devis à", e: "Maine ThermPro", det: "DEV-2026-0420 · 22 400 € · 9kWc + onduleur", t: "il y a 32 min", ic: "email" },
    { who: "Mehdi Daoudi",        v: "a ouvert", e: "Devis 12 PAC + ballons (87 600 €)", det: "3ème ouverture en 4h", t: "il y a 1h", ic: "email" },
    { who: "Karim Aït",           v: "a appelé", e: "Hugo Pinault — ES49", det: "Pas de réponse · rappel programmé demain 10h", t: "il y a 1h", ic: "call" },
    { who: "Vendée Habitat Dur.", v: "a planifié un RDV avec", e: "Léa Bouvier", det: "Présentation devis copropriété — vendredi 14h", t: "il y a 2h", ic: "cal" },
    { who: "Domus Rénovation",    v: "est passé en statut", e: "Closing", det: "Aurélie Costa · 28 400 €", t: "il y a 3h", ic: "win" },
  ];

  return (
    <div className="page">
      <div className="dash-grid">

        {/* LEFT — TODAY */}
        <aside className="dash-today">
          <div className="date">jeudi 21 mai · semaine 21</div>
          <h2>Bonjour Lucas.</h2>
          <div className="greet-sub">Sept rendez-vous, trois devis à relancer, un closing.</div>

          <div className="timeline">
            {today.map((it, i) => (
              <div key={i} className="tl-item" data-state={it.state}>
                <div className="h">{it.h}</div>
                <div className="ttl">{it.ttl}</div>
                {it.det && <div className="det">{it.det}</div>}
                {it.tags && (
                  <div className="tags">
                    {it.tags.map((t, j) => <Pill key={j} kind={t.k}>{t.l}</Pill>)}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="dash-now-cta">
            <div className="gho"><Icon name="mappin" className="ico-lg" style={{ color: "white" }} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="lb">Maintenant · dans 14 min</div>
              <div className="nm">Pelletier · 14 rue des Ormeaux</div>
            </div>
            <button className="btn xs" style={{ background: "rgba(255,255,255,.10)", color: "var(--bg)", border: "1px solid rgba(255,255,255,.15)" }}>
              <Icon name="map" className="ico-sm" />Route
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <div className="dash-main">

          {/* KPI bento */}
          <div className="kpi-bento">
            <div className="kpi dark">
              <div className="lb"><Icon name="euro" className="ico-sm" />Pipeline ouvert</div>
              <div className="vl">412<small>k€ · 38 deals</small></div>
              <div className="delta up"><Icon name="trending" className="ico-xs" />+18,4% <span className="vs">vs 30j</span></div>
              <div className="spark">
                <Sparkline data={[180, 210, 195, 230, 248, 265, 290, 320, 340, 358, 380, 412]} color="var(--accent)" width={84} height={32} fill />
              </div>
            </div>

            <div className="kpi">
              <div className="lb"><Icon name="check" className="ico-sm" />Signé ce mois</div>
              <div className="vl">96<small>k€ · 7 deals</small></div>
              <div className="delta dn"><Icon name="arrowDown" className="ico-xs" />–8% <span className="vs">vs avril</span></div>
              <div className="spark">
                <Sparkline data={[40, 52, 48, 62, 71, 68, 84, 79, 88, 92, 96]} color="var(--text-3)" width={84} height={32} />
              </div>
            </div>

            <div className="kpi">
              <div className="lb"><Icon name="target" className="ico-sm" />Objectif mensuel</div>
              <div className="vl">44<small>% · de 220k€</small></div>
              <div className="delta up"><Icon name="clock" className="ico-xs" />j+11 sur 22</div>
              <div style={{ height: 6, background: "var(--bg-3)", borderRadius: 999, marginTop: "auto", overflow: "hidden" }}>
                <div style={{ width: "44%", height: "100%", background: "var(--accent)", borderRadius: 999 }} />
              </div>
            </div>

            <div className="kpi">
              <div className="lb"><Icon name="phone" className="ico-sm" />Activité · 7j</div>
              <div className="vl">312<small>actions</small></div>
              <div className="delta up"><Icon name="trending" className="ico-xs" />+24% <span className="vs">vs 7j préc.</span></div>
              <div className="spark">
                <Sparkline data={[28, 42, 38, 51, 45, 62, 46]} color="var(--text-3)" width={84} height={32} />
              </div>
            </div>
          </div>

          {/* Forecast + To-action */}
          <div className="dash-row-2">

            {/* Forecast chart */}
            <div className="card">
              <div className="card-hd">
                <h3>Forecast vs objectif</h3>
                <span className="meta">en k€ · 6 derniers mois</span>
                <button className="btn xs subtle" style={{ marginLeft: "auto" }}>
                  <Icon name="calendar" className="ico-sm" />6 mois<Icon name="chevdown" className="ico-xs" />
                </button>
              </div>
              <div className="card-bd">
                <div className="forecast-chart">
                  {forecast.map((f, i) => {
                    const hVal = (f.val / maxF) * 100;
                    const hObj = (f.obj / maxF) * 100;
                    return (
                      <div key={i} className="forecast-col">
                        <div className="fc-bar-wrap">
                          <div className="fc-bar" style={{ height: `${hObj}%` }}>
                            <div className="fill" style={{
                              height: `${(hVal / hObj) * 100}%`,
                              background: f.partial ? "repeating-linear-gradient(45deg, var(--accent), var(--accent) 4px, var(--accent-2) 4px, var(--accent-2) 8px)" : "var(--accent)",
                              opacity: f.partial ? 0.85 : 1,
                            }} />
                            <div className="marker" style={{ top: 0 }} />
                          </div>
                        </div>
                        <div className="fc-col-lb">{f.m}</div>
                        <div className="fc-col-val">{f.val}{f.partial ? " ↗" : ""} / {f.obj}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-3)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 10, height: 10, background: "var(--accent)", borderRadius: 2 }} /> réalisé
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 10, height: 2, background: "var(--text)" }} /> objectif
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 10, height: 10, background: "repeating-linear-gradient(45deg, var(--accent), var(--accent) 3px, var(--accent-2) 3px, var(--accent-2) 6px)", borderRadius: 2 }} /> en cours
                  </span>
                </div>
              </div>
            </div>

            {/* Team leaderboard */}
            <div className="card">
              <div className="card-hd">
                <h3>Équipe · réalisé ce mois</h3>
                <span className="meta">en € · objectif équipe 220k€</span>
              </div>
              <div className="card-bd" style={{ padding: 0 }}>
                {team.map(t => (
                  <div className="team-row" key={t.id}>
                    <Avatar initials={t.n.split(" ").map(w => w[0]).join("").slice(0,2)} color={t.c} size={28} />
                    <div className="nm">{t.n}<div className="r">{t.r}</div></div>
                    <div className="v">{Math.round(t.v/1000)}<span style={{ fontSize: 13, color: "var(--text-3)", marginLeft: 2 }}>k</span></div>
                    <div className="mt">{t.pct}%</div>
                    <div className="bar"><i style={{ width: `${t.pct}%`, background: t.c }} /></div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Activity */}
          <div className="card">
            <div className="card-hd">
              <h3>Activité du workspace</h3>
              <span className="meta">en direct</span>
              <button className="btn xs" style={{ marginLeft: "auto", color: "var(--text-3)" }}>
                Voir tout<Icon name="chevright" className="ico-xs" />
              </button>
            </div>
            <div className="card-bd" style={{ padding: 0 }}>
              <div className="activity">
                {activity.map((a, i) => (
                  <div className="act-row" key={i}>
                    <div className={`ic-w ${a.ic}`}>
                      <Icon name={a.ic === "win" ? "check" : a.ic === "call" ? "phone" : a.ic === "email" ? "mail" : a.ic === "cal" ? "calendar" : "note"} className="ico-sm" />
                    </div>
                    <div>
                      <div className="tx">
                        <span className="e">{a.who}</span> <span className="pp">{a.v}</span> <span className="e">{a.e}</span>
                      </div>
                      {a.det && <div className="det">{a.det}</div>}
                    </div>
                    <div className="h">{a.t}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

window.ScreenDashboard = ScreenDashboard;
