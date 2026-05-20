// automations-workflows.jsx — Automations list + Workflow builder canvas

// ──────────────────────────────────────────────────────────────────────────
//   AUTOMATIONS LIST (table view)
// ──────────────────────────────────────────────────────────────────────────
function AutomationsList({ onOpen, onNew }) {
  const [q, setQ] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterKind, setFilterKind] = useState("all");

  const rows = AUTOMATIONS.filter((a) => {
    if (filterStatus !== "all" && a.status !== filterStatus) return false;
    if (filterKind !== "all" && a.kind !== filterKind) return false;
    if (q && !a.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const counts = {
    on: AUTOMATIONS.filter((a) => a.status === "on").length,
    paused: AUTOMATIONS.filter((a) => a.status === "paused").length,
    draft: AUTOMATIONS.filter((a) => a.status === "draft").length,
  };

  return (
    <div className="alist-page">
      <div className="alist-hd">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>Automatisations</h1>
          <div className="desc">
            {AUTOMATIONS.length} automatisations · {counts.on} actives ·
            {" "}{counts.paused} en pause · {counts.draft} brouillon
          </div>
        </div>
        <button className="btn outline sm">
          <XI name="externalLink" className="ico-sm" />Connexions
        </button>
        <button className="btn outline sm">
          <XI name="history" className="ico-sm" />Journal d'exécution
        </button>
        <button className="btn accent" onClick={onNew}>
          <XI name="plus" className="ico-sm" />Nouvelle automatisation
        </button>
      </div>

      <div className="alist-filters">
        <SearchInput value={q} onChange={setQ}
                     placeholder="Rechercher une automatisation…"
                     style={{ flex: 1, maxWidth: 320 }} />
        <div style={{ width: 1, height: 22, background: "var(--border)", margin: "0 4px" }} />
        <div className="seg">
          {[
            { v: "all",      l: `Toutes (${AUTOMATIONS.length})` },
            { v: "on",       l: `Actives (${counts.on})` },
            { v: "paused",   l: `En pause (${counts.paused})` },
            { v: "draft",    l: `Brouillons (${counts.draft})` },
          ].map((o) => (
            <button key={o.v} aria-pressed={filterStatus === o.v}
                    onClick={() => setFilterStatus(o.v)}>{o.l}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <div className="seg">
          {[
            { v: "all", l: "Tous types" },
            { v: "workflow", l: "Workflows" },
            { v: "sequence", l: "Séquences" },
          ].map((o) => (
            <button key={o.v} aria-pressed={filterKind === o.v}
                    onClick={() => setFilterKind(o.v)}>{o.l}</button>
          ))}
        </div>
        <button className="btn ghost sm icon" title="Trier"><XI name="filter" className="ico-sm" /></button>
      </div>

      <div className="alist-table">
        {rows.map((a) => (
          <AutomationRow key={a.id} row={a} onOpen={() => onOpen(a)} />
        ))}
        {rows.length === 0 && (
          <div className="empty-row" style={{ padding: 32 }}>
            Aucune automatisation ne correspond. Essayez d'élargir vos filtres.
          </div>
        )}
      </div>
    </div>
  );
}

function AutomationRow({ row, onOpen }) {
  const pipeline = row.pipeline ? supaRow("pipelines", row.pipeline) : null;
  const stage    = row.stage    ? supaRow("stages",    row.stage)    : null;
  const owner    = row.owner    ? supaRow("users",     row.owner)    : null;

  // mock sparkline
  const sparkData = useMemo(
    () => Array.from({ length: 10 }, () => 1 + Math.floor(Math.random() * 9)),
    [row.id]
  );

  const kindIcon = row.kind === "sequence" ? "flame" : "bolt";
  const kindCol  = row.kind === "sequence" ? "var(--accent)" : "var(--trigger)";
  const kindBg   = row.kind === "sequence" ? "var(--accent-tint)" : "var(--trigger-tint)";

  return (
    <div className="alist-row" onClick={onOpen}>
      <div className="kind-ic" style={{ background: kindBg, color: kindCol }}>
        <XI name={kindIcon} className="ico" />
      </div>

      <div style={{ minWidth: 0 }}>
        <div className="name">
          {row.name}
          {row.kind === "sequence" && <span className="pill accent" style={{ marginLeft: 8 }}>Séquence</span>}
        </div>
        <div className="sub">{row.desc}</div>
      </div>

      <div className="col-trigger">
        <span className="ic">
          <XI name={row.kind === "sequence" ? "pipeline" :
                    row.triggerLabel.includes("formulaire") || row.triggerLabel.toLowerCase().includes("formulaire") ? "form" :
                    row.triggerLabel.toLowerCase().includes("tag") ? "tag" :
                    row.triggerLabel.toLowerCase().includes("inactivité") ? "clock" :
                    "pipeline"} className="ico-sm" />
        </span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
          {pipeline ? (
            <>
              <span style={{ color: "var(--text)" }}>{pipeline.name}</span>
              {stage && <span style={{ color: "var(--text-3)" }}> · {stage.name}</span>}
            </>
          ) : (
            <span style={{ color: "var(--text)" }}>{row.triggerLabel}</span>
          )}
        </span>
      </div>

      <div className="col-meta">
        <span className="big">{row.runs7d}</span>
        exéc. · 7j
        {row.success7d != null && (
          <span style={{ marginLeft: 6, color: row.success7d > 0.5 ? "var(--ok)" : "var(--warn)" }}>
            · {Math.round(row.success7d * 100)}%
          </span>
        )}
      </div>

      <div>
        <Spark data={sparkData}
               color={row.status === "on" ? "var(--ok)" : "var(--text-4)"}
               width={72} />
      </div>

      <div className="col-status">
        <StatusBadge status={row.status} />
      </div>

      <div>
        {owner && <Av user={owner} size={22} />}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//   WORKFLOW BUILDER
// ──────────────────────────────────────────────────────────────────────────
function WorkflowBuilder({ workflow, onBack }) {
  const [wf, setWf] = useState(workflow);
  const [selectedId, setSelectedId] = useState(wf.nodes[1]?.id || wf.nodes[0]?.id);
  const [zoom, setZoom] = useState(95);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSlot, setPickerSlot] = useState(null);

  const selectedNode = wf.nodes.find((n) => n.id === selectedId);

  const updateNode = useCallback((id, patch) => {
    setWf((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => n.id === id ? { ...n, ...patch, config: { ...n.config, ...(patch.config || {}) } } : n),
    }));
  }, []);

  return (
    <>
      {/* LEFT: Node library + structure */}
      <div className="pane" style={{ minWidth: 240 }}>
        <div className="pane-hd">
          <span>Bibliothèque</span>
          <div className="actions">
            <button className="btn ghost sm icon" onClick={onBack} title="Retour à la liste">
              <XI name="chevleft" className="ico-sm" />
            </button>
          </div>
        </div>
        <div className="pane-body">
          <div style={{ padding: "10px 12px" }}>
            <SearchInput placeholder="Rechercher un bloc…" />
          </div>
          {NODE_CATALOG.map((sec) => (
            <Section key={sec.section} label={sec.section} count={sec.items.length} defaultOpen={true}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {sec.items.map((item) => (
                  <NodeCard key={item.id} item={item} cat={sec.cat} />
                ))}
              </div>
            </Section>
          ))}
        </div>
      </div>

      {/* CENTER: canvas */}
      <div className="pane" style={{ background: "transparent" }}>
        <div className="pane-hd">
          <div className="title-row">
            <button className="btn ghost sm icon" onClick={onBack} title="Retour"><XI name="chevleft" className="ico-sm" /></button>
            <XI name="bolt" className="ico-sm" style={{ color: "var(--trigger)" }} />
            <span>{wf.name}</span>
            <span className="pill" style={{ marginLeft: 4 }}>Workflow</span>
          </div>
          <div className="actions">
            <button className="btn ghost xs"><XI name="history" className="ico-xs" />Tests</button>
            <button className="btn ghost xs"><XI name="play" className="ico-xs" />Simuler</button>
            <span style={{ width: 1, height: 14, background: "var(--border)", margin: "0 4px" }} />
            <button className="btn outline xs"><XI name="pause" className="ico-xs" />Mettre en pause</button>
            <button className="btn ok xs"><XI name="power" className="ico-xs" />Activer</button>
          </div>
        </div>
        <div className="canvas-host" onClick={() => setSelectedId(null)}>
          <div className="canvas-dotgrid" />
          <div className="canvas-stage" style={{ transform: `scale(${zoom / 100})`, transformOrigin: "50% 0" }}
               onClick={(e) => e.stopPropagation()}>
            <FlowGraph wf={wf} selectedId={selectedId} onSelect={setSelectedId}
                       onAddNode={(slot) => { setPickerSlot(slot); setShowPicker(true); }} />
          </div>

          <div className="canvas-tools" onClick={(e) => e.stopPropagation()}>
            <div className="grp">
              <button onClick={() => setZoom(Math.max(50, zoom - 5))}><XI name="chevdown" className="ico-sm" /></button>
              <button className="zoom-val" onClick={() => setZoom(100)}>{zoom}%</button>
              <button onClick={() => setZoom(Math.min(150, zoom + 5))}><XI name="chevup" className="ico-sm" /></button>
            </div>
            <div className="grp">
              <button><XI name="undo" className="ico-sm" /></button>
              <button><XI name="redo" className="ico-sm" /></button>
            </div>
            <div className="grp">
              <button><XI name="checkBig" className="ico-sm" />Valider</button>
            </div>
          </div>
          <div className="canvas-help">
            <kbd>⌘</kbd>+scroll : zoom · <kbd>Space</kbd> + drag : pan
          </div>
        </div>
      </div>

      {/* RIGHT: inspector */}
      <div className="pane">
        <NodeInspector node={selectedNode} updateNode={(patch) => updateNode(selectedId, patch)} />
      </div>

      {showPicker && (
        <NodePickerModal onClose={() => setShowPicker(false)}
                         onPick={(item) => { setShowPicker(false); /* would add node */ }} />
      )}
    </>
  );
}

// ── Node card in left library (draggable handle) ──────────────────────────
function NodeCard({ item, cat }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 8px",
      borderRadius: 6,
      cursor: "grab",
      border: "1px solid var(--border)",
      background: "var(--surface)",
    }}>
      <span style={{
        width: 24, height: 24, borderRadius: 5,
        background: `var(--${cat}-tint)`, color: `var(--${cat})`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <XI name={item.icon} className="ico-sm" />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.name}
        </div>
      </div>
      <XI name="grip" className="ico-sm" style={{ color: "var(--text-4)" }} />
    </div>
  );
}

// ── Flow graph (renders the sample wf) ────────────────────────────────────
function FlowGraph({ wf, selectedId, onSelect, onAddNode }) {
  // Hard-coded layout for the sample: n1 → n2 → (yes: n3 → n4) (no: n5 → n6)
  const byId = Object.fromEntries(wf.nodes.map((n) => [n.id, n]));
  const node = (id) => byId[id];

  return (
    <div className="flow-track">
      {/* trigger node */}
      <FlowNode node={node("n1")} isSelected={selectedId === "n1"} onSelect={() => onSelect("n1")} />
      <FlowConn onAdd={() => onAddNode?.({ after: "n1" })} />

      <FlowNode node={node("n2")} isSelected={selectedId === "n2"} onSelect={() => onSelect("n2")} />
      <FlowConn />

      {/* branch */}
      <div className="flow-branch">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span className="flow-branch-lbl yes">✓ OUI</span>
          <FlowConn />
          <FlowNode node={node("n3")} isSelected={selectedId === "n3"} onSelect={() => onSelect("n3")} />
          <FlowConn />
          <FlowNode node={node("n4")} isSelected={selectedId === "n4"} onSelect={() => onSelect("n4")} />
          <FlowConn />
          <div className="flow-end"><XI name="flag" className="ico-sm" />Fin</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span className="flow-branch-lbl no">✕ NON</span>
          <FlowConn />
          <FlowNode node={node("n5")} isSelected={selectedId === "n5"} onSelect={() => onSelect("n5")} />
          <FlowConn />
          <FlowNode node={node("n6")} isSelected={selectedId === "n6"} onSelect={() => onSelect("n6")} />
          <FlowConn />
          <div className="flow-end"><XI name="flag" className="ico-sm" />Fin</div>
        </div>
      </div>
    </div>
  );
}

// ── Single flow node ──────────────────────────────────────────────────────
function FlowNode({ node, isSelected, onSelect }) {
  if (!node) return null;
  const meta = nodeMeta(node);

  return (
    <div className="flow-node" data-cat={node.cat} data-selected={isSelected}
         onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <div className="node-hd">
        <span className="ic-wrap">
          <XI name={meta.icon} className="ico" />
        </span>
        <div className="name" style={{ minWidth: 0 }}>
          <div>{node.title}</div>
          <div className="sublabel">{meta.subtitle}</div>
        </div>
        <span className="badge-cat">{meta.catLabel}</span>
        <div className="tools">
          <button title="Dupliquer"><XI name="copyClip" className="ico-sm" /></button>
          <button title="Supprimer"><XI name="trash" className="ico-sm" /></button>
        </div>
      </div>
      <div className="node-body">
        {meta.bodyRows.map((row, i) => (
          <div className="node-row" key={i}>
            <span className="lhs">
              {row.icon && <XI name={row.icon} className="ico-sm" style={{ color: "var(--text-3)" }} />}
              <span className="lbl">{row.lbl}</span>
              {row.symbol && <span style={{ color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>{row.symbol}</span>}
              <span className="val" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.val}</span>
            </span>
            {row.tag && <span className={`pill ${row.tagCls || ""}`}>{row.tag}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Compute node display metadata (icon, body summary) from its config
function nodeMeta(node) {
  const cfg = node.config || {};
  const m = { icon: "bolt", subtitle: "", catLabel: node.cat, bodyRows: [] };
  m.catLabel = node.cat === "trigger" ? "Déclencheur" :
               node.cat === "cond"    ? "Condition" :
               node.cat === "action"  ? "Action" :
               node.cat === "delay"   ? "Délai" :
               node.cat === "manual"  ? "Manuel" : node.cat;
  if (node.type === "trg.stage_changed") {
    const pip = supaRow("pipelines", cfg.pipeline);
    const st  = supaRow("stages",    cfg.stage_to);
    m.icon = "pipeline";
    m.subtitle = "déclenche dès qu'une opp. change de stage";
    m.bodyRows = [
      { icon: "pipeline", lbl: "Pipeline",  val: pip?.name || "—", tag: pip ? "pipelines.id" : null, tagCls: "supa" },
      { icon: "kanban",   lbl: "Stage cible", symbol: "=", val: st?.name || "—", tag: st ? "stages.id" : null, tagCls: "supa" },
    ];
  } else if (node.type === "cnd.if_field") {
    const op = OPS.find((o) => o.id === cfg.op);
    m.icon = "filter";
    m.subtitle = "branche selon une valeur";
    m.bodyRows = [
      { icon: "variable", lbl: "Champ", val: cfg.field || "—" },
      { lbl: "Opérateur", val: op ? `${op.symbol}  ${op.label}` : "=" },
      { lbl: "Valeur",    val: cfg.value != null ? String(cfg.value) + " €" : "—" },
    ];
  } else if (node.type === "act.assign_owner") {
    const u = supaRow("users", cfg.user);
    m.icon = "user";
    m.subtitle = "attribuer l'opp. à un utilisateur";
    m.bodyRows = [
      { icon: "user", lbl: "Utilisateur", val: u?.name || "—", tag: u ? "auth.users" : null, tagCls: "supa" },
    ];
  } else if (node.type === "act.notify") {
    m.icon = "bell";
    m.subtitle = "notification d'équipe";
    m.bodyRows = [
      { icon: "bell", lbl: "Canal", val: `#${cfg.channel}` },
      { lbl: "Message", val: `« ${cfg.message?.slice(0, 36) || ""}… »` },
    ];
  } else if (node.type === "act.create_task") {
    const tt = supaRow("task_types", cfg.type);
    const u  = supaRow("users", cfg.assignee);
    m.icon = "task";
    m.subtitle = "créer une tâche assignée";
    m.bodyRows = [
      { icon: "task", lbl: "Type",  val: tt?.name || "—", tag: tt ? "task_types.id" : null, tagCls: "supa" },
      { icon: "user", lbl: "Assignée à", val: u?.name || "—", tag: u ? "auth.users" : null, tagCls: "supa" },
    ];
  } else if (node.type === "act.send_email") {
    const tpl = supaRow("email_templates", cfg.template);
    m.icon = "mail";
    m.subtitle = "envoie un email via template";
    m.bodyRows = [
      { icon: "template", lbl: "Template", val: tpl?.name || "—", tag: tpl ? "email_templates.id" : null, tagCls: "supa" },
      { icon: "mail", lbl: "Sujet", val: tpl?.subject || "—" },
    ];
  }
  return m;
}

// ──────────────────────────────────────────────────────────────────────────
//   NODE INSPECTOR (right pane)
// ──────────────────────────────────────────────────────────────────────────
function NodeInspector({ node, updateNode }) {
  if (!node) {
    return (
      <div className="pane-body" style={{ padding: 24, color: "var(--text-3)", textAlign: "center" }}>
        <XI name="cursor" className="ico-xl" style={{ color: "var(--text-4)", margin: "40px 0 14px" }} />
        <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 4 }}>Aucun bloc sélectionné</div>
        <div style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          Cliquez sur un bloc dans le canvas pour modifier ses paramètres.
        </div>
      </div>
    );
  }
  return (
    <div className="inspector">
      <div className="inspector-hd">
        <div className="top">
          <span className="ic-wrap" style={{
            background: `var(--${node.cat}-tint)`,
            color: `var(--${node.cat})`,
          }}>
            <XI name={nodeMeta(node).icon} className="ico" />
          </span>
          <h3>{node.title}</h3>
          <span className="pill" style={{ background: `var(--${node.cat}-tint)`, color: `var(--${node.cat})` }}>
            {nodeMeta(node).catLabel}
          </span>
        </div>
        <div className="desc">{nodeMeta(node).subtitle}</div>
      </div>

      <div className="inspector-body">
        <NodeInspectorBody node={node} updateNode={updateNode} />

        <Section label="Avancé" defaultOpen={false}>
          <Field label="ID interne">
            <input className="input mono" defaultValue={node.id} disabled />
          </Field>
          <Field label="Étiquette personnalisée" hint="optionnel">
            <input className="input" defaultValue={node.title} />
          </Field>
          <ToggleRow label="Logger chaque exécution" checked />
          <ToggleRow label="Notifier en cas d'erreur" desc="Lucas Martin · Slack #ops" checked />
        </Section>
      </div>
    </div>
  );
}

function NodeInspectorBody({ node, updateNode }) {
  const cfg = node.config || {};

  if (node.type === "trg.stage_changed") {
    return (
      <Section label="Source des données" defaultOpen>
        <Field label="Pipeline" required>
          <SupaSelect table="pipelines" value={cfg.pipeline}
                      placeholder="Choisir un pipeline…"
                      icon="pipeline"
                      onChange={(v) => updateNode({ config: { pipeline: v, stage_to: null } })} />
        </Field>
        <Field label="Stage destination" required
               hint={cfg.pipeline ? null : "choisissez un pipeline"}>
          <SupaSelect table="stages" value={cfg.stage_to}
                      placeholder="Stage…"
                      icon="kanban"
                      disabled={!cfg.pipeline}
                      filterFK={cfg.pipeline ? { pipeline_id: cfg.pipeline } : null}
                      onChange={(v) => updateNode({ config: { stage_to: v } })} />
        </Field>
        <Field label="Stage source"
               hint="optionnel">
          <SupaSelect table="stages" value={cfg.stage_from}
                      placeholder="Tous les stages précédents"
                      icon="kanban"
                      disabled={!cfg.pipeline}
                      filterFK={cfg.pipeline ? { pipeline_id: cfg.pipeline } : null}
                      onChange={(v) => updateNode({ config: { stage_from: v } })} />
        </Field>
        <ToggleRow label="Re-déclencher si re-passage"
                   desc="Si l'opp. revient à ce stage, ré-exécuter le workflow."
                   checked={cfg.repeat} onChange={(v) => updateNode({ config: { repeat: v } })} />
      </Section>
    );
  }

  if (node.type === "cnd.if_field") {
    return (
      <Section label="Condition" defaultOpen>
        <Field label="Champ" required>
          <FieldSelect entity="opportunities" value={cfg.field}
                       onChange={(v) => updateNode({ config: { field: v } })} />
        </Field>
        <Field label="Opérateur">
          <OpSelect value={cfg.op} onChange={(v) => updateNode({ config: { op: v } })} />
        </Field>
        <Field label="Valeur">
          <input className="input mono" defaultValue={cfg.value}
                 onBlur={(e) => updateNode({ config: { value: Number(e.target.value) || e.target.value } })} />
        </Field>
        <ToggleRow label="Comparaison casse-sensible" />
        <ToggleRow label="Si manquant, prendre le chemin NON" checked />
      </Section>
    );
  }

  if (node.type === "act.assign_owner") {
    return (
      <Section label="Attribution" defaultOpen>
        <Field label="Mode">
          <SegFull value={cfg.mode || "fixed"}
                   onChange={(v) => updateNode({ config: { mode: v } })}
                   options={[
                     { value: "fixed", label: "Utilisateur fixe" },
                     { value: "rr",    label: "Round-robin" },
                     { value: "load",  label: "Moins chargé" },
                   ]} />
        </Field>
        <Field label="Utilisateur" required>
          <SupaSelect table="users" value={cfg.user}
                      placeholder="Choisir un utilisateur…"
                      icon="user"
                      onChange={(v) => updateNode({ config: { user: v } })} />
        </Field>
        <ToggleRow label="Notifier l'utilisateur" checked accent />
        <ToggleRow label="Avertir si l'utilisateur est en congé" checked />
      </Section>
    );
  }

  if (node.type === "act.notify") {
    return (
      <Section label="Notification" defaultOpen>
        <Field label="Canal Slack" required>
          <input className="input mono" defaultValue={"#" + (cfg.channel || "")} />
        </Field>
        <Field label="Message">
          <textarea className="textarea" rows={3} defaultValue={cfg.message} />
        </Field>
        <Field label="Aussi destiné à">
          <SupaSelect table="users" placeholder="Mentionner un utilisateur…" icon="user" />
        </Field>
        <ToggleRow label="Inclure les détails de l'opportunité" checked />
      </Section>
    );
  }

  if (node.type === "act.create_task") {
    return (
      <Section label="Tâche" defaultOpen>
        <Field label="Titre">
          <input className="input" defaultValue={node.title} />
        </Field>
        <Field label="Type" required>
          <SupaSelect table="task_types" value={cfg.type}
                      icon="task"
                      onChange={(v) => updateNode({ config: { type: v } })} />
        </Field>
        <Field label="Assignée à" required>
          <SupaSelect table="users" value={cfg.assignee}
                      icon="user"
                      onChange={(v) => updateNode({ config: { assignee: v } })} />
        </Field>
        <Field label="Échéance" hint="depuis le déclenchement">
          <div className="field-row">
            <input className="input mono" defaultValue="2" style={{ flex: 1 }} />
            <select className="select" defaultValue="d" style={{ flex: 1.4 }}>
              <option value="m">minutes</option>
              <option value="h">heures</option>
              <option value="d">jours ouvrés</option>
              <option value="dc">jours calendaires</option>
            </select>
          </div>
        </Field>
      </Section>
    );
  }

  if (node.type === "act.send_email") {
    return (
      <Section label="Email" defaultOpen>
        <Field label="Template" required>
          <SupaSelect table="email_templates" value={cfg.template}
                      icon="template"
                      onChange={(v) => updateNode({ config: { template: v } })} />
        </Field>
        <Field label="Expéditeur">
          <SupaSelect table="users" placeholder="Utilisateur expéditeur" icon="user" />
        </Field>
        <Field label="Destinataire">
          <select className="select">
            <option>contact.email (de l'opp.)</option>
            <option>contact.email (du déclencheur)</option>
            <option>Personnalisé…</option>
          </select>
        </Field>
        <ToggleRow label="Tracker les ouvertures" checked accent />
        <ToggleRow label="Tracker les clics" checked accent />
        <ToggleRow label="Programmer en heures ouvrées (9h–19h)" checked />
      </Section>
    );
  }

  return (
    <Section label="Paramètres">
      <div className="empty-row">Aucun paramètre disponible.</div>
    </Section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//   NODE PICKER MODAL
// ──────────────────────────────────────────────────────────────────────────
function NodePickerModal({ onClose, onPick }) {
  const [q, setQ] = useState("");
  return ReactDOM.createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hd">
          <div className="grow">
            <div className="title">Ajouter un bloc</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              Choisissez parmi les déclencheurs, conditions, actions et étapes manuelles.
            </div>
          </div>
          <button className="btn ghost sm icon" onClick={onClose}><XI name="x" className="ico-sm" /></button>
        </div>
        <div style={{ padding: "10px 18px", borderBottom: "1px solid var(--border)" }}>
          <SearchInput value={q} onChange={setQ} placeholder="Rechercher un bloc (ex: email, stage, webhook…)" />
        </div>
        <div className="modal-body">
          {NODE_CATALOG.map((sec) => {
            const items = sec.items.filter((i) => !q || i.name.toLowerCase().includes(q.toLowerCase()));
            if (items.length === 0) return null;
            return (
              <div key={sec.section}>
                <div className="picker-section-label">{sec.section}</div>
                <div className="picker-grid">
                  {items.map((it) => (
                    <div key={it.id} className={`picker-card ${sec.cat}`} onClick={() => onPick?.(it)}>
                      <div className="top">
                        <span className="ic"><XI name={it.icon} className="ico" /></span>
                        <div style={{ minWidth: 0 }}>
                          <div className="name">{it.name}</div>
                        </div>
                      </div>
                      <div className="desc">{it.desc || "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Flow connector (centred vertical bar with +) ─────────────────────────
function FlowConn({ onAdd }) {
  return (
    <div className="flow-conn">
      <button className="add" onClick={onAdd} title="Insérer un bloc">
        <XI name="plus" className="ico-xs" />
      </button>
    </div>
  );
}

Object.assign(window, {
  AutomationsList, WorkflowBuilder, NodePickerModal, FlowGraph, FlowNode, FlowConn,
});
