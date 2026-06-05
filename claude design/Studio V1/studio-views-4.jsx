// studio-views-4.jsx — Pilotage workspace (manager view)

function StudioPilotage() {
  return (
    <div className="studio">
      <AppRail active="data" />
      <div className="content">

        <header className="topbar">
          <WorkspacePill />
          <div className="crumbs">
            <Icon name="home2" className="ico-sm" style={{ color: "var(--text-4)" }} />
            <Icon name="chevright" className="ico-xs" />
            <span>Studio</span>
            <Icon name="chevright" className="ico-xs" />
            <span>Pilotage</span>
            <Icon name="chevright" className="ico-xs" />
            <span className="cur">Vue d'ensemble</span>
          </div>
          <div className="search">
            <Icon name="search" className="ico-sm" />
            <span>Rechercher…</span>
            <kbd>⌘K</kbd>
          </div>
          <div className="actions">
            <button className="btn ghost sm icon"><Icon name="bell" className="ico-sm" /></button>
            <button className="btn outline sm"><Icon name="download" className="ico-sm" />Export</button>
          </div>
        </header>

        <div className="ws-shell">

          <aside className="subnav">
            <div className="subnav-hd">
              <div className="step"><Icon name="trending" className="ico-xs" />Espace · pilotage</div>
              <h2><em>Piloter</em> & mesurer</h2>
              <div className="sb">tableau de bord manager</div>
            </div>
            <div className="subnav-body">
              <div className="subnav-section">
                <div className="nl">Vue</div>
                <button className="subnav-item" aria-current="page">
                  <Icon name="bento" className="ico ic" />
                  <span className="lb">Vue d'ensemble</span>
                </button>
                <button className="subnav-item">
                  <Icon name="trending" className="ico ic" />
                  <span className="lb">Forecast</span>
                </button>
                <button className="subnav-item">
                  <Icon name="bar" className="ico ic" />
                  <span className="lb">Rapports</span>
                  <span className="bd">12</span>
                </button>
              </div>

              <div className="subnav-section">
                <div className="nl">Performance</div>
                <button className="subnav-item">
                  <Icon name="users" className="ico ic" />
                  <span className="lb">Équipe</span>
                  <span className="bd">6</span>
                </button>
                <button className="subnav-item">
                  <Icon name="target" className="ico ic" />
                  <span className="lb">Objectifs</span>
                  <span className="bd">Q2</span>
                </button>
                <button className="subnav-item">
                  <Icon name="euro" className="ico ic" />
                  <span className="lb">Commissions</span>
                </button>
              </div>

              <div className="subnav-section">
                <div className="nl">Analyse</div>
                <button className="subnav-item">
                  <Icon name="flow" className="ico ic" />
                  <span className="lb">Sources & ROI</span>
                </button>
                <button className="subnav-item">
                  <Icon name="trending" className="ico ic" />
                  <span className="lb">Cohortes</span>
                </button>
                <button className="subnav-item">
                  <Icon name="map" className="ico ic" />
                  <span className="lb">Territoires</span>
                </button>
              </div>

              <div className="subnav-section">
                <div className="nl">Admin</div>
                <button className="subnav-item">
                  <Icon name="users" className="ico ic" />
                  <span className="lb">Utilisateurs & rôles</span>
                </button>
                <button className="subnav-item">
                  <Icon name="zap" className="ico ic" />
                  <span className="lb">Intégrations</span>
                </button>
              </div>
            </div>
            <div className="subnav-ft">
              <div className="progress-row">
                <div className="lb">
                  <span>Objectif Q2 — équipe</span>
                  <span>76%</span>
                </div>
                <div className="bar"><i style={{ width: "76%" }} /></div>
              </div>
            </div>
          </aside>

          <div className="ws-content">
            <div className="tabs-strip">
              <div className="tab" aria-selected="true"><Icon name="bento" className="ico-sm" />Vue d'ensemble</div>
              <div className="tab"><Icon name="trending" className="ico-sm" />Forecast</div>
              <div className="tab"><Icon name="users" className="ico-sm" />Équipe</div>
              <div className="tab"><Icon name="flow" className="ico-sm" />Sources & ROI</div>
              <span className="grow" />
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
                <Icon name="calendar" className="ico-sm" />30 derniers jours
                <Icon name="chevdown" className="ico-xs" />
              </div>
            </div>

            <div className="ws-overview">
              <div className="ws-header">
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--text-3)" }}>30J · MAI → JUIN 2026</div>
                  <h1>L'équipe a fait <em>+18%</em> ce mois</h1>
                  <div className="sub">486 k€ pipeline · 14 signés (vs 10 en mai) · cycle moyen 21 jours</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn outline sm"><Icon name="filter" className="ico-sm" />Filtrer</button>
                  <button className="btn outline sm"><Icon name="share" className="ico-sm" />Partager</button>
                </div>
              </div>

              {/* KPI strip */}
              <div className="kpi-strip" style={{ marginTop: 0, marginBottom: 18 }}>
                <div className="kpi">
                  <div className="lb"><Icon name="euro" className="ico-xs" />CA signé</div>
                  <div className="vl">218<small>k€</small></div>
                  <div className="delta">▲ +24% vs M-1</div>
                </div>
                <div className="kpi">
                  <div className="lb"><Icon name="target" className="ico-xs" />pipeline</div>
                  <div className="vl">486<small>k€</small></div>
                  <div className="delta">▲ +18% vs M-1</div>
                </div>
                <div className="kpi">
                  <div className="lb"><Icon name="trending" className="ico-xs" />conversion</div>
                  <div className="vl">5.2<small>%</small></div>
                  <div className="delta dn">▼ -0.3pt</div>
                </div>
                <div className="kpi">
                  <div className="lb"><Icon name="clock" className="ico-xs" />cycle moyen</div>
                  <div className="vl">21<small>j</small></div>
                  <div className="delta">▲ -3j vs M-1</div>
                </div>
              </div>

              <div className="bento-2col">

                {/* Left: chart + sources */}
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div className="chart-card">
                    <div className="card-hd">
                      <h3>CA signé · 6 derniers mois</h3>
                      <span className="meta">objectif 200 k€/mois</span>
                    </div>
                    <div className="line-chart">
                      <div className="grid">
                        <i><span className="ax">300k</span></i>
                        <i><span className="ax">200k</span></i>
                        <i><span className="ax">100k</span></i>
                        <i><span className="ax">0</span></i>
                      </div>
                      <svg viewBox="0 0 600 200" preserveAspectRatio="none">
                        {/* objective line */}
                        <line x1="0" y1="67" x2="600" y2="67"
                              stroke="var(--text)" strokeWidth="1" strokeDasharray="4 4" opacity="0.4" />
                        {/* area */}
                        <path d="M0,140 L120,120 L240,90 L360,70 L480,80 L600,50 L600,200 L0,200 Z"
                              fill="var(--accent)" fillOpacity="0.10" />
                        {/* line */}
                        <path d="M0,140 L120,120 L240,90 L360,70 L480,80 L600,50"
                              fill="none" stroke="var(--accent)" strokeWidth="2"
                              strokeLinecap="round" strokeLinejoin="round" />
                        {/* points */}
                        <circle cx="0"   cy="140" r="3" fill="var(--accent)" />
                        <circle cx="120" cy="120" r="3" fill="var(--accent)" />
                        <circle cx="240" cy="90"  r="3" fill="var(--accent)" />
                        <circle cx="360" cy="70"  r="3" fill="var(--accent)" />
                        <circle cx="480" cy="80"  r="3" fill="var(--accent)" />
                        <circle cx="600" cy="50"  r="4" fill="var(--accent)" stroke="#fff" strokeWidth="2" />
                      </svg>
                      <div className="xax">
                        <span>jan</span><span>fév</span><span>mar</span><span>avr</span><span>mai</span><span>juin</span>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-hd">
                      <h3>Sources de leads — 30j</h3>
                      <span className="meta">86 leads · 4 200 € de coût</span>
                    </div>
                    <div className="sources-grid">
                      <div className="src-row">
                        <div className="icw" style={{ background: "var(--info-tint)", color: "var(--info)" }}>
                          <Icon name="globe" className="ico" />
                        </div>
                        <div>
                          <div className="nm">Site & landings</div>
                          <div className="det">SEO + direct</div>
                        </div>
                        <div className="vl">34</div>
                        <div className="pct">+18%</div>
                      </div>
                      <div className="src-row">
                        <div className="icw" style={{ background: "var(--magic-tint)", color: "var(--magic)" }}>
                          <Icon name="note" className="ico" />
                        </div>
                        <div>
                          <div className="nm">Formulaires</div>
                          <div className="det">qualif + devis</div>
                        </div>
                        <div className="vl">28</div>
                        <div className="pct">+24%</div>
                      </div>
                      <div className="src-row">
                        <div className="icw" style={{ background: "var(--ok-tint)", color: "var(--ok)" }}>
                          <Icon name="google" className="ico" />
                        </div>
                        <div>
                          <div className="nm">Google Ads</div>
                          <div className="det">CPC 3.20 €</div>
                        </div>
                        <div className="vl">14</div>
                        <div className="pct dn">-8%</div>
                      </div>
                      <div className="src-row">
                        <div className="icw" style={{ background: "var(--warn-tint)", color: "var(--warn)" }}>
                          <Icon name="users" className="ico" />
                        </div>
                        <div>
                          <div className="nm">Recommandations</div>
                          <div className="det">parrainage</div>
                        </div>
                        <div className="vl">10</div>
                        <div className="pct">+5%</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: team + objectives */}
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div className="card">
                    <div className="card-hd">
                      <h3>Équipe — performance 30j</h3>
                      <span className="meta">6 actifs</span>
                    </div>
                    <div className="team-grid">
                      <div className="team-row-2">
                        <div className="av" style={{ background: "var(--accent)" }}>LB</div>
                        <div>
                          <div className="nm">Lucas Bernier</div>
                          <div className="r">lead · acquisition</div>
                        </div>
                        <div className="vl">
                          <div className="num">82<span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 2 }}>k</span></div>
                          <div className="pct">+22%</div>
                        </div>
                        <div className="bar"><i style={{ width: "92%" }} /></div>
                      </div>
                      <div className="team-row-2">
                        <div className="av" style={{ background: "var(--info)" }}>NC</div>
                        <div>
                          <div className="nm">Naïma Cherif</div>
                          <div className="r">freelance · agent</div>
                        </div>
                        <div className="vl">
                          <div className="num">64<span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 2 }}>k</span></div>
                          <div className="pct">+18%</div>
                        </div>
                        <div className="bar"><i style={{ width: "78%" }} /></div>
                      </div>
                      <div className="team-row-2">
                        <div className="av" style={{ background: "var(--magic)" }}>PE</div>
                        <div>
                          <div className="nm">Pierre Étienne</div>
                          <div className="r">commercial · sud</div>
                        </div>
                        <div className="vl">
                          <div className="num">38<span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 2 }}>k</span></div>
                          <div className="pct dn">-4%</div>
                        </div>
                        <div className="bar"><i style={{ width: "48%", background: "var(--warn)" }} /></div>
                      </div>
                      <div className="team-row-2">
                        <div className="av" style={{ background: "var(--ok)" }}>SR</div>
                        <div>
                          <div className="nm">Sylvie Roux</div>
                          <div className="r">commercial · nord</div>
                        </div>
                        <div className="vl">
                          <div className="num">34<span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 2 }}>k</span></div>
                          <div className="pct">+12%</div>
                        </div>
                        <div className="bar"><i style={{ width: "42%" }} /></div>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-hd">
                      <h3>Objectifs Q2 2026</h3>
                      <span className="meta">76% atteint</span>
                    </div>
                    <div style={{ padding: "10px 18px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                          <span>CA signé Q2</span>
                          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>456 / 600 k€</span>
                        </div>
                        <div style={{ height: 6, background: "var(--bg-3)", borderRadius: 999 }}>
                          <i style={{ display: "block", height: "100%", width: "76%", background: "var(--accent)", borderRadius: 999 }} />
                        </div>
                      </div>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                          <span>Nouveaux clients</span>
                          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>38 / 50</span>
                        </div>
                        <div style={{ height: 6, background: "var(--bg-3)", borderRadius: 999 }}>
                          <i style={{ display: "block", height: "100%", width: "76%", background: "var(--ok)", borderRadius: 999 }} />
                        </div>
                      </div>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                          <span>NPS clients</span>
                          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>62 / 70</span>
                        </div>
                        <div style={{ height: 6, background: "var(--bg-3)", borderRadius: 999 }}>
                          <i style={{ display: "block", height: "100%", width: "88%", background: "var(--info)", borderRadius: 999 }} />
                        </div>
                      </div>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                          <span>Cycle moyen</span>
                          <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-3)" }}>21 / ≤20 j</span>
                        </div>
                        <div style={{ height: 6, background: "var(--bg-3)", borderRadius: 999 }}>
                          <i style={{ display: "block", height: "100%", width: "95%", background: "var(--warn)", borderRadius: 999 }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>

        <footer className="statusbar">
          <span><span className="dot" />Connecté</span>
          <span className="sep">·</span>
          <span>pilotage</span>
          <span className="sep">·</span>
          <span>data au {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>
          <span className="spacer" />
          <span>v2.0.0-beta</span>
        </footer>
      </div>
    </div>
  );
}

window.StudioPilotage = StudioPilotage;
