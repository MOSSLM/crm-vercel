// automations-app.jsx — app shell + topbar + tabs.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "regular",
  "accent": "#E2552B",
  "view": "automations-list",
  "openWorkflowId": "auto_stage_to_devis",
  "openSequenceId": "seq_solaire69"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = useState(t.view || "automations-list");
  const [openWorkflowId, setOpenWorkflowId] = useState(t.openWorkflowId || "auto_stage_to_devis");
  const [openSequenceId, setOpenSequenceId] = useState(t.openSequenceId || "seq_solaire69");
  const [companyOpen, setCompanyOpen] = useState(false);

  // Sync tweaks → CSS / body attrs
  useLayoutEffect(() => {
    document.body.dataset.density = t.density;
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
  }, [t.density, t.accent]);

  // Sync view → body attribute (controls grid template)
  useLayoutEffect(() => {
    if (view === "automations-list" || view === "sequences-list") {
      document.body.dataset.view = "list";
    } else if (view === "prospection") {
      document.body.dataset.view = "prospection";
    } else if (view === "connections") {
      document.body.dataset.view = "connections";
    } else {
      document.body.dataset.view = "builder";
    }
  }, [view]);

  // Reflect view in tweaks defaults JSON
  useEffect(() => { setTweak("view", view); }, [view]);

  // Top-level tab id
  const topTab =
    view.startsWith("automation") || view === "workflow-builder" ? "automations" :
    view.startsWith("sequence") ? "sequences" :
    view === "prospection" ? "prospection" :
    view === "connections" ? "connections" : "automations";

  const openWorkflow = AUTOMATIONS.find((a) => a.id === openWorkflowId);

  return (
    <>
      <div id="app">
        <TopBar topTab={topTab}
                onTopTab={(v) => {
                  if (v === "automations") setView("automations-list");
                  else if (v === "sequences") setView("sequences-list");
                  else if (v === "prospection") setView("prospection");
                  else if (v === "connections") setView("connections");
                }}
                view={view}
                companyOpen={companyOpen} setCompanyOpen={setCompanyOpen}
                onBackToList={() => {
                  if (view === "workflow-builder") setView("automations-list");
                  else if (view === "sequence-builder") setView("sequences-list");
                }} />

        <div className="body" key={view}>
          {view === "automations-list" && (
            <AutomationsList
              onOpen={(row) => {
                setOpenWorkflowId(row.id);
                setTweak("openWorkflowId", row.id);
                if (row.kind === "sequence") {
                  setOpenSequenceId("seq_solaire69");
                  setView("sequence-builder");
                } else {
                  setView("workflow-builder");
                }
              }}
              onNew={() => setView("workflow-builder")}
            />
          )}

          {view === "workflow-builder" && (
            <WorkflowBuilder workflow={SAMPLE_WORKFLOW} onBack={() => setView("automations-list")} />
          )}

          {view === "sequences-list" && (
            <SequencesList
              onOpen={(seq) => {
                setOpenSequenceId(seq.id);
                setView("sequence-builder");
              }}
              onNew={() => setView("sequence-builder")}
            />
          )}

          {view === "sequence-builder" && (
            <SequenceBuilder sequence={SAMPLE_SEQUENCE} onBack={() => setView("sequences-list")} />
          )}

          {view === "prospection" && <ProspectionPage />}

          {view === "connections" && <ConnectionsPage onBack={() => setView("automations-list")} />}
        </div>

        <StatusBar view={view} />
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="App">
          <TweakSelect label="Vue" value={view}
            options={[
              { value: "automations-list", label: "Liste automatisations" },
              { value: "workflow-builder", label: "Workflow builder" },
              { value: "sequences-list",   label: "Liste séquences" },
              { value: "sequence-builder", label: "Séquence builder" },
              { value: "prospection",      label: "Démarchage" },
              { value: "connections",      label: "Connexions" },
            ]}
            onChange={(v) => setView(v)} />
          <TweakRadio label="Densité" value={t.density}
            options={["compact","regular","cozy"]}
            onChange={(v) => setTweak("density", v)} />
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

// ── TopBar ─────────────────────────────────────────────────────────────────
function TopBar({ topTab, onTopTab, view, companyOpen, setCompanyOpen, onBackToList }) {
  const inBuilder = view === "workflow-builder" || view === "sequence-builder";
  const builderName = view === "workflow-builder" ? "RDV planifié → préparer devis"
                    : view === "sequence-builder" ? "Cold outbound · Solaire 69"
                    : null;

  return (
    <div className="topbar">
      <div className="left-group">
        <div className="brand">
          <div className="brand-mark" aria-label="Sama mark" />
          <span style={{ fontWeight: 500, fontSize: 13, letterSpacing: "-.005em", whiteSpace: "nowrap" }}>Sama CRM</span>
        </div>

        <div className="crumbs">
          <span>Sama Digital</span>
          <span className="sep">/</span>
          <span style={{ color: "var(--text-2)" }}>Automatisations</span>
          {inBuilder && (
            <>
              <span className="sep">/</span>
              <span className="cur">{builderName}</span>
            </>
          )}
        </div>

        <span className="saved"><i />enregistré · il y a 3 s</span>

        <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 4px" }} />

        <div style={{ position: "relative" }}>
          <button className="topchip" onClick={() => setCompanyOpen((v) => !v)}>
            <XI name="building" className="ico-sm" style={{ color: "var(--text-3)" }} />
            <span className="truncate">Thermalis SARL</span>
            <XI name="chevdown" className="ico-xs" style={{ color: "var(--text-4)" }} />
          </button>
          {companyOpen && (
            <CompanyPop onClose={() => setCompanyOpen(false)} />
          )}
        </div>

        <button className="topchip">
          <XI name="database" className="ico-sm" style={{ color: "var(--supa-dark)" }} />
          <span className="truncate">Supabase · prod</span>
          <XI name="chevdown" className="ico-xs" style={{ color: "var(--text-4)" }} />
        </button>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" className="tab" aria-selected={topTab === "automations"}
                onClick={() => onTopTab("automations")}>
          <XI name="bolt" className="ico-sm" />Workflows
          <span className="count">{AUTOMATIONS.filter((a) => a.kind !== "sequence").length}</span>
        </button>
        <button role="tab" className="tab" aria-selected={topTab === "sequences"}
                onClick={() => onTopTab("sequences")}>
          <XI name="flame" className="ico-sm" />Séquences
          <span className="count">{SUPA.sequences.rows.length}</span>
        </button>
        <button role="tab" className="tab" aria-selected={topTab === "prospection"}
                onClick={() => onTopTab("prospection")}>
          <XI name="inbox" className="ico-sm" />Démarchage
          <span className="count" style={{
            background: topTab === "prospection" ? "var(--bg-2)" : "var(--accent-tint)",
            color: topTab === "prospection" ? "var(--accent-2)" : "var(--accent-2)",
            fontWeight: 600,
          }}>14</span>
        </button>
        <button role="tab" className="tab" aria-selected={topTab === "connections"}
                onClick={() => onTopTab("connections")}>
          <XI name="webhook" className="ico-sm" />Connexions
        </button>
      </div>

      <div className="right">
        <div className="seg compact">
          <button title="Annuler ⌘Z"><XI name="undo" className="ico-sm" /></button>
          <button title="Rétablir ⌘⇧Z"><XI name="redo" className="ico-sm" /></button>
        </div>
        <button className="btn ghost sm icon" title="Journaux"><XI name="history" className="ico-sm" /></button>
        <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 2px" }} />
        <button className="btn outline sm"><XI name="play" className="ico-sm" />Exécution test</button>
        <button className="btn outline sm"><XI name="share" className="ico-sm" />Partager</button>
        <button className="btn accent">
          {inBuilder ? <><XI name="checkBig" className="ico-sm" />Publier</> :
                       <><XI name="plus" className="ico-sm" />Nouveau</>}
        </button>
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
    { name: "Thermalis SARL",          tag: "LM", active: true },
    { name: "Brossard Couverture",     tag: "JB" },
    { name: "Énergie Solaire 69",      tag: "" },
    { name: "Chauffage Pro Lyon",      tag: "LM" },
    { name: "Plomberie Express",      tag: "" },
  ];
  return (
    <div ref={ref} className="pop" style={{ top: "calc(100% + 6px)", left: 0, width: 280 }}>
      <div style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
        <div className="search-wrap" style={{ position: "relative" }}>
          <XI name="search" className="ico-sm" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)" }} />
          <input className="input" placeholder="Rechercher une entreprise…"
                 style={{ paddingLeft: 28, height: 26, fontSize: 12 }} autoFocus />
        </div>
      </div>
      <div style={{ maxHeight: 230, overflow: "auto", padding: "4px 0" }}>
        {companies.map((c) => (
          <div key={c.name} className="menu-row" aria-selected={c.active}
               style={{ height: 30 }}>
            <XI name="building" className="ico-sm" style={{ color: "var(--text-3)" }} />
            <span style={{ flex: 1 }}>{c.name}</span>
            {c.tag && <span className="pill">{c.tag}</span>}
            {c.active && <XI name="check" className="ico-sm" style={{ color: "var(--accent)" }} />}
          </div>
        ))}
      </div>
      <div style={{ padding: "6px 10px", borderTop: "1px solid var(--border)", fontSize: 10.5, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>
        12 entreprises · 5 affichées
      </div>
    </div>
  );
}

// ── Status bar ─────────────────────────────────────────────────────────────
function StatusBar({ view }) {
  const onCount = AUTOMATIONS.filter((a) => a.status === "on").length;
  const runs24h = AUTOMATIONS.reduce((s, a) => s + (a.runs7d || 0), 0);
  return (
    <div className="statusbar">
      <span><span className="dot" />Connecté · Supabase prod</span>
      <span className="sep" />
      <span>{onCount} workflows actifs</span>
      <span className="sep" />
      <span>{runs24h} exécutions / 7j</span>
      <span className="sep" />
      <span>14 tâches manuelles dans la file</span>
      <span className="spacer" />
      <span><kbd>?</kbd> Raccourcis</span>
      <span className="sep" />
      <span><kbd>⌘</kbd><kbd>K</kbd> Commandes</span>
      <span className="sep" />
      <span>v 2.4.1</span>
    </div>
  );
}

// ── Connections page (placeholder full-bleed) ─────────────────────────────
function ConnectionsPage({ onBack }) {
  const conns = [
    { id: "supa",   icon: "database", name: "Supabase · prod",      desc: "Lecture/écriture sur les tables CRM.",            status: "on",     since: "12 mois", color: "#3ECF8E", textCol: "var(--supa-dark)" },
    { id: "sendg",  icon: "mail",     name: "SendGrid",             desc: "Envoi des emails des séquences & workflows.",     status: "on",     since: "8 mois",  color: "#1A82E2", textCol: "#1A82E2" },
    { id: "wa",     icon: "whatsapp", name: "WhatsApp Business API",desc: "Numéros pro pour les séquences WhatsApp.",        status: "on",     since: "3 mois",  color: "#25D366", textCol: "#1F8A5B" },
    { id: "slack",  icon: "bell",     name: "Slack",                desc: "Notifications sur #ventes, #ops, #urgences.",     status: "on",     since: "9 mois",  color: "#4A154B", textCol: "#7A5AE0" },
    { id: "cal",    icon: "cal",      name: "Cal.com",              desc: "Liens de réservation auto-injectés dans les emails.", status: "on", since: "6 mois", color: "#292929", textCol: "#14120E" },
    { id: "li",     icon: "linkedin", name: "LinkedIn",             desc: "Connexion manuelle — pas d'API officielle.",      status: "manual", since: "—",        color: "#0A66C2", textCol: "#2A6FDB" },
    { id: "claude", icon: "ai",       name: "Claude — Anthropic",   desc: "Scoring IA et génération de copy.",               status: "on",     since: "2 mois",  color: "#D97757", textCol: "#C73E16" },
    { id: "webhook",icon: "webhook",  name: "Webhooks sortants",    desc: "Endpoints HTTP appelés par les automatisations.", status: "draft",  since: "—",        color: "#8A877F", textCol: "#5C5953" },
  ];
  return (
    <div className="pane" style={{ background: "var(--bg)", borderRight: 0 }}>
      <div className="pane-hd">
        <div className="title-row">
          <button className="btn ghost sm icon" onClick={onBack} title="Retour"><XI name="chevleft" className="ico-sm" /></button>
          <XI name="webhook" className="ico-sm" style={{ color: "var(--text-3)" }} />
          <span>Connexions</span>
        </div>
        <div className="actions">
          <button className="btn outline xs"><XI name="plus" className="ico-xs" />Ajouter une connexion</button>
        </div>
      </div>
      <div className="pane-body" style={{ padding: 24 }}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>
          <div style={{ marginBottom: 16 }}>
            <h1 style={{ fontFamily: "var(--font-serif)", fontWeight: 400, fontSize: 26, letterSpacing: "-.01em", margin: 0 }}>
              Connexions
            </h1>
            <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 4 }}>
              Toutes les sources de données et services utilisés par vos automatisations.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {conns.map((c) => (
              <div key={c.id} style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 16,
                display: "flex", gap: 14, alignItems: "flex-start",
              }}>
                <span style={{
                  width: 40, height: 40, borderRadius: 9,
                  background: c.color + "22", color: c.textCol,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <XI name={c.icon} className="ico-lg" />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-.005em" }}>{c.name}</div>
                    <StatusBadge status={c.status === "manual" ? "draft" : c.status} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4, lineHeight: 1.45 }}>{c.desc}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-4)", fontFamily: "var(--font-mono)", marginTop: 6 }}>
                    {c.status === "manual" ? "mode manuel — pas d'auth requise" :
                     c.status === "draft" ? "non configuré" :
                     `connecté depuis ${c.since}`}
                  </div>
                </div>
                <button className="btn ghost xs icon"><XI name="settings" className="ico-sm" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mount ──────────────────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
