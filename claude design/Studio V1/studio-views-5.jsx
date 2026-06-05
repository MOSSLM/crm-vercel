// studio-views-5.jsx — Qualification + Pipeline + Opportunities (restyled, full features)

// ───── Shared Acquisition subnav with extended items ─────
function AcquisitionSubnav({ active }) {
  const it = (id, ic, lb, bd) => ({ id, ic, lb, bd });
  const sections = [
    { nl: "Vue", items: [
      it("overview",  "bento",    "Vue d'ensemble"),
      it("funnel",    "trending", "Funnel & stats"),
    ]},
    { nl: "Capter", items: [
      it("sites",     "globe",    "Sites & landings", "3"),
      it("forms",     "note",     "Formulaires", "7"),
      it("audits",    "search",   "Audits & leads", "28"),
    ]},
    { nl: "Qualifier", items: [
      it("qualification", "squareCheck", "Qualification", "42"),
      it("duplicates",    "copy",        "Doublons", "8"),
      it("blacklist",     "ban",         "Blacklist"),
    ]},
    { nl: "Convertir", items: [
      it("demarchage",   "target",   "Démarchage", "10"),
      it("pipeline",     "pipeline", "Pipeline", "38"),
      it("opportunities","zap",      "Opportunités", "124"),
      it("sequences",    "flow",     "Séquences", "5"),
      it("messagerie",   "inbox",    "Messagerie", "12"),
    ]},
    { nl: "Optimiser", items: [
      it("ab",       "bar",       "A/B tests"),
      it("sources",  "trending",  "Sources & ROI"),
    ]},
  ];

  return (
    <aside className="subnav">
      <div className="subnav-hd">
        <div className="step"><Icon name="target" className="ico-xs" />Espace · acquisition</div>
        <h2><em>Acquérir</em> & convertir</h2>
        <div className="sb">site → form → audit → qualif → opp → signé</div>
      </div>
      <div className="subnav-body">
        {sections.map((sec) => (
          <div key={sec.nl} className="subnav-section">
            <div className="nl">{sec.nl}</div>
            {sec.items.map((it) => (
              <button
                key={it.id}
                className="subnav-item"
                aria-current={active === it.id ? "page" : undefined}
              >
                <Icon name={it.ic} className="ico ic" />
                <span className="lb">{it.lb}</span>
                {it.bd && <span className="bd">{it.bd}</span>}
              </button>
            ))}
          </div>
        ))}
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
  );
}

window.AcquisitionSubnav = AcquisitionSubnav;

// ───── ARTBOARD: Qualification ─────
function StudioQualification() {
  const rows = [
    {
      id: 1, qualified: false, name: "Brossard Plomberie Chauffage", url: "brossard-plomberie.fr",
      source: "maps", address: "12 rue Sainte-Catherine, Carcassonne", tags: ["plomberie", "chauffage"],
      date: "04/06/2026", phone: true, hidden: false,
    },
    {
      id: 2, qualified: true, name: "SARL Dumas BTP", url: "dumas-btp.com",
      source: "search", address: "5 avenue Jean Jaurès, Toulouse", tags: ["btp", "rénovation"],
      date: "04/06/2026", phone: true, hidden: false,
    },
    {
      id: 3, qualified: false, name: "Énergie Sud-Ouest", url: "energie-sudouest.fr",
      source: "maps", address: "28 boulevard Carnot, Albi", tags: ["énergie", "solaire", "PAC"],
      date: "03/06/2026", phone: false, hidden: false,
    },
    {
      id: 4, qualified: false, name: "Chauffage Vasseur & Fils", url: "",
      source: "maps", address: "rue des Hauts, Limoux", tags: ["chauffage"],
      date: "03/06/2026", phone: true, hidden: false,
    },
    {
      id: 5, qualified: true, name: "Isolation Pro Languedoc", url: "isolationpro-lr.fr",
      source: "search", address: "14 rue de la République, Béziers", tags: ["isolation", "RGE"],
      date: "02/06/2026", phone: true, hidden: false,
    },
    {
      id: 6, qualified: false, name: "Bati Solutions Méditerranée", url: "batisolutions-med.fr",
      source: "search", address: "9 chemin du Lac, Narbonne", tags: ["BTP", "menuiserie", "carrelage"],
      date: "02/06/2026", phone: false, hidden: false,
    },
    {
      id: 7, qualified: false, name: "Climatech Languedoc", url: "climatech-lr.com",
      source: "maps", address: "ZA Les Pins, Lézignan", tags: ["climatisation", "PAC"],
      date: "01/06/2026", phone: true, hidden: false,
    },
    {
      id: 8, qualified: true, name: "Sud Habitat Rénovation", url: "sudhabitat.fr",
      source: "maps", address: "23 rue Mirabeau, Perpignan", tags: ["rénovation"],
      date: "01/06/2026", phone: true, hidden: false,
    },
  ];

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
            <span className="cur">Qualification</span>
          </div>
          <div className="search">
            <Icon name="search" className="ico-sm" />
            <span>Rechercher dans Qualification…</span>
            <kbd>⌘K</kbd>
          </div>
          <div className="actions">
            <button className="btn ghost sm icon"><Icon name="bell" className="ico-sm" /></button>
            <button className="btn outline sm"><Icon name="play" className="ico-sm" />Nouvelle recherche</button>
          </div>
        </header>

        <div className="ws-shell">
          <AcquisitionSubnav active="qualification" />

          <div className="ws-content">
            <div className="tabs-strip">
              <div className="tab" aria-selected="true">
                <Icon name="layoutList" className="ico-sm" />File à qualifier <span className="bd">42</span>
              </div>
              <div className="tab"><Icon name="check" className="ico-sm" />Qualifiées <span className="bd">28</span></div>
              <div className="tab"><Icon name="eyeOff" className="ico-sm" />Masquées <span className="bd">14</span></div>
              <div className="tab"><Icon name="ban" className="ico-sm" />Blacklist <span className="bd">6</span></div>
              <span className="grow" />
              <button className="btn ghost sm"><Icon name="download" className="ico-sm" />Export</button>
            </div>

            <div className="ws-overview" style={{ padding: "20px 24px 40px" }}>

              {/* Sprint banner */}
              <div className="sprint-banner">
                <div className="icw"><Icon name="zap" className="ico-lg" /></div>
                <div>
                  <div className="meta">SPRINT — opportunités</div>
                  <div className="ttl">Objectif : qualifier 12 leads aujourd'hui</div>
                </div>
                <div className="progress-line">
                  <div className="lab"><span>8 / 12</span><span>67%</span></div>
                  <div className="bar"><i style={{ width: "67%" }} /></div>
                </div>
                <button className="btn sm" style={{ background: "rgba(255,255,255,.1)", color: "#fff" }}>
                  <Icon name="arrowRight" className="ico-sm" />Voir le sprint
                </button>
                <button className="btn sm icon" style={{ color: "rgba(255,255,255,.5)" }}>
                  <Icon name="x" className="ico-sm" />
                </button>
              </div>

              {/* Header */}
              <div className="ws-header" style={{ marginBottom: 14 }}>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--text-3)" }}>BOT GOOGLE · DERNIÈRE PASSE IL Y A 3H</div>
                  <h1 style={{ fontSize: 30 }}><em>42 entreprises</em> à qualifier</h1>
                  <div className="sub">Qualifiez pour créer automatiquement des opportunités liées à votre offre active.</div>
                </div>
              </div>

              {/* Offer picker */}
              <div className="offer-picker">
                <div className="icw"><Icon name="target" className="ico" /></div>
                <div>
                  <div className="lab">OFFRE ACTIVE POUR LA QUALIFICATION</div>
                  <div className="ttl">Les opportunités créées seront liées à cette offre</div>
                </div>
                <div className="grow" />
                <div className="select-big">
                  <span>Audit PAC + isolation 2026</span>
                  <span className="pill">MRR</span>
                  <span className="price">1 290 € HT</span>
                  <Icon name="chevdown" className="ico-sm" style={{ color: "var(--text-4)" }} />
                </div>
              </div>

              {/* Filter bar */}
              <div className="filter-bar">
                <div className="search-w">
                  <Icon name="search" className="ico-sm" />
                  <input placeholder="Rechercher entreprise, ville, tag…" />
                </div>
                <div className="select-w">
                  <span className="lb">Sources :</span>
                  <span className="val">Toutes</span>
                  <Icon name="chevdown" className="ico-xs chev" />
                </div>
                <div className="select-w">
                  <span className="lb">URL :</span>
                  <span className="val">Toutes</span>
                  <Icon name="chevdown" className="ico-xs chev" />
                </div>
                <div className="toggle-w">
                  <span>Non qualifiées</span>
                  <span className="switch sm" />
                </div>
                <div className="toggle-w">
                  <span>Doublons</span>
                  <span className="switch sm" />
                </div>
                <div className="toggle-w">
                  <span>Masquées</span>
                  <span className="switch sm" />
                </div>
                <span className="grow" />
                <div className="seg">
                  <span className="s icon" title="Grille"><Icon name="layoutGrid" className="ico-sm" /></span>
                  <span className="s icon" aria-pressed="true" title="Liste"><Icon name="layoutList" className="ico-sm" /></span>
                </div>
              </div>

              {/* Data table */}
              <div className="dtable">
                <div className="dtable-head">
                  <div></div>
                  <div>Entreprise</div>
                  <div>Source</div>
                  <div>Adresse</div>
                  <div>Tags</div>
                  <div>Date</div>
                  <div>Actions</div>
                  <div style={{ textAlign: "center" }}>Qualification</div>
                  <div></div>
                </div>
                {rows.map((r) => (
                  <div key={r.id} className="dtable-row" data-qualified={r.qualified ? "true" : "false"}>
                    <div className={`chk ${r.id === 1 ? "on" : ""}`}>
                      {r.id === 1 && <Icon name="check" className="ico-xs" />}
                    </div>
                    <div className="ent">
                      <div className="nm">
                        {r.name}
                        {r.phone && <Icon name="phone" className="ico-xs ico-phone" />}
                      </div>
                      {r.url && <div className="url">{r.url}</div>}
                    </div>
                    <div>
                      <div className={`src-pill ${r.source}`}>
                        <Icon name={r.source === "maps" ? "mappin" : "google"} className="ico-xs" />
                        {r.source === "maps" ? "Maps" : "Search"}
                      </div>
                    </div>
                    <div className="addr">
                      <Icon name="mappin" className="ico-xs" />
                      <span>{r.address}</span>
                    </div>
                    <div className="tags">
                      {r.tags.slice(0, 2).map((t, i) => (
                        <span key={i} className="pill">{t}</span>
                      ))}
                      {r.tags.length > 2 && <span className="pill">+{r.tags.length - 2}</span>}
                    </div>
                    <div className="date">{r.date}</div>
                    <div className="actions">
                      <button className="btn" disabled={!r.url} title="Visiter le site"><Icon name="ext" className="ico-sm" /></button>
                      <button className="btn" title="Masquer"><Icon name="eyeOff" className="ico-sm" /></button>
                      <button className="btn" title="Voir détails"><Icon name="eye" className="ico-sm" /></button>
                      <button className="btn danger" title="Blacklister"><Icon name="ban" className="ico-sm" /></button>
                    </div>
                    <div className="qualif-cell">
                      <span className={`switch ok ${r.qualified ? "on" : ""}`} />
                      {r.qualified && <Icon name="check" className="ico-sm ok-mark" />}
                    </div>
                    <div>
                      <button className="btn icon danger" title="Supprimer"><Icon name="x" className="ico-sm" /></button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              <div className="pagination">
                <span className="pg-btn disabled"><Icon name="chevleft" className="ico-sm" /></span>
                <span className="pg-btn" aria-current="page">1</span>
                <span className="pg-btn">2</span>
                <span className="pg-btn">3</span>
                <span style={{ color: "var(--text-4)", fontFamily: "var(--font-mono)", padding: "0 4px" }}>…</span>
                <span className="pg-btn">4</span>
                <span className="pg-btn"><Icon name="chevright" className="ico-sm" /></span>
                <span className="pg-info">Page 1 / 4 · 42 entreprises au total</span>
              </div>

            </div>
          </div>
        </div>

        <footer className="statusbar">
          <span><span className="dot" />Bot connecté · Supabase</span>
          <span className="sep">·</span>
          <span>file qualification</span>
          <span className="sep">·</span>
          <span>42 à qualifier · 28 qualifiées ce mois</span>
          <span className="spacer" />
          <span>auto-sync · il y a 4s</span>
        </footer>
      </div>

      <div className="callout rt" style={{ left: 372, top: 290 }}>offre active · pas perdue dans un Select profond</div>
      <div className="callout rt" style={{ left: 740, top: 488 }}>switch + check vert quand qualifié · ligne teintée</div>
      <div className="callout rt" style={{ left: 1140, top: 488 }}>4 actions par ligne · visite, masquer, voir, blacklist</div>
    </div>
  );
}

window.StudioQualification = StudioQualification;
