// site-builder-modals.jsx — All modals (themes, save theme, section picker, style-guide modals)

const { useState: useStateM, useEffect: useEffectM, useMemo: useMemoM } = React;

// ── Shared modal shell ───────────────────────────────────────────────────────
function ModalShell({ size = "md", title, subtitle, icon, iconKind = "accent", onClose, children, footer }) {
  useEffectM(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-shell ${size}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          {icon && <div className={`ic-wrap ${iconKind}`}><I name={icon} className="ico-sm" /></div>}
          <div className="grow">
            <div className="title">{title}</div>
            {subtitle && <div className="subtitle">{subtitle}</div>}
          </div>
          <button className="btn ghost xs icon" onClick={onClose} title="Fermer"><I name="x" className="ico-sm" /></button>
        </div>
        {children}
        {footer && <div className="modal-ft">{footer}</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Theme Library
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_THEMES = [
  { id: "th1", name: "Artisan chauffage — Warm",  desc: "Palette ambre/orange, serif éditorial pour PME chauffage/plomberie.", pages: 5, sections: 23, type: "Intégré",     featured: true,  swatches: ["#C14A1C","#181612","#F59E0B","#FFFAF2"] },
  { id: "th2", name: "Couvreur — Slate",          desc: "Look pro et sérieux, ardoise et bleu nuit.",                            pages: 5, sections: 21, type: "Intégré",                       swatches: ["#1E40AF","#0F172A","#94A3B8","#F8FAFC"] },
  { id: "th3", name: "Plombier urgentiste",       desc: "Hero rouge urgence, conversion forte, gros numéro.",                    pages: 4, sections: 18, type: "Intégré",                       swatches: ["#DC2626","#0F172A","#FCA5A5","#FFF7ED"] },
  { id: "th4", name: "Solaire éco — Verde",       desc: "Vert nature, doux, pour solaire/photovoltaïque.",                       pages: 6, sections: 26, type: "Intégré",                       swatches: ["#1F8A5B","#0F2E1F","#A7F3D0","#F0FDF4"] },
  { id: "th5", name: "Thermalis v3 (custom)",     desc: "Votre thème actuel — sauvegardé le 12/05.",                              pages: 5, sections: 23, type: "Votre thème",  current: true, swatches: ["#C14A1C","#181612","#F59E0B","#FFFAF2"] },
  { id: "th6", name: "Maison ossature bois",      desc: "Mémoire de marque chaleureuse, textures bois.",                          pages: 7, sections: 31, type: "Intégré",                       swatches: ["#A0522D","#3E2A1F","#D4A373","#FFF9F0"] },
];

function ThemeLibraryModal({ onClose }) {
  const [confirming, setConfirming] = useStateM(null);
  const [search, setSearch] = useStateM("");
  const filtered = MOCK_THEMES.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <ModalShell
      size="lg"
      title="Bibliothèque de thèmes"
      subtitle="Appliquer un thème remplace le style guide et la structure du site (les contenus sont conservés)."
      icon="palette" iconKind="accent"
      onClose={onClose}
    >
      <div className="modal-search">
        <div className="search-wrap">
          <I name="search" className="ico-sm" />
          <input className="input" placeholder="Rechercher un thème…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn outline sm" title="Filtrer par type"><I name="filter" className="ico-sm" />Type</button>
        <button className="btn outline sm" title="Trier"><I name="more" className="ico-sm" /></button>
      </div>

      <div className="modal-body">
        <div className="card-grid cols2">
          {filtered.map(theme => (
            <div key={theme.id} className="picker-card" style={{ borderRadius: 12 }}>
              <div className="preview" style={{ height: 110, padding: 14, alignItems: "flex-end", justifyContent: "flex-start", background: theme.swatches[3] }}>
                <span className={`badge ${theme.current ? "magic" : ""}`}>{theme.current ? "Actuel" : theme.type}</span>
                <div style={{ display: "flex", gap: 4, alignSelf: "flex-end" }}>
                  {theme.swatches.map((c, i) => (
                    <div key={i} style={{ width: 22, height: 22, borderRadius: 5, background: c, border: "1.5px solid #fff", boxShadow: "0 1px 2px rgba(0,0,0,.08)" }} />
                  ))}
                </div>
              </div>
              <div className="meta">
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span className="name" style={{ flex: 1 }}>{theme.name}</span>
                  {theme.featured && <I name="star" className="ico-xs" style={{ color: "var(--warn)" }} />}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.4, marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{theme.desc}</div>
                <div className="stats">
                  <span><I name="textShort" className="ico-xs" />{theme.pages} pages</span>
                  <span><I name="layers" className="ico-xs" />{theme.sections} sections</span>
                </div>
                {confirming === theme.id ? (
                  <div style={{ marginTop: 10, padding: 8, background: "rgba(200,136,31,.10)", border: "1px solid rgba(200,136,31,.30)", borderRadius: 6 }}>
                    <div style={{ fontSize: 10.5, color: "#8a5700", marginBottom: 6, lineHeight: 1.4 }}>
                      <I name="warning" className="ico-xs" style={{ verticalAlign: -1 }} /> Remplace le style + la structure des pages. Confirmer ?
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="btn primary xs" style={{ flex: 1, justifyContent: "center" }}><I name="check" className="ico-xs" />Confirmer</button>
                      <button className="btn outline xs" onClick={() => setConfirming(null)}>Annuler</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <button className="btn outline xs" style={{ flex: 1, justifyContent: "center" }} onClick={() => setConfirming(theme.id)}>
                      Appliquer
                    </button>
                    <button className="btn ghost xs icon" title="Aperçu"><I name="eye" className="ico-xs" /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Save As Theme
// ─────────────────────────────────────────────────────────────────────────────

function SaveAsThemeModal({ onClose }) {
  const [name, setName] = useStateM("Thermalis v3.2");
  const [desc, setDesc] = useStateM("");
  const [shared, setShared] = useStateM(false);

  return (
    <ModalShell
      size="sm"
      title="Enregistrer comme thème"
      subtitle="Réutilisez ce style guide + cette structure sur d'autres sites de votre catalogue."
      icon="bookmark" iconKind="accent"
      onClose={onClose}
      footer={<>
        <button className="btn outline" onClick={onClose}>Annuler</button>
        <button className="btn accent"><I name="bookmark" className="ico-sm" />Enregistrer</button>
      </>}
    >
      <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Nom du thème">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mon thème pro" />
        </Field>
        <Field label="Description" hint="optionnel">
          <textarea className="textarea" rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Pour qui ? Quels secteurs ? Quels usages ?" />
        </Field>
        <Field label="Aperçu généré">
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-2)" }}>
            <div style={{ width: 60, height: 60, borderRadius: 8, background: "#FFFAF2", display: "flex", flexDirection: "column", border: "1px solid var(--border)" }}>
              <div style={{ height: 8, background: "#181612" }} />
              <div style={{ flex: 1, padding: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ height: 4, background: "#C14A1C", borderRadius: 1 }} />
                <div style={{ height: 4, background: "rgba(20,18,14,.12)", borderRadius: 1 }} />
                <div style={{ height: 4, background: "rgba(20,18,14,.10)", width: "70%", borderRadius: 1 }} />
              </div>
            </div>
            <div style={{ flex: 1, fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5 }}>
              Captura automatiquement la page d'accueil comme miniature. Tu peux remplacer ensuite depuis Réglages.
            </div>
          </div>
        </Field>
        <ToggleRow label="Partager avec l'agence" desc="Visible par tous les membres Sama Digital." checked={shared} />
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section picker (Replace flow)
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_PICKER_CATS = ["Tous","Hero","Services","Content","Social Proof","Contact","CTA","Media","Footer"];

const SECTION_PICKER_ITEMS = [
  { id: "p-h1", name: "Hero 1 — Stack", cat: "Hero" },
  { id: "p-h2", name: "Hero 4 — Centered", cat: "Hero" },
  { id: "p-h3", name: "Hero 12 — Split", cat: "Hero", current: true },
  { id: "p-h4", name: "Hero 27 — Background image", cat: "Hero" },
  { id: "p-h5", name: "Hero 31 — Carousel", cat: "Hero" },
  { id: "p-h6", name: "Hero 18 — Video bg", cat: "Hero" },
  { id: "p-s1", name: "Layout 250 — 3 cols", cat: "Services" },
  { id: "p-s2", name: "Layout 408 — Grid", cat: "Services" },
  { id: "p-s3", name: "Layout 22 — Two col", cat: "Services" },
  { id: "p-p1", name: "Logo Bar 3", cat: "Social Proof" },
  { id: "p-p2", name: "Testimonial 14", cat: "Social Proof" },
  { id: "p-c1", name: "FAQ 4 — Accordion", cat: "Content" },
];

function SectionPickerModal({ onClose }) {
  const [search, setSearch] = useStateM("");
  const [cat, setCat] = useStateM("Hero");
  const [hover, setHover] = useStateM(null);

  const filtered = useMemoM(() =>
    SECTION_PICKER_ITEMS.filter(s =>
      (cat === "Tous" || s.cat === cat) &&
      s.name.toLowerCase().includes(search.toLowerCase())
    ), [search, cat]);

  return (
    <ModalShell
      size="lg"
      title="Remplacer la section"
      subtitle="Survolez pour prévisualiser dans le canvas, cliquez pour confirmer."
      icon="refresh" iconKind="info"
      onClose={onClose}
    >
      <div className="modal-search">
        <div className="search-wrap">
          <I name="search" className="ico-sm" />
          <input className="input" placeholder="Rechercher (Hero, FAQ, témoignages…)" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        </div>
      </div>
      <div className="modal-tabs">
        {SECTION_PICKER_CATS.map(c => (
          <button key={c} className="modal-tab" aria-selected={c === cat} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <div className="modal-body">
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-4)", fontSize: 12 }}>
            Aucune section ne correspond.
          </div>
        ) : (
          <div className="card-grid">
            {filtered.map(s => (
              <div key={s.id} className="picker-card" onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)}>
                <div className="preview">
                  {s.current && <span className="badge magic">Actuel</span>}
                  <PickerThumb cat={s.cat} />
                </div>
                <div className="meta">
                  <div className="name">{s.name}</div>
                  <div className="cat">{s.cat}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="modal-ft">
        <span style={{ fontSize: 11, color: "var(--text-3)", flex: 1, fontFamily: "var(--font-mono)" }}>
          {hover ? `Aperçu en cours : ${SECTION_PICKER_ITEMS.find(s => s.id === hover)?.name}` : `${filtered.length} sections disponibles`}
        </span>
        <button className="btn outline" onClick={onClose}>Annuler</button>
        <button className="btn accent" disabled={!hover}><I name="check" className="ico-sm" />Remplacer</button>
      </div>
    </ModalShell>
  );
}

// Tiny SVG thumbnail for each section category
function PickerThumb({ cat }) {
  const baseProps = { width: "100%", height: "100%", viewBox: "0 0 80 50", preserveAspectRatio: "none" };
  const bar = (x, y, w, h, op = .25) => <rect key={`${x},${y}`} x={x} y={y} width={w} height={h} fill="currentColor" opacity={op} rx={1} />;
  return (
    <svg {...baseProps} style={{ color: "var(--text-3)", opacity: .7 }}>
      {cat === "Hero" && (<>
        {bar(4, 6, 30, 3)}
        {bar(4, 12, 38, 5, .45)}
        {bar(4, 20, 30, 2, .2)}
        {bar(4, 25, 14, 5, .45)}
        <rect x={48} y={6} width={28} height={36} fill="currentColor" opacity=".15" rx={2} />
      </>)}
      {cat === "Services" && (<>
        {[0,1,2].map(i => <rect key={i} x={4 + i * 25} y={10} width={22} height={30} fill="currentColor" opacity=".15" rx={2} />)}
      </>)}
      {cat === "Social Proof" && (<>
        {[0,1,2,3,4].map(i => bar(4 + i * 15, 18, 12, 3, .25))}
        {bar(8, 8, 24, 3, .35)}
      </>)}
      {cat === "Content" && (<>
        {bar(4, 6, 22, 3, .35)}
        {bar(4, 12, 72, 3)}
        {bar(4, 18, 60, 3)}
        {bar(4, 24, 68, 3)}
        {bar(4, 30, 40, 3)}
      </>)}
      {cat === "CTA" && (<>
        <rect x={4} y={6} width={72} height={38} fill="currentColor" opacity=".10" rx={3} />
        {bar(10, 16, 36, 4, .45)}
        {bar(10, 24, 24, 2, .2)}
        <rect x={50} y={26} width={20} height={8} fill="currentColor" opacity=".5" rx={1.5} />
      </>)}
      {cat === "Contact" && (<>
        <rect x={4} y={6} width={34} height={38} fill="currentColor" opacity=".10" rx={2} />
        {bar(8, 10, 14, 2, .35)}
        <rect x={8} y={16} width={26} height={4} fill="currentColor" opacity=".18" rx={1} />
        <rect x={8} y={22} width={26} height={4} fill="currentColor" opacity=".18" rx={1} />
        <rect x={8} y={32} width={14} height={5} fill="currentColor" opacity=".5" rx={1.5} />
        <rect x={44} y={6} width={32} height={38} fill="currentColor" opacity=".15" rx={2} />
      </>)}
      {cat === "Media" && (<>
        {[0,1,2].map(j => [0,1].map(i => <rect key={`${i}-${j}`} x={4 + j * 25} y={4 + i * 22} width={22} height={18} fill="currentColor" opacity=".15" rx={1.5} />))}
      </>)}
      {cat === "Footer" && (<>
        <rect x={0} y={0} width={80} height={50} fill="currentColor" opacity=".06" />
        {[0,1,2,3].map(i => <g key={i}>
          {bar(4 + i * 19, 6, 14, 3, .4)}
          {bar(4 + i * 19, 14, 14, 2, .15)}
          {bar(4 + i * 19, 20, 11, 2, .15)}
          {bar(4 + i * 19, 26, 14, 2, .15)}
        </g>)}
      </>)}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Style Guide modals
// ─────────────────────────────────────────────────────────────────────────────

const PALETTE_CHIPS = [
  { name: "Sunset orange", hex: "#FF7043" },
  { name: "Cornflower",   hex: "#799DF3" },
  { name: "Manz",         hex: "#EFEF6D" },
  { name: "Malibu",       hex: "#74CEF2" },
  { name: "Mint",         hex: "#4CAF7D" },
  { name: "Lavender",     hex: "#A78BFA" },
  { name: "Rose",         hex: "#F43F5E" },
  { name: "Teal",         hex: "#14B8A6" },
];

function generateShadeStrip(baseHex) {
  // Generate 11 shades by mixing with white/black
  const r = parseInt(baseHex.slice(1,3), 16);
  const g = parseInt(baseHex.slice(3,5), 16);
  const b = parseInt(baseHex.slice(5,7), 16);
  const stops = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  return stops.map(stop => {
    const t = stop / 500;
    let nr, ng, nb;
    if (t < 1) {
      // mix with white
      const k = 1 - t;
      nr = Math.round(r + (255 - r) * k);
      ng = Math.round(g + (255 - g) * k);
      nb = Math.round(b + (255 - b) * k);
    } else {
      const k = Math.min(1, (t - 1) * .6);
      nr = Math.round(r * (1 - k));
      ng = Math.round(g * (1 - k));
      nb = Math.round(b * (1 - k));
    }
    return { stop, hex: "#" + [nr,ng,nb].map(n => n.toString(16).padStart(2, "0")).join("") };
  });
}

function HexInput({ label, value, onChange }) {
  return (
    <div>
      <div className="field-label"><span>{label}</span></div>
      <div className="hex-input-row">
        <div className="big-swatch" style={{ background: value }} />
        <input className="input" defaultValue={value} onBlur={(e) => onChange?.(e.target.value)} />
        <button className="btn ghost xs icon" title="Copier"><I name="copy" className="ico-xs" /></button>
      </div>
    </div>
  );
}

function ColorsModal({ onClose }) {
  const [colors, setColors] = useStateM({
    primary:    "#C14A1C",
    secondary:  "#181612",
    accent:     "#F59E0B",
    background: "#FFFAF2",
    backgroundAlt: "#FFEFE2",
    text:       "#1A1714",
    textMuted:  "#57514A",
  });
  const update = (k, v) => setColors(c => ({ ...c, [k]: v }));

  return (
    <ModalShell
      size="md" title="Couleurs" subtitle="Marque, fonds et textes. Cliquez une nuance pour copier son hex."
      icon="palette" iconKind="accent"
      onClose={onClose}
      footer={<>
        <button className="btn ghost"><I name="refresh" className="ico-sm" />Réinitialiser</button>
        <span style={{ flex: 1 }} />
        <button className="btn outline" onClick={onClose}>Annuler</button>
        <button className="btn primary"><I name="check" className="ico-sm" />Appliquer</button>
      </>}
    >
      <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div className="field-label" style={{ marginBottom: 0 }}><span>Couleurs de marque</span></div>
            <button className="btn outline xs"><I name="refresh" className="ico-xs" />Aléatoire</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            <HexInput label="Primaire"   value={colors.primary}   onChange={(v) => update("primary", v)} />
            <HexInput label="Secondaire" value={colors.secondary} onChange={(v) => update("secondary", v)} />
            <HexInput label="Accent"     value={colors.accent}    onChange={(v) => update("accent", v)} />
          </div>
        </div>

        <div>
          <div className="field-label"><span>Fonds &amp; texte</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
            <HexInput label="Fond"            value={colors.background}    onChange={(v) => update("background", v)} />
            <HexInput label="Fond alt."       value={colors.backgroundAlt} onChange={(v) => update("backgroundAlt", v)} />
            <HexInput label="Texte"           value={colors.text}          onChange={(v) => update("text", v)} />
            <HexInput label="Texte atténué"   value={colors.textMuted}     onChange={(v) => update("textMuted", v)} />
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div className="field-label" style={{ display: "flex", alignItems: "center" }}>
            <span>Nuances générées</span>
            <span className="hint">cliquer pour copier</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              ["Primaire", colors.primary],
              ["Secondaire", colors.secondary],
              ["Accent", colors.accent],
            ].map(([label, hex]) => (
              <div key={label}>
                <div style={{ fontSize: 10.5, color: "var(--text-4)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>{label}</div>
                <div className="shade-strip">
                  {generateShadeStrip(hex).map(s => (
                    <div key={s.stop} style={{ background: s.hex }} title={`${s.stop} · ${s.hex}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="field-label"><span>Palettes suggérées</span></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PALETTE_CHIPS.map(p => (
              <button key={p.name} title={p.name}
                onClick={() => update("primary", p.hex)}
                style={{ width: 30, height: 30, borderRadius: "50%", border: "2px solid #fff", boxShadow: "0 0 0 1px var(--border)", background: p.hex, cursor: "default" }} />
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

const GOOGLE_FONTS = [
  "Instrument Serif", "Fraunces", "Playfair Display", "Merriweather", "Bodoni Moda",
  "Geist", "Inter", "Söhne", "DM Sans", "Plus Jakarta Sans", "Work Sans", "Outfit",
  "Sora", "Space Grotesk", "Unbounded", "Manrope", "Poppins", "Montserrat",
];

function FontModal({ role, onClose }) {
  const isHead = role === "heading";
  const [search, setSearch] = useStateM("");
  const [current, setCurrent] = useStateM(isHead ? "Instrument Serif" : "Geist");
  const filtered = GOOGLE_FONTS.filter(f => f.toLowerCase().includes(search.toLowerCase()));

  return (
    <ModalShell
      size="sm" title={isHead ? "Police de titres" : "Police de corps"} subtitle="Google Fonts · chargée à la publication."
      icon="type" iconKind="accent"
      onClose={onClose}
      footer={<>
        <button className="btn ghost xs"><I name="refresh" className="ico-xs" />Aléatoire</button>
        <span style={{ flex: 1 }} />
        <button className="btn outline" onClick={onClose}>Annuler</button>
        <button className="btn primary">Appliquer</button>
      </>}
    >
      <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="modal-search" style={{ padding: 0, borderBottom: 0 }}>
          <div className="search-wrap">
            <I name="search" className="ico-sm" />
            <input className="input" placeholder="Rechercher une police…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          </div>
        </div>

        <div style={{ padding: 14, background: "var(--bg-2)", borderRadius: 10, border: "1px solid var(--border)" }}>
          <div style={{ fontFamily: `"${current}", ${isHead ? "serif" : "sans-serif"}`, fontSize: isHead ? 36 : 18, color: "var(--text)", lineHeight: 1.1 }}>
            {isHead ? "Aa Bb · L'eau chaude qui ne lâche jamais." : "The quick brown fox jumps over the lazy dog."}
          </div>
          <div style={{ fontFamily: `"${current}", ${isHead ? "serif" : "sans-serif"}`, fontSize: 12, color: "var(--text-3)", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
            {current} · 0123456789 · &amp; @ # → ←
          </div>
        </div>

        <div style={{ maxHeight: 220, overflow: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
          {filtered.map(f => (
            <button key={f} onClick={() => setCurrent(f)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", border: 0,
                borderBottom: "1px solid var(--border)",
                background: f === current ? "var(--text)" : "transparent",
                color: f === current ? "var(--bg)" : "var(--text)",
                cursor: "default",
                fontFamily: `"${f}", ${isHead ? "serif" : "sans-serif"}`,
                fontSize: 14, textAlign: "left",
              }}>
              <span>{f}</span>
              {f === current && <I name="check" className="ico-sm" />}
            </button>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

// Buttons modal
const BUTTON_PRESETS = [
  { id: "modern",  label: "Modern",  radius: 8, fill: true },
  { id: "rounded", label: "Rounded", radius: 999, fill: true },
  { id: "sharp",   label: "Sharp",   radius: 0, fill: true },
  { id: "outline", label: "Outline", radius: 8, fill: false },
  { id: "soft",    label: "Soft",    radius: 12, fill: true, soft: true },
  { id: "custom",  label: "Custom",  radius: 8, fill: true },
];

function ButtonsModal({ onClose }) {
  const [preset, setPreset] = useStateM("modern");
  const [tab, setTab] = useStateM("primary");
  const [style, setStyle] = useStateM("filled");
  const [radius, setRadius] = useStateM(8);
  const [padding, setPadding] = useStateM("12px 20px");
  const [shadow, setShadow] = useStateM(true);

  const preview = (filled) => (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: filled ? (tab === "primary" ? "#C14A1C" : "#181612") : "transparent",
      color: filled ? "#fff" : (tab === "primary" ? "#C14A1C" : "#181612"),
      border: filled ? "0" : `1.5px solid ${tab === "primary" ? "#C14A1C" : "#181612"}`,
      padding, borderRadius: radius,
      fontSize: 13, fontWeight: 600,
      boxShadow: shadow && filled ? "0 4px 12px rgba(20,18,14,.12)" : "none",
    }}>Demander un devis <I name="arrow" className="ico-sm" /></span>
  );

  return (
    <ModalShell
      size="md" title="Boutons CTA"
      subtitle="Configure les styles cta-primary et cta-secondary appliqués sur tout le site."
      icon="mouse" iconKind="accent"
      onClose={onClose}
      footer={<>
        <span style={{ flex: 1 }} />
        <button className="btn outline" onClick={onClose}>Annuler</button>
        <button className="btn primary">Appliquer</button>
      </>}
    >
      <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div className="field-label"><span>Preset</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {BUTTON_PRESETS.map(p => (
              <button key={p.id}
                className="btn outline xs"
                style={{
                  height: 30, justifyContent: "center",
                  background: preset === p.id ? "var(--text)" : "var(--surface)",
                  color: preset === p.id ? "var(--bg)" : "var(--text)",
                  borderColor: preset === p.id ? "var(--text)" : "var(--border-2)",
                }}
                onClick={() => { setPreset(p.id); if (p.id !== "custom") setRadius(p.radius); }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="seg" style={{ width: "100%" }}>
          {["primary","secondary"].map(t => (
            <button key={t} style={{ flex: 1, justifyContent: "center" }} aria-pressed={tab === t} onClick={() => setTab(t)}>
              {t === "primary" ? "Bouton principal" : "Bouton secondaire"}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {[{ id: "filled", label: "Plein" }, { id: "outline", label: "Contour" }, { id: "soft", label: "Doux" }, { id: "ghost", label: "Ghost" }].map(s => (
            <button key={s.id}
              className="btn outline xs"
              style={{
                height: 28, justifyContent: "center",
                background: style === s.id ? "var(--text)" : "var(--surface)",
                color: style === s.id ? "var(--bg)" : "var(--text)",
                borderColor: style === s.id ? "var(--text)" : "var(--border-2)",
              }}
              onClick={() => setStyle(s.id)}>
              {s.label}
            </button>
          ))}
        </div>

        <Field label="Couleurs (override)">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {[["Fond","#C14A1C"],["Texte","#FFFFFF"],["Bordure","#C14A1C"]].map(([l, v]) => (
              <div key={l}>
                <div style={{ fontSize: 10, color: "var(--text-4)", marginBottom: 4 }}>{l}</div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <div className="big-swatch" style={{ width: 28, height: 28, background: v }} />
                  <input className="input mono" style={{ fontSize: 11, height: 26 }} defaultValue={v} />
                </div>
              </div>
            ))}
          </div>
        </Field>

        <div className="range-row">
          <label>Arrondi</label>
          <input type="range" min={0} max={32} value={radius} onChange={(e) => setRadius(parseInt(e.target.value))} />
          <span className="val">{radius} px</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[{ l: "Carré", v: 0 }, { l: "Sm", v: 4 }, { l: "Md", v: 8 }, { l: "Lg", v: 16 }, { l: "Pilule", v: 999 }].map(({ l, v }) => (
            <button key={v}
              className="btn outline xs"
              style={{
                flex: 1, justifyContent: "center", height: 26,
                background: radius === v ? "var(--text)" : "var(--surface)",
                color: radius === v ? "var(--bg)" : "var(--text-2)",
                borderColor: radius === v ? "var(--text)" : "var(--border-2)",
              }} onClick={() => setRadius(v)}>{l}</button>
          ))}
        </div>

        <Field label="Padding">
          <input className="input mono" value={padding} onChange={(e) => setPadding(e.target.value)} />
        </Field>

        <ToggleRow label="Ombre portée" desc="Ajoute une légère ombre dynamique au survol." checked={shadow} />

        <div style={{ padding: 22, background: "var(--bg-2)", borderRadius: 8, border: "1px solid var(--border)", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "var(--text-4)", marginBottom: 10, fontFamily: "var(--font-mono)", letterSpacing: ".06em", textTransform: "uppercase" }}>Aperçu</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            {preview(true)}
            {preview(false)}
          </div>
        </div>

        <div className="alert-soft info">
          <I name="warning" className="ico-sm" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong>Convention :</strong> ajouter <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "rgba(42,111,219,.15)", padding: "1px 4px", borderRadius: 3 }}>cta-primary</code> ou <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "rgba(42,111,219,.15)", padding: "1px 4px", borderRadius: 3 }}>cta-secondary</code> sur tes boutons d'action pour appliquer ce style.
          </span>
        </div>
      </div>
    </ModalShell>
  );
}

// Cards modal
function CardsModal({ onClose }) {
  const [radius, setRadius] = useStateM(12);
  const [imgRadius, setImgRadius] = useStateM(12);
  const [shadow, setShadow] = useStateM("sm");
  const [border, setBorder] = useStateM(1);

  const shadowMap = {
    none: "none",
    sm:   "0 1px 2px rgba(20,18,14,.06)",
    md:   "0 4px 8px rgba(20,18,14,.10)",
    lg:   "0 10px 20px rgba(20,18,14,.12)",
  };

  return (
    <ModalShell
      size="md" title="Cartes & images"
      subtitle="Apparence par défaut des cartes de feature, témoignages, blog, etc."
      icon="block" iconKind="accent"
      onClose={onClose}
      footer={<>
        <span style={{ flex: 1 }} />
        <button className="btn outline" onClick={onClose}>Annuler</button>
        <button className="btn primary">Appliquer</button>
      </>}
    >
      <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="range-row">
          <label>Arrondi cartes</label>
          <input type="range" min={0} max={32} value={radius} onChange={(e) => setRadius(parseInt(e.target.value))} />
          <span className="val">{radius} px</span>
        </div>

        <div className="range-row">
          <label>Arrondi images</label>
          <input type="range" min={0} max={32} value={imgRadius} onChange={(e) => setImgRadius(parseInt(e.target.value))} />
          <span className="val">{imgRadius} px</span>
        </div>

        <Field label="Ombre">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
            {["none","sm","md","lg"].map(s => (
              <button key={s}
                className="btn outline xs"
                style={{
                  height: 30, justifyContent: "center",
                  background: shadow === s ? "var(--text)" : "var(--surface)",
                  color: shadow === s ? "var(--bg)" : "var(--text)",
                  borderColor: shadow === s ? "var(--text)" : "var(--border-2)",
                }} onClick={() => setShadow(s)}>
                {s === "none" ? "Aucune" : s.toUpperCase()}
              </button>
            ))}
          </div>
        </Field>

        <div className="range-row">
          <label>Bordure</label>
          <input type="range" min={0} max={6} value={border} onChange={(e) => setBorder(parseInt(e.target.value))} />
          <span className="val">{border} px</span>
        </div>

        <div style={{ padding: 22, background: "var(--bg-2)", borderRadius: 8, border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--text-4)", marginBottom: 14, fontFamily: "var(--font-mono)", letterSpacing: ".06em", textTransform: "uppercase", textAlign: "center" }}>Aperçu</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {["#FFFAF2","#FFEFE2","#E9F1F8"].map((bg, i) => (
              <div key={i} style={{
                background: bg, borderRadius: radius,
                boxShadow: shadowMap[shadow],
                border: `${border}px solid rgba(20,18,14,.10)`,
                aspectRatio: "1/1",
                padding: 10,
                display: "flex", flexDirection: "column", gap: 6,
              }}>
                <div style={{ background: "rgba(20,18,14,.10)", borderRadius: imgRadius, height: "55%" }} />
                <div style={{ background: "rgba(20,18,14,.16)", borderRadius: 3, height: 8, width: "70%" }} />
                <div style={{ background: "rgba(20,18,14,.10)", borderRadius: 3, height: 6, width: "85%" }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// Expose
Object.assign(window, {
  ThemeLibraryModal, SaveAsThemeModal, SectionPickerModal,
  ColorsModal, FontModal, ButtonsModal, CardsModal,
});
