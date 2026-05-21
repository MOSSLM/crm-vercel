// site-builder-workspaces.jsx — Sitemap / Wireframe / Style Guide workspaces

const { useState: useStateW, useEffect: useEffectW, useRef: useRefW, useMemo: useMemoW } = React;

// ── Shared mock data ────────────────────────────────────────────────────────
const AI_MODELS = [
  { provider: "anthropic", id: "sonnet-46",  label: "Claude Sonnet 4.6" },
  { provider: "anthropic", id: "haiku-45",   label: "Claude Haiku 4.5" },
  { provider: "anthropic", id: "opus-47",    label: "Claude Opus 4.7" },
  { provider: "openai",    id: "gpt-4o",     label: "GPT-4o" },
  { provider: "openai",    id: "gpt-4o-mini",label: "GPT-4o mini" },
];

const SECTION_CATEGORIES = ["Tous", "Hero", "Services", "Content", "Social Proof", "Contact", "CTA", "Media", "Footer"];

const SECTION_LIBRARY = [
  // Hero
  { id: "lib-h1", name: "Hero 1 — Stack", cat: "Hero" },
  { id: "lib-h2", name: "Hero 4 — Centered", cat: "Hero" },
  { id: "lib-h3", name: "Hero 12 — Split", cat: "Hero", featured: true },
  { id: "lib-h4", name: "Hero 27 — Background image", cat: "Hero" },
  // Services
  { id: "lib-s1", name: "Layout 250 — 3 cols", cat: "Services" },
  { id: "lib-s2", name: "Layout 408 — Grid 2x3", cat: "Services" },
  { id: "lib-s3", name: "Layout 22 — Two col", cat: "Services" },
  // Social Proof
  { id: "lib-p1", name: "Logo Bar 3", cat: "Social Proof" },
  { id: "lib-p2", name: "Testimonial 14", cat: "Social Proof" },
  { id: "lib-p3", name: "Stats 5 — 4 colonnes", cat: "Social Proof" },
  // Content
  { id: "lib-c1", name: "FAQ 4 — Accordion", cat: "Content" },
  { id: "lib-c2", name: "Pricing 23", cat: "Content" },
  // CTA
  { id: "lib-ct1", name: "CTA 7 — Newsletter", cat: "CTA" },
  { id: "lib-ct2", name: "CTA 1 — Inline", cat: "CTA" },
  // Contact
  { id: "lib-co1", name: "Contact 16 — Form", cat: "Contact" },
  { id: "lib-co2", name: "Contact 2 — Map", cat: "Contact" },
  // Media
  { id: "lib-m1", name: "Gallery 19", cat: "Media" },
  { id: "lib-m2", name: "Gallery 5 — Masonry", cat: "Media" },
  // Footer
  { id: "lib-f1", name: "Footer 5", cat: "Footer", featured: true },
  { id: "lib-f2", name: "Footer 1 — Minimal", cat: "Footer" },
];

// Mock sitemap with descriptions per section (for the Sitemap workspace cards)
const SITEMAP_DETAILS = {
  "/": [
    { id: "sd1", name: "Navbar",   desc: "Logo Thermalis, menu principal et CTA \"Demander un devis\"." },
    { id: "sd2", name: "Hero",     desc: "Tagline locale + promesse forte sur l'urgence 7j/7." },
    { id: "sd3", name: "Logos",    desc: "Marques de chaudières partenaires (Saunier Duval, Atlantic…)." },
    { id: "sd4", name: "Features", desc: "Trois engagements : rapidité, garantie, aides MaPrimeRénov'." },
    { id: "sd5", name: "CTA",      desc: "Bandeau sombre · numéro de standard direct + bouton devis." },
    { id: "sd6", name: "Footer",   desc: "Coordonnées, services, légal, zones desservies." },
  ],
  "/services": [
    { id: "sd7", name: "Navbar",   desc: "Navbar partagée du site." },
    { id: "sd8", name: "Header",   desc: "Titre éditorial \"Nos services\" + sous-titre." },
    { id: "sd9", name: "Layout",   desc: "Grille 2×3 : Dépannage, Chaudière, PAC, Solaire, Plomberie, Entretien." },
    { id: "sd10", name: "Footer",  desc: "Footer partagé." },
  ],
  "/realisations": [
    { id: "sd11", name: "Navbar",  desc: "Navbar partagée." },
    { id: "sd12", name: "Gallery", desc: "12 réalisations récentes avec photos avant/après." },
    { id: "sd13", name: "Footer",  desc: "Footer partagé." },
  ],
  "/a-propos": [
    { id: "sd14", name: "Navbar",  desc: "Navbar partagée." },
    { id: "sd15", name: "Story",   desc: "Histoire de l'entreprise depuis 1987." },
    { id: "sd16", name: "Team",    desc: "Photos et bio des 6 techniciens." },
    { id: "sd17", name: "Footer",  desc: "Footer partagé." },
  ],
  "/contact": [
    { id: "sd18", name: "Navbar",  desc: "Navbar partagée." },
    { id: "sd19", name: "Contact", desc: "Formulaire de devis + carte + horaires." },
    { id: "sd20", name: "Footer",  desc: "Footer partagé." },
  ],
};

// ─────────────────────────────────────────────────────────────────────────
// Sitemap workspace
// ─────────────────────────────────────────────────────────────────────────

function SitemapWorkspace({ activePage, onActivePage, zoom, onZoom }) {
  const [model, setModel] = useStateW("sonnet-46");
  const [modelOpen, setModelOpen] = useStateW(false);
  const [description, setDescription] = useStateW(
    "Plombier-chauffagiste à Lyon depuis 1987. Spécialité : chaudières gaz, PAC, solaire thermique, dépannage urgence. Cible : propriétaires CSP+ Lyon métropole."
  );
  const [aiCtxPageId, setAiCtxPageId] = useStateW(null);
  const [pageCtx, setPageCtx] = useStateW({});

  const scale = zoom / 100;

  return (
    <>
      <div className="pane">
        <div className="ai-side-hd">
          <div className="title"><span className="mark"><I name="sparkles" className="ico-sm" /></span>Assistant IA</div>
          <div className="desc">Décrivez l'activité de l'entreprise pour générer ou régénérer le sitemap automatiquement.</div>
        </div>

        <div className="pane-body">
          <div className="ai-side-body">
            <div className="alert-soft info">
              <I name="warning" className="ico-sm" style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Entreprise <b>Thermalis SARL</b> liée · variables {"{{ville}}, {{tel}}, {{nb_avis}}"} disponibles.</span>
            </div>

            <div className="field">
              <div className="field-label"><span>Modèle IA</span></div>
              <button className="model-pick" onClick={() => setModelOpen(v => !v)} style={{ position: "relative" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`dot ${AI_MODELS.find(m => m.id === model)?.provider === "openai" ? "openai" : ""}`} />
                  {AI_MODELS.find(m => m.id === model)?.label}
                </span>
                <I name="chevdown" className="ico-xs" style={{ color: "var(--text-4)" }} />
              </button>
              {modelOpen && (
                <ModelPop value={model} onSelect={(id) => { setModel(id); setModelOpen(false); }} onClose={() => setModelOpen(false)} />
              )}
            </div>

            <div className="field">
              <div className="field-label">
                <span>Description de l'activité</span>
                <span className="hint">5 lignes</span>
              </div>
              <textarea className="textarea" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} />
              <div style={{ display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" }}>
                <span className="pill magic">{"{{ville}}"}</span>
                <span className="pill magic">{"{{tel}}"}</span>
                <span className="pill magic">{"{{nb_avis}}"}</span>
              </div>
            </div>

            <div className="field">
              <div className="field-label">
                <span>Pages souhaitées</span>
                <span className="hint">{SITEMAP.length}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {SITEMAP.map((p, i) => (
                  <div key={p.id} className="page-pill">
                    <span className="pgnum">{String(i + 1).padStart(2, "0")}</span>
                    <I name="textShort" className="ico-xs" style={{ color: "var(--text-4)" }} />
                    <span style={{ flex: 1 }}>{p.title}</span>
                    <span className="pgnum">{p.slug}</span>
                  </div>
                ))}
                <button className="btn ghost xs" style={{ alignSelf: "flex-start", marginTop: 2, color: "var(--magic)" }}>
                  <I name="plus" className="ico-xs" />Ajouter une page
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="ai-side-foot">
          <button className="btn magic" style={{ width: "100%", height: 32, justifyContent: "center" }}>
            <I name="sparkles" className="ico-sm" />Générer le sitemap
          </button>
        </div>
      </div>

      <div className="sm-canvas" onClick={() => setAiCtxPageId(null)}>
        <div className="canvas-dotgrid" />
        <SitemapStage
          scale={scale}
          activePage={activePage}
          onActivePage={onActivePage}
          aiCtxPageId={aiCtxPageId}
          onAiCtxPageId={setAiCtxPageId}
          pageCtx={pageCtx}
          setPageCtx={setPageCtx}
        />

        <div className="canvas-tools" onClick={(e) => e.stopPropagation()}>
          <div className="grp">
            <button onClick={() => onZoom(Math.max(40, zoom - 5))}><I name="zoomOut" className="ico-sm" /></button>
            <button className="zoom-val" onClick={() => onZoom(100)}>{zoom}%</button>
            <button onClick={() => onZoom(Math.min(120, zoom + 5))}><I name="zoomIn" className="ico-sm" /></button>
          </div>
          <div className="grp">
            <button><I name="expand" className="ico-sm" />Réinitialiser la vue</button>
          </div>
        </div>
        <div className="canvas-help">
          Vue arbre · <kbd>⌘</kbd>+scroll : zoom
        </div>
      </div>
    </>
  );
}

function ModelPop({ value, onSelect, onClose }) {
  const ref = useRefW(null);
  useEffectW(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const groups = [{ provider: "anthropic", label: "Claude" }, { provider: "openai", label: "ChatGPT" }];
  return (
    <div ref={ref} className="pop" style={{ top: "calc(100% + 4px)", left: 0, right: 0, padding: 4 }}>
      {groups.map(g => (
        <div key={g.provider}>
          <div style={{ padding: "6px 8px 2px", fontSize: 9.5, color: "var(--text-4)", fontFamily: "var(--font-mono)", letterSpacing: ".06em", textTransform: "uppercase" }}>{g.label}</div>
          {AI_MODELS.filter(m => m.provider === g.provider).map(m => (
            <button key={m.id} onClick={() => onSelect(m.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 5, border: 0, background: m.id === value ? "var(--accent-tint)" : "transparent", color: m.id === value ? "var(--accent-2)" : "var(--text)", cursor: "default", fontSize: 12, fontWeight: 500, textAlign: "left" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: m.provider === "anthropic" ? "var(--accent)" : "var(--ok)" }} />
              <span style={{ flex: 1 }}>{m.label}</span>
              {m.id === value && <I name="check" className="ico-xs" />}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function SitemapStage({ scale, activePage, onActivePage, aiCtxPageId, onAiCtxPageId, pageCtx, setPageCtx }) {
  const PAGE_W = 252;
  const PAGE_GAP = 34;
  const ROOT_TOP = 48;
  const PAGES_TOP = 160;
  const totalCols = SITEMAP.length;
  const totalW = totalCols * (PAGE_W + PAGE_GAP);

  const rootX = totalW / 2 - 90;

  return (
    <div className="sm-stage" style={{ transform: `translate(48px, 24px) scale(${scale})`, width: totalW + 80 }}>
      {/* SVG connector lines from root to each page */}
      <svg style={{ position: "absolute", top: 0, left: 0, width: totalW + 80, height: 500, pointerEvents: "none", overflow: "visible" }}>
        {SITEMAP.map((page, i) => {
          const px = i * (PAGE_W + PAGE_GAP);
          const fromX = rootX + 90;
          const fromY = ROOT_TOP + 42;
          const toX = px + PAGE_W / 2;
          const toY = PAGES_TOP;
          const midY = (fromY + toY) / 2;
          return (
            <path
              key={page.id}
              d={`M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`}
              stroke="rgba(20,18,14,.18)"
              strokeWidth={1.4}
              fill="none"
              strokeDasharray="5 4"
            />
          );
        })}
      </svg>

      {/* Root project node */}
      <div style={{ position: "absolute", top: ROOT_TOP, left: rootX }}>
        <div className="sm-root-node">
          <div className="ic"><I name="globe" className="ico-sm" /></div>
          <span>Thermalis · Lyon</span>
          <span className="pill" style={{ background: "rgba(255,255,255,.10)", color: "rgba(255,255,255,.7)" }}>v3.2</span>
        </div>
      </div>

      {/* Page cards */}
      {SITEMAP.map((page, i) => {
        const sections = SITEMAP_DETAILS[page.slug] ?? [];
        const isActive = page.slug === activePage;
        const isAiOpen = aiCtxPageId === page.id;
        return (
          <div key={page.id}
            className="sm-page-card"
            data-active={isActive}
            style={{ position: "absolute", top: PAGES_TOP, left: i * (PAGE_W + PAGE_GAP), width: PAGE_W }}
            onClick={(e) => { e.stopPropagation(); onActivePage(page.slug); }}>
            <div className="hd">
              <div className="ic"><I name="textShort" className="ico-xs" /></div>
              <span className="title">{page.title}</span>
              <span className="slug">{page.slug}</span>
              <div className="tools">
                <button title="Régénérer page"
                        className={isAiOpen ? "magic-on" : ""}
                        onClick={(e) => { e.stopPropagation(); onAiCtxPageId(isAiOpen ? null : page.id); }}>
                  <I name="sparkles" className="ico-xs" />
                </button>
                <button title="Renommer"><I name="textShort" className="ico-xs" /></button>
                <button title="Plus"><I name="more" className="ico-xs" /></button>
              </div>
            </div>
            {isAiOpen && (
              <div className="ai-ctx" onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 600, color: "var(--magic)", marginBottom: 6 }}>
                  <I name="sparkles" className="ico-xs" />Contexte pour cette page
                </div>
                <textarea
                  rows={3}
                  placeholder={`Instructions spécifiques pour "${page.title}"…`}
                  value={pageCtx[page.id] ?? ""}
                  onChange={(e) => setPageCtx(prev => ({ ...prev, [page.id]: e.target.value }))} />
                <button className="btn magic xs" style={{ width: "100%", marginTop: 6, justifyContent: "center" }}>
                  <I name="refresh" className="ico-xs" />Régénérer cette page
                </button>
              </div>
            )}
            {sections.slice(0, 4).map(sec => (
              <div key={sec.id} className="sec-row">
                <div className="name">{sec.name}</div>
                <div className="desc">{sec.desc}</div>
              </div>
            ))}
            {sections.length > 4 && (
              <div className="sec-row" style={{ paddingTop: 4, paddingBottom: 8 }}>
                <div style={{ fontSize: 10.5, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>+{sections.length - 4} sections…</div>
              </div>
            )}
            <div className="add-row">
              <I name="plus" className="ico-xs" />Ajouter une section
            </div>
          </div>
        );
      })}

      {/* Add-page chip after the last page */}
      <div style={{ position: "absolute", top: PAGES_TOP + 8, left: totalCols * (PAGE_W + PAGE_GAP) }}>
        <button className="sm-add-page"><I name="plus" className="ico-lg" /></button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Wireframe workspace
// ─────────────────────────────────────────────────────────────────────────

function WireframeWorkspace({ activePage, onActivePage, device, onDevice, zoom, onZoom, selectedSectionId, onSelectSection, onOpenSectionPicker }) {
  const [tab, setTab] = useStateW("library");
  const [search, setSearch] = useStateW("");
  const [cat, setCat] = useStateW("Tous");
  const [model, setModel] = useStateW("sonnet-46");

  const deviceWidth = device === "mobile" ? 390 : device === "tablet" ? 768 : 1200;
  const scale = zoom / 100;
  const filtered = SECTION_LIBRARY.filter(s =>
    (cat === "Tous" || s.cat === cat) &&
    (s.name.toLowerCase().includes(search.toLowerCase()) || s.cat.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <div className="pane">
        <div className="wf-side-tabs">
          <button aria-selected={tab === "library"} onClick={() => setTab("library")}>
            <I name="layers" className="ico-sm" />Sections
          </button>
          <button className="magic" aria-selected={tab === "ai"} onClick={() => setTab("ai")}>
            <I name="sparkles" className="ico-sm" />IA
          </button>
        </div>

        {tab === "library" && (
          <>
            <div className="wf-search">
              <div style={{ position: "relative" }}>
                <I name="search" className="ico-sm" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)" }} />
                <input className="input" placeholder="Rechercher une section…" style={{ paddingLeft: 28, height: 28 }}
                       value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="wf-cats">
                {SECTION_CATEGORIES.map(c => (
                  <button key={c} className="wf-cat" aria-selected={c === cat} onClick={() => setCat(c)}>{c}</button>
                ))}
              </div>
            </div>
            <div className="pane-body">
              <div className="wf-sec-list">
                {filtered.map(s => (
                  <div key={s.id} className="wf-sec-row">
                    <div className="thumb" />
                    <div className="info">
                      <div className="name">{s.name}</div>
                      <div className="cat">{s.cat}{s.featured ? " · utilisée" : ""}</div>
                    </div>
                    <button className="add-btn" title="Ajouter à la page active"><I name="plus" className="ico-xs" strokeWidth={2.2} /></button>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="empty-row" style={{ textAlign: "center", padding: 20 }}>Aucune section trouvée.</div>
                )}
              </div>
            </div>
          </>
        )}

        {tab === "ai" && (
          <div className="ai-side-body" style={{ flex: 1, overflow: "auto" }}>
            <div className="field">
              <div className="field-label"><span>Modèle IA</span></div>
              <div className="model-pick">
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="dot" />
                  {AI_MODELS.find(m => m.id === model)?.label}
                </span>
                <I name="chevdown" className="ico-xs" style={{ color: "var(--text-4)" }} />
              </div>
            </div>
            <div style={{ textAlign: "center", padding: "24px 8px", color: "var(--text-3)" }}>
              <I name="sparkles" className="ico-lg" style={{ color: "var(--magic)", marginBottom: 10 }} />
              <div style={{ fontSize: 12.5, color: "var(--text), font-weight: 500" }}>Régénération IA contextuelle</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4, lineHeight: 1.5 }}>
                Survolez une section dans le canvas puis cliquez sur <I name="sparkles" className="ico-xs" style={{ color: "var(--magic)", verticalAlign: -1 }} /> pour la régénérer avec un prompt spécifique.
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="canvas-host">
        <div className="canvas-dotgrid" />
        <div className="canvas-stage" style={{ transform: `translate(48px, 24px) scale(${scale})`, width: deviceWidth }}>
          {/* Page tab bar */}
          <div className="page-meta-bar">
            <div className="page-chip">
              <I name="layoutLeft" className="ico-sm" style={{ color: "var(--text-3)" }} />
              <span>{SITEMAP.find(p => p.slug === activePage)?.title}</span>
              <span className="slug">{activePage}</span>
            </div>
            <div className="page-tabs">
              {SITEMAP.map((p, i) => (
                <button key={p.id} className="page-tab" aria-selected={p.slug === activePage} onClick={() => onActivePage(p.slug)}>
                  <span className="pgnum">{String(i + 1).padStart(2, "0")}</span>
                  <span>{p.title}</span>
                </button>
              ))}
            </div>
            <button className="btn outline xs" style={{ borderColor: "var(--magic-tint)", color: "var(--magic)" }} onClick={() => setTab("ai")}>
              <I name="sparkles" className="ico-xs" />Régénérer la page
            </button>
          </div>

          {/* Wireframe rendering of active page */}
          <div className="device-frame" style={{ width: deviceWidth, background: "var(--surface)" }}>
            {(SECTIONS_BY_PAGE[activePage] ?? []).map((sec) => (
              <WireframeSection
                key={sec.id}
                section={sec}
                isSelected={selectedSectionId === sec.id}
                onSelect={() => onSelectSection(sec.id)}
                onReplace={onOpenSectionPicker}
              />
            ))}
            <button onClick={() => onSelectSection(null)} style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: 14, border: 0, background: "transparent",
              color: "var(--text-3)", fontSize: 12, borderTop: "1px dashed var(--border-2)", cursor: "default",
            }}>
              <I name="plus" className="ico-sm" />Ajouter une section
            </button>
          </div>
        </div>

        <div className="canvas-tools" onClick={(e) => e.stopPropagation()}>
          <div className="grp">
            {["desktop","tablet","mobile"].map((d) => (
              <button key={d} aria-pressed={device === d} onClick={() => onDevice(d)} title={d}>
                <I name={d === "desktop" ? "laptop" : d === "tablet" ? "tablet" : "device"} className="ico-sm" />
              </button>
            ))}
          </div>
          <div className="grp">
            <button onClick={() => onZoom(Math.max(40, zoom - 5))}><I name="zoomOut" className="ico-sm" /></button>
            <button className="zoom-val" onClick={() => onZoom(100)}>{zoom}%</button>
            <button onClick={() => onZoom(Math.min(120, zoom + 5))}><I name="zoomIn" className="ico-sm" /></button>
          </div>
        </div>
      </div>
    </>
  );
}

function WireframeSection({ section, isSelected, onSelect, onReplace }) {
  return (
    <div className={`wf-section ${isSelected ? "selected" : ""}`} onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <div className="toolbar" onClick={(e) => e.stopPropagation()}>
        <span>{section.name}</span>
        <button className="magic" title="Régénérer avec IA"><I name="sparkles" className="ico-xs" /></button>
        <button title="Changer de section" onClick={onReplace}><I name="refresh" className="ico-xs" /></button>
        <button title="Plus"><I name="more" className="ico-xs" /></button>
      </div>
      {section.type === "Navbar" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="wf-bar" style={{ width: 64, height: 18, background: "rgba(20,18,14,.16)" }} />
          <div style={{ display: "flex", gap: 18 }}>
            {[0,1,2,3].map(i => <div key={i} className="wf-bar short" style={{ width: 48, height: 10 }} />)}
          </div>
          <div className="wf-bar cta" style={{ width: 92, height: 22 }} />
        </div>
      )}
      {section.type === "Hero" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "center", padding: "16px 0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="wf-bar short" />
            <div className="wf-bar title" />
            <div className="wf-bar title" style={{ width: "85%" }} />
            <div className="wf-bar long" style={{ marginTop: 6 }} />
            <div className="wf-bar med" />
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <div className="wf-bar cta" />
              <div className="wf-bar cta ghost" />
            </div>
          </div>
          <div className="wf-img-box" style={{ aspectRatio: "4/3" }} />
        </div>
      )}
      {section.type === "Logos" && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", gap: 18 }}>
          {[0,1,2,3,4,5].map(i => <div key={i} className="wf-bar" style={{ width: 84, height: 22, opacity: .55 }} />)}
        </div>
      )}
      {section.type === "Features" && (
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22, maxWidth: 380 }}>
            <div className="wf-bar short" />
            <div className="wf-bar title" />
            <div className="wf-bar long" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {[0,1,2].map(i => (
              <div key={i} className="wf-card-box">
                <div className="wf-bar" style={{ width: 32, height: 32, borderRadius: 6, marginBottom: 12 }} />
                <div className="wf-bar med" style={{ marginBottom: 8, height: 16 }} />
                <div className="wf-bar long" style={{ marginBottom: 4 }} />
                <div className="wf-bar med" />
              </div>
            ))}
          </div>
        </div>
      )}
      {section.type === "CTA" && (
        <div style={{
          background: "rgba(20,18,14,.06)", borderRadius: 10,
          padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
            <div className="wf-bar title" style={{ width: "60%" }} />
            <div className="wf-bar long" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div className="wf-bar cta" />
            <div className="wf-bar cta ghost" />
          </div>
        </div>
      )}
      {section.type === "Footer" && (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 24, paddingTop: 4 }}>
          {[0,1,2,3].map(c => (
            <div key={c} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="wf-bar short" />
              {[0,1,2,3].map(i => <div key={i} className="wf-bar med" style={{ height: 10 }} />)}
            </div>
          ))}
        </div>
      )}
      {["Header","Gallery","Team","Story","Layout","Contact"].includes(section.type) && (
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18, maxWidth: 380 }}>
            <div className="wf-bar short" />
            <div className="wf-bar title" />
            <div className="wf-bar long" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: section.type === "Gallery" || section.type === "Team" ? "repeat(3, 1fr)" : "1fr 1fr", gap: 16 }}>
            {[0,1,2,3].map(i => (
              <div key={i} className="wf-img-box" style={{ aspectRatio: section.type === "Team" ? "3/4" : "4/3" }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Style Guide workspace
// ─────────────────────────────────────────────────────────────────────────

const STYLE_GUIDE_DEFAULT = {
  colors: { primary: "#C14A1C", secondary: "#181612", accent: "#F59E0B", background: "#FFFAF2", text: "#1A1714", textMuted: "#57514A" },
  fonts: { heading: "Instrument Serif", body: "Geist", baseSize: "16px" },
  buttons: { preset: "modern", borderRadius: "8px" },
  cards: { borderRadius: "12px", shadow: "sm" },
  spacing: { sectionPadding: "80px", elementGap: "24px" },
};

function StyleGuideWorkspace({ onOpenModal }) {
  return (
    <div className="sg-split">
      <div className="sg-side">
        <div className="sg-side-hd">
          <span className="title">Style Guide · Thermalis</span>
          <span className="hint">cliquez une zone</span>
        </div>
        <div className="sg-zones">
          {/* Colors */}
          <div className="zone-card" onClick={() => onOpenModal("colors")}>
            <div className="zh">
              <span style={{ display: "inline-flex", alignItems: "center" }}>
                <span className="ic-wrap"><I name="palette" className="ico-xs" /></span>Couleurs
              </span>
              <I name="chevright" className="ico-xs" style={{ color: "var(--text-4)" }} />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                ["#C14A1C", "Primaire"], ["#181612", "Secondaire"], ["#F59E0B", "Accent"],
                ["#FFFAF2", "BG"], ["#1A1714", "Texte"],
              ].map(([hex, label]) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: hex, border: "1px solid var(--border)", boxShadow: "var(--shadow-1)" }} />
                  <div style={{ fontSize: 9.5, color: "var(--text-4)", marginTop: 4, fontFamily: "var(--font-mono)" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Typography */}
          <div className="zone-row-2">
            <div className="zone-card" onClick={() => onOpenModal("heading")}>
              <div className="zh">
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  <span className="ic-wrap"><I name="type" className="ico-xs" /></span>Titres
                </span>
                <I name="chevright" className="ico-xs" style={{ color: "var(--text-4)" }} />
              </div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, color: "var(--text)", lineHeight: 1.1, marginTop: 2 }}>Instrument Serif</div>
              <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 4, fontFamily: "var(--font-mono)" }}>weights 400 · italic</div>
            </div>
            <div className="zone-card" onClick={() => onOpenModal("body")}>
              <div className="zh">
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  <span className="ic-wrap"><I name="textShort" className="ico-xs" /></span>Corps
                </span>
                <I name="chevright" className="ico-xs" style={{ color: "var(--text-4)" }} />
              </div>
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 15, color: "var(--text)", marginTop: 2 }}>Geist · Aa Bb Cc</div>
              <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 4, fontFamily: "var(--font-mono)" }}>16px · weight 400</div>
            </div>
          </div>

          {/* Buttons + Cards */}
          <div className="zone-row-2">
            <div className="zone-card" onClick={() => onOpenModal("buttons")}>
              <div className="zh">
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  <span className="ic-wrap"><I name="mouse" className="ico-xs" /></span>Boutons
                </span>
                <I name="chevright" className="ico-xs" style={{ color: "var(--text-4)" }} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ background: "#181612", color: "#fff", padding: "5px 11px", borderRadius: 7, fontSize: 11, fontWeight: 500 }}>Principal</span>
                <span style={{ background: "transparent", color: "#181612", padding: "5px 11px", borderRadius: 7, fontSize: 11, fontWeight: 500, border: "1px solid rgba(20,18,14,.16)" }}>Secondaire</span>
                <span className="pill" style={{ alignSelf: "center" }}>modern</span>
              </div>
            </div>
            <div className="zone-card" onClick={() => onOpenModal("cards")}>
              <div className="zh">
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  <span className="ic-wrap"><I name="block" className="ico-xs" /></span>Cartes
                </span>
                <I name="chevright" className="ico-xs" style={{ color: "var(--text-4)" }} />
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {["#FFFAF2", "#FFEFE2", "#E9F1F8"].map((bg, i) => (
                  <div key={i} style={{ flex: 1, height: 32, background: bg, borderRadius: 8, border: "1px solid var(--border)", boxShadow: "0 1px 2px rgba(20,18,14,.06)" }} />
                ))}
              </div>
            </div>
          </div>

          {/* Spacing (inline) */}
          <div className="zone-card">
            <div className="zh">
              <span style={{ display: "inline-flex", alignItems: "center" }}>
                <span className="ic-wrap"><I name="align" className="ico-xs" /></span>Espacement
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="range-row">
                <label>Section</label>
                <input type="range" min={40} max={160} defaultValue={80} />
                <span className="val">80 px</span>
              </div>
              <div className="range-row">
                <label>Élément</label>
                <input type="range" min={8} max={64} defaultValue={24} />
                <span className="val">24 px</span>
              </div>
            </div>
          </div>

          {/* Reset */}
          <button className="btn outline" style={{ width: "100%", justifyContent: "center", height: 30, color: "var(--text-3)" }}>
            <I name="refresh" className="ico-sm" />Réinitialiser le style guide
          </button>
        </div>
      </div>

      {/* Right: live preview */}
      <div className="sg-preview-host">
        <div className="sg-preview-bar">
          <span className="title">Aperçu en direct · page d'accueil</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="btn ghost xs"><I name="laptop" className="ico-sm" /></button>
            <button className="btn ghost xs"><I name="tablet" className="ico-sm" /></button>
            <button className="btn ghost xs"><I name="device" className="ico-sm" /></button>
            <span style={{ width: 1, height: 14, background: "var(--border)", margin: "0 4px" }} />
            <button className="btn outline xs"><I name="expand" className="ico-sm" />Plein écran</button>
          </div>
        </div>
        <div className="sg-preview-frame">
          <div className="frame-inner">
            {/* Reuse a couple of mock sections for the preview */}
            {(SECTIONS_BY_PAGE["/"] ?? []).slice(0, 4).map(sec => (
              <PreviewMockSection key={sec.id} section={sec} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// A lightweight version of MockSection just for the style-guide preview
function PreviewMockSection({ section }) {
  if (section.type === "Navbar") {
    return (
      <div className="mock mock-navbar" style={{ padding: "14px 32px" }}>
        <div className="logo"><div className="mark" /><span>Thermalis</span></div>
        <div className="links"><span>Services</span><span>Réalisations</span><span>À propos</span><span>Contact</span></div>
        <span className="cta">Demander un devis</span>
      </div>
    );
  }
  if (section.type === "Hero") {
    return (
      <div className="mock mock-hero" style={{ padding: "48px 32px" }}>
        <div>
          <div className="eyebrow"><span className="pulse" />Plombier-chauffagiste · Lyon</div>
          <h1 style={{ fontSize: 38 }}>Une eau chaude qui ne <em>vous lâche jamais.</em></h1>
          <p>Dépannage 7j/7 · devis sous 24 h, intervention sous 4 h en urgence.</p>
          <div className="btn-row">
            <span className="primary">Obtenir mon devis →</span>
            <span className="ghost">Réalisations</span>
          </div>
        </div>
        <div className="img-slot" style={{ minHeight: 200 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>HERO · 1200×900</span>
        </div>
      </div>
    );
  }
  if (section.type === "Logos") {
    return (
      <div className="mock" style={{ padding: "24px 32px", background: "#faf7f1", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: "#8a877f", fontFamily: "var(--font-mono)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>Ils nous font confiance</div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "center", opacity: .55 }}>
          {["Saunier Duval","Atlantic","De Dietrich","Frisquet","Vaillant"].map(b => (
            <div key={b} style={{ fontFamily: "var(--font-serif)", fontSize: 15, color: "#3a3530" }}>{b}</div>
          ))}
        </div>
      </div>
    );
  }
  if (section.type === "Features") {
    return (
      <div className="mock mock-features" style={{ padding: "48px 32px" }}>
        <div className="lead">
          <div className="kicker">Pourquoi nous</div>
          <h2 style={{ fontSize: 28 }}>Trois engagements <em style={{ fontStyle: "italic", color: "#c14a1c" }}>tenus</em>.</h2>
        </div>
        <div className="grid">
          {FEATURE_BLOCKS.map((b, i) => (
            <div key={b.id} className="card">
              <div className="ic"><I name={i === 0 ? "zap" : i === 1 ? "tools" : "euro"} className="ico-lg" /></div>
              <h3>{b.title}</h3>
              <p>{b.body}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
}

// Expose
Object.assign(window, { SitemapWorkspace, WireframeWorkspace, StyleGuideWorkspace });
