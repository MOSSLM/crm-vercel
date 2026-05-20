// site-builder-app.jsx — Site Builder, main app

const { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, Fragment } = React;

// ── Extra icons specific to the site builder ────────────────────────────────
const EXTRA_ICONS = {
  layers:    <><polyline points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>,
  palette:   <><circle cx="12" cy="12" r="9" /><circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="16.5" cy="10.5" r="1" fill="currentColor" stroke="none" /><path d="M12 21a3 3 0 0 0 3-3 3 3 0 0 1 3-3h1" /></>,
  bookmark:  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
  sparkles:  <><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" /><path d="M19 14l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8L16.5 16.5l1.8-.7z" /><path d="M5 14l.6 1.5 1.5.6-1.5.6L5 18.2l-.6-1.5L2.9 16.1l1.5-.6z" /></>,
  save:      <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></>,
  history:   <><polyline points="3 3 3 9 9 9" /><path d="M3 9a9 9 0 1 0 3-6.7L3 5" /><polyline points="12 7 12 12 15 14" /></>,
  building:  <><rect x="4" y="3" width="16" height="18" rx="1" /><line x1="9" y1="8" x2="9" y2="8" /><line x1="15" y1="8" x2="15" y2="8" /><line x1="9" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="9" y2="16" /><line x1="15" y1="16" x2="15" y2="16" /></>,
  upload:    <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>,
  type:      <><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></>,
  cursor:    <><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><line x1="13" y1="13" x2="19" y2="19" /></>,
  imageIcon: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>,
  box:       <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></>,
  block:     <rect x="4" y="4" width="16" height="16" rx="2" />,
  laptop:    <><rect x="3" y="4" width="18" height="12" rx="2" /><line x1="2" y1="20" x2="22" y2="20" /></>,
  tablet:    <><rect x="6" y="3" width="12" height="18" rx="2" /><line x1="12" y1="18" x2="12" y2="18" /></>,
  zoomIn:    <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></>,
  zoomOut:   <><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></>,
  eyeOff:    <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18 18 0 0 1 5.06-5.94" /><path d="M1 1l22 22" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a17.94 17.94 0 0 1-3.06 4.06" /><path d="M14.12 14.12a3 3 0 0 1-4.24-4.24" /></>,
  navigation:<><polygon points="3 11 22 2 13 21 11 13 3 11" /></>,
  mouse:     <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />,
  align:     <><line x1="4" y1="8" x2="20" y2="8" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="16" x2="18" y2="16" /></>,
  arrow:     <><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>,
  externalLink: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>,
  star:      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
  variable2: <><circle cx="12" cy="12" r="9" /><text x="12" y="16" fontSize="10" textAnchor="middle" fill="currentColor" stroke="none">x</text></>,
};

// extend Icon's lookup
function I({ name, className = "ico", strokeWidth, ...rest }) {
  const built = EXTRA_ICONS[name];
  if (built) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={strokeWidth || 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>{built}</svg>
    );
  }
  return <Icon name={name} className={className} strokeWidth={strokeWidth} {...rest} />;
}

// ── Mock data ────────────────────────────────────────────────────────────────
const SITEMAP = [
  { id: "p1", slug: "/", title: "Accueil" },
  { id: "p2", slug: "/services", title: "Services" },
  { id: "p3", slug: "/realisations", title: "Réalisations" },
  { id: "p4", slug: "/a-propos", title: "À propos" },
  { id: "p5", slug: "/contact", title: "Contact" },
];

const SECTIONS_BY_PAGE = {
  "/": [
    { id: "s1", type: "Navbar", name: "Navbar 4" },
    { id: "s2", type: "Hero",   name: "Hero 12 — Split" },
    { id: "s3", type: "Logos",  name: "Logo Bar 3" },
    { id: "s4", type: "Features", name: "Layout 250 — 3 cols" },
    { id: "s5", type: "CTA",    name: "CTA 7 — Newsletter" },
    { id: "s6", type: "Footer", name: "Footer 5" },
  ],
  "/services": [
    { id: "s7", type: "Navbar", name: "Navbar 4" },
    { id: "s8", type: "Header", name: "Header 64" },
    { id: "s9", type: "Layout", name: "Layout 408 — Grid" },
    { id: "s10", type: "Footer", name: "Footer 5" },
  ],
  "/realisations": [
    { id: "s11", type: "Navbar", name: "Navbar 4" },
    { id: "s12", type: "Gallery", name: "Gallery 19" },
    { id: "s13", type: "Footer", name: "Footer 5" },
  ],
  "/a-propos": [
    { id: "s14", type: "Navbar", name: "Navbar 4" },
    { id: "s15", type: "Story", name: "Layout 22 — Two col" },
    { id: "s16", type: "Team",  name: "Team 6" },
    { id: "s17", type: "Footer", name: "Footer 5" },
  ],
  "/contact": [
    { id: "s18", type: "Navbar", name: "Navbar 4" },
    { id: "s19", type: "Contact", name: "Contact 16 — Form" },
    { id: "s20", type: "Footer", name: "Footer 5" },
  ],
};

const HERO_FIELDS = [
  { id: "eyebrow",  kind: "text",   label: "Tagline",      preview: "Plombier-chauffagiste · Lyon" },
  { id: "heading",  kind: "text",   label: "Titre",        preview: "Une eau chaude qui ne vous lâche jamais." },
  { id: "subhead",  kind: "text",   label: "Sous-titre",   preview: "Dépannage 7j/7 · devis sous 24h" },
  { id: "cta_primary",   kind: "button", label: "CTA principal",   preview: "Obtenir mon devis →" },
  { id: "cta_secondary", kind: "button", label: "CTA secondaire",  preview: "Voir nos réalisations" },
  { id: "image",    kind: "image",  label: "Visuel",       preview: "hero-chaudiere.jpg" },
];

const NAVBAR_FIELDS = [
  { id: "logo",  kind: "image", label: "Logo",   preview: "thermalis-logo.svg" },
  { id: "menu",  kind: "link",  label: "Menu",   preview: "5 entrées · header" },
  { id: "cta",   kind: "button", label: "CTA",   preview: "Demander un devis" },
];

const FEATURES_FIELDS = [
  { id: "kicker",  kind: "text", label: "Kicker", preview: "POURQUOI NOUS" },
  { id: "heading", kind: "text", label: "Titre",  preview: "Trois engagements." },
];

const FEATURE_BLOCK_FIELDS = [
  { id: "icon",  kind: "image", label: "Icône",  preview: "" },
  { id: "title", kind: "text",  label: "Titre",  preview: "" },
  { id: "body",  kind: "text",  label: "Texte",  preview: "" },
];

const FEATURE_BLOCKS = [
  { id: "b1", label: "Intervention rapide", title: "Intervention rapide",   body: "Un technicien chez vous sous 4 h, partout dans le Rhône." },
  { id: "b2", label: "Garantie 10 ans",     title: "Garantie 10 ans",       body: "Pièces et main-d'œuvre couvertes sur nos installations." },
  { id: "b3", label: "Aides MaPrimeRénov'", title: "MaPrimeRénov'",         body: "On monte votre dossier d'aide de A à Z, sans frais." },
];

// ── Top-level App ──────────────────────────────────────────────────────────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "workspace": "design",
  "panelMode": "section",
  "device": "desktop",
  "density": "regular",
  "accent": "#E2552B",
  "zoom": 85
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [activePage, setActivePage] = useState("/");
  const [selectedSectionId, setSelectedSectionId] = useState("s2"); // Hero on home
  const [selectedElementId, setSelectedElementId] = useState(null); // e.g. "heading"
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [expandedSections, setExpandedSections] = useState(new Set(["s2", "s4"]));
  const [companyOpen, setCompanyOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  // Which modal is open? null | "themes" | "save-theme" | "section-picker" |
  // "sg-colors" | "sg-heading" | "sg-body" | "sg-buttons" | "sg-cards"
  const [modal, setModal] = useState(null);

  // Mirror tweaks → CSS / body attrs
  useLayoutEffect(() => {
    document.body.dataset.density = t.density;
    document.body.dataset.workspace = t.workspace;
    document.documentElement.style.setProperty("--accent", t.accent);
    const hex = t.accent.replace("#","");
    const r = parseInt(hex.slice(0,2),16);
    const g = parseInt(hex.slice(2,4),16);
    const b = parseInt(hex.slice(4,6),16);
    document.documentElement.style.setProperty("--accent-tint",   `rgba(${r},${g},${b},.10)`);
    document.documentElement.style.setProperty("--accent-tint-2", `rgba(${r},${g},${b},.18)`);
    const darken = (n) => Math.max(0, n - 30);
    document.documentElement.style.setProperty("--accent-2", `rgb(${darken(r)},${darken(g)},${darken(b)})`);
    document.body.classList.remove("mount-pending");
  }, [t.density, t.accent, t.workspace]);

  // Drive panel mode from selection — but allow Tweaks override
  const panelMode = useMemo(() => {
    if (t.panelMode) return t.panelMode;
    if (selectedElementId) return "element";
    if (selectedSectionId) return "section";
    return "global";
  }, [t.panelMode, selectedElementId, selectedSectionId]);

  // Toggle bulk selection (multi-AI)
  const toggleBulk = useCallback((sectionId) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId); else next.add(sectionId);
      return next;
    });
  }, []);

  return (
    <>
      <div id="app">
        <TopBar
          workspace={t.workspace}
          onWorkspace={(v) => setTweak("workspace", v)}
          companyOpen={companyOpen} setCompanyOpen={setCompanyOpen}
          publishOpen={publishOpen} setPublishOpen={setPublishOpen}
          onOpenThemes={() => setModal("themes")}
          onOpenSaveTheme={() => setModal("save-theme")}
        />

        <div className="body">
          {t.workspace === "design" && (
            <>
              <LeftPanel
                mode={panelMode}
                onCloseElement={() => { setSelectedElementId(null); setTweak("panelMode", "section"); }}
                onCloseSection={() => { setSelectedSectionId(null); setSelectedElementId(null); setTweak("panelMode", "global"); }}
                onOpenSectionPicker={() => setModal("section-picker")}
              />
              <Canvas
                activePage={activePage} onActivePage={setActivePage}
                device={t.device} onDevice={(v) => setTweak("device", v)}
                zoom={t.zoom} onZoom={(v) => setTweak("zoom", v)}
                selectedSectionId={selectedSectionId}
                selectedElementId={selectedElementId}
                onSelectSection={(id) => { setSelectedSectionId(id); setSelectedElementId(null); setTweak("panelMode", "section"); }}
                onSelectElement={(id) => { setSelectedElementId(id); setTweak("panelMode", "element"); }}
                onClearSelection={() => { setSelectedSectionId(null); setSelectedElementId(null); setTweak("panelMode", "global"); }}
              />
              <LayersPanel
                activePage={activePage} onActivePage={setActivePage}
                selectedSectionId={selectedSectionId}
                selectedElementId={selectedElementId}
                onSelectSection={(id) => { setSelectedSectionId(id); setSelectedElementId(null); setTweak("panelMode", "section"); }}
                onSelectElement={(sid, eid) => { setSelectedSectionId(sid); setSelectedElementId(eid); setTweak("panelMode", "element"); }}
                expandedSections={expandedSections}
                onToggleExpanded={(id) => setExpandedSections((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                })}
                bulkMode={bulkMode}
                onToggleBulk={() => { setBulkMode((v) => !v); setBulkSelected(new Set()); }}
                bulkSelected={bulkSelected}
                onToggleBulkItem={toggleBulk}
              />
            </>
          )}

          {t.workspace === "sitemap" && (
            <SitemapWorkspace
              activePage={activePage}
              onActivePage={setActivePage}
              zoom={t.zoom}
              onZoom={(v) => setTweak("zoom", v)}
            />
          )}

          {t.workspace === "wireframe" && (
            <WireframeWorkspace
              activePage={activePage} onActivePage={setActivePage}
              device={t.device} onDevice={(v) => setTweak("device", v)}
              zoom={t.zoom} onZoom={(v) => setTweak("zoom", v)}
              selectedSectionId={selectedSectionId}
              onSelectSection={(id) => { setSelectedSectionId(id); setSelectedElementId(null); }}
              onOpenSectionPicker={() => setModal("section-picker")}
            />
          )}

          {t.workspace === "style-guide" && (
            <StyleGuideWorkspace
              onOpenModal={(id) => setModal("sg-" + id)}
            />
          )}
        </div>

        <StatusBar workspace={t.workspace} />
      </div>

      {/* Modals */}
      {modal === "themes" && (
        <ThemeLibraryModal onClose={() => setModal(null)} />
      )}
      {modal === "save-theme" && (
        <SaveAsThemeModal onClose={() => setModal(null)} />
      )}
      {modal === "section-picker" && (
        <SectionPickerModal onClose={() => setModal(null)} />
      )}
      {modal === "sg-colors" && (
        <ColorsModal onClose={() => setModal(null)} />
      )}
      {modal === "sg-heading" && (
        <FontModal role="heading" onClose={() => setModal(null)} />
      )}
      {modal === "sg-body" && (
        <FontModal role="body" onClose={() => setModal(null)} />
      )}
      {modal === "sg-buttons" && (
        <ButtonsModal onClose={() => setModal(null)} />
      )}
      {modal === "sg-cards" && (
        <CardsModal onClose={() => setModal(null)} />
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Workspace">
          <TweakSelect label="Vue" value={t.workspace}
            options={[
              {value: "sitemap",     label: "Sitemap"},
              {value: "wireframe",   label: "Wireframe"},
              {value: "style-guide", label: "Style Guide"},
              {value: "design",      label: "Design"},
            ]}
            onChange={(v) => setTweak("workspace", v)} />
          <TweakRadio label="Densité" value={t.density}
            options={["compact","regular","cozy"]}
            onChange={(v) => setTweak("density", v)} />
        </TweakSection>

        {t.workspace === "design" && (
          <TweakSection label="Panneau gauche">
            <TweakRadio label="Mode" value={t.panelMode}
              options={[
                {value: "global",  label: "Global"},
                {value: "section", label: "Section"},
                {value: "element", label: "Élément"},
              ]}
              onChange={(v) => setTweak("panelMode", v)} />
          </TweakSection>
        )}

        {t.workspace !== "sitemap" && t.workspace !== "style-guide" && (
          <TweakSection label="Canvas">
            <TweakRadio label="Device" value={t.device}
              options={[
                {value:"desktop",label:"Desktop"},
                {value:"tablet", label:"Tablet"},
                {value:"mobile", label:"Mobile"},
              ]}
              onChange={(v) => setTweak("device", v)} />
            <TweakSlider label="Zoom" value={t.zoom} min={40} max={120} step={5} unit="%"
              onChange={(v) => setTweak("zoom", v)} />
          </TweakSection>
        )}

        <TweakSection label="Modals">
          <TweakSelect label="Ouvrir" value={modal ?? "none"}
            options={[
              {value:"none",            label:"Aucune"},
              {value:"themes",          label:"Bibliothèque thèmes"},
              {value:"save-theme",      label:"Enregistrer thème"},
              {value:"section-picker",  label:"Remplacer section"},
              {value:"sg-colors",       label:"SG · Couleurs"},
              {value:"sg-heading",      label:"SG · Titre"},
              {value:"sg-body",         label:"SG · Corps"},
              {value:"sg-buttons",      label:"SG · Boutons"},
              {value:"sg-cards",        label:"SG · Cartes"},
            ]}
            onChange={(v) => setModal(v === "none" ? null : v)} />
        </TweakSection>

        <TweakSection label="Thème">
          <TweakColor label="Accent" value={t.accent}
            options={["#E2552B","#2A6FDB","#1F8A5B","#7A5AE0","#14120E","#C8881F"]}
            onChange={(v) => setTweak("accent", v)} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

// ── Top bar ────────────────────────────────────────────────────────────────
function TopBar({ workspace, onWorkspace, companyOpen, setCompanyOpen, publishOpen, setPublishOpen, onOpenThemes, onOpenSaveTheme }) {
  const wsLabel = {
    sitemap: "Sitemap",
    wireframe: "Wireframe",
    "style-guide": "Style Guide",
    design: "Design",
  }[workspace];

  return (
    <div className="topbar">
      <div className="left-group">
        <div className="brand">
          <div className="brand-mark" aria-label="Studio mark" />
          <span style={{ fontWeight: 500, fontSize: 13, letterSpacing: "-.005em", whiteSpace: "nowrap" }}>Site Studio</span>
        </div>

        <div className="crumbs">
          <span>Sama Digital</span>
          <span className="sep">/</span>
          <span className="cur">Thermalis · Lyon</span>
          <span className="sep">/</span>
          <span style={{ color: "var(--text-3)" }}>{wsLabel}</span>
        </div>

        <span className="saved"><i />enregistré · il y a 6 s</span>

        <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 4px" }} />

        <div style={{ position: "relative" }}>
          <button className="topchip" onClick={() => setCompanyOpen(v => !v)}>
            <I name="building" className="ico-sm" style={{ color: "var(--text-3)" }} />
            <span className="truncate">Thermalis SARL</span>
            <I name="chevdown" className="ico-xs" style={{ color: "var(--text-4)" }} />
          </button>
          {companyOpen && (
            <CompanyPop onClose={() => setCompanyOpen(false)} />
          )}
        </div>

        <button className="topchip">
          <span className="truncate">Projet · Lyon 7e</span>
          <I name="chevdown" className="ico-xs" style={{ color: "var(--text-4)" }} />
        </button>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" className="tab" aria-selected={workspace === "sitemap"} onClick={() => onWorkspace("sitemap")}>
          <I name="flow" className="ico-sm" />Sitemap
        </button>
        <button role="tab" className="tab" aria-selected={workspace === "wireframe"} onClick={() => onWorkspace("wireframe")}>
          <I name="layoutLeft" className="ico-sm" />Wireframe
        </button>
        <button role="tab" className="tab" aria-selected={workspace === "style-guide"} onClick={() => onWorkspace("style-guide")}>
          <I name="palette" className="ico-sm" />Style Guide
        </button>
        <button role="tab" className="tab" aria-selected={workspace === "design"} onClick={() => onWorkspace("design")}>
          <I name="block" className="ico-sm" />Design <kbd>D</kbd>
        </button>
      </div>

      <div className="right">
        <div className="seg compact">
          <button title="Annuler — ⌘Z"><I name="undo" className="ico-sm" /></button>
          <button title="Rétablir — ⌘⇧Z"><I name="redo" className="ico-sm" /></button>
        </div>
        <button className="btn ghost sm" title="Historique des versions">
          <I name="history" className="ico-sm" />
        </button>
        <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 2px" }} />
        <button className="btn outline sm" onClick={onOpenThemes}><I name="palette" className="ico-sm" />Thèmes</button>
        <button className="btn outline sm" onClick={onOpenSaveTheme}><I name="bookmark" className="ico-sm" />Sauver</button>
        <button className="btn outline sm"><I name="share" className="ico-sm" />Partager</button>
        <div style={{ position: "relative" }}>
          <button className="btn accent" onClick={() => setPublishOpen(v => !v)}>
            <I name="globe" className="ico-sm" />Publier
            <span style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, background: "#f5b417", borderRadius: "50%", border: "2px solid var(--bg)" }} title="Modifications non publiées" />
          </button>
          {publishOpen && <PublishPop onClose={() => setPublishOpen(false)} />}
        </div>
      </div>
    </div>
  );
}

function CompanyPop({ onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const companies = [
    { name: "Thermalis SARL", tag: "LM", active: true },
    { name: "Brossard Couverture", tag: "LM" },
    { name: "Énergie Solaire 69", tag: "" },
    { name: "Chauffage Pro Lyon", tag: "LM" },
    { name: "Plomberie Express", tag: "" },
  ];
  return (
    <div ref={ref} className="pop" style={{ top: "calc(100% + 6px)", left: 0, width: 280 }}>
      <div style={{ padding: 8, borderBottom: "1px solid var(--border)", display: "flex", gap: 6 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <I name="search" className="ico-sm" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)" }} />
          <input autoFocus placeholder="Rechercher une entreprise…" className="input" style={{ paddingLeft: 28, height: 26, fontSize: 12 }} />
        </div>
        <button className="btn outline xs" title="Trier"><I name="filter" className="ico-xs" />LM</button>
      </div>
      <div style={{ maxHeight: 230, overflow: "auto", padding: "4px 0" }}>
        {companies.map((c) => (
          <button key={c.name} className="layer-section" aria-selected={c.active}
            style={{ width: "100%", height: 28, padding: "0 10px", borderRadius: 0, fontSize: 12 }}>
            <I name="building" className="ico-sm" />
            <span className="name">{c.name}</span>
            {c.tag && <span className="pill ok" style={{ height: 16, fontSize: 9 }}>{c.tag}</span>}
            {c.active && <I name="check" className="ico-sm" style={{ color: "var(--accent)" }} />}
          </button>
        ))}
      </div>
      <div style={{ padding: "6px 10px", borderTop: "1px solid var(--border)", fontSize: 10.5, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>
        12 entreprises qualifiées · 5 affichées
      </div>
    </div>
  );
}

function PublishPop({ onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} className="pop" style={{ top: "calc(100% + 6px)", right: 0, width: 320, padding: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Publier les modifications</div>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 12 }}>
        Actuellement en ligne · <a style={{ color: "var(--info)", textDecoration: "none" }}>thermalis-lyon.samadigitalstudio.fr ↗</a>
      </div>

      <div style={{ background: "rgba(245, 180, 23, .12)", border: "1px solid rgba(245, 180, 23, .35)", borderRadius: 7, padding: "8px 10px", marginBottom: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
        <I name="warning" className="ico-sm" style={{ color: "#a36b00", marginTop: 1 }} />
        <span style={{ fontSize: 11, color: "#8a5700", lineHeight: 1.45 }}>
          4 modifications non publiées depuis le 14 mai à 18:23.
        </span>
      </div>

      <div className="field-label">Sous-domaine</div>
      <div style={{ display: "flex", alignItems: "stretch", border: "1px solid var(--border-2)", borderRadius: 6, overflow: "hidden", marginBottom: 12, background: "var(--surface)" }}>
        <input className="input mono" defaultValue="thermalis-lyon"
               style={{ border: 0, borderRadius: 0, height: 30, paddingLeft: 10, flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", padding: "0 10px", background: "var(--surface-2)", borderLeft: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--text-3)" }}>
          .samadigitalstudio.fr
        </div>
      </div>

      <button className="btn accent" style={{ width: "100%", height: 32, justifyContent: "center" }}>
        <I name="globe" className="ico-sm" />Mettre à jour le site live
      </button>
    </div>
  );
}

// ── Left Panel ──────────────────────────────────────────────────────────────
function LeftPanel({ mode, onCloseElement, onCloseSection, onOpenSectionPicker }) {
  return (
    <div className="pane">
      {mode === "global"  && <GlobalPanel  />}
      {mode === "section" && <SectionPanel onClose={onCloseSection} onOpenSectionPicker={onOpenSectionPicker} />}
      {mode === "element" && <ElementPanel onClose={onCloseElement} />}
    </div>
  );
}

function PaneHeader({ icon, iconColor, title, accessory, onClose }) {
  return (
    <div className="pane-hd contextual" style={{ padding: "0 10px 0 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, flex: 1 }}>
        <I name={icon} className="ico-sm" style={{ color: iconColor }} />
        <span style={{ fontWeight: 600, fontSize: 12.5, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
      </div>
      <div className="actions">
        {accessory}
        {onClose && (
          <button className="btn ghost xs icon" onClick={onClose} title="Fermer"><I name="x" className="ico-xs" /></button>
        )}
      </div>
    </div>
  );
}

function GlobalPanel() {
  return (
    <>
      <PaneHeader icon="settings" iconColor="var(--text-3)" title="Paramètres globaux"
        accessory={<button className="btn xs ghost" style={{ color: "var(--info)" }}><I name="navigation" className="ico-xs" />Menus</button>} />
      <div className="pane-body">
        <Section label="Identité" defaultOpen>
          <Field label="Nom du site">
            <input className="input" defaultValue="Thermalis · Plombier-chauffagiste Lyon" />
          </Field>
          <Field label="Slogan">
            <input className="input" defaultValue="L'expert chauffage et plomberie du Rhône" />
          </Field>
          <Field label="Logo" hint="SVG · 256×64">
            <ImageDropper label="thermalis-logo.svg" />
          </Field>
        </Section>

        <Section label="Couleurs" defaultOpen>
          <Field label="Couleurs principales">
            <div className="swatches">
              <div className="swatch selected" style={{ background: "#c14a1c" }} />
              <div className="swatch" style={{ background: "#181612" }} />
              <div className="swatch" style={{ background: "#fffaf2" }} />
              <div className="swatch" style={{ background: "#f59e0b" }} />
              <div className="swatch add">+</div>
            </div>
          </Field>
          <Field label="Schéma rendu">
            <div className="seg" style={{ width: "100%" }}>
              <button style={{ flex: 1, justifyContent: "center" }} aria-pressed="true">Clair</button>
              <button style={{ flex: 1, justifyContent: "center" }}>Sombre</button>
              <button style={{ flex: 1, justifyContent: "center" }}>Auto</button>
            </div>
          </Field>
        </Section>

        <Section label="Typographie" defaultOpen>
          <Field label="Titre">
            <select className="select" defaultValue="Instrument Serif">
              <option>Instrument Serif</option>
              <option>Geist</option>
              <option>Fraunces</option>
              <option>Söhne</option>
            </select>
          </Field>
          <Field label="Corps">
            <select className="select" defaultValue="Geist">
              <option>Geist</option>
              <option>Inter</option>
              <option>Söhne</option>
            </select>
          </Field>
          <Field label="Échelle">
            <div className="field-row">
              <input className="input mono" defaultValue="1.250" style={{ flex: 1 }} />
              <select className="select" defaultValue="major-third" style={{ flex: 1 }}>
                <option value="major-third">Major third</option>
                <option>Perfect fourth</option>
                <option>Golden</option>
              </select>
            </div>
          </Field>
        </Section>

        <Section label="Variables">
          <ToggleRow label="Injecter les variables entreprise" desc="Ville, téléphone, avis Google…" checked />
          <ToggleRow label="Mode A/B" desc="Comparer deux variantes en aperçu" />
        </Section>
      </div>
    </>
  );
}

function SectionPanel({ onClose, onOpenSectionPicker }) {
  return (
    <>
      <PaneHeader icon="block" iconColor="var(--accent)" title="Hero 12 — Split"
        accessory={<button className="btn xs ghost" title="Remplacer la section" onClick={onOpenSectionPicker}><I name="refresh" className="ico-xs" />Changer</button>}
        onClose={onClose} />
      <div className="pane-body">

        {/* AI box */}
        <div style={{ padding: "12px 14px" }}>
          <div className="ai-box">
            <div className="ai-box-hd">
              <I name="sparkles" className="ico-sm" />
              <span>Régénérer cette section</span>
              <span className="pill magic">Claude · Sonnet 4.6</span>
            </div>
            <textarea defaultValue="Plus orienté urgence : insister sur la disponibilité 7j/7 et la rapidité d'intervention (sous 4 h)." />
            <div className="ai-box-ft">
              <span style={{ fontSize: 10.5, color: "var(--text-3)", flex: 1 }}>
                Conserve les variables {"{{ville}}"}, {"{{tel}}"}.
              </span>
              <button className="btn magic xs"><I name="sparkles" className="ico-xs" />Générer</button>
            </div>
          </div>
        </div>

        <Section label="Contenu" defaultOpen>
          <Field label="Tagline">
            <input className="input" defaultValue="Plombier-chauffagiste · Lyon" />
          </Field>
          <Field label="Titre" hint="2 lignes max">
            <textarea className="textarea" rows={2} defaultValue="Une eau chaude qui ne vous lâche jamais." />
          </Field>
          <Field label="Sous-titre">
            <textarea className="textarea" rows={2} defaultValue="Dépannage 7j/7 dans tout le Rhône. Devis sous 24 h, intervention sous 4 h en urgence." />
          </Field>
          <Field label="Image principale" hint="ratio 4:3">
            <ImageDropper label="hero-chaudiere.jpg" />
          </Field>
        </Section>

        <Section label="Boutons" defaultOpen>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
            <ButtonRow label="Obtenir mon devis →" link="/contact" primary />
            <ButtonRow label="Voir nos réalisations" link="/realisations" />
          </div>
        </Section>

        <Section label="Apparence">
          <Field label="Schéma de couleurs">
            <div className="seg" style={{ width: "100%" }}>
              <button style={{ flex: 1, justifyContent: "center" }} aria-pressed="true">Sur clair</button>
              <button style={{ flex: 1, justifyContent: "center" }}>Sur foncé</button>
              <button style={{ flex: 1, justifyContent: "center" }}>Accent</button>
            </div>
          </Field>
          <Field label="Alignement texte">
            <div className="seg" style={{ width: "100%" }}>
              <button style={{ flex: 1, justifyContent: "center" }} aria-pressed="true">Gauche</button>
              <button style={{ flex: 1, justifyContent: "center" }}>Centre</button>
            </div>
          </Field>
          <Field label="Padding vertical" hint="px">
            <input className="input mono" defaultValue="80 / 96" />
          </Field>
        </Section>

        <Section label="Animation">
          <Field label="Apparition au scroll">
            <select className="select" defaultValue="fade-up">
              <option value="none">Aucune</option>
              <option value="fade-up">Fade up</option>
              <option value="fade-in">Fade in</option>
              <option value="slide-right">Slide right</option>
            </select>
          </Field>
          <Field label="Délai" hint="ms">
            <input className="input mono" defaultValue="120" />
          </Field>
        </Section>
      </div>
    </>
  );
}

function ElementPanel({ onClose }) {
  return (
    <>
      <PaneHeader icon="type" iconColor="var(--magic)" title="<h1> · text"
        accessory={<span className="pill magic">heading</span>}
        onClose={onClose} />
      <div className="pane-body">

        <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
          <div className="el-preview">
            <span style={{ fontFamily: "var(--font-serif)", fontSize: 22, color: "#1a1714" }}>Une eau chaude qui ne <em style={{ color: "#c14a1c", fontStyle: "italic" }}>vous lâche jamais.</em></span>
          </div>
        </div>

        <Section label="Texte" defaultOpen>
          <Field label="Contenu">
            <textarea className="textarea" rows={3} defaultValue="Une eau chaude qui ne vous lâche jamais." />
          </Field>
          <Field label="Élément">
            <div className="seg" style={{ width: "100%" }}>
              {["h1","h2","h3","p","span"].map((tag, i) => (
                <button key={tag} style={{ flex: 1, justifyContent: "center" }} aria-pressed={i === 0}>{tag}</button>
              ))}
            </div>
          </Field>
        </Section>

        <Section label="Typographie" defaultOpen>
          <Field label="Famille">
            <select className="select" defaultValue="serif"><option value="serif">Instrument Serif</option><option>Geist</option></select>
          </Field>
          <Field label="Taille / Hauteur ligne">
            <div className="field-row">
              <input className="input mono" defaultValue="56px" style={{ flex: 1 }} />
              <input className="input mono" defaultValue="1.02" style={{ flex: 1 }} />
            </div>
          </Field>
          <Field label="Poids">
            <div className="seg" style={{ width: "100%" }}>
              {["300","400","500","600","700"].map((w, i) => (
                <button key={w} style={{ flex: 1, justifyContent: "center", fontFamily: "var(--font-mono)" }} aria-pressed={i === 1}>{w}</button>
              ))}
            </div>
          </Field>
        </Section>

        <Section label="Couleur">
          <div className="swatches">
            <div className="swatch selected" style={{ background: "#1a1714" }} />
            <div className="swatch" style={{ background: "#c14a1c" }} />
            <div className="swatch" style={{ background: "#fffaf2" }} />
            <div className="swatch" style={{ background: "#57514a" }} />
            <div className="swatch add">+</div>
          </div>
        </Section>

        <Section label="Variables">
          <ToggleRow label="Insérer {{ville}}" desc="Remplacé à la publication" />
          <ToggleRow label="Insérer {{nb_avis}}" desc="248 avis Google" />
        </Section>
      </div>
    </>
  );
}

// ── Atom helpers ───────────────────────────────────────────────────────────
function Section({ label, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <div className="section-hd" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <I name="chevdown" className="ico-xs chev" />
        <span>{label}</span>
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        {hint && <span className="hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, desc, checked = false }) {
  const [on, setOn] = useState(checked);
  return (
    <div className="toggle-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lbl">{label}</div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      <button className="toggle" aria-checked={on} onClick={() => setOn(o => !o)} />
    </div>
  );
}

function ImageDropper({ label }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      border: "1px dashed var(--border-2)",
      background: "var(--surface-2)",
      borderRadius: 6, padding: "6px 8px",
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 4,
        background: "var(--bg-3)",
        backgroundImage: "repeating-linear-gradient(135deg, rgba(20,18,14,.06) 0 6px, transparent 6px 12px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--text-4)",
      }}>
        <I name="imageIcon" className="ico-sm" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
        <div style={{ fontSize: 10.5, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>déposer ou cliquer</div>
      </div>
      <button className="btn ghost xs"><I name="upload" className="ico-xs" /></button>
    </div>
  );
}

function ButtonRow({ label, link, primary }) {
  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 7, padding: 8,
      display: "grid", gridTemplateColumns: "1fr", gap: 6,
      background: "var(--surface)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span className="pill" style={{ background: primary ? "var(--text)" : "var(--bg-2)", color: primary ? "var(--bg)" : "var(--text-2)" }}>
          {primary ? "Primary" : "Secondary"}
        </span>
        <input className="input" style={{ height: 24, fontSize: 12, flex: 1 }} defaultValue={label} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <I name="link" className="ico-xs" style={{ color: "var(--text-4)" }} />
        <input className="input mono" style={{ height: 22, fontSize: 11, flex: 1 }} defaultValue={link} />
      </div>
    </div>
  );
}

// ── Canvas ──────────────────────────────────────────────────────────────────
function Canvas({ activePage, onActivePage, device, onDevice, zoom, onZoom,
  selectedSectionId, selectedElementId,
  onSelectSection, onSelectElement, onClearSelection }) {

  const deviceWidth = device === "mobile" ? 390 : device === "tablet" ? 768 : 1200;
  const scale = zoom / 100;

  return (
    <div className="canvas-host" onClick={onClearSelection}>
      <div className="canvas-dotgrid" />

      <div className="canvas-stage" style={{ transform: `translate(60px, 24px) scale(${scale})`, width: deviceWidth }}
           onClick={(e) => e.stopPropagation()}>

        {/* Page meta bar */}
        <div className="page-meta-bar">
          <div className="page-chip">
            <I name="home" className="ico-sm" style={{ color: "var(--text-3)" }} />
            <span>{SITEMAP.find(p => p.slug === activePage)?.title}</span>
            <span className="slug">{activePage}</span>
          </div>
          <div className="page-tabs">
            {SITEMAP.map((p, i) => (
              <button key={p.id} className="page-tab" aria-selected={p.slug === activePage}
                onClick={() => onActivePage(p.slug)}>
                <span className="pgnum">{String(i + 1).padStart(2, "0")}</span>
                <span>{p.title}</span>
              </button>
            ))}
            <button className="page-tab" title="Ajouter une page">
              <I name="plus" className="ico-xs" />
            </button>
          </div>
        </div>

        {/* Device frame */}
        <div className="device-frame" style={{ width: deviceWidth }}>
          {SECTIONS_BY_PAGE[activePage]?.map((sec) => (
            <MockSection
              key={sec.id}
              section={sec}
              isSelected={selectedSectionId === sec.id}
              selectedElementId={selectedElementId}
              onSelectSection={() => onSelectSection(sec.id)}
              onSelectElement={onSelectElement}
            />
          ))}
        </div>

        <div style={{ height: 80 }} />
      </div>

      {/* Bottom canvas toolbar */}
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
        <div className="grp">
          <button><I name="eye" className="ico-sm" />Aperçu</button>
        </div>
      </div>

      <div className="canvas-help">
        <kbd>⌘</kbd> + scroll : zoom · <kbd>Space</kbd> + drag : panoramique
      </div>
    </div>
  );
}

// ── Mock section renderers ──────────────────────────────────────────────────
function MockSection({ section, isSelected, selectedElementId, onSelectSection, onSelectElement }) {
  const handleClick = (e) => {
    e.stopPropagation();
    onSelectSection();
  };
  const handleElement = (id) => (e) => {
    e.stopPropagation();
    onSelectElement(id);
  };
  const selClass = (id, tag) => selectedElementId === id && isSelected ? "el-sel" : "";

  return (
    <div className="ws-section mock" data-selected={isSelected} onClick={handleClick}>
      <span className="ws-tag"><span className="dot" />{section.name}</span>
      {section.type === "Navbar" && (
        <div className="mock-navbar">
          <div className="logo">
            <div className="mark" />
            <span>Thermalis</span>
          </div>
          <div className="links">
            <span>Services</span><span>Réalisations</span><span>À propos</span><span>Contact</span>
          </div>
          <span className="cta">Demander un devis</span>
        </div>
      )}
      {section.type === "Hero" && (
        <div className="mock-hero">
          <div>
            <div className={`eyebrow ${selClass("eyebrow")}`}
                 data-tag="eyebrow"
                 onClick={handleElement("eyebrow")}>
              <span className="pulse" /> Plombier-chauffagiste · Lyon
            </div>
            <h1 className={selClass("heading")} data-tag="h1" onClick={handleElement("heading")}>
              Une eau chaude qui ne <em>vous lâche jamais.</em>
            </h1>
            <p className={selClass("subhead")} data-tag="p" onClick={handleElement("subhead")}>
              Dépannage 7j/7 dans tout le Rhône. Devis sous 24 h, intervention sous 4 h en urgence.
            </p>
            <div className="btn-row">
              <span className={`primary ${selClass("cta_primary")}`} data-tag="a.primary"
                    onClick={handleElement("cta_primary")}>
                Obtenir mon devis <I name="arrow" className="ico-sm" />
              </span>
              <span className={`ghost ${selClass("cta_secondary")}`} data-tag="a.ghost"
                    onClick={handleElement("cta_secondary")}>
                Voir nos réalisations
              </span>
            </div>
          </div>
          <div className={`img-slot ${selClass("image")}`} data-tag="img"
               onClick={handleElement("image")}>
            <I name="imageIcon" className="ico-lg" />
            <span>HERO · 1200×900</span>
            <span className="ph-mark">hero-chaudiere.jpg</span>
          </div>
        </div>
      )}
      {section.type === "Logos" && (
        <div style={{ padding: "36px 48px", background: "#faf7f1", borderTop: "1px solid rgba(0,0,0,.04)", borderBottom: "1px solid rgba(0,0,0,.04)", textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#8a877f", fontFamily: "var(--font-mono)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 18 }}>
            Ils nous font confiance
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 24, alignItems: "center", opacity: .55 }}>
            {["Saunier Duval","Atlantic","De Dietrich","Frisquet","Vaillant","Viessmann"].map((b) => (
              <div key={b} style={{ fontFamily: "var(--font-serif)", fontSize: 18, color: "#3a3530", letterSpacing: ".02em" }}>{b}</div>
            ))}
          </div>
        </div>
      )}
      {section.type === "Features" && (
        <div className="mock-features">
          <div className="lead">
            <div className="kicker">Pourquoi nous</div>
            <h2>Trois engagements <em style={{ fontStyle: "italic", color: "#c14a1c" }}>tenus</em>.</h2>
          </div>
          <div className="grid">
            {FEATURE_BLOCKS.map((b, i) => (
              <div key={b.id} className="card">
                <div className="ic">
                  <I name={i === 0 ? "zap" : i === 1 ? "tools" : "euro"} className="ico-lg" />
                </div>
                <h3>{b.title}</h3>
                <p>{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {section.type === "CTA" && (
        <div style={{ padding: "64px 48px", background: "#181612", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32 }}>
          <div>
            <div style={{ fontFamily: "var(--font-serif)", fontSize: 32, lineHeight: 1.1, marginBottom: 8 }}>
              Une urgence ? On est là.
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,.65)" }}>Standard ouvert 7j/7 · réponse en moins de 5 min.</div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <span style={{ padding: "12px 22px", background: "#c14a1c", borderRadius: 8, fontSize: 14, fontWeight: 500 }}>04 78 00 00 00</span>
            <span style={{ padding: "12px 22px", border: "1px solid rgba(255,255,255,.25)", borderRadius: 8, fontSize: 14, fontWeight: 500 }}>Demander un devis</span>
          </div>
        </div>
      )}
      {section.type === "Footer" && (
        <div style={{ padding: "40px 48px 24px", background: "#0f0d0a", color: "rgba(255,255,255,.5)", fontSize: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 32 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff", fontWeight: 600, marginBottom: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: 5, background: "linear-gradient(135deg, #f59e0b, #ef4444)" }} />
                Thermalis
              </div>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55 }}>Plombier-chauffagiste depuis 1987 · Lyon, Villeurbanne, Bron, Caluire, Vénissieux.</p>
            </div>
            <div>
              <div style={{ color: "#fff", fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>Services</div>
              <div style={{ display: "grid", gap: 6 }}>{["Dépannage","Chaudière","PAC","Solaire"].map(x => <span key={x}>{x}</span>)}</div>
            </div>
            <div>
              <div style={{ color: "#fff", fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>Société</div>
              <div style={{ display: "grid", gap: 6 }}>{["À propos","Avis","Recrutement","Contact"].map(x => <span key={x}>{x}</span>)}</div>
            </div>
            <div>
              <div style={{ color: "#fff", fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 }}>Légal</div>
              <div style={{ display: "grid", gap: 6 }}>{["CGV","Mentions","Cookies"].map(x => <span key={x}>{x}</span>)}</div>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,.08)", marginTop: 28, paddingTop: 16, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>© 2026 Thermalis SARL · SIREN 488 220 117</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>fait avec Sama Site Studio</span>
          </div>
        </div>
      )}
      {/* Generic placeholder for other section types */}
      {!["Navbar","Hero","Logos","Features","CTA","Footer"].includes(section.type) && (
        <PlaceholderSection name={section.name} type={section.type} />
      )}
    </div>
  );
}

function PlaceholderSection({ name, type }) {
  return (
    <div style={{ padding: "56px 48px", background: "#fffaf2", textAlign: "center", borderBottom: "1px solid rgba(0,0,0,.04)" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#b3491c", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>{type}</div>
      <div style={{ fontFamily: "var(--font-serif)", fontSize: 26, color: "#1a1714", marginBottom: 6 }}>{name}</div>
      <div style={{ fontSize: 12, color: "#8a877f" }}>Aperçu masqué — sélectionner pour éditer.</div>
    </div>
  );
}

// ── Right Layers panel ─────────────────────────────────────────────────────
function LayersPanel({
  activePage, onActivePage,
  selectedSectionId, selectedElementId,
  onSelectSection, onSelectElement,
  expandedSections, onToggleExpanded,
  bulkMode, onToggleBulk,
  bulkSelected, onToggleBulkItem,
}) {

  return (
    <div className="pane">
      <div className="pane-hd">
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <I name="layers" className="ico-sm" style={{ color: "var(--text-3)" }} />Calques
        </span>
        <div className="actions">
          <button className={`btn xs ${bulkMode ? "magic" : "ghost"}`} onClick={onToggleBulk}>
            <I name="sparkles" className="ico-xs" />
            {bulkMode ? `${bulkSelected.size} sél.` : "IA ×N"}
          </button>
        </div>
      </div>

      <div className="pane-body" style={{ padding: "6px 6px" }}>
        {SITEMAP.map((page) => {
          const sections = SECTIONS_BY_PAGE[page.slug] ?? [];
          const isActivePage = page.slug === activePage;
          return (
            <div key={page.id} style={{ marginBottom: 4 }}>
              <div className="layer-page" aria-selected={isActivePage} aria-expanded={isActivePage}
                   onClick={() => onActivePage(page.slug)}>
                <I name="chevdown" className="ico-xs chev" />
                <I name="home" className="ico-sm" style={{ color: "inherit", opacity: .7 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{page.title}</span>
                <span className="count">{sections.length}</span>
              </div>
              {isActivePage && (
                <div style={{ marginLeft: 8, borderLeft: "1px solid var(--border)", paddingLeft: 2, marginTop: 1 }}>
                  {sections.map((sec) => {
                    const isSel = selectedSectionId === sec.id;
                    const isOpen = expandedSections.has(sec.id);
                    const checked = bulkSelected.has(sec.id);
                    return (
                      <div key={sec.id}>
                        <div className={`layer-section ${bulkMode ? "bulk-on" : ""}`} aria-selected={isSel}
                             data-checked={checked}
                             onClick={() => bulkMode ? onToggleBulkItem(sec.id) : onSelectSection(sec.id)}>
                          {bulkMode ? (
                            <span style={{ width: 14, height: 14, borderRadius: 3, border: "1.5px solid var(--border-strong)",
                                          background: checked ? "var(--magic)" : "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {checked && <I name="check" className="ico-xs" style={{ color: "#fff" }} strokeWidth={2.5} />}
                            </span>
                          ) : (
                            <button onClick={(e) => { e.stopPropagation(); onToggleExpanded(sec.id); }}
                                    style={{ background: "transparent", border: 0, padding: 0, width: 12, color: "var(--text-4)", cursor: "default", flexShrink: 0 }}>
                              <I name="chevright" className="ico-xs" style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s ease" }} />
                            </button>
                          )}
                          <I name={sectionIconFor(sec.type)} className="ico-sm ico-section" />
                          <span className="name">{sec.name}</span>
                          <span className="rowtools">
                            <button title="Masquer"><I name="eye" className="ico-xs" /></button>
                            <button title="Dupliquer"><I name="copy" className="ico-xs" /></button>
                            <button className="danger" title="Supprimer"><I name="trash" className="ico-xs" /></button>
                          </span>
                        </div>

                        {isOpen && !bulkMode && (
                          <div className="layer-children">
                            {fieldsFor(sec).map((f) => {
                              const fieldSelected = isSel && selectedElementId === f.id;
                              return (
                                <div key={f.id} className="layer-field" aria-selected={fieldSelected}
                                     onClick={(e) => { e.stopPropagation(); onSelectElement(sec.id, f.id); }}>
                                  <I name={fieldIconFor(f.kind)} className="ico-xs ico-kind" />
                                  <span className="lbl">{f.label}</span>
                                  {f.preview && <span className="prev">{f.preview}</span>}
                                </div>
                              );
                            })}
                            {sec.type === "Features" && (
                              <>
                                {FEATURE_BLOCKS.map((b, idx) => (
                                  <div key={b.id} style={{ marginTop: 2 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 8px 0 16px", height: 20, fontSize: 9.5, color: "var(--text-4)", fontFamily: "var(--font-mono)", letterSpacing: ".06em", textTransform: "uppercase" }}>
                                      <I name="box" className="ico-xs" />
                                      <span>Bloc {idx + 1} · {b.label}</span>
                                    </div>
                                    {FEATURE_BLOCK_FIELDS.map((bf) => (
                                      <div key={bf.id} className="layer-field" style={{ paddingLeft: 32 }}>
                                        <I name={fieldIconFor(bf.kind)} className="ico-xs ico-kind" />
                                        <span className="lbl">{bf.label}</span>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {sections.length === 0 && <div className="empty-row">aucune section</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {bulkMode && (
        <div style={{
          borderTop: "1px solid var(--border)",
          background: bulkSelected.size > 0 ? "var(--magic-tint)" : "var(--surface-2)",
          padding: "8px 10px",
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          {bulkSelected.size === 0 ? (
            <div style={{ fontSize: 10.5, color: "var(--text-3)", textAlign: "center" }}>Cochez des sections à régénérer en groupe</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10.5, fontFamily: "var(--font-mono)", color: "var(--magic)" }}>
                  {bulkSelected.size} section{bulkSelected.size !== 1 ? "s" : ""} sélectionnée{bulkSelected.size !== 1 ? "s" : ""}
                </span>
                <button className="btn ghost xs" onClick={() => {/* no-op */}}>Tout décocher</button>
              </div>
              <button className="btn magic" style={{ height: 28, justifyContent: "center" }}>
                <I name="sparkles" className="ico-sm" />Régénérer avec IA
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function sectionIconFor(type) {
  switch (type) {
    case "Navbar":   return "navigation";
    case "Hero":     return "imageIcon";
    case "Logos":    return "more";
    case "Features": return "layoutLeft";
    case "CTA":      return "send";
    case "Footer":   return "layoutBottom";
    case "Gallery":  return "image";
    case "Team":     return "user";
    case "Story":    return "textLong";
    case "Header":   return "type";
    case "Layout":   return "layoutLeft";
    case "Contact":  return "email";
    default:         return "block";
  }
}

function fieldIconFor(kind) {
  switch (kind) {
    case "image": return "imageIcon";
    case "button": return "mouse";
    case "link":  return "link";
    case "input": return "textShort";
    default:      return "type";
  }
}

function fieldsFor(section) {
  switch (section.type) {
    case "Hero":     return HERO_FIELDS;
    case "Navbar":   return NAVBAR_FIELDS;
    case "Features": return FEATURES_FIELDS;
    default: return [
      { id: "heading", kind: "text",  label: "Titre",       preview: "" },
      { id: "body",    kind: "text",  label: "Texte",       preview: "" },
    ];
  }
}

// ── Status bar ─────────────────────────────────────────────────────────────
function StatusBar({ workspace }) {
  return (
    <div className="statusbar">
      <span><span className="dot" />Connecté à Supabase</span>
      <span className="sep" />
      <span>5 pages · 23 sections · 4 modifs non publiées</span>
      <span className="sep" />
      <span>auto-save · 6 s</span>
      <span className="sep" />
      <span>vue : <b style={{ color: "var(--text-2)" }}>{workspace}</b></span>
      <span className="spacer" />
      <span><kbd>?</kbd> Raccourcis</span>
      <span className="sep" />
      <span><kbd>⌘</kbd><kbd>K</kbd> Commandes</span>
    </div>
  );
}

// Expose helpers + data for sibling babel scripts (workspaces, modals, mount)
Object.assign(window, {
  I, App,
  SITEMAP, SECTIONS_BY_PAGE,
  HERO_FIELDS, NAVBAR_FIELDS, FEATURES_FIELDS, FEATURE_BLOCK_FIELDS, FEATURE_BLOCKS,
  Section, Field, ToggleRow, ImageDropper, ButtonRow,
  sectionIconFor, fieldIconFor, fieldsFor,
});
