// app.jsx — main app shell, state, tabs.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "regular",
  "previewPos": "right",
  "previewMode": "step",
  "previewDevice": "desktop",
  "accent": "#E2552B"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [form, setForm] = useState(INITIAL_FORM);
  const [tab, setTab] = useState("build");
  const [selectedId, setSelectedId] = useState(form.questions[1]?.id || form.questions[0]?.id);

  // ─── Mirror tweaks → CSS / body attrs ──────────────────────────────────
  useLayoutEffect(() => {
    document.body.dataset.density = t.density;
    document.body.dataset.previewPos = t.previewPos;
    document.documentElement.style.setProperty("--accent", t.accent);
    // derive accent-2 (darker) and accent-tint
    const hexToRgb = (h) => {
      const x = h.replace("#","");
      return [parseInt(x.slice(0,2),16), parseInt(x.slice(2,4),16), parseInt(x.slice(4,6),16)];
    };
    const [r,g,b] = hexToRgb(t.accent);
    document.documentElement.style.setProperty("--accent-tint", `rgba(${r},${g},${b},.10)`);
    document.documentElement.style.setProperty("--accent-tint-2", `rgba(${r},${g},${b},.18)`);
    const dark = `rgb(${Math.max(0,r-30)},${Math.max(0,g-30)},${Math.max(0,b-30)})`;
    document.documentElement.style.setProperty("--accent-2", dark);
    // remove mount-pending after first paint
    document.body.classList.remove("mount-pending");
  }, [t]);

  // ─── form-mutation helpers ─────────────────────────────────────────────
  const selectedIndex = form.questions.findIndex((q) => q.id === selectedId);
  const selectedQ = form.questions[selectedIndex];

  const reRefs = (qs) => qs.map((q, i) => ({ ...q, ref: q.ref || `Q${String(i + 1).padStart(2, "0")}` }));

  const updateQuestion = useCallback((id, patch) => {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q) => q.id === id ? { ...q, ...patch } : q),
    }));
  }, []);

  const updateChoices = useCallback((id, choices) => {
    setForm((f) => ({
      ...f,
      questions: f.questions.map((q) => q.id === id ? { ...q, choices } : q),
    }));
  }, []);

  const reorderQuestion = useCallback((srcId, targetId, where) => {
    setForm((f) => {
      const arr = [...f.questions];
      const srcIdx = arr.findIndex((q) => q.id === srcId);
      if (srcIdx < 0) return f;
      const [m] = arr.splice(srcIdx, 1);
      const tgtIdx = arr.findIndex((q) => q.id === targetId);
      const insertAt = tgtIdx + (where === "below" ? 1 : 0);
      arr.splice(insertAt, 0, m);
      return { ...f, questions: arr };
    });
  }, []);

  const addQuestion = useCallback((typeId) => {
    setForm((f) => {
      const refNum = (f.questions.length + 1).toString().padStart(2, "0");
      const id = uid("q");
      const base = {
        id, ref: `Q${refNum}`, type: typeId, required: false,
        title: "Nouvelle question", subtitle: "",
      };
      const extra = {};
      if (typeId === "multi_choice" || typeId === "single_choice" || typeId === "dropdown") {
        extra.multi = typeId === "multi_choice";
        extra.choices = [
          { id: uid("c"), label: "Option 1" },
          { id: uid("c"), label: "Option 2" },
        ];
      } else if (typeId === "slider") {
        Object.assign(extra, { min: 0, max: 100, step: 1, default: 50, unit: "" });
      } else if (typeId === "welcome" || typeId === "end") {
        extra.cta = typeId === "welcome" ? "Commencer" : "Retour au site";
      }
      // Insert after currently-selected, or at end
      const insertAfter = selectedIndex >= 0 ? selectedIndex : f.questions.length - 1;
      const next = [...f.questions];
      next.splice(insertAfter + 1, 0, { ...base, ...extra });
      setSelectedId(id);
      return { ...f, questions: next };
    });
  }, [selectedIndex]);

  const duplicateQuestion = useCallback((id) => {
    setForm((f) => {
      const idx = f.questions.findIndex((q) => q.id === id);
      if (idx < 0) return f;
      const src = f.questions[idx];
      const newQ = { ...JSON.parse(JSON.stringify(src)), id: uid("q") };
      // dedupe choice ids
      if (newQ.choices) newQ.choices = newQ.choices.map((c) => ({ ...c, id: uid("c") }));
      const next = [...f.questions];
      next.splice(idx + 1, 0, newQ);
      return { ...f, questions: next };
    });
  }, []);

  const deleteQuestion = useCallback((id) => {
    setForm((f) => {
      const next = f.questions.filter((q) => q.id !== id);
      const nextLogic = f.logic.filter((r) => r.from !== id && r.to !== id);
      // if selected was deleted, pick neighbor
      if (id === selectedId) {
        const idx = f.questions.findIndex((q) => q.id === id);
        const fallback = f.questions[idx + 1] || f.questions[idx - 1];
        setSelectedId(fallback?.id || null);
      }
      return { ...f, questions: next, logic: nextLogic };
    });
  }, [selectedId]);

  const addLogicFrom = useCallback((fromId) => {
    setForm((f) => {
      const fromQ = f.questions.find((q) => q.id === fromId);
      const nextQ = f.questions[f.questions.findIndex((q) => q.id === fromId) + 1];
      if (!fromQ || !nextQ) return f;
      const firstChoice = fromQ.choices?.[0];
      const rule = {
        id: uid("r"), from: fromId, to: nextQ.id,
        cond: firstChoice
          ? { all: [{ field: fromId, op: "eq", value: firstChoice.id }] }
          : { all: [{ field: fromId, op: "answered" }] },
        label: firstChoice ? `si ${firstChoice.label}` : "si répondue",
      };
      return { ...f, logic: [...f.logic, rule] };
    });
  }, []);

  // ─── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.matches("input, textarea, [contenteditable=true]")) return;
      if (e.metaKey || e.ctrlKey) return;
      if (e.key === "1") setTab("build");
      if (e.key === "2") setTab("logic");
      if (e.key === "3") setTab("preview");
      if (e.key === "4") setTab("share");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <>
      <style>{ATOMS_CSS}{BUILDER_CSS}{LOGIC_CSS}{PREVIEW_CSS}</style>

      <div id="app">
        <TopBar form={form} tab={tab} onTab={setTab} />

        <div className="body" key={tab + t.previewPos}>
          {tab === "build" && (
            <BuildView
              form={form}
              selectedId={selectedId}
              onSelect={setSelectedId}
              previewMode={t.previewMode}
              previewDevice={t.previewDevice}
              previewPos={t.previewPos}
              onChangeQ={(patch) => updateQuestion(selectedId, patch)}
              onChangeChoices={(c) => updateChoices(selectedId, c)}
              onAdd={addQuestion}
              onReorder={reorderQuestion}
              onDuplicate={duplicateQuestion}
              onDelete={deleteQuestion}
              onAddLogicFrom={addLogicFrom}
              onSetPreviewDevice={(d) => setTweak("previewDevice", d)}
              onSetPreviewMode={(m) => setTweak("previewMode", m)}
              onGotoLogic={() => setTab("logic")}
            />
          )}

          {tab === "logic" && (
            <LogicView
              form={form}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChangeQ={(patch) => updateQuestion(selectedId, patch)}
              onAddRule={() => addLogicFrom(selectedId)}
              onAddLogicFrom={addLogicFrom}
            />
          )}

          {tab === "preview" && (
            <PreviewView
              form={form}
              mode={t.previewMode}
              device={t.previewDevice}
              onSetDevice={(d) => setTweak("previewDevice", d)}
              onSetMode={(m) => setTweak("previewMode", m)}
            />
          )}

          {tab === "share" && <ShareView form={form} />}
        </div>

        <StatusBar form={form} tab={tab} />
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Builder">
          <TweakRadio  label="Densité" value={t.density}
                       options={["compact","regular","cozy"]}
                       onChange={(v) => setTweak("density", v)} />
          <TweakRadio  label="Position preview" value={t.previewPos}
                       options={[{value:"right",label:"Droite"},{value:"bottom",label:"Bas"}]}
                       onChange={(v) => setTweak("previewPos", v)} />
        </TweakSection>
        <TweakSection label="Rendu">
          <TweakRadio  label="Style" value={t.previewMode}
                       options={[{value:"step",label:"1/page"},{value:"scroll",label:"Scroll"}]}
                       onChange={(v) => setTweak("previewMode", v)} />
          <TweakRadio  label="Device" value={t.previewDevice}
                       options={[{value:"desktop",label:"Desktop"},{value:"mobile",label:"Mobile"}]}
                       onChange={(v) => setTweak("previewDevice", v)} />
          <TweakColor  label="Accent" value={t.accent}
                       options={["#E2552B","#2A6FDB","#1F8A5B","#7A5AE0","#14120E","#C8881F"]}
                       onChange={(v) => setTweak("accent", v)} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

// ─── Topbar ──────────────────────────────────────────────────────────────
function TopBar({ form, tab, onTab }) {
  return (
    <div className="topbar">
      <div className="left-group">
        <div className="brand">
          <div className="brand-mark">T</div>
          <span style={{ fontWeight: 500, fontSize: 13, letterSpacing: "-.005em", whiteSpace: "nowrap" }}>Form Studio</span>
        </div>
        <div className="crumbs">
          <span>Thermalis</span>
          <span className="sep">/</span>
          <span className="cur">{form.title}</span>
        </div>
        <span className="saved"><i />enregistré</span>
      </div>

      <div className="tabs" role="tablist">
        <button role="tab" className="tab" aria-selected={tab === "build"} onClick={() => onTab("build")}>
          <Icon name="textShort" className="ico-sm" />Build <kbd>1</kbd>
        </button>
        <button role="tab" className="tab" aria-selected={tab === "logic"} onClick={() => onTab("logic")}>
          <Icon name="branch" className="ico-sm" />Logique <kbd>2</kbd>
        </button>
        <button role="tab" className="tab" aria-selected={tab === "preview"} onClick={() => onTab("preview")}>
          <Icon name="eye" className="ico-sm" />Preview <kbd>3</kbd>
        </button>
        <button role="tab" className="tab" aria-selected={tab === "share"} onClick={() => onTab("share")}>
          <Icon name="share" className="ico-sm" />Partager <kbd>4</kbd>
        </button>
      </div>

      <div className="right">
        <button className="btn ghost"><Icon name="undo" className="ico-sm" /></button>
        <button className="btn ghost"><Icon name="redo" className="ico-sm" /></button>
        <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 4px" }} />
        <button className="btn outline">Brouillon</button>
        <button className="btn accent"><Icon name="send" className="ico-sm" />Publier</button>
      </div>
    </div>
  );
}

// ─── Build view (3 columns) ───────────────────────────────────────────────
function BuildView(props) {
  const { form, selectedId, onSelect, onChangeQ, onChangeChoices, onAdd, onReorder,
          onDuplicate, onDelete, onAddLogicFrom, previewPos, previewMode, previewDevice,
          onSetPreviewDevice, onSetPreviewMode } = props;
  const selectedQ = form.questions.find((q) => q.id === selectedId);

  // 3 modes:
  //  - previewPos === "right" => 4 panels: list | editor | preview | inspector
  //  - previewPos === "bottom" => 3 cols top: list | editor | inspector, preview bottom-wide
  //  - default "right" small => still 3 panels (list | editor | inspector) with no preview pane
  // We'll use 4-column when previewPos === "right" — and "bottom" splits vertical.
  // The body grid is configured via body[data-preview-pos]
  // Here, we add a dedicated mini-preview pane in build mode.

  return (
    <>
      <div className="pane" style={{ minWidth: 220 }}>
        <div className="pane-hd">
          <span>Questions</span>
          <div className="actions">
            <span className="pill">{form.questions.length}</span>
          </div>
        </div>
        <div className="pane-body">
          <QuestionList
            form={form}
            selectedId={selectedId}
            onSelect={onSelect}
            onReorder={onReorder}
            onAdd={onAdd}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        </div>
      </div>

      <div className="pane" style={{ background: "transparent", borderRight: "1px solid var(--border)" }}>
        <div className="pane-hd">
          <span>Éditeur</span>
          <div className="actions">
            <button className="btn ghost sm" onClick={() => onDuplicate(selectedId)} title="Dupliquer (⌘D)">
              <Icon name="copy" className="ico-sm" />
            </button>
            <button className="btn ghost sm danger" onClick={() => onDelete(selectedId)} title="Supprimer">
              <Icon name="trash" className="ico-sm" />
            </button>
            <span style={{ width: 1, height: 14, background: "var(--border)", margin: "0 4px" }} />
            <button className="btn ghost sm">
              <Icon name="branch" className="ico-sm" />Ajouter logique
            </button>
          </div>
        </div>
        <QuestionEditor
          form={form}
          question={selectedQ}
          onChangeQ={onChangeQ}
          onChangeChoices={onChangeChoices}
        />
      </div>

      <div className="pane">
        <Inspector
          form={form}
          question={selectedQ}
          onChangeQ={onChangeQ}
          onChangeChoices={onChangeChoices}
          onDeleteQuestion={onDelete}
          onDuplicate={onDuplicate}
          onAddLogicFrom={onAddLogicFrom}
        />
      </div>
    </>
  );
}

// ─── Logic view ───────────────────────────────────────────────────────────
function LogicView({ form, selectedId, onSelect, onChangeQ, onAddLogicFrom }) {
  const selectedQ = form.questions.find((q) => q.id === selectedId);
  return (
    <>
      <div className="pane" style={{ minWidth: 220 }}>
        <div className="pane-hd">
          <span>Questions</span>
          <div className="actions"><span className="pill">{form.questions.length}</span></div>
        </div>
        <div className="pane-body">
          <QuestionList form={form} selectedId={selectedId} onSelect={onSelect}
                        onReorder={() => {}} onAdd={() => {}} onDuplicate={() => {}} onDelete={() => {}} />
        </div>
      </div>

      <div className="pane" style={{ background: "transparent", borderRight: "1px solid var(--border)" }}>
        <div className="pane-hd">
          <span>Flow logique</span>
          <div className="actions">
            <span className="pill logic"><Icon name="branch" className="ico-sm" />{form.logic.length} règles</span>
          </div>
        </div>
        <LogicCanvas form={form} selectedId={selectedId} onSelect={onSelect} onAddRule={() => onAddLogicFrom(selectedId)} />
      </div>

      <div className="pane">
        <Inspector
          form={form}
          question={selectedQ}
          onChangeQ={onChangeQ}
          onChangeChoices={() => {}}
          onDeleteQuestion={() => {}}
          onDuplicate={() => {}}
          onAddLogicFrom={onAddLogicFrom}
        />
      </div>
    </>
  );
}

// ─── Preview view ────────────────────────────────────────────────────────
function PreviewView({ form, mode, device, onSetDevice, onSetMode }) {
  return (
    <>
      <div className="pane" style={{ minWidth: 220 }}>
        <div className="pane-hd">
          <span>Aperçu</span>
        </div>
        <div className="pane-body" style={{ padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", padding: "0 4px 8px" }}>Mode</div>
          <div style={{ padding: "0 4px 16px" }}>
            <Segmented value={mode} onChange={onSetMode}
                       options={[{value:"step",label:"Étape"},{value:"scroll",label:"Scroll"}]} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", padding: "0 4px 8px" }}>Appareil</div>
          <div style={{ padding: "0 4px 16px" }}>
            <Segmented value={device} onChange={onSetDevice}
                       options={[{value:"desktop",label:"Desktop",icon:"desktop"},{value:"mobile",label:"Mobile",icon:"device"}]} />
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", padding: "8px 4px 8px", borderTop: "1px solid var(--border)" }}>État</div>
          <div style={{ padding: "0 4px", fontSize: 12, color: "var(--text-2)", lineHeight: 1.6 }}>
            <div>Questions : <b style={{ color: "var(--text)" }}>{form.questions.length}</b></div>
            <div>Règles : <b style={{ color: "var(--text)" }}>{form.logic.length}</b></div>
            <div>Obligatoires : <b style={{ color: "var(--text)" }}>{form.questions.filter((q) => q.required).length}</b></div>
          </div>
        </div>
      </div>

      <div className="pane" style={{ background: "var(--bg-2)", borderRight: 0 }}>
        <div className="preview-host">
          <div className="preview-chrome">
            <div className="dots"><i /><i /><i /></div>
            <div className="url"><Icon name="lock" className="ico-sm" />form.thermalis.fr/devis</div>
            <div className="device-pick">
              <button aria-pressed={device === "desktop"} onClick={() => onSetDevice("desktop")} title="Desktop"><Icon name="desktop" className="ico-sm" /></button>
              <button aria-pressed={device === "mobile"} onClick={() => onSetDevice("mobile")} title="Mobile"><Icon name="device" className="ico-sm" /></button>
            </div>
          </div>
          <div className="preview-viewport">
            <PreviewFrame form={form} mode={mode} device={device} />
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Share view ──────────────────────────────────────────────────────────
function ShareView({ form }) {
  return (
    <>
      <div className="pane" style={{ minWidth: 0, gridColumn: "1 / -1", background: "var(--bg)" }}>
        <div className="pane-hd">
          <span>Partager & Intégrer</span>
        </div>
        <div className="pane-body" style={{ padding: 36 }}>
          <div style={{ maxWidth: 720, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <ShareCard icon="link" title="Lien public"
                       desc="Partagez ce lien partout. Le formulaire s'ouvre dans le navigateur."
                       cta="Copier le lien" url={`https://form.thermalis.fr/${form.id}`} />
            <ShareCard icon="globe" title="Intégrer sur site"
                       desc="Snippet HTML iframe à coller dans n'importe quelle page."
                       cta="Copier le code"
                       url={`<iframe src="https://form.thermalis.fr/${form.id}" />`} mono />
            <ShareCard icon="send" title="Envoi par email"
                       desc="Envoyer un lien personnalisé avec pré-remplissage par variables URL."
                       cta="Configurer" />
            <ShareCard icon="zap" title="Webhook & CRM"
                       desc="Recevez chaque soumission par webhook ou dans HubSpot, Pipedrive, Notion."
                       cta="Connecter une intégration" />
          </div>
        </div>
      </div>
    </>
  );
}

function ShareCard({ icon, title, desc, cta, url, mono }) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border-2)",
      borderRadius: 12, padding: 22, boxShadow: "var(--shadow-1)",
    }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent-tint)", color: "var(--accent-2)",
                    display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
        <Icon name={icon} className="ico" />
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5, marginBottom: 14 }}>{desc}</div>
      {url && (
        <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)",
                      borderRadius: 7, padding: "8px 10px", fontFamily: mono ? "var(--font-mono)" : "var(--font-ui)",
                      fontSize: 11.5, color: "var(--text-2)", marginBottom: 12,
                      overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{url}</div>
      )}
      <button className="btn outline">{cta}</button>
    </div>
  );
}

// ─── Status bar ──────────────────────────────────────────────────────────
function StatusBar({ form, tab }) {
  return (
    <div className="statusbar">
      <span><span className="dot" />Connecté</span>
      <span className="sep" />
      <span>{form.questions.length} questions · {form.logic.length} règles</span>
      <span className="sep" />
      <span>auto-save activé</span>
      <span className="spacer" />
      <span><kbd>?</kbd> Raccourcis</span>
      <span className="sep" />
      <span><kbd>⌘</kbd><kbd>K</kbd> Commandes</span>
    </div>
  );
}

// ─── Mount ───────────────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
