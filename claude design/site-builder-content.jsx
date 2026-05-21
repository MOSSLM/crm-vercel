// site-builder-content.jsx — Contenu workspace (schema-driven, with tag simulator)

const { useState: useStateC, useMemo: useMemoC, useRef: useRefC, useEffect: useEffectC, useCallback: useCallbackC } = React;

// ─── Schemas ───────────────────────────────────────────────────────────────
// Each section type declares its content schema. Fields drive the form in the
// center area; the rest of the app (preview, AI regen) reads the same shape.
// The user remark: "les schemas de sections prennent tout leur sens" — this is
// exactly where they pay off: one schema, used by:
//   1. the Contenu editor (this file)
//   2. the live preview (already in site-builder-app.jsx via MockSection)
//   3. the AI prompt builder (mentioned in PR but not shown here)

const SECTION_SCHEMAS = {
  Navbar: {
    label: "Navigation",
    fields: [
      { id: "logo",  kind: "image",  label: "Logo",       hint: "SVG · 256×64" },
      { id: "menu",  kind: "links",  label: "Liens menu", hint: "5 max" },
      { id: "cta",   kind: "button", label: "CTA",        link: true },
    ],
  },
  Hero: {
    label: "Hero",
    fields: [
      { id: "eyebrow",  kind: "text",     label: "Eyebrow" },
      { id: "heading",  kind: "longtext", label: "Titre" },
      { id: "subhead",  kind: "longtext", label: "Sous-titre" },
      { id: "cta_primary",   kind: "button", label: "CTA primaire",   primary: true,  link: true },
      { id: "cta_secondary", kind: "button", label: "CTA secondaire",                  link: true },
      { id: "image",    kind: "image",    label: "Visuel", hint: "ratio 4:3" },
    ],
  },
  Header: {
    label: "Header",
    fields: [
      { id: "kicker",   kind: "text",     label: "Kicker" },
      { id: "heading",  kind: "longtext", label: "Titre" },
      { id: "subhead",  kind: "longtext", label: "Sous-titre" },
    ],
  },
  Logos: {
    label: "Logo bar",
    fields: [
      { id: "kicker", kind: "text", label: "Eyebrow" },
      { id: "logos", kind: "blocks", label: "Marques", item: "logo",
        defaults: [
          { id: "l1", value: "Saunier Duval" },
          { id: "l2", value: "Atlantic" },
          { id: "l3", value: "De Dietrich" },
          { id: "l4", value: "Frisquet" },
          { id: "l5", value: "Vaillant" },
          { id: "l6", value: "Viessmann" },
        ],
      },
    ],
  },
  Features: {
    label: "Features",
    fields: [
      { id: "kicker",  kind: "text",     label: "Kicker" },
      { id: "heading", kind: "longtext", label: "Titre" },
      { id: "blocks",  kind: "blocks",   label: "Cartes", item: "feature",
        defaults: [
          { id: "b1", title: "Intervention rapide", body: "Un technicien chez vous sous 4 h.", tag: "depannage" },
          { id: "b2", title: "Garantie 10 ans",     body: "Pièces et main-d'œuvre couvertes.", tag: null },
          { id: "b3", title: "Aides MaPrimeRénov'", body: "On monte votre dossier, sans frais.", tag: "pac" },
        ],
      },
    ],
  },
  Layout: {
    label: "Grille services",
    fields: [
      { id: "kicker",  kind: "text",     label: "Kicker" },
      { id: "heading", kind: "longtext", label: "Titre" },
      { id: "blocks",  kind: "blocks",   label: "Services", item: "service",
        defaults: [
          { id: "g1", title: "Dépannage",   body: "Urgence 7j/7.", tag: "depannage" },
          { id: "g2", title: "Chaudière",   body: "Installation et entretien.", tag: "chaudiere" },
          { id: "g3", title: "PAC",         body: "Air/eau et air/air.", tag: "pac" },
          { id: "g4", title: "Solaire",     body: "Thermique et photovoltaïque.", tag: "solaire" },
          { id: "g5", title: "Plomberie",   body: "Sanitaire complet.", tag: "plomberie" },
          { id: "g6", title: "Entretien",   body: "Contrat annuel.", tag: null },
        ],
      },
    ],
  },
  Gallery: {
    label: "Galerie",
    fields: [
      { id: "heading", kind: "longtext", label: "Titre" },
      { id: "images",  kind: "blocks",   label: "Photos", item: "image",
        defaults: [
          { id: "g1", value: "realisation-01.jpg" },
          { id: "g2", value: "realisation-02.jpg" },
          { id: "g3", value: "realisation-03.jpg" },
          { id: "g4", value: "realisation-04.jpg" },
        ],
      },
    ],
  },
  Story: {
    label: "Histoire",
    fields: [
      { id: "kicker",  kind: "text",     label: "Kicker" },
      { id: "heading", kind: "longtext", label: "Titre" },
      { id: "body",    kind: "longtext", label: "Texte" },
      { id: "image",   kind: "image",    label: "Photo" },
    ],
  },
  Team: {
    label: "Équipe",
    fields: [
      { id: "heading", kind: "longtext", label: "Titre" },
      { id: "blocks",  kind: "blocks",   label: "Membres", item: "membre",
        defaults: [
          { id: "t1", title: "Mathieu Bertrand", body: "Fondateur · 1987" },
          { id: "t2", title: "Sofiane Belkacem",  body: "Chef d'équipe" },
          { id: "t3", title: "Élodie Marchand",   body: "Responsable atelier" },
        ],
      },
    ],
  },
  CTA: {
    label: "CTA",
    fields: [
      { id: "heading",     kind: "longtext", label: "Titre" },
      { id: "subhead",     kind: "text",     label: "Sous-titre" },
      { id: "cta_primary", kind: "button",   label: "Bouton",  primary: true, link: true },
      { id: "phone",       kind: "text",     label: "Téléphone" },
    ],
  },
  Contact: {
    label: "Contact",
    fields: [
      { id: "heading", kind: "longtext", label: "Titre" },
      { id: "subhead", kind: "longtext", label: "Sous-titre" },
      { id: "form",    kind: "form",     label: "Formulaire",     ref: "Contact 16" },
      { id: "phone",   kind: "text",     label: "Téléphone" },
      { id: "email",   kind: "text",     label: "Email" },
    ],
  },
  Footer: {
    label: "Footer",
    fields: [
      { id: "tagline",  kind: "text",   label: "Tagline" },
      { id: "columns",  kind: "blocks", label: "Colonnes liens", item: "colonne",
        defaults: [
          { id: "c1", title: "Services", body: "Dépannage · Chaudière · PAC · Solaire" },
          { id: "c2", title: "Société",  body: "À propos · Avis · Recrutement" },
        ],
      },
      { id: "legal",    kind: "text",   label: "Mention légale" },
    ],
  },
};

// Service tags exposed by the enterprise. Used to filter blocks/pages.
const SERVICE_TAGS = [
  { id: "chaudiere", label: "Chaudière" },
  { id: "pac",       label: "Pompe à chaleur" },
  { id: "solaire",   label: "Solaire" },
  { id: "depannage", label: "Dépannage" },
  { id: "plomberie", label: "Plomberie" },
  { id: "entretien", label: "Entretien" },
];

// Default chiffres clés / stats (enterprise-scoped)
const DEFAULT_STATS = [
  { id: "s1", value: "+250",  label: "clients fidèles" },
  { id: "s2", value: "10 ans", label: "garantie pièces & MO" },
  { id: "s3", value: "< 4 h",  label: "intervention urgence" },
  { id: "s4", value: "1987",   label: "depuis" },
];

// Pre-filled content per section (the "values" side of the schema).
const SAMPLE_CONTENT = {
  s1: { /* Navbar */
    cta: { label: "Demander un devis", link: "/contact" },
  },
  s2: { /* Hero on home */
    eyebrow: "Plombier-chauffagiste · Lyon",
    heading: "Une eau chaude qui ne vous lâche jamais.",
    subhead: "Dépannage 7j/7 dans tout le Rhône. Devis sous 24 h, intervention sous 4 h en urgence.",
    cta_primary:   { label: "Obtenir mon devis →", link: "/contact", tag: null },
    cta_secondary: { label: "Voir nos réalisations", link: "/realisations", tag: null },
    image: "hero-chaudiere.jpg",
  },
  s3: { kicker: "Ils nous font confiance" },
  s4: { /* Features */
    kicker: "Pourquoi nous",
    heading: "Trois engagements tenus.",
  },
  s5: { /* CTA home */
    heading: "Une urgence ? On est là.",
    subhead: "Standard ouvert 7j/7 · réponse en moins de 5 min.",
    cta_primary: { label: "Demander un devis", link: "/contact", tag: null },
    phone: "04 78 00 00 00",
  },
  s6: { /* Footer */
    tagline: "Plombier-chauffagiste depuis 1987 · Lyon, Villeurbanne, Bron.",
    legal: "© 2026 Thermalis SARL · SIREN 488 220 117",
  },
  s8: { /* Services header */
    kicker: "Services",
    heading: "Tout ce qu'on fait pour vous.",
    subhead: "De la pose d'une PAC à la fuite d'un dimanche soir.",
  },
};

// ─── ContentWorkspace ──────────────────────────────────────────────────────

function ContentWorkspace({ activePage, onActivePage }) {
  // Selected section + selected block-inside-section
  const [selectedId, setSelectedId] = useStateC("s2"); // start on the Hero
  const [selectedBlockId, setSelectedBlockId] = useStateC(null);

  // Tag state — "real" = on the enterprise; "simulated" = override
  const [realTags] = useStateC(["chaudiere", "depannage"]);
  const [simulatedTags, setSimulatedTags] = useStateC(null); // null = use real
  const activeTags = simulatedTags ?? realTags;
  const isSimulating = simulatedTags !== null;

  // Content store: { [sectionId]: { ...values, _tag, _hidden, blocks: {bid:{tag}} } }
  const [content, setContent] = useStateC(() => {
    const init = {};
    (SITEMAP || []).forEach((p) => {
      (SECTIONS_BY_PAGE[p.slug] || []).forEach((sec) => {
        init[sec.id] = {
          ...(SAMPLE_CONTENT[sec.id] || {}),
          _tag: null,
          _hidden: false,
          _blockTags: {},
        };
        // seed block tags from defaults
        const schema = SECTION_SCHEMAS[sec.type];
        if (schema) {
          schema.fields.forEach((f) => {
            if (f.kind === "blocks" && f.defaults) {
              f.defaults.forEach((d) => {
                if (d.tag) init[sec.id]._blockTags[d.id] = d.tag;
              });
            }
          });
        }
      });
    });
    return init;
  });

  // Page tag (whole page filterable). Seed e.g. /realisations behind "depannage".
  const [pageTags] = useStateC({});

  // Stats (chiffres clés)
  const [stats, setStats] = useStateC(DEFAULT_STATS);
  const [statsSavedSnap, setStatsSavedSnap] = useStateC(DEFAULT_STATS);
  const statsDirty = useMemoC(() => {
    return JSON.stringify(stats) !== JSON.stringify(statsSavedSnap);
  }, [stats, statsSavedSnap]);

  // Helpers
  const sectionsForPage = SECTIONS_BY_PAGE[activePage] || [];

  function tagVisible(tag) {
    if (!tag) return true;
    return activeTags.includes(tag);
  }
  function sectionVisible(sec) {
    const c = content[sec.id];
    if (c?._hidden) return false;
    if (c?._tag && !tagVisible(c._tag)) return false;
    return true;
  }

  function patchSection(sid, patch) {
    setContent((prev) => ({ ...prev, [sid]: { ...prev[sid], ...patch } }));
  }
  function setBlockTag(sid, bid, tag) {
    setContent((prev) => ({
      ...prev,
      [sid]: {
        ...prev[sid],
        _blockTags: { ...(prev[sid]._blockTags || {}), [bid]: tag },
      },
    }));
  }

  function toggleSimTag(tagId) {
    const base = simulatedTags ?? realTags;
    const next = base.includes(tagId) ? base.filter((t) => t !== tagId) : [...base, tagId];
    setSimulatedTags(next);
  }
  function clearSim() { setSimulatedTags(null); }

  function saveStats() {
    setStatsSavedSnap(stats);
  }

  const selectedSection = sectionsForPage.find((s) => s.id === selectedId)
    || sectionsForPage[0]
    || null;

  return (
    <div className="ct-grid">
      {/* ───────── Left pane ───────── */}
      <aside className="ct-left">
        <div className="pane-hd contextual">
          <div className="title-with-icon">
            <I name="textShort" className="ico-sm" />
            <span>Contenu</span>
          </div>
          <div className="actions">
            <span className="pill">{sectionsForPage.length} sections</span>
          </div>
        </div>

        <div className="pane-body">
          {/* Page picker */}
          <div className="section">
            <div className="section-hd" aria-expanded="true">
              <I name="chevdown" className="ico-xs chev" />
              <span>Page</span>
            </div>
            <div className="ct-page-select" style={{ paddingBottom: 12 }}>
              {SITEMAP.map((p, i) => {
                const pTag = pageTags[p.slug];
                const hidden = pTag && !tagVisible(pTag);
                return (
                  <button key={p.id}
                    className="ct-page-row"
                    aria-selected={activePage === p.slug}
                    data-hidden={hidden ? "true" : "false"}
                    onClick={() => onActivePage(p.slug)}>
                    <span className="pgnum">{String(i + 1).padStart(2, "0")}</span>
                    <span className="pname">{p.title}</span>
                    <span className="pslug">{p.slug}</span>
                    <span className="pcount">{(SECTIONS_BY_PAGE[p.slug] || []).length}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sections of active page */}
          <div className="section">
            <div className="section-hd" aria-expanded="true">
              <I name="chevdown" className="ico-xs chev" />
              <span>Sections</span>
              <span className="count">{sectionsForPage.length}</span>
            </div>
            <div className="ct-sec-list" style={{ paddingBottom: 12 }}>
              {sectionsForPage.map((sec) => {
                const c = content[sec.id] || {};
                const taggedCount = Object.values(c._blockTags || {}).filter(Boolean).length
                  + (c._tag ? 1 : 0);
                const visible = sectionVisible(sec);
                return (
                  <button key={sec.id} className="ct-sec-row"
                    aria-selected={selectedId === sec.id}
                    onClick={() => { setSelectedId(sec.id); setSelectedBlockId(null); }}>
                    <span className="stype">{sec.type}</span>
                    <span className="sname">{sec.name}</span>
                    {!visible && <I name="eyeOff" className="ico-xs hide-ic" />}
                    {taggedCount > 0 && (
                      <span className="tagbadge" title={`${taggedCount} élément(s) tagué(s)`}>
                        <I name="bookmark" className="ico-xs" />{taggedCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chiffres clés */}
          <div className="section">
            <div className="section-hd" aria-expanded="true">
              <I name="chevdown" className="ico-xs chev" />
              <span>Chiffres clés</span>
              <span className="count">entreprise</span>
            </div>
            <div className="ct-stats">
              <div className="ct-stats-hd">
                <h4>
                  <I name="variable2" className="ico-sm" style={{ color: "var(--text-3)" }} />
                  Stats
                </h4>
                <button className="btn ghost xs"
                  onClick={() => setStats((s) => [...s, { id: "n" + Date.now(), value: "", label: "" }])}>
                  <I name="plus" className="ico-xs" />Ajouter
                </button>
              </div>
              <p className="hint">
                Stockés sur l'entreprise, injectés automatiquement dans toute section <code style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-2)" }}>kind=stats</code>.
              </p>
              {stats.length === 0 ? (
                <p className="ct-stat-empty">Aucun chiffre clé.</p>
              ) : (
                stats.map((s, i) => (
                  <div key={s.id} className="ct-stat-row">
                    <input className="input mono val" value={s.value}
                      onChange={(e) => setStats((arr) => arr.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                      placeholder="500" />
                    <input className="input" value={s.label}
                      onChange={(e) => setStats((arr) => arr.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      placeholder="clients satisfaits" />
                    <button className="del" title="Supprimer"
                      onClick={() => setStats((arr) => arr.filter((_, j) => j !== i))}>
                      <I name="trash" className="ico-xs" />
                    </button>
                  </div>
                ))
              )}
              <button className={"btn " + (statsDirty ? "primary" : "subtle")}
                style={{ width: "100%", justifyContent: "center", marginTop: 10, height: 28 }}
                onClick={saveStats}
                disabled={!statsDirty}>
                {statsDirty
                  ? (<><I name="save" className="ico-sm" />Enregistrer</>)
                  : (<><I name="check" className="ico-sm" style={{ color: "var(--ok)" }} />À jour</>)}
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ───────── Center pane ───────── */}
      <div className="ct-mid">
        <TagSimulatorBar
          tags={SERVICE_TAGS}
          realTags={realTags}
          activeTags={activeTags}
          isSimulating={isSimulating}
          onToggle={toggleSimTag}
          onClear={clearSim} />

        <div style={{ padding: "10px 18px 0" }}>
          <SchemaCallout />
        </div>

        <div className="ct-scroll">
          {sectionsForPage.length === 0 && (
            <div style={{ padding: 60, textAlign: "center", color: "var(--text-4)" }}>
              Aucune section sur cette page.
            </div>
          )}

          {sectionsForPage.map((sec) => {
            const c = content[sec.id] || {};
            const schema = SECTION_SCHEMAS[sec.type];
            const visible = sectionVisible(sec);
            return (
              <SectionContentCard
                key={sec.id}
                section={sec}
                schema={schema}
                content={c}
                selected={selectedId === sec.id}
                selectedBlockId={selectedId === sec.id ? selectedBlockId : null}
                hidden={!visible}
                activeTags={activeTags}
                onSelect={() => { setSelectedId(sec.id); setSelectedBlockId(null); }}
                onSelectBlock={(bid) => { setSelectedId(sec.id); setSelectedBlockId(bid); }}
                onPatch={(patch) => patchSection(sec.id, patch)}
                onSetBlockTag={(bid, tag) => setBlockTag(sec.id, bid, tag)}
              />
            );
          })}
        </div>
      </div>

      {/* ───────── Right pane ───────── */}
      <aside className="ct-right">
        <ContentInspector
          section={selectedSection}
          content={selectedSection ? content[selectedSection.id] : null}
          blockId={selectedBlockId}
          activeTags={activeTags}
          schema={selectedSection ? SECTION_SCHEMAS[selectedSection.type] : null}
          onPatch={(patch) => selectedSection && patchSection(selectedSection.id, patch)}
          onSetBlockTag={(bid, tag) => selectedSection && setBlockTag(selectedSection.id, bid, tag)}
        />
      </aside>
    </div>
  );
}

// ─── Tag simulator bar ─────────────────────────────────────────────────────

function TagSimulatorBar({ tags, realTags, activeTags, isSimulating, onToggle, onClear }) {
  return (
    <div className="ct-simbar">
      <span className="lead">
        <span className="flask"><I name="variable2" className="ico-xs" /></span>
        Simuler tags entreprise
      </span>
      <div className="chips">
        {tags.map((t) => {
          const on = activeTags.includes(t.id);
          const isReal = realTags.includes(t.id);
          return (
            <button key={t.id}
              className="ct-tag-chip"
              aria-pressed={on}
              data-real={isReal ? "true" : "false"}
              title={isReal ? "Tag réel de l'entreprise" : "Tag simulé"}
              onClick={() => onToggle(t.id)}>
              {t.label}
            </button>
          );
        })}
      </div>
      {isSimulating && (
        <button className="reset" onClick={onClear}>
          <I name="undo" className="ico-xs" />Tags réels
        </button>
      )}
    </div>
  );
}

// ─── Schema callout ────────────────────────────────────────────────────────

function SchemaCallout() {
  const [open, setOpen] = useStateC(true);
  if (!open) return null;
  return (
    <div className="ct-schema-callout">
      <I name="sparkles" className="ico-sm" />
      <span>
        <b>Cet onglet édite directement le schéma de chaque section.</b>{" "}
        Les champs sont déclarés une fois, réutilisés par l'éditeur, le preview, l'IA et le moteur de variables.
      </span>
      <button className="x" onClick={() => setOpen(false)} title="Masquer">
        <I name="x" className="ico-xs" />
      </button>
    </div>
  );
}

// ─── Section content card (schema-driven) ─────────────────────────────────

function SectionContentCard({ section, schema, content, selected, selectedBlockId,
  hidden, activeTags, onSelect, onSelectBlock, onPatch, onSetBlockTag }) {

  return (
    <div className="ct-card"
      data-selected={selected ? "true" : "false"}
      data-hidden={hidden ? "true" : "false"}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}>

      {/* Header */}
      <div className="ct-card-hd">
        <span className="type">{section.type}</span>
        <span className="name">{section.name}</span>
        {content._tag && (
          <span className="tagged" title={`Section affichée uniquement si tag = ${content._tag}`}>
            <I name="bookmark" className="ico-xs" />{labelForTag(content._tag)}
          </span>
        )}
        <div className="actions">
          <SectionTagControl
            tag={content._tag}
            onChange={(t) => onPatch({ _tag: t })} />
          <button className="btn ghost xs icon"
            title={content._hidden ? "Réafficher" : "Masquer"}
            onClick={(e) => { e.stopPropagation(); onPatch({ _hidden: !content._hidden }); }}>
            <I name={content._hidden ? "eyeOff" : "eye"} className="ico-xs" />
          </button>
        </div>
      </div>

      {hidden && (
        <div className="ct-hidden-banner">
          <I name="eyeOff" className="ico-xs" />
          Masquée pour les tags actifs ({content._tag ? `requiert "${labelForTag(content._tag)}"` : "section désactivée"})
        </div>
      )}

      {/* Schema-driven body */}
      {schema ? (
        <div className="ct-card-body">
          {schema.fields.map((f) => (
            <SchemaField
              key={f.id}
              field={f}
              value={content[f.id]}
              blockTags={content._blockTags || {}}
              activeTags={activeTags}
              selectedBlockId={selectedBlockId}
              onChange={(v) => onPatch({ [f.id]: v })}
              onSelectBlock={onSelectBlock}
              onSetBlockTag={onSetBlockTag} />
          ))}
        </div>
      ) : (
        <div className="ct-card-body">
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-4)", fontStyle: "italic" }}>
            Pas de schéma déclaré pour le type <code style={{ fontFamily: "var(--font-mono)" }}>{section.type}</code>.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Schema field renderer ────────────────────────────────────────────────

function SchemaField({ field, value, blockTags, activeTags, selectedBlockId,
  onChange, onSelectBlock, onSetBlockTag }) {

  return (
    <div className="ct-field" onClick={(e) => e.stopPropagation()}>
      <div className="ct-field-lbl">
        <span className="name">{field.label}</span>
        <span className="kind">{field.kind}{field.hint ? ` · ${field.hint}` : ""}</span>
      </div>

      <div className="ct-field-val">
        {field.kind === "text" && (
          <input className="input" value={value ?? ""}
            onChange={(e) => onChange(e.target.value)} placeholder={field.label} />
        )}
        {field.kind === "longtext" && (
          <textarea className="textarea" rows={2} value={value ?? ""}
            onChange={(e) => onChange(e.target.value)} placeholder={field.label} />
        )}
        {field.kind === "image" && (
          <div className="ct-img">
            <span className="thumb"><I name="imageIcon" className="ico-sm" /></span>
            <div className="info">
              <div className="fname">{value || "—"}</div>
              <div className="desc">déposer ou cliquer</div>
            </div>
            <button className="btn ghost xs"><I name="upload" className="ico-xs" /></button>
          </div>
        )}
        {field.kind === "button" && (
          <ButtonField value={value || {}} field={field}
            onChange={(v) => onChange({ ...(value || {}), ...v })} />
        )}
        {field.kind === "links" && (
          <div className="ct-img">
            <span className="thumb"><I name="navigation" className="ico-sm" /></span>
            <div className="info">
              <div className="fname">Menu principal</div>
              <div className="desc">{field.hint}</div>
            </div>
            <button className="btn ghost xs"><I name="settings" className="ico-xs" /></button>
          </div>
        )}
        {field.kind === "form" && (
          <div className="ct-img">
            <span className="thumb"><I name="textShort" className="ico-sm" /></span>
            <div className="info">
              <div className="fname">{field.ref}</div>
              <div className="desc">formulaire lié</div>
            </div>
            <button className="btn ghost xs"><I name="externalLink" className="ico-xs" /></button>
          </div>
        )}
        {field.kind === "blocks" && (
          <BlocksField field={field}
            blockTags={blockTags}
            activeTags={activeTags}
            selectedBlockId={selectedBlockId}
            onSelectBlock={onSelectBlock}
            onSetBlockTag={onSetBlockTag} />
        )}
      </div>

      {/* Per-field tag control sits in the gutter for atomic fields */}
      {(field.kind !== "blocks") && (
        <FieldTagControl
          tag={value && typeof value === "object" ? value.tag : null}
          kind={field.kind}
          onChange={(t) => {
            if (field.kind === "button") onChange({ ...(value || {}), tag: t });
          }}
          enabled={field.kind === "button"}
        />
      )}
    </div>
  );
}

function ButtonField({ value, field, onChange }) {
  return (
    <div className="ct-btn-row">
      <span className={"lbl-pill " + (field.primary ? "" : "secondary")}>
        {field.primary ? "Primary" : "Secondary"}
      </span>
      <input className="input" value={value.label || ""}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder="Libellé du bouton" />
      {field.link && (
        <>
          <I name="link" className="ico-xs" style={{ color: "var(--text-4)", gridColumn: 1, justifySelf: "end" }} />
          <input className="input mono" value={value.link || ""}
            onChange={(e) => onChange({ link: e.target.value })}
            placeholder="/contact" style={{ fontSize: 11 }} />
        </>
      )}
    </div>
  );
}

function BlocksField({ field, blockTags, activeTags, selectedBlockId, onSelectBlock, onSetBlockTag }) {
  const blocks = field.defaults || [];
  return (
    <div className="ct-blocks">
      {blocks.map((b, i) => {
        const tag = blockTags[b.id] ?? null;
        const filtered = tag && !activeTags.includes(tag);
        const sel = selectedBlockId === b.id;
        return (
          <div key={b.id} className="ct-block"
            data-filtered={filtered ? "true" : "false"}
            style={sel ? { borderColor: "var(--accent)", boxShadow: "0 0 0 2px var(--accent-tint)" } : undefined}
            onClick={(e) => { e.stopPropagation(); onSelectBlock(b.id); }}>
            <I name="drag" className="ico-sm handle" />
            <div className="btxt">
              {b.title !== undefined ? (
                <>
                  <input className="input" defaultValue={b.title}
                    style={{ height: 22, fontSize: 12.5, fontWeight: 500, marginBottom: 2, padding: 0 }} />
                  <input className="input" defaultValue={b.body || ""}
                    style={{ height: 20, fontSize: 11, color: "var(--text-3)", padding: 0 }} />
                </>
              ) : (
                <input className="input mono" defaultValue={b.value} style={{ height: 22, fontSize: 11.5, padding: 0 }} />
              )}
            </div>
            <BlockTagControl
              tag={tag}
              onChange={(t) => onSetBlockTag(b.id, t)} />
            <button className="btn ghost xs icon" title="Supprimer le bloc" onClick={(e) => e.stopPropagation()}>
              <I name="trash" className="ico-xs" />
            </button>
          </div>
        );
      })}
      <button className="btn ghost xs" style={{ alignSelf: "flex-start", marginTop: 2 }}>
        <I name="plus" className="ico-xs" />Ajouter un bloc
      </button>
    </div>
  );
}

// ─── Tag controls (3 placements: section, field, block) ───────────────────

function SectionTagControl({ tag, onChange }) {
  return <TagControl tag={tag} onChange={onChange} scope="Section" />;
}
function BlockTagControl({ tag, onChange }) {
  return <TagControl tag={tag} onChange={onChange} scope="Bloc" />;
}
function FieldTagControl({ tag, onChange, kind, enabled }) {
  if (!enabled) {
    return <span style={{ width: 70 }} />; // keep grid aligned, no control on plain text
  }
  return <TagControl tag={tag} onChange={onChange} scope="Champ" />;
}

function TagControl({ tag, onChange, scope }) {
  const [open, setOpen] = useStateC(false);
  const ref = useRefC(null);
  useEffectC(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const lbl = tag ? labelForTag(tag) : "tag";
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-block" }} onClick={(e) => e.stopPropagation()}>
      <button className="ct-tag-picker" data-set={tag ? "true" : "false"}
        onClick={() => setOpen((v) => !v)}>
        <I name="bookmark" className="ico-xs" />{lbl}
      </button>
      {open && (
        <div className="ct-tag-pop" style={{ top: "calc(100% + 4px)", right: 0 }}>
          <div className="ct-pop-hd">Filtrer ce {scope.toLowerCase()} par tag</div>
          {SERVICE_TAGS.map((t) => (
            <button key={t.id} className="ct-pop-item"
              aria-pressed={tag === t.id}
              onClick={() => { onChange(t.id); setOpen(false); }}>
              <span className="dot" />{t.label}
            </button>
          ))}
          {tag && (
            <div className="ct-pop-clear">
              <button className="ct-pop-item" onClick={() => { onChange(null); setOpen(false); }}>
                <I name="x" className="ico-xs" />Retirer le tag
              </button>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

function labelForTag(tagId) {
  return (SERVICE_TAGS.find((t) => t.id === tagId) || { label: tagId }).label;
}

// ─── Right inspector pane ────────────────────────────────────────────────

function ContentInspector({ section, content, blockId, schema, activeTags,
  onPatch, onSetBlockTag }) {

  if (!section) {
    return (
      <div className="ct-insp">
        <div className="empty">
          <span className="ic"><I name="cursor" className="ico-lg" /></span>
          <p>Sélectionnez une section pour éditer son contenu.</p>
        </div>
      </div>
    );
  }

  // Block-focused mode
  if (blockId && schema) {
    const blocksField = schema.fields.find((f) => f.kind === "blocks");
    const block = blocksField?.defaults?.find((b) => b.id === blockId);
    const tag = (content._blockTags || {})[blockId] || null;
    const filtered = tag && !activeTags.includes(tag);
    return (
      <>
        <div className="pane-hd contextual">
          <div className="title-with-icon">
            <I name="box" className="ico-sm" style={{ color: "var(--magic)" }} />
            <span>Bloc · {block?.title || block?.value || blockId}</span>
          </div>
        </div>
        <div className="pane-body">
          <div className="ct-insp">
            <div className="visibility-row" data-state={filtered ? "hidden" : "visible"}>
              <span><I name={filtered ? "eyeOff" : "eye"} className="ico-sm" style={{ marginRight: 6 }} />
                {filtered ? "Masqué" : "Visible"} pour les tags actifs
              </span>
              {tag && <span className="pill info">{labelForTag(tag)}</span>}
            </div>

            <div className="insp-section">
              <div className="insp-section-hd">Service tag</div>
              <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5 }}>
                Ce bloc ne s'affichera que si l'entreprise possède le tag sélectionné.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {SERVICE_TAGS.map((t) => (
                  <button key={t.id}
                    className="ct-tag-chip"
                    aria-pressed={tag === t.id}
                    data-real="true"
                    onClick={() => onSetBlockTag(blockId, tag === t.id ? null : t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
              {tag && (
                <button className="btn ghost xs" style={{ marginTop: 6 }}
                  onClick={() => onSetBlockTag(blockId, null)}>
                  <I name="x" className="ico-xs" />Retirer le tag
                </button>
              )}
            </div>

            <div className="insp-section">
              <div className="insp-section-hd">Schéma du bloc</div>
              <div className="schema-overview" style={{ margin: 0 }}>
                <div className="lbl">{blocksField?.item || "block"}</div>
                <div className="schema-grid">
                  {Object.keys(block || {}).filter((k) => k !== "id" && k !== "tag").map((k) => (
                    <span key={k}>
                      <code>{k}</code>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Section-focused mode
  const sectionTag = content._tag;
  const sectionHidden = content._hidden;
  const sectionFiltered = sectionTag && !activeTags.includes(sectionTag);
  const sectionVisible = !sectionHidden && !sectionFiltered;
  const totalBlockTags = Object.values(content._blockTags || {}).filter(Boolean).length;

  return (
    <>
      <div className="pane-hd contextual">
        <div className="title-with-icon">
          <I name="block" className="ico-sm" style={{ color: "var(--accent)" }} />
          <span>{section.name}</span>
        </div>
        <div className="actions">
          <span className="pill">{section.type}</span>
        </div>
      </div>

      <div className="pane-body">
        <div className="ct-insp">
          <div className="visibility-row" data-state={sectionVisible ? "visible" : "hidden"}>
            <span>
              <I name={sectionVisible ? "eye" : "eyeOff"} className="ico-sm" style={{ marginRight: 6 }} />
              {sectionVisible ? "Visible" : sectionHidden ? "Manuellement masquée" : "Masquée par tag"}
            </span>
            <button className="btn ghost xs"
              onClick={() => onPatch({ _hidden: !sectionHidden })}>
              {sectionHidden ? "Réafficher" : "Masquer"}
            </button>
          </div>

          <div className="insp-section">
            <div className="insp-section-hd">Tag de section</div>
            <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5 }}>
              Toute la section sera masquée si l'entreprise n'a pas ce tag.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {SERVICE_TAGS.map((t) => (
                <button key={t.id}
                  className="ct-tag-chip"
                  aria-pressed={sectionTag === t.id}
                  data-real="true"
                  onClick={() => onPatch({ _tag: sectionTag === t.id ? null : t.id })}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="insp-section">
            <div className="insp-section-hd">Schéma de la section</div>
            <div className="schema-overview" style={{ margin: 0 }}>
              <div className="lbl">{section.type} · {schema?.label || "no schema"}</div>
              <div className="schema-grid">
                {(schema?.fields || []).map((f) => (
                  <span key={f.id}>
                    <code>{f.id}</code>
                    <span style={{ color: "var(--text-4)", fontSize: 10 }}>· {f.kind}</span>
                  </span>
                ))}
              </div>
            </div>
            <p style={{ margin: "10px 2px 0", fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
              Définis dans <code style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>SECTION_SCHEMAS</code>.
              Le rendu, l'IA et le moteur de variables consomment cette même structure.
            </p>
          </div>

          <div className="insp-section">
            <div className="insp-section-hd">Synthèse tags</div>
            <div style={{ display: "grid", gap: 4, fontSize: 11.5, color: "var(--text-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Tag section</span>
                <span style={{ fontFamily: "var(--font-mono)", color: sectionTag ? "var(--info)" : "var(--text-4)" }}>
                  {sectionTag || "—"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Blocs tagués</span>
                <span style={{ fontFamily: "var(--font-mono)", color: totalBlockTags ? "var(--info)" : "var(--text-4)" }}>
                  {totalBlockTags}
                </span>
              </div>
            </div>
          </div>

          <button className="btn outline" style={{ width: "100%", justifyContent: "center", marginTop: 14 }}>
            <I name="sparkles" className="ico-sm" />Régénérer cette section avec l'IA
          </button>
        </div>
      </div>
    </>
  );
}

// Expose
Object.assign(window, { ContentWorkspace });
