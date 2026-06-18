// studio-views.jsx — the three artboard views for SAMA Studio nav refonte

// ───── App rail (left, level 1) ─────
function AppRail({ active }) {
  const items = [
    { id: "hub",     ic: "bento",    lb: "Studio" },
    { id: "acq",     ic: "target",   lb: "Acquisition", dot: true },
    { id: "rel",     ic: "users",    lb: "Relation" },
    { id: "prod",    ic: "doc",      lb: "Production" },
    { id: "web",     ic: "globe",    lb: "Marketing & Web" },
    { id: "data",    ic: "trending", lb: "Pilotage" },
  ];
  return (
    <aside className="rail">
      <div className="brand">S</div>
      {items.map(it => (
        <div key={it.id} className="rail-btn" data-active={active === it.id ? "true" : "false"} title={it.lb}>
          <Icon name={it.ic} className="ico-lg" />
          {it.dot && <span className="dot" />}
        </div>
      ))}
      <div className="sep" />
      <div className="rail-btn" title="Outils & intégrations"><Icon name="tools" className="ico-lg" /></div>
      <div className="rail-btn" title="Notifications"><Icon name="bell" className="ico-lg" /><span className="dot" /></div>
      <div className="spacer" />
      <div className="rail-btn" title="Aide"><Icon name="info" className="ico-lg" /></div>
      <div className="rail-btn" title="Réglages"><Icon name="settings" className="ico-lg" /></div>
      <div className="av">LB</div>
    </aside>
  );
}

// ───── Workspace pill (topbar) ─────
function WorkspacePill() {
  return (
    <div className="workspace-pill">
      <div className="lg">T</div>
      <span>thermalis</span>
      <span className="sub">· lucas</span>
      <Icon name="chevdown" className="ico-sm chev" />
    </div>
  );
}

// ───── ARTBOARD 1: Studio Hub (home / launcher) ─────
function StudioHub() {
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
            <button className="btn ghost sm icon" title="Notifications"><Icon name="bell" className="ico-sm" /></button>
            <button className="btn outline sm"><Icon name="plus" className="ico-sm" />Nouveau</button>
          </div>
        </header>

        <div className="hub-body">
          <div className="hub-scroll">

            {/* Greeting + "à reprendre" */}
            <div className="hub-greet">
              <div>
                <div className="date">jeudi · 5 juin 2026 · sem. 23</div>
                <h1>Bonjour Lucas, <em>3 RDV</em> aujourd'hui.</h1>
                <div className="sub">12 nouveaux leads cette nuit · 4 séquences à valider · pipeline +18% vs sem. dernière.</div>
              </div>
              <div className="now">
                <div className="ic-cube"><Icon name="play" className="ico-lg" /></div>
                <div>
                  <div className="lb">MAINTENANT · 09:30</div>
                  <div className="nm">RDV — Mme Vasseur, audit PAC</div>
                  <div className="det">12 rue Sainte-Catherine · dans 22 min</div>
                </div>
              </div>
            </div>

            {/* Universal search hero */}
            <div className="hub-search">
              <span className="icw"><Icon name="search" className="ico-lg" /></span>
              <span className="ph">Rechercher un contact, une entreprise, un devis, ou taper une action — "envoyer relance à Vasseur", "créer audit"…</span>
              <span className="hint">
                <kbd>⌘</kbd><kbd>K</kbd>
              </span>
            </div>

            {/* Recents row */}
            <div className="row-title">
              <h2>Reprendre où vous en étiez</h2>
              <span className="more">tout l'historique →</span>
            </div>
            <div className="recents">
              <div className="recent-card">
                <div className="top">
                  <span className="ic-w" data-tool="crm"><Icon name="user" className="ico" /></span>
                  <span className="tool">CRM · contact</span>
                  <span className="time">il y a 8 min</span>
                </div>
                <div className="ttl">Marie Vasseur</div>
                <div className="ctx">
                  <span className="av">MV</span>
                  <span>Audit PAC · score 87</span>
                </div>
              </div>
              <div className="recent-card">
                <div className="top">
                  <span className="ic-w" data-tool="form"><Icon name="note" className="ico" /></span>
                  <span className="tool">Form · brouillon</span>
                  <span className="time">il y a 1 h</span>
                </div>
                <div className="ttl">Pré-qualif chauffage 2026</div>
                <div className="ctx">14 questions · logique en cours</div>
              </div>
              <div className="recent-card">
                <div className="top">
                  <span className="ic-w" data-tool="auto"><Icon name="flow" className="ico" /></span>
                  <span className="tool">Séquence · active</span>
                  <span className="time">hier</span>
                </div>
                <div className="ttl">Relance devis J+7</div>
                <div className="ctx">42 actifs · 67% ouverture</div>
              </div>
              <div className="recent-card">
                <div className="top">
                  <span className="ic-w" data-tool="site"><Icon name="globe" className="ico" /></span>
                  <span className="tool">Site · page</span>
                  <span className="time">2 j</span>
                </div>
                <div className="ttl">thermalis.fr — Aide d'État</div>
                <div className="ctx">132 vues · 6 leads</div>
              </div>
            </div>

            {/* Workflows */}
            <div className="row-title">
              <h2>Vos outils</h2>
              <span className="sub">groupés par étape commerciale</span>
            </div>

            <div className="workflows">

              <div className="wf">
                <div className="hd">
                  <div className="step"><Icon name="target" className="ico-xs" /> Étape 1</div>
                  <div className="ttl"><em>Acquérir</em></div>
                  <div className="sb">attirer & capter les leads</div>
                </div>
                <div className="bd">
                  <div className="tool-row">
                    <span className="ic-w" data-tool="site"><Icon name="globe" className="ico" /></span>
                    <span className="nm">Site builder</span>
                    <span className="meta">3 pages</span>
                  </div>
                  <div className="tool-row">
                    <span className="ic-w" data-tool="form"><Icon name="note" className="ico" /></span>
                    <span className="nm">Form builder</span>
                    <span className="meta">7 forms</span>
                  </div>
                  <div className="tool-row">
                    <span className="ic-w" data-tool="audit"><Icon name="search" className="ico" /></span>
                    <span className="nm">Audit builder</span>
                    <span className="meta">2 modèles</span>
                  </div>
                  <div className="tool-row is-soon">
                    <span className="ic-w" data-tool="audit"><Icon name="map" className="ico" /></span>
                    <span className="nm">Landing pages</span>
                    <span className="meta"></span>
                  </div>
                </div>
              </div>

              <div className="wf">
                <div className="hd">
                  <div className="step"><Icon name="phone" className="ico-xs" /> Étape 2</div>
                  <div className="ttl"><em>Convertir</em></div>
                  <div className="sb">prospecter, qualifier, relancer</div>
                </div>
                <div className="bd">
                  <div className="tool-row">
                    <span className="ic-w" data-tool="crm"><Icon name="target" className="ico" /></span>
                    <span className="nm">Démarchage</span>
                    <span className="badge">10</span>
                  </div>
                  <div className="tool-row">
                    <span className="ic-w" data-tool="auto"><Icon name="flow" className="ico" /></span>
                    <span className="nm">Séquences</span>
                    <span className="meta">5 actives</span>
                  </div>
                  <div className="tool-row">
                    <span className="ic-w" data-tool="msg"><Icon name="inbox" className="ico" /></span>
                    <span className="nm">Messagerie</span>
                    <span className="badge">12</span>
                  </div>
                  <div className="tool-row">
                    <span className="ic-w" data-tool="cal"><Icon name="calendar" className="ico" /></span>
                    <span className="nm">Calendrier</span>
                    <span className="meta">7 RDV</span>
                  </div>
                </div>
              </div>

              <div className="wf">
                <div className="hd">
                  <div className="step"><Icon name="users" className="ico-xs" /> Étape 3</div>
                  <div className="ttl"><em>Relation</em></div>
                  <div className="sb">votre base de connaissance client</div>
                </div>
                <div className="bd">
                  <div className="tool-row">
                    <span className="ic-w" data-tool="crm"><Icon name="user" className="ico" /></span>
                    <span className="nm">Contacts</span>
                    <span className="meta">1 248</span>
                  </div>
                  <div className="tool-row">
                    <span className="ic-w" data-tool="crm"><Icon name="building" className="ico" /></span>
                    <span className="nm">Entreprises</span>
                    <span className="meta">342</span>
                  </div>
                  <div className="tool-row">
                    <span className="ic-w" data-tool="crm"><Icon name="pipeline" className="ico" /></span>
                    <span className="nm">Pipeline</span>
                    <span className="badge">38</span>
                  </div>
                  <div className="tool-row is-soon">
                    <span className="ic-w" data-tool="crm"><Icon name="map" className="ico" /></span>
                    <span className="nm">Territoires</span>
                    <span className="meta"></span>
                  </div>
                </div>
              </div>

              <div className="wf">
                <div className="hd">
                  <div className="step"><Icon name="tools" className="ico-xs" /> Étape 4</div>
                  <div className="ttl"><em>Produire</em></div>
                  <div className="sb">devis, contrats, chantiers</div>
                </div>
                <div className="bd">
                  <div className="tool-row">
                    <span className="ic-w" data-tool="audit"><Icon name="doc" className="ico" /></span>
                    <span className="nm">Devis & offres</span>
                    <span className="badge">33</span>
                  </div>
                  <div className="tool-row">
                    <span className="ic-w" data-tool="audit"><Icon name="tools" className="ico" /></span>
                    <span className="nm">Pose & chantiers</span>
                    <span className="meta">8 actifs</span>
                  </div>
                  <div className="tool-row">
                    <span className="ic-w" data-tool="form"><Icon name="check" className="ico" /></span>
                    <span className="nm">Bons de commande</span>
                    <span className="meta">14</span>
                  </div>
                  <div className="tool-row is-soon">
                    <span className="ic-w" data-tool="form"><Icon name="euro" className="ico" /></span>
                    <span className="nm">Facturation</span>
                  </div>
                </div>
              </div>

              <div className="wf">
                <div className="hd">
                  <div className="step"><Icon name="trending" className="ico-xs" /> Étape 5</div>
                  <div className="ttl"><em>Piloter</em></div>
                  <div className="sb">mesure, objectifs, équipe</div>
                </div>
                <div className="bd">
                  <div className="tool-row">
                    <span className="ic-w" data-tool="auto"><Icon name="bento" className="ico" /></span>
                    <span className="nm">Dashboard</span>
                    <span className="meta">live</span>
                  </div>
                  <div className="tool-row">
                    <span className="ic-w" data-tool="auto"><Icon name="trending" className="ico" /></span>
                    <span className="nm">Rapports</span>
                    <span className="meta">12</span>
                  </div>
                  <div className="tool-row">
                    <span className="ic-w" data-tool="auto"><Icon name="target" className="ico" /></span>
                    <span className="nm">Objectifs</span>
                    <span className="meta">Q2 · 71%</span>
                  </div>
                  <div className="tool-row">
                    <span className="ic-w" data-tool="auto"><Icon name="users" className="ico" /></span>
                    <span className="nm">Équipe</span>
                    <span className="meta">6 actifs</span>
                  </div>
                </div>
              </div>

            </div>

            {/* KPI strip */}
            <div className="kpi-strip">
              <div className="kpi">
                <div className="lb"><Icon name="target" className="ico-xs" />pipeline</div>
                <div className="vl">486<small>k€</small></div>
                <div className="delta">▲ +18% · 7j</div>
              </div>
              <div className="kpi">
                <div className="lb"><Icon name="check" className="ico-xs" />signés ce mois</div>
                <div className="vl">14</div>
                <div className="delta">▲ +4 vs juin'25</div>
              </div>
              <div className="kpi">
                <div className="lb"><Icon name="phone" className="ico-xs" />démarchage</div>
                <div className="vl">62<small>/sem.</small></div>
                <div className="delta dn">▼ -8% objectif</div>
              </div>
              <div className="kpi">
                <div className="lb"><Icon name="euro" className="ico-xs" />ca prévisionnel</div>
                <div className="vl">128<small>k€</small></div>
                <div className="delta">▲ obj. atteint à 91%</div>
              </div>
            </div>

          </div>
        </div>

        <footer className="statusbar">
          <span><span className="dot" />Connecté · Supabase</span>
          <span className="sep">·</span>
          <span>thermalis</span>
          <span className="sep">·</span>
          <span>auto-save synced il y a 4s</span>
          <span className="spacer" />
          <span>v2.0.0-beta</span>
        </footer>
      </div>

      {/* annotations */}
      <div className="callout lt" style={{ left: 88, top: 60 }}>app rail · 1 clic = 1 espace métier</div>
      <div className="callout lt" style={{ left: 248, top: 246 }}>3 outils différents · 1 vue</div>
      <div className="callout lt" style={{ left: 248, top: 488 }}>tout est groupé par étape commerciale</div>
    </div>
  );
}

window.AppRail = AppRail;
window.WorkspacePill = WorkspacePill;
window.StudioHub = StudioHub;
