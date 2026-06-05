// studio-views-2.jsx — workspace view + Cmd+K palette

// ───── ARTBOARD 2: Workspace "Acquisition" — sub-nav level 2 + content ─────
function StudioWorkspace() {
  return (
    <div className="studio">
      <AppRail active="acq" />
      <div className="content">

        <header className="topbar">
          <WorkspacePill />
          <div className="crumbs">
            <Icon name="home2" className="ico-sm" style={{ color: "var(--text-4)" }} />
            <Icon name="chevright" className="ico-xs" />
            <span>Studio</span>
            <Icon name="chevright" className="ico-xs" />
            <span>Acquisition</span>
            <Icon name="chevright" className="ico-xs" />
            <span className="cur">Vue d'ensemble</span>
          </div>
          <div className="search">
            <Icon name="search" className="ico-sm" />
            <span>Rechercher dans Acquisition…</span>
            <kbd>⌘K</kbd>
          </div>
          <div className="actions">
            <button className="btn ghost sm icon"><Icon name="bell" className="ico-sm" /></button>
            <button className="btn outline sm"><Icon name="plus" className="ico-sm" />Nouveau lead</button>
          </div>
        </header>

        <div className="ws-shell">

          {/* Level-2 sub-nav */}
          <aside className="subnav">
            <div className="subnav-hd">
              <div className="step"><Icon name="target" className="ico-xs" />Espace · acquisition</div>
              <h2><em>Acquérir</em> & convertir</h2>
              <div className="sb">site → form → audit → démarchage → signé</div>
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
                  <span className="lb">Funnel & stats</span>
                </button>
              </div>

              <div className="subnav-section">
                <div className="nl">Capter</div>
                <button className="subnav-item">
                  <Icon name="globe" className="ico ic" />
                  <span className="lb">Site & landings</span>
                  <span className="bd">3</span>
                </button>
                <button className="subnav-item">
                  <Icon name="note" className="ico ic" />
                  <span className="lb">Formulaires</span>
                  <span className="bd">7</span>
                </button>
                <button className="subnav-item">
                  <Icon name="search" className="ico ic" />
                  <span className="lb">Audits & leads</span>
                  <span className="bd">28</span>
                </button>
              </div>

              <div className="subnav-section">
                <div className="nl">Activer</div>
                <button className="subnav-item">
                  <Icon name="target" className="ico ic" />
                  <span className="lb">Démarchage</span>
                  <span className="bd">10</span>
                </button>
                <button className="subnav-item">
                  <Icon name="flow" className="ico ic" />
                  <span className="lb">Séquences</span>
                  <span className="bd">5</span>
                </button>
                <button className="subnav-item">
                  <Icon name="inbox" className="ico ic" />
                  <span className="lb">Messagerie</span>
                  <span className="bd">12</span>
                </button>
              </div>

              <div className="subnav-section">
                <div className="nl">Optimiser</div>
                <button className="subnav-item">
                  <Icon name="bar" className="ico ic" />
                  <span className="lb">A/B tests</span>
                </button>
                <button className="subnav-item">
                  <Icon name="trending" className="ico ic" />
                  <span className="lb">Sources & ROI</span>
                </button>
              </div>
            </div>
            <div className="subnav-ft">
              <div className="progress-row">
                <div className="lb">
                  <span>Objectif Q2</span>
                  <span>71%</span>
                </div>
                <div className="bar"><i style={{ width: "71%" }} /></div>
              </div>
            </div>
          </aside>

          {/* Content tabs + bento */}
          <div className="ws-content">
            <div className="tabs-strip">
              <div className="tab" aria-selected="true">
                <Icon name="bento" className="ico-sm" />Vue d'ensemble
              </div>
              <div className="tab">
                <Icon name="target" className="ico-sm" />Démarchage <span className="bd">10</span>
              </div>
              <div className="tab">
                <Icon name="flow" className="ico-sm" />Séquences
              </div>
              <div className="tab">
                <Icon name="note" className="ico-sm" />Forms collectés
              </div>
              <div className="tab">
                <Icon name="trending" className="ico-sm" />Funnel
              </div>
              <span className="grow" />
              <button className="btn ghost sm icon"><Icon name="filter" className="ico-sm" /></button>
              <button className="btn ghost sm icon"><Icon name="moreV" className="ico-sm" /></button>
            </div>

            <div className="ws-overview">
              <div className="ws-header">
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--text-3)" }}>SEMAINE 23 · 1→7 JUIN</div>
                  <h1>Acquérir <em>cette semaine</em></h1>
                  <div className="sub">86 nouveaux leads · 38 qualifiés · 14 RDV pris · 4 signés</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn outline sm"><Icon name="download" className="ico-sm" />Export</button>
                  <button className="btn primary sm"><Icon name="plus" className="ico-sm" />Nouvelle campagne</button>
                </div>
              </div>

              <div className="bento-2col">

                {/* Left: funnel + sequences */}
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div className="card">
                    <div className="card-hd">
                      <h3>Funnel — 7 derniers jours</h3>
                      <span className="meta">86 entrées</span>
                    </div>
                    <div className="card-bd">
                      <div className="funnel">
                        <div className="funnel-row" data-stage="lead">
                          <span className="nm">Leads bruts</span>
                          <span className="bar"><i style={{ width: "100%" }} /></span>
                          <span className="vl">86</span>
                          <span className="pct">100%</span>
                        </div>
                        <div className="funnel-row" data-stage="qualif">
                          <span className="nm">Qualifiés</span>
                          <span className="bar"><i style={{ width: "62%" }} /></span>
                          <span className="vl">53</span>
                          <span className="pct">62%</span>
                        </div>
                        <div className="funnel-row" data-stage="rdv">
                          <span className="nm">RDV pris</span>
                          <span className="bar"><i style={{ width: "32%" }} /></span>
                          <span className="vl">28</span>
                          <span className="pct">32%</span>
                        </div>
                        <div className="funnel-row" data-stage="devis">
                          <span className="nm">Devis envoyé</span>
                          <span className="bar"><i style={{ width: "19%" }} /></span>
                          <span className="vl">16</span>
                          <span className="pct">19%</span>
                        </div>
                        <div className="funnel-row" data-stage="signe">
                          <span className="nm">Signés</span>
                          <span className="bar"><i style={{ width: "5%" }} /></span>
                          <span className="vl">4</span>
                          <span className="pct">5%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-hd">
                      <h3>Séquences actives</h3>
                      <span className="meta">5 · 142 contacts</span>
                    </div>
                    <div>
                      <div className="seq-row">
                        <div>
                          <div className="nm">Relance devis J+7</div>
                          <div className="det">42 contacts · email + SMS · démarrée il y a 12j</div>
                        </div>
                        <div className="mini-bar"><i style={{ width: "67%" }} /></div>
                        <div className="pct">67%</div>
                      </div>
                      <div className="seq-row">
                        <div>
                          <div className="nm">Aide d'État 2026 — nurturing</div>
                          <div className="det">38 contacts · LinkedIn + email · auto</div>
                        </div>
                        <div className="mini-bar"><i style={{ width: "54%" }} /></div>
                        <div className="pct">54%</div>
                      </div>
                      <div className="seq-row">
                        <div>
                          <div className="nm">Cold call Carcassonne</div>
                          <div className="det">28 contacts · appels manuels</div>
                        </div>
                        <div className="mini-bar"><i style={{ width: "39%" }} /></div>
                        <div className="pct">39%</div>
                      </div>
                      <div className="seq-row">
                        <div>
                          <div className="nm">Réactivation 2024</div>
                          <div className="det">22 contacts · email 3 étapes</div>
                        </div>
                        <div className="mini-bar"><i style={{ width: "82%" }} /></div>
                        <div className="pct">82%</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: today + queue */}
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div className="card">
                    <div className="card-hd">
                      <h3>Aujourd'hui</h3>
                      <span className="meta">jeu. 5 juin</span>
                    </div>
                    <div className="card-bd" style={{ paddingBottom: 6 }}>
                      <div className="tl">
                        <div className="tl-it" data-st="done">
                          <div className="h">08:30 · DONE</div>
                          <div className="ttl">Revue séquences · 5 actives</div>
                          <div className="det">Naïma · 12 min</div>
                        </div>
                        <div className="tl-it" data-st="now">
                          <div className="h">09:30 · MAINTENANT</div>
                          <div className="ttl">RDV Vasseur · audit PAC</div>
                          <div className="det">12 rue Sainte-Catherine</div>
                        </div>
                        <div className="tl-it">
                          <div className="h">11:00</div>
                          <div className="ttl">10 appels file démarchage</div>
                          <div className="det">objectif 6 RDV</div>
                        </div>
                        <div className="tl-it">
                          <div className="h">14:30</div>
                          <div className="ttl">Demo form "pré-qualif 2026"</div>
                          <div className="det">avec Pierre + Naïma</div>
                        </div>
                        <div className="tl-it">
                          <div className="h">17:00</div>
                          <div className="ttl">Pousser séquence relance</div>
                          <div className="det">42 contacts en attente</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-hd">
                      <h3>File démarchage</h3>
                      <span className="meta">10 prochains</span>
                    </div>
                    <div>
                      <div className="queue-row" data-k="call">
                        <span className="av">MD</span>
                        <div>
                          <div className="nm">Mathieu Dumas <span style={{ color: "var(--text-4)", fontWeight: 400, fontSize: 11, marginLeft: 6 }}>SARL Dumas BTP</span></div>
                          <div className="sb">audit fait · score 92 · à rappeler</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div className="tm">09:45</div>
                          <span className="kind"><Icon name="phone" className="ico-sm" /></span>
                        </div>
                      </div>
                      <div className="queue-row" data-k="email">
                        <span className="av">SR</span>
                        <div>
                          <div className="nm">Sylvie Roux</div>
                          <div className="sb">form rempli il y a 1h · PAC + isolation</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div className="tm">10:15</div>
                          <span className="kind"><Icon name="mail" className="ico-sm" /></span>
                        </div>
                      </div>
                      <div className="queue-row" data-k="linkedin">
                        <span className="av">PB</span>
                        <div>
                          <div className="nm">Pierre Brossard</div>
                          <div className="sb">vu landing aide d'État · 3 visites</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div className="tm">10:30</div>
                          <span className="kind"><Icon name="linkedin" className="ico-sm" /></span>
                        </div>
                      </div>
                      <div className="queue-row" data-k="call">
                        <span className="av">AL</span>
                        <div>
                          <div className="nm">Anne Leclerc</div>
                          <div className="sb">devis envoyé · J+9 sans réponse</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <div className="tm">11:00</div>
                          <span className="kind"><Icon name="phone" className="ico-sm" /></span>
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
          <span>acquisition</span>
          <span className="sep">·</span>
          <span>5 séquences actives · 10 actions en attente</span>
          <span className="spacer" />
          <span>v2.0.0-beta</span>
        </footer>
      </div>

      {/* annotations */}
      <div className="callout rt" style={{ left: 122, top: 184 }}>level 1 · espaces métiers</div>
      <div className="callout rt" style={{ left: 320, top: 184 }}>level 2 · outils de l'espace</div>
      <div className="callout rt" style={{ left: 580, top: 156 }}>tabs · vues de l'outil actif</div>
    </div>
  );
}

// ───── ARTBOARD 3: Cmd+K Palette ─────
function StudioCmdK() {
  return (
    <div className="studio">
      <AppRail active="hub" />
      <div className="content">

        <header className="topbar">
          <WorkspacePill />
          <div className="crumbs">
            <Icon name="home2" className="ico-sm" style={{ color: "var(--text-4)" }} />
            <Icon name="chevright" className="ico-xs" />
            <span className="cur">Studio</span>
          </div>
          <div className="search">
            <Icon name="search" className="ico-sm" />
            <span>Rechercher contacts, outils, actions…</span>
            <kbd>⌘K</kbd>
          </div>
          <div className="actions">
            <button className="btn ghost sm icon"><Icon name="bell" className="ico-sm" /></button>
            <button className="btn outline sm"><Icon name="plus" className="ico-sm" />Nouveau</button>
          </div>
        </header>

        <div className="hub-body">
          <div className="hub-scroll" style={{ filter: "blur(2px)", opacity: 0.7 }}>
            <div className="hub-greet">
              <div>
                <div className="date">jeudi · 5 juin 2026</div>
                <h1>Bonjour Lucas, <em>3 RDV</em> aujourd'hui.</h1>
              </div>
            </div>
            <div style={{ height: 48, background: "var(--surface)", border: "1px solid var(--border-2)", borderRadius: 12, marginBottom: 32 }} />
            <div className="recents">
              {[1,2,3,4].map(i => (
                <div key={i} className="recent-card" style={{ height: 120 }} />
              ))}
            </div>
            <div style={{ height: 22, margin: "30px 0 14px", background: "var(--bg-2)", width: 220, borderRadius: 4 }} />
            <div className="workflows">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="wf" style={{ height: 260 }} />
              ))}
            </div>
          </div>
        </div>

        <footer className="statusbar">
          <span><span className="dot" />Connecté</span>
          <span className="sep">·</span>
          <span>thermalis</span>
          <span className="spacer" />
          <span>v2.0.0-beta</span>
        </footer>

      </div>

      {/* Cmd+K modal */}
      <div className="cmd-overlay">
        <div className="cmd">
          <div className="cmd-hd">
            <span className="icw"><Icon name="search" className="ico-lg" /></span>
            <span className="scope">
              <span>dans Acquisition</span>
              <span className="x"><Icon name="x" className="ico-xs" /></span>
            </span>
            <input defaultValue="vass" autoFocus />
          </div>

          <div className="cmd-bd">

            <div className="cmd-sec">
              <div className="nl"><Icon name="user" className="ico-xs" />Contacts · 2 résultats</div>

              <div className="cmd-row" data-active="true">
                <span className="ic-w" data-tool="crm"><Icon name="user" className="ico" /></span>
                <div>
                  <div className="nm">Marie <em>Vass</em>eur</div>
                  <div className="sub">SARL Vasseur · Carcassonne · score 87</div>
                </div>
                <div className="ctx">
                  <div>contact</div>
                  <div className="where">CRM / Contacts</div>
                </div>
                <div className="kbd"><kbd>↵</kbd></div>
              </div>

              <div className="cmd-row">
                <span className="ic-w" data-tool="crm"><Icon name="user" className="ico" /></span>
                <div>
                  <div className="nm">Étienne <em>Vass</em>al</div>
                  <div className="sub">indépendant · perdu en mai</div>
                </div>
                <div className="ctx">
                  <div>contact</div>
                  <div className="where">CRM / Archives</div>
                </div>
              </div>
            </div>

            <div className="cmd-sec">
              <div className="nl"><Icon name="zap" className="ico-xs" />Actions rapides</div>
              <div className="cmd-row">
                <span className="ic-w" data-tool="auto"><Icon name="send" className="ico" /></span>
                <div>
                  <div className="nm">Envoyer relance à <em>Vass</em>eur</div>
                  <div className="sub">template "relance devis J+7"</div>
                </div>
                <div className="ctx">
                  <div>action</div>
                  <div className="where">Séquences</div>
                </div>
              </div>
              <div className="cmd-row">
                <span className="ic-w" data-tool="audit"><Icon name="search" className="ico" /></span>
                <div>
                  <div className="nm">Créer audit pour <em>Vass</em>eur</div>
                  <div className="sub">modèle "PAC + isolation 2026"</div>
                </div>
                <div className="ctx">
                  <div>action</div>
                  <div className="where">Audit builder</div>
                </div>
              </div>
              <div className="cmd-row">
                <span className="ic-w" data-tool="cal"><Icon name="calendar" className="ico" /></span>
                <div>
                  <div className="nm">Planifier RDV avec <em>Vass</em>eur</div>
                  <div className="sub">vendredi 10:00 disponible</div>
                </div>
                <div className="ctx">
                  <div>action</div>
                  <div className="where">Calendrier</div>
                </div>
              </div>
            </div>

            <div className="cmd-sec">
              <div className="nl"><Icon name="bento" className="ico-xs" />Outils & navigation</div>
              <div className="cmd-row">
                <span className="ic-w" data-tool="form"><Icon name="note" className="ico" /></span>
                <div>
                  <div className="nm">Form "Pré-qualif <em>Vass</em>eur"</div>
                  <div className="sub">brouillon · 12 questions</div>
                </div>
                <div className="ctx">
                  <div>document</div>
                  <div className="where">Form builder</div>
                </div>
              </div>
            </div>

          </div>

          <div className="cmd-ft">
            <div className="it"><kbd>↑</kbd><kbd>↓</kbd><span>naviguer</span></div>
            <div className="it"><kbd>↵</kbd><span>ouvrir</span></div>
            <div className="it"><kbd>⌘</kbd><kbd>↵</kbd><span>nouvel onglet</span></div>
            <div className="it"><kbd>tab</kbd><span>filtrer</span></div>
            <span className="spacer" />
            <span className="branding">⌘K · 14 résultats</span>
          </div>

        </div>
      </div>

      {/* annotation */}
      <div className="callout tp" style={{ left: 700, top: 70 }}>recherche universelle + actions exécutables</div>
    </div>
  );
}

window.StudioWorkspace = StudioWorkspace;
window.StudioCmdK = StudioCmdK;
