// screen-dashboard.jsx — vue agent freelance SAMA
function ScreenDashboard() {
  const { openConv } = window.useConv();
  const tasks = window.TODAY_TASKS;
  const done = tasks.filter(t => t.state === "done").length;
  const weeks = window.RDV_WEEKS;
  const maxW = Math.max(...weeks.map(w => Math.max(w.val, w.obj)));
  const net = window.NETWORK;
  const signals = window.SIGNALS;

  const chIc = ch => ch === "wa" ? "whatsapp" : ch === "call" ? "phone" : "mail";

  return (
    <div className="page">
      <div className="dash-grid">

        {/* LEFT — aujourd'hui */}
        <aside className="dash-today">
          <div className="date">jeudi 21 mai 2026 · semaine 21</div>
          <h2>Bonjour Naïma.</h2>
          <div className="greet-sub">9 actions aujourd'hui · 2 RDV à confirmer · 1 lead à clôturer.</div>

          <div className="task-progress">
            <span style={{ fontFamily: "var(--font-mono)" }}>{done}/{tasks.length}</span>
            <span className="bar"><i style={{ width: `${(done / tasks.length) * 100}%` }} /></span>
            <span>fait</span>
          </div>

          <div className="timeline">
            {tasks.map(t => {
              const p = window.prospect(t.pid);
              const m = window.mandant(p.mandant);
              return (
                <div key={t.id} className="tl-item clickable" data-state={t.state} onClick={() => openConv(t.pid)}>
                  <div className="h">{t.time}</div>
                  <div className="task-head">
                    <span className={`ch-ico ${t.ch}`}><Icon name={chIc(t.ch)} className="ico-xs" /></span>
                    <span className="ttl">{t.title}</span>
                    <Icon name="chevright" className="ico-sm task-go" />
                  </div>
                  {t.det && <div className="det">{t.det}</div>}
                  <div className="mandant-tag"><span className="d" style={{ background: m.color }} />{m.name} · {m.focus}</div>
                </div>
              );
            })}
          </div>

          <div className="dash-now-cta" style={{ marginTop: 16 }}>
            <div className="gho"><Icon name="whatsapp" className="ico-lg" style={{ color: "white" }} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="lb">Maintenant · à traiter</div>
              <div className="nm">Mehdi Daoudi · a ouvert le devis 3×</div>
            </div>
            <button className="btn xs" style={{ background: "rgba(255,255,255,.10)", color: "var(--bg)", border: "1px solid rgba(255,255,255,.15)" }} onClick={() => openConv("p4")}>
              Ouvrir<Icon name="arrowRight" className="ico-sm" />
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <div className="dash-main">

          {/* KPIs */}
          <div className="kpi-bento">
            <div className="kpi dark">
              <div className="lb"><Icon name="calendar" className="ico-sm" />RDV pris · ce mois</div>
              <div className="vl">23<small>· obj 38</small></div>
              <div className="delta up"><Icon name="trending" className="ico-xs" />+15% <span className="vs">vs avril</span></div>
              <div className="spark">
                <Sparkline data={[2, 3, 5, 4, 6, 5, 8, 7, 9, 11, 14, 23]} color="var(--accent)" width={84} height={32} fill />
              </div>
            </div>

            <div className="kpi">
              <div className="lb"><Icon name="phone" className="ico-sm" />Appels · aujourd'hui</div>
              <div className="vl">34<small>/ 50</small></div>
              <div className="delta up"><Icon name="clock" className="ico-xs" />reste 16</div>
              <div style={{ height: 6, background: "var(--bg-3)", borderRadius: 999, marginTop: "auto", overflow: "hidden" }}>
                <div style={{ width: "68%", height: "100%", background: "var(--accent)", borderRadius: 999 }} />
              </div>
            </div>

            <div className="kpi">
              <div className="lb"><Icon name="trending" className="ico-sm" />Taux de réponse</div>
              <div className="vl">42<small>%</small></div>
              <div className="delta up"><Icon name="trending" className="ico-xs" />+6 pts <span className="vs">vs 30j</span></div>
              <div className="spark">
                <Sparkline data={[31, 34, 33, 38, 36, 40, 42]} color="var(--text-3)" width={84} height={32} />
              </div>
            </div>

            <div className="kpi">
              <div className="lb"><Icon name="euro" className="ico-sm" />Gains · ce mois</div>
              <div className="vl">1 840<small>€ · estimé</small></div>
              <div className="delta up"><Icon name="check" className="ico-xs" />18 validés · 5 en cours</div>
              <div className="spark">
                <Sparkline data={[180, 320, 460, 620, 820, 1040, 1280, 1520, 1840]} color="var(--text-3)" width={84} height={32} fill />
              </div>
            </div>
          </div>

          {/* RDV/objectif + classement réseau */}
          <div className="dash-row-2">
            <div className="card">
              <div className="card-hd">
                <h3>RDV pris vs objectif</h3>
                <span className="meta">par semaine · 6 sem.</span>
                <button className="btn xs subtle" style={{ marginLeft: "auto" }}>
                  <Icon name="calendar" className="ico-sm" />6 sem.<Icon name="chevdown" className="ico-xs" />
                </button>
              </div>
              <div className="card-bd">
                <div className="forecast-chart">
                  {weeks.map((w, i) => {
                    const hVal = (w.val / maxW) * 100;
                    const hObj = (w.obj / maxW) * 100;
                    return (
                      <div key={i} className="forecast-col">
                        <div className="fc-bar-wrap">
                          <div className="fc-bar" style={{ height: `${hObj}%` }}>
                            <div className="fill" style={{
                              height: `${(hVal / hObj) * 100}%`,
                              background: w.partial ? "repeating-linear-gradient(45deg, var(--accent), var(--accent) 4px, var(--accent-2) 4px, var(--accent-2) 8px)" : "var(--accent)",
                              opacity: w.partial ? 0.85 : 1,
                            }} />
                            <div className="marker" style={{ top: 0 }} />
                          </div>
                        </div>
                        <div className="fc-col-lb">{w.m}</div>
                        <div className="fc-col-val">{w.val}{w.partial ? " ↗" : ""} / {w.obj}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 11, color: "var(--text-3)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 10, height: 10, background: "var(--accent)", borderRadius: 2 }} /> RDV pris
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

            <div className="card">
              <div className="card-hd">
                <h3>Réseau freelance SAMA</h3>
                <span className="meta">RDV ce mois</span>
              </div>
              <div className="card-bd" style={{ padding: 0 }}>
                {net.map(t => (
                  <div className="team-row" key={t.id} style={t.me ? { background: "var(--accent-tint)" } : null}>
                    <Avatar initials={t.n.split(" ").map(w => w[0]).join("").slice(0, 2)} color={t.c} size={28} />
                    <div className="nm">{t.n}<div className="r">{t.r}</div></div>
                    <div className="v">{t.rdv}<span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 2 }}>rdv</span></div>
                    <div className="mt">{t.pct}%</div>
                    <div className="bar"><i style={{ width: `${t.pct}%`, background: t.c }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Signaux récents (cliquables) */}
          <div className="card">
            <div className="card-hd">
              <h3>Signaux en direct</h3>
              <span className="meta">ouvertures · clics · réponses</span>
              <button className="btn xs" style={{ marginLeft: "auto", color: "var(--text-3)" }}>
                Tout voir<Icon name="chevright" className="ico-xs" />
              </button>
            </div>
            <div className="card-bd" style={{ padding: 0 }}>
              <div className="activity">
                {signals.map((a, i) => {
                  const p = window.prospect(a.pid);
                  const m = window.mandant(p.mandant);
                  const icMap = { email: "mail", wa: "whatsapp", win: "check", call: "phone" };
                  const wCls = a.ic === "win" ? "win" : a.ic === "email" ? "email" : a.ic === "call" ? "call" : "note";
                  return (
                    <div className="act-row" key={i} style={{ cursor: "default" }} onClick={() => openConv(a.pid)}>
                      <div className={`ic-w ${wCls}`}><Icon name={icMap[a.ic] || "note"} className="ico-sm" /></div>
                      <div>
                        <div className="tx">
                          <span className="e">{p.first} {p.last}</span> <span className="pp">{a.v}</span> <span className="e">{a.e}</span>
                        </div>
                        {a.det && <div className="det">{a.det} · <span style={{ color: m.color }}>{m.name}</span></div>}
                      </div>
                      <div className="h">{a.t}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

window.ScreenDashboard = ScreenDashboard;
