// studio-views-3.jsx — Marketing/Web workspace, Site Builder focus, Pilotage workspace

// ───── ARTBOARD 4: Marketing & Web workspace ─────
function StudioMarketing() {
  return (
    <div className="studio">
      <AppRail active="web" />
      <div className="content">

        <header className="topbar">
          <WorkspacePill />
          <div className="crumbs">
            <Icon name="home2" className="ico-sm" style={{ color: "var(--text-4)" }} />
            <Icon name="chevright" className="ico-xs" />
            <span>Studio</span>
            <Icon name="chevright" className="ico-xs" />
            <span className="cur">Marketing & Web</span>
          </div>
          <div className="search">
            <Icon name="search" className="ico-sm" />
            <span>Rechercher dans Marketing…</span>
            <kbd>⌘K</kbd>
          </div>
          <div className="actions">
            <button className="btn ghost sm icon"><Icon name="bell" className="ico-sm" /></button>
            <button className="btn outline sm"><Icon name="plus" className="ico-sm" />Créer</button>
          </div>
        </header>

        <div className="ws-shell">

          <aside className="subnav">
            <div className="subnav-hd">
              <div className="step"><Icon name="globe" className="ico-xs" />Espace · marketing</div>
              <h2><em>Marketing</em> & Web</h2>
              <div className="sb">sites, forms, audits, contenus</div>
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
                  <span className="lb">Analytics</span>
                </button>
              </div>

              <div className="subnav-section">
                <div className="nl">Builders</div>
                <button className="subnav-item">
                  <Icon name="globe" className="ico ic" />
                  <span className="lb">Sites & landings</span>
                  <span className="bd">3</span>
                </button>
                <button className="subnav-item">
                  <Icon name="note" className="ico ic" />
                  <span className="lb">Formulaires</span>
                  <span className="bd">7</span>
                </button>
                <button className="subnav-item">
                  <Icon name="search" className="ico ic" />
                  <span className="lb">Audits</span>
                  <span className="bd">2</span>
                </button>
                <button className="subnav-item">
                  <Icon name="mail" className="ico ic" />
                  <span className="lb">Emails & templates</span>
                </button>
              </div>

              <div className="subnav-section">
                <div className="nl">Contenu</div>
                <button className="subnav-item">
                  <Icon name="doc" className="ico ic" />
                  <span className="lb">Pages & articles</span>
                </button>
                <button className="subnav-item">
                  <Icon name="bento" className="ico ic" />
                  <span className="lb">Media library</span>
                </button>
                <button className="subnav-item">
                  <Icon name="link" className="ico ic" />
                  <span className="lb">Domaines & DNS</span>
                </button>
              </div>

              <div className="subnav-section">
                <div className="nl">Diffusion</div>
                <button className="subnav-item">
                  <Icon name="share" className="ico ic" />
                  <span className="lb">Réseaux sociaux</span>
                </button>
                <button className="subnav-item">
                  <Icon name="bar" className="ico ic" />
                  <span className="lb">Sources & UTM</span>
                </button>
              </div>
            </div>
            <div className="subnav-ft">
              <div className="progress-row">
                <div className="lb">
                  <span>Trafic ce mois</span>
                  <span>+24%</span>
                </div>
                <div className="bar"><i style={{ width: "62%" }} /></div>
              </div>
            </div>
          </aside>

          <div className="ws-content">
            <div className="tabs-strip">
              <div className="tab" aria-selected="true"><Icon name="bento" className="ico-sm" />Vue d'ensemble</div>
              <div className="tab"><Icon name="globe" className="ico-sm" />Sites <span className="bd">3</span></div>
              <div className="tab"><Icon name="note" className="ico-sm" />Forms <span className="bd">7</span></div>
              <div className="tab"><Icon name="search" className="ico-sm" />Audits <span className="bd">2</span></div>
              <span className="grow" />
              <button className="btn ghost sm"><Icon name="layoutGrid" className="ico-sm" />Grille</button>
            </div>

            <div className="ws-overview">
              <div className="ws-header">
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--text-3)" }}>3 SITES · 7 FORMS · 2 AUDITS</div>
                  <h1>Tout votre <em>marketing</em></h1>
                  <div className="sub">3 244 visites cette semaine · 86 leads · 32% de conversion form</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn outline sm"><Icon name="globe" className="ico-sm" />Nouveau site</button>
                  <button className="btn outline sm"><Icon name="note" className="ico-sm" />Nouveau form</button>
                  <button className="btn primary sm"><Icon name="plus" className="ico-sm" />Audit</button>
                </div>
              </div>

              <div className="assets-grid">

                {/* Sites */}
                <div className="asset-card">
                  <div className="thumb">
                    <div className="browser">
                      <div className="dots"><i /><i /><i /></div>
                      <div className="body">
                        <div className="hh" />
                        <div className="ln m" />
                        <div className="ln s" />
                        <div className="row"><span className="b" /><span className="b gh" /></div>
                        <div className="blocks"><i /><i /><i /></div>
                      </div>
                    </div>
                  </div>
                  <div className="meta-row">
                    <div className="ttl"><span className="liveness" />thermalis.fr</div>
                    <div className="url">thermalis.fr · publié 12 mai</div>
                    <div className="stats">
                      <span className="s"><Icon name="eye" className="ico-xs" /><b>2 184</b> vues</span>
                      <span className="s"><Icon name="target" className="ico-xs" /><b>34</b> leads</span>
                    </div>
                    <div className="actions-row">
                      <button className="btn outline sm"><Icon name="note" className="ico-sm" />Éditer</button>
                      <button className="btn subtle sm"><Icon name="trending" className="ico-sm" />Stats</button>
                    </div>
                  </div>
                </div>

                <div className="asset-card">
                  <div className="thumb">
                    <div className="browser">
                      <div className="dots"><i /><i /><i /></div>
                      <div className="body">
                        <div className="hh" style={{ width: "75%", background: "var(--accent)" }} />
                        <div className="ln m" />
                        <div className="ln m" />
                        <div className="ln s" />
                        <div className="row"><span className="b" /></div>
                      </div>
                    </div>
                  </div>
                  <div className="meta-row">
                    <div className="ttl"><span className="liveness" />Aide d'État 2026</div>
                    <div className="url">thermalis.fr/aide-2026 · landing</div>
                    <div className="stats">
                      <span className="s"><Icon name="eye" className="ico-xs" /><b>912</b> vues</span>
                      <span className="s"><Icon name="target" className="ico-xs" /><b>28</b> leads</span>
                    </div>
                    <div className="actions-row">
                      <button className="btn outline sm"><Icon name="note" className="ico-sm" />Éditer</button>
                      <button className="btn subtle sm"><Icon name="trending" className="ico-sm" />Stats</button>
                    </div>
                  </div>
                </div>

                <div className="asset-card">
                  <div className="thumb">
                    <div className="browser">
                      <div className="dots"><i /><i /><i /></div>
                      <div className="body">
                        <div className="hh" style={{ width: "40%" }} />
                        <div className="ln s" />
                        <div className="blocks" style={{ gridTemplateColumns: "1fr 1fr" }}><i /><i /></div>
                      </div>
                    </div>
                  </div>
                  <div className="meta-row">
                    <div className="ttl"><span className="liveness draft" />Avis clients (brouillon)</div>
                    <div className="url">thermalis.fr/temoignages · brouillon</div>
                    <div className="stats">
                      <span className="s"><Icon name="clock" className="ico-xs" /><b>4 j</b> sans édition</span>
                    </div>
                    <div className="actions-row">
                      <button className="btn accent sm"><Icon name="send" className="ico-sm" />Publier</button>
                      <button className="btn subtle sm"><Icon name="note" className="ico-sm" />Éditer</button>
                    </div>
                  </div>
                </div>

                {/* Forms */}
                <div className="asset-card">
                  <div className="thumb form">
                    <div className="q" />
                    <div className="o" style={{ width: "65%" }} />
                    <div className="o" style={{ width: "70%" }} />
                    <div className="o s" />
                    <div className="o" style={{ width: "55%" }} />
                    <div className="progress"><i style={{ width: "45%" }} /></div>
                  </div>
                  <div className="meta-row">
                    <div className="ttl"><span className="liveness" />Pré-qualif PAC 2026</div>
                    <div className="url">12 questions · logique active</div>
                    <div className="stats">
                      <span className="s"><Icon name="eye" className="ico-xs" /><b>284</b> vues</span>
                      <span className="s"><Icon name="check" className="ico-xs" /><b>92</b> envois</span>
                      <span className="s"><Icon name="target" className="ico-xs" /><b>32%</b></span>
                    </div>
                    <div className="actions-row">
                      <button className="btn outline sm"><Icon name="note" className="ico-sm" />Éditer</button>
                      <button className="btn subtle sm"><Icon name="link" className="ico-sm" />Partager</button>
                    </div>
                  </div>
                </div>

                <div className="asset-card">
                  <div className="thumb form">
                    <div className="q" style={{ width: "70%" }} />
                    <div className="o" style={{ width: "50%" }} />
                    <div className="o" style={{ width: "65%" }} />
                    <div className="o s" />
                    <div className="progress"><i style={{ width: "78%" }} /></div>
                  </div>
                  <div className="meta-row">
                    <div className="ttl"><span className="liveness" />Demande de devis</div>
                    <div className="url">6 questions · simple</div>
                    <div className="stats">
                      <span className="s"><Icon name="eye" className="ico-xs" /><b>1 102</b> vues</span>
                      <span className="s"><Icon name="check" className="ico-xs" /><b>54</b> envois</span>
                    </div>
                    <div className="actions-row">
                      <button className="btn outline sm"><Icon name="note" className="ico-sm" />Éditer</button>
                      <button className="btn subtle sm"><Icon name="link" className="ico-sm" />Partager</button>
                    </div>
                  </div>
                </div>

                {/* Audit */}
                <div className="asset-card">
                  <div className="thumb audit">
                    <div className="lb">SCORE ÉNERGÉTIQUE</div>
                    <div className="score">87</div>
                    <div className="bars">
                      <i style={{ height: "30%" }} />
                      <i style={{ height: "45%" }} />
                      <i style={{ height: "70%" }} />
                      <i style={{ height: "100%" }} />
                      <i style={{ height: "55%" }} />
                      <i style={{ height: "35%" }} />
                    </div>
                  </div>
                  <div className="meta-row">
                    <div className="ttl"><span className="liveness" />Audit PAC + isolation</div>
                    <div className="url">modèle · 28 critères</div>
                    <div className="stats">
                      <span className="s"><Icon name="check" className="ico-xs" /><b>28</b> audits</span>
                      <span className="s"><Icon name="target" className="ico-xs" /><b>14</b> RDV</span>
                    </div>
                    <div className="actions-row">
                      <button className="btn outline sm"><Icon name="note" className="ico-sm" />Éditer</button>
                      <button className="btn subtle sm"><Icon name="play" className="ico-sm" />Lancer</button>
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
          <span>marketing</span>
          <span className="sep">·</span>
          <span>3 sites · 7 forms · 2 audits</span>
          <span className="spacer" />
          <span>v2.0.0-beta</span>
        </footer>
      </div>

      <div className="callout rt" style={{ left: 580, top: 196 }}>builders comme entités, pas comme pages</div>
    </div>
  );
}

// ───── ARTBOARD 5: Site Builder focus mode ─────
function StudioSiteBuilder() {
  return (
    <div className="builder-shell">

      {/* mini rail */}
      <div className="builder-rail">
        <AppRail active="web" />
      </div>

      {/* pages + tree */}
      <aside className="builder-pages">
        <div className="builder-pages-hd">
          <div className="ttl">PAGES · thermalis.fr</div>
          <button className="btn ghost sm icon"><Icon name="plus" className="ico-sm" /></button>
        </div>
        <div className="builder-pages-body">
          <div className="builder-page-it" aria-current="page">
            <Icon name="home" className="ico ic" />
            <span className="lb">Accueil</span>
            <span className="meta">/</span>
          </div>
          <div className="builder-page-it">
            <Icon name="globe" className="ico ic" />
            <span className="lb">Aide d'État 2026</span>
            <span className="meta">/aide-2026</span>
          </div>
          <div className="builder-page-it">
            <Icon name="users" className="ico ic" />
            <span className="lb">À propos</span>
            <span className="meta">/about</span>
          </div>
          <div className="builder-page-it">
            <Icon name="phone" className="ico ic" />
            <span className="lb">Contact</span>
            <span className="meta">/contact</span>
          </div>
          <div className="builder-page-it">
            <Icon name="doc" className="ico ic" />
            <span className="lb">Témoignages</span>
            <span className="meta">brouillon</span>
          </div>
        </div>

        <div className="builder-tree">
          <div className="nl">Structure · Accueil</div>
          <div className="lvl">
            <Icon name="layoutList" className="ico-sm ic" />
            <span>body</span>
          </div>
          <div className="lvl" data-d="1">
            <Icon name="layoutList" className="ico-sm ic" />
            <span>nav</span>
          </div>
          <div className="lvl" data-d="1">
            <Icon name="bento" className="ico-sm ic" />
            <span>section.hero</span>
          </div>
          <div className="lvl sel" data-d="2">
            <Icon name="textShort" className="ico-sm ic" />
            <span>h1.headline</span>
          </div>
          <div className="lvl" data-d="2">
            <Icon name="textShort" className="ico-sm ic" />
            <span>p.lead</span>
          </div>
          <div className="lvl" data-d="2">
            <Icon name="layoutList" className="ico-sm ic" />
            <span>div.cta-group</span>
          </div>
          <div className="lvl" data-d="1">
            <Icon name="bento" className="ico-sm ic" />
            <span>section.features</span>
          </div>
          <div className="lvl" data-d="1">
            <Icon name="bento" className="ico-sm ic" />
            <span>section.testimonials</span>
          </div>
          <div className="lvl" data-d="1">
            <Icon name="layoutList" className="ico-sm ic" />
            <span>footer</span>
          </div>
        </div>
      </aside>

      {/* canvas */}
      <div className="builder-canvas">

        <div className="builder-bar">
          <a className="home-back" href="#">
            <Icon name="chevleft" className="ico-sm" />
            <span>Marketing</span>
          </a>
          <div className="crumbs">
            <Icon name="globe" className="ico-sm" style={{ color: "var(--text-3)" }} />
            <span>thermalis.fr</span>
            <span className="sep">/</span>
            <span className="cur">Accueil</span>
          </div>
          <span className="grow" />
          <span className="saved">enregistré il y a 4s</span>
          <div className="viewport-pick">
            <div className="vp" aria-pressed="true" title="Desktop"><Icon name="desktop" className="ico-sm" /></div>
            <div className="vp" title="Tablette"><Icon name="panel" className="ico-sm" /></div>
            <div className="vp" title="Mobile"><Icon name="device" className="ico-sm" /></div>
          </div>
          <div className="zoom">
            <Icon name="minus" className="ico-sm" />
            <span>100%</span>
            <Icon name="plus" className="ico-sm" />
          </div>
          <button className="btn outline sm"><Icon name="eye" className="ico-sm" />Aperçu</button>
          <button className="btn primary sm"><Icon name="send" className="ico-sm" />Publier</button>
        </div>

        <div className="canvas-area">
          <div className="canvas-frame">
            <div className="cf-hero">
              <div className="cf-nav">
                <span className="brand">thermalis</span>
                <span className="lk">Solutions</span>
                <span className="lk cur">Aide d'État</span>
                <span className="lk">À propos</span>
                <span className="lk">Contact</span>
                <span className="cta-mini">Demander un devis</span>
              </div>
              <h1 className="cf-headline">
                Rendez votre maison <em>plus chaude</em>, plus économe, <em>plus durable</em>.
                <div className="cf-selected" style={{ left: -8, right: 0, top: -4, bottom: -4 }}>
                  <span className="tab">h1.headline · 38px · Instrument Serif</span>
                </div>
              </h1>
              <p className="cf-sub">
                Audit énergétique gratuit, devis sous 48h et installation par nos artisans RGE. Aide d'État jusqu'à 11 000 €.
              </p>
              <div className="cf-cta">
                <span className="b1">Démarrer mon audit</span>
                <span className="b2">Voir les aides 2026 →</span>
              </div>
              <div className="cf-trust">
                <span className="av">JD</span>
                <span className="av">ML</span>
                <span className="av">SP</span>
                <span className="av">EV</span>
                <span>★ 4.9 — 412 avis Google</span>
              </div>
            </div>

            <div className="cf-features">
              <div className="cf-feat">
                <div className="icw"><Icon name="droplet" className="ico" /></div>
                <h4>Pompes à chaleur</h4>
                <p>Air-eau, air-air, géothermie. Devis sur mesure et pose RGE garantie 10 ans.</p>
              </div>
              <div className="cf-feat">
                <div className="icw"><Icon name="sun" className="ico" /></div>
                <h4>Solaire photovoltaïque</h4>
                <p>Autoconsommation, revente, batterie. Étude gratuite et garantie performance.</p>
              </div>
              <div className="cf-feat">
                <div className="icw"><Icon name="snow" className="ico" /></div>
                <h4>Isolation & VMC</h4>
                <p>Combles, murs, sols, ventilation double flux. Confort été comme hiver.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* inspector */}
      <aside className="builder-inspector">
        <div className="bi-tabs">
          <div className="t" aria-selected="true">Design</div>
          <div className="t">Contenu</div>
          <div className="t">Logique</div>
        </div>

        <div className="bi-bd">
          <div className="bi-group">
            <div className="nl">
              <span>SÉLECTION</span>
              <span className="pill accent" style={{ fontSize: 10 }}>h1.headline</span>
            </div>
            <div className="bi-row">
              <span className="k">balise</span>
              <div className="seg">
                <span className="s" aria-pressed="true">h1</span>
                <span className="s">h2</span>
                <span className="s">h3</span>
                <span className="s">p</span>
              </div>
            </div>
          </div>

          <div className="bi-group">
            <div className="nl"><span>TYPOGRAPHIE</span></div>
            <div className="bi-row">
              <span className="k">famille</span>
              <div className="bi-input">Instrument Serif</div>
            </div>
            <div className="bi-row">
              <span className="k">taille</span>
              <div className="bi-input">38 / 44 px</div>
            </div>
            <div className="bi-row">
              <span className="k">graisse</span>
              <div className="seg">
                <span className="s">300</span>
                <span className="s" aria-pressed="true">400</span>
                <span className="s">500</span>
                <span className="s">600</span>
              </div>
            </div>
            <div className="bi-row">
              <span className="k">interligne</span>
              <div className="bi-input">1.05</div>
            </div>
          </div>

          <div className="bi-group">
            <div className="nl"><span>COULEUR</span></div>
            <div className="bi-color-row">
              <div className="bi-sw cur" style={{ background: "#14120E" }} />
              <div className="bi-sw" style={{ background: "#E2552B" }} />
              <div className="bi-sw" style={{ background: "#5C5953" }} />
              <div className="bi-sw" style={{ background: "#FBFAF7", borderColor: "var(--border-strong)" }} />
              <div className="bi-sw" style={{ background: "#1F8A5B" }} />
            </div>
          </div>

          <div className="bi-group">
            <div className="nl"><span>ESPACEMENT</span></div>
            <div className="bi-spacing-viz">
              <span className="label t">12</span>
              <span className="label b">12</span>
              <span className="label l">0</span>
              <span className="label r">0</span>
              <div className="inner">contenu</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="callout lt" style={{ left: 88, top: 50 }}>rail toujours là — 1 clic pour sortir</div>
      <div className="callout tp" style={{ left: 320, top: 38 }}>level-2 devient le panneau pages/structure du builder</div>
      <div className="callout tp" style={{ left: 1180, top: 38 }}>inspector remplace la zone "tabs" mais le pattern reste</div>
    </div>
  );
}

window.StudioMarketing = StudioMarketing;
window.StudioSiteBuilder = StudioSiteBuilder;
