// builder-pane.jsx — 3-column builder: list | editor | inspector.

const BUILDER_CSS = `
/* ── Question list (left) ───────────────────────────────────────── */
.q-list { padding: 6px 8px; display: flex; flex-direction: column; gap: 1px; }
.q-row {
  position: relative;
  display: flex; align-items: center; gap: 8px;
  height: var(--row-h);
  padding: 0 8px 0 6px;
  border-radius: 6px;
  cursor: default;
  color: var(--text-2);
  font-size: 12.5px;
}
.q-row:hover { background: var(--hover); color: var(--text); }
.q-row .drag-handle {
  width: 12px; flex-shrink: 0; opacity: 0; color: var(--text-4);
  display: flex; align-items: center; justify-content: center;
  cursor: grab;
}
.q-row:hover .drag-handle, .q-row.dragging .drag-handle { opacity: 1; }
.q-row .q-ref {
  font-family: var(--font-mono);
  font-size: 10.5px; color: var(--text-4);
  flex-shrink: 0;
  width: 26px;
}
.q-row .q-type {
  width: 18px; height: 18px;
  background: var(--bg-2);
  border-radius: 4px;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-2);
}
.q-row .q-title {
  flex: 1;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  font-weight: 400;
}
.q-row.selected {
  background: var(--accent-tint);
  color: var(--text);
}
.q-row.selected .q-ref { color: var(--accent-2); }
.q-row.selected .q-type { background: var(--accent-tint-2); color: var(--accent-2); }
.q-row.selected .q-title { font-weight: 500; }
.q-row .q-flags { display: flex; gap: 3px; align-items: center; }
.q-row .q-flags i {
  width: 4px; height: 4px; border-radius: 50%;
  background: var(--text-4);
}
.q-row .q-flags i.req { background: var(--accent); }
.q-row .q-flags i.logic { background: var(--logic-cond); }
.q-row.dragging { opacity: .4; }
.q-row.drop-above { box-shadow: inset 0 1px 0 var(--accent); }
.q-row.drop-below { box-shadow: inset 0 -1px 0 var(--accent); }

.list-add {
  margin: 8px 6px;
  display: flex; align-items: center; gap: 6px;
  height: var(--tap-h); padding: 0 8px;
  border-radius: 7px;
  border: 1px dashed var(--border-2);
  background: transparent;
  color: var(--text-3);
  font: inherit; font-size: 12px;
  cursor: default;
}
.list-add:hover { background: var(--hover); color: var(--text); border-color: var(--border-strong); }
.list-add .ico { color: var(--text-4); }

.list-section {
  padding: 14px 14px 4px;
  font-size: 10.5px; font-weight: 600;
  text-transform: uppercase; letter-spacing: .06em;
  color: var(--text-3);
}

/* ── Picker popover for + add ────────────────────────────────────── */
.type-picker { width: 240px; padding: 6px; max-height: 380px; overflow: auto; }
.type-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2px;
  padding: 4px;
}
.type-tile {
  appearance: none; border: 0; background: transparent;
  display: flex; align-items: center; gap: 8px;
  padding: 7px 8px;
  border-radius: 6px;
  font: inherit; font-size: 12px; color: var(--text);
  cursor: default;
}
.type-tile:hover { background: var(--hover); }
.type-tile .ico {
  width: 14px; height: 14px;
  color: var(--text-2);
}

/* ── Center editor ──────────────────────────────────────────────── */
.editor-wrap {
  flex: 1; min-height: 0;
  overflow: auto;
  background:
    linear-gradient(var(--bg-2) 1px, transparent 1px) 0 0 / 24px 24px,
    linear-gradient(90deg, var(--bg-2) 1px, transparent 1px) 0 0 / 24px 24px,
    var(--bg);
  background-blend-mode: normal;
  display: flex; align-items: flex-start; justify-content: center;
  padding: 32px 32px 64px;
}
.editor-card {
  width: 100%;
  max-width: 720px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  box-shadow: var(--shadow-2);
  padding: 36px 40px 32px;
  position: relative;
}
.editor-card .editor-meta {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 18px;
  font-size: 11.5px; color: var(--text-3);
}
.editor-card .editor-meta .ref {
  font-family: var(--font-mono);
  background: var(--bg-2);
  padding: 2px 6px; border-radius: 4px;
  color: var(--text-2);
  font-size: 10.5px;
}
.editor-card .editor-meta .type-tag {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px;
  color: var(--text-2);
}
.editor-card .editor-meta .spacer { flex: 1; }
.editor-title {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -.018em;
  line-height: 1.2;
  color: var(--text);
  margin-bottom: 8px;
}
.editor-subtitle {
  font-size: 15px;
  line-height: 1.55;
  color: var(--text-2);
  margin-bottom: 28px;
}

/* answer area mockups */
.ans-area { margin-top: 8px; }
.ans-input {
  height: 44px;
  border: 1px solid var(--border-2);
  border-radius: 8px;
  background: var(--surface-2);
  display: flex; align-items: center;
  padding: 0 14px;
  color: var(--text-3);
  font-size: 15px;
  font-family: var(--font-form);
}
.ans-input.tall { height: 96px; align-items: flex-start; padding-top: 12px; }

.choice-list { display: flex; flex-direction: column; gap: 8px; }
.choice-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-2);
  border-radius: 9px;
  background: var(--surface);
  position: relative;
}
.choice-row:hover { border-color: var(--border-strong); }
.choice-row .ch-icon {
  width: 32px; height: 32px;
  border-radius: 7px;
  background: var(--accent-tint);
  color: var(--accent-2);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.choice-row .ch-text { flex: 1; min-width: 0; }
.choice-row .ch-text .lbl {
  font-size: 14.5px; font-weight: 500; color: var(--text);
  line-height: 1.3;
}
.choice-row .ch-text .desc {
  font-size: 12.5px; color: var(--text-3); margin-top: 2px;
}
.choice-row .ch-shortcut {
  width: 22px; height: 22px;
  border: 1px solid var(--border-2);
  border-radius: 5px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.choice-row .ch-del {
  position: absolute; right: -8px; top: -8px;
  width: 20px; height: 20px;
  border-radius: 50%;
  background: var(--surface);
  border: 1px solid var(--border-2);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-3);
  opacity: 0;
  cursor: default;
}
.choice-row:hover .ch-del { opacity: 1; }
.choice-row .ch-del:hover { color: var(--danger); border-color: var(--danger); }
.choice-row.dragging { opacity: .4; }
.choice-row.drop-above { box-shadow: inset 0 2px 0 var(--accent); }
.choice-row.drop-below { box-shadow: inset 0 -2px 0 var(--accent); }

.choice-add {
  margin-top: 4px;
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  border: 1px dashed var(--border-2);
  border-radius: 8px;
  color: var(--text-3);
  font-size: 12.5px;
  cursor: default;
}
.choice-add:hover { border-color: var(--accent); color: var(--accent-2); background: var(--accent-tint); }
.choice-add .ico { color: inherit; }

/* rating preview */
.rating-stars { display: flex; gap: 4px; }
.rating-stars .star {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-4);
}
.rating-stars .star.on { color: var(--accent); }
.scale-row { display: flex; gap: 6px; }
.scale-row .num {
  width: 38px; height: 38px;
  border: 1px solid var(--border-2);
  border-radius: 8px;
  font-family: var(--font-form);
  display: flex; align-items: center; justify-content: center;
  font-weight: 500;
  color: var(--text-2);
}

/* yes/no preview */
.yesno-row { display: flex; gap: 10px; }
.yesno-row .pill-btn {
  flex: 1;
  height: 56px;
  border: 1px solid var(--border-2);
  border-radius: 10px;
  font-size: 16px; font-weight: 500;
  color: var(--text);
  display: flex; align-items: center; justify-content: center;
  gap: 8px;
}
.yesno-row .pill-btn .k {
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--bg-2);
  color: var(--text-3);
  padding: 2px 6px;
  border-radius: 4px;
}

/* slider preview */
.slider-wrap { padding: 12px 0; }
.slider-track {
  height: 4px;
  background: var(--bg-2);
  border-radius: 999px;
  position: relative;
}
.slider-track .fill {
  position: absolute; top: 0; bottom: 0; left: 0;
  background: var(--accent);
  border-radius: 999px;
}
.slider-track .thumb {
  position: absolute; top: 50%;
  width: 18px; height: 18px;
  background: white;
  border: 2px solid var(--accent);
  border-radius: 50%;
  transform: translate(-50%, -50%);
}
.slider-meta {
  margin-top: 14px;
  display: flex; justify-content: space-between;
  font-size: 12.5px;
  color: var(--text-3);
  font-family: var(--font-mono);
}
.slider-value {
  font-size: 32px;
  font-weight: 600;
  font-family: var(--font-form);
  color: var(--text);
  letter-spacing: -.02em;
  margin-bottom: 12px;
}

/* welcome / end */
.welcome-card { text-align: center; padding: 20px 0; }
.welcome-card .cta {
  margin-top: 28px;
  display: inline-flex; align-items: center; gap: 8px;
  height: 44px; padding: 0 22px;
  background: var(--accent);
  color: white;
  font-size: 14px; font-weight: 500;
  border-radius: 8px;
}
.welcome-card .cta .k {
  font-family: var(--font-mono); font-size: 10.5px;
  background: rgba(255,255,255,.18); padding: 1px 5px; border-radius: 3px;
}

/* file upload */
.file-drop {
  border: 2px dashed var(--border-2);
  border-radius: 12px;
  padding: 30px;
  text-align: center;
  color: var(--text-3);
}
.file-drop .ico { width: 28px; height: 28px; margin-bottom: 8px; color: var(--text-3); }

/* date */
.date-mock {
  display: flex; gap: 6px;
}
.date-mock .seg {
  width: 56px; height: 44px;
  border: 1px solid var(--border-2);
  border-radius: 8px;
  background: var(--surface-2);
  display: flex; align-items: center; justify-content: center;
  color: var(--text-3); font-size: 15px;
  font-family: var(--font-mono);
}

/* dropdown */
.dropdown-mock {
  height: 44px;
  border: 1px solid var(--border-2);
  border-radius: 8px;
  display: flex; align-items: center;
  padding: 0 14px;
  color: var(--text-3);
  background: var(--surface);
  font-size: 15px;
}

/* Editor footer */
.editor-footer {
  margin-top: 24px;
  display: flex; align-items: center; gap: 10px;
  color: var(--text-3); font-size: 12px;
}
.editor-footer .ok-btn {
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 14px;
  background: var(--text); color: var(--bg);
  border-radius: 7px;
  font-size: 13px; font-weight: 500;
}
.editor-footer .ok-btn .k {
  font-family: var(--font-mono); font-size: 10.5px;
  background: rgba(255,255,255,.18); padding: 1px 5px; border-radius: 3px;
}

/* ── Right inspector ───────────────────────────────────────────────── */
.insp-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}
.insp-tab {
  flex: 1;
  appearance: none; border: 0; background: transparent;
  height: 32px; padding: 0 4px;
  font: inherit; font-size: 12px; font-weight: 500;
  white-space: nowrap;
  color: var(--text-3);
  cursor: default;
  border-bottom: 1.5px solid transparent;
  margin-bottom: -1px;
}
.insp-tab[aria-selected="true"] {
  color: var(--text);
  border-bottom-color: var(--text);
}
.insp-tab:hover { color: var(--text); }
.insp-section {
  padding: 6px 0 10px;
  border-bottom: 1px solid var(--border);
}
.insp-section:last-child { border-bottom: 0; }
.insp-section-hd {
  padding: 10px 14px 4px;
  font-size: 10.5px; font-weight: 600;
  text-transform: uppercase; letter-spacing: .06em;
  color: var(--text-3);
}

.logic-rule {
  margin: 8px 14px;
  padding: 10px;
  border: 1px solid var(--border-2);
  border-radius: 8px;
  background: var(--surface-2);
}
.logic-rule .rule-hd {
  display: flex; align-items: center; gap: 6px;
  margin-bottom: 6px;
}
.logic-rule .rule-hd .pill {
  background: var(--logic-cond-tint); color: var(--logic-cond);
}
.logic-rule .rule-body {
  font-size: 12px; color: var(--text-2);
  line-height: 1.5;
}
.logic-rule .rule-body code {
  font-family: var(--font-mono); font-size: 11px;
  background: var(--surface); border: 1px solid var(--border);
  padding: 1px 5px; border-radius: 4px;
}
.logic-rule .rule-target {
  margin-top: 6px;
  font-size: 11.5px; color: var(--text-3);
}
.logic-rule .rule-target b { color: var(--text); font-weight: 500; }

.empty-state {
  padding: 40px 16px; text-align: center;
  color: var(--text-3); font-size: 12px;
}
.empty-state .ico { width: 22px; height: 22px; color: var(--text-4); margin-bottom: 8px; }
`;

// ── Picker grouped by category ──────────────────────────────────────────────
function TypePicker({ onPick }) {
  return (
    <div className="type-picker">
      {QT_GROUPS.map((g) => (
        <React.Fragment key={g.id}>
          <MenuLabel>{g.label}</MenuLabel>
          <div className="type-grid">
            {g.items.map((id) => {
              const t = QT[id];
              return (
                <button key={id} className="type-tile" onClick={() => onPick(id)}>
                  <Icon name={t.icon} className="ico" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Question list (left column) ─────────────────────────────────────────────
function QuestionList({ form, selectedId, onSelect, onReorder, onAdd, onDuplicate, onDelete }) {
  const [dragId, setDragId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // {id, where}
  const addBtnRef = useRef(null);
  const [addOpen, setAddOpen] = useState(false);

  const ruleByFrom = useMemo(() => {
    const s = new Set();
    form.logic.forEach((r) => s.add(r.from));
    return s;
  }, [form.logic]);

  return (
    <>
      <div className="q-list">
        {form.questions.map((q, i) => {
          const t = QT[q.type] || {};
          const isSel = q.id === selectedId;
          const dragging = dragId === q.id;
          const drop = dropTarget?.id === q.id ? dropTarget.where : null;
          return (
            <div
              key={q.id}
              className={`q-row ${isSel ? "selected" : ""} ${dragging ? "dragging" : ""} ${drop ? `drop-${drop}` : ""}`}
              onClick={() => onSelect(q.id)}
              draggable
              onDragStart={(e) => {
                setDragId(q.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", q.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                const r = e.currentTarget.getBoundingClientRect();
                const where = e.clientY < r.top + r.height / 2 ? "above" : "below";
                setDropTarget({ id: q.id, where });
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => {
                e.preventDefault();
                const src = e.dataTransfer.getData("text/plain");
                if (src && src !== q.id) onReorder(src, q.id, dropTarget?.where || "below");
                setDragId(null); setDropTarget(null);
              }}
              onDragEnd={() => { setDragId(null); setDropTarget(null); }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className="drag-handle"><Icon name="drag" className="ico-sm" /></span>
              <span className="q-ref">{q.ref || `Q${i + 1}`}</span>
              <span className="q-type"><Icon name={t.icon || "textShort"} className="ico-sm" /></span>
              <span className="q-title" title={q.title}>{q.title || <em style={{ color: "var(--text-4)" }}>Sans titre</em>}</span>
              <span className="q-flags">
                {q.required && <i className="req" title="Obligatoire" />}
                {ruleByFrom.has(q.id) && <i className="logic" title="Logique" />}
              </span>
            </div>
          );
        })}

        <button ref={addBtnRef} className="list-add" onClick={() => setAddOpen((v) => !v)}>
          <Icon name="plus" className="ico-sm" />
          <span>Ajouter une question</span>
        </button>
      </div>

      <Popover anchor={addBtnRef} open={addOpen} onClose={() => setAddOpen(false)}>
        <TypePicker onPick={(tid) => { setAddOpen(false); onAdd(tid); }} />
      </Popover>
    </>
  );
}

// ── Question editor (center) ────────────────────────────────────────────────
function QuestionEditor({ form, question, onChangeQ, onChangeChoices }) {
  if (!question) {
    return (
      <div className="editor-wrap">
        <div className="empty-state" style={{ marginTop: 80 }}>
          <Icon name="textShort" className="ico" /><br />
          Sélectionnez une question dans la liste pour l'éditer.
        </div>
      </div>
    );
  }
  const t = QT[question.type];
  return (
    <div className="editor-wrap">
      <div className="editor-card">
        <div className="editor-meta">
          <span className="ref">{question.ref}</span>
          <span className="type-tag">
            <Icon name={t.icon} className="ico-sm" />
            {t.label}
          </span>
          {question.required && <span className="pill req">obligatoire</span>}
          <span className="spacer" />
          <button className="btn ghost sm" style={{ fontSize: 11, color: "var(--text-3)" }}>
            <Icon name="image" className="ico-sm" />Ajouter média
          </button>
        </div>

        <Editable
          as="h2" className="editor-title"
          placeholder="Posez votre question…"
          value={question.title}
          onChange={(v) => onChangeQ({ title: v })}
        />
        <Editable
          as="div" className="editor-subtitle" multiline
          placeholder="Ajoutez une description (optionnel)"
          value={question.subtitle || ""}
          onChange={(v) => onChangeQ({ subtitle: v })}
        />

        <div className="ans-area">
          <QuestionAnswerEditor q={question} onChangeQ={onChangeQ} onChangeChoices={onChangeChoices} />
        </div>

        {question.type !== "welcome" && question.type !== "end" && question.type !== "statement" && (
          <div className="editor-footer">
            <div className="ok-btn">OK <span className="k">↵</span></div>
            <span>appuyer sur <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 11, background: "var(--bg-2)", padding: "1px 5px", borderRadius: 3 }}>Entrée</kbd></span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── per-type answer renderer for the editor ─────────────────────────────────
function QuestionAnswerEditor({ q, onChangeQ, onChangeChoices }) {
  const isChoice = q.type === "multi_choice" || q.type === "single_choice" || q.type === "dropdown";

  if (isChoice) {
    return <ChoiceEditor q={q} onChange={onChangeChoices} />;
  }

  switch (q.type) {
    case "welcome":
    case "end":
      return (
        <div className="welcome-card">
          <div className="cta">{q.cta || "Commencer"} <span className="k">↵</span></div>
        </div>
      );
    case "statement":
      return null;
    case "short_text":
      return <div className="ans-input">{q.placeholder || "Votre réponse…"}</div>;
    case "long_text":
      return <div className="ans-input tall">{q.placeholder || "Votre réponse… (Maj+Entrée pour aller à la ligne)"}</div>;
    case "email":
      return <div className="ans-input">{q.placeholder || "vous@example.com"}</div>;
    case "phone":
      return <div className="ans-input">{q.placeholder || "+33 6 12 34 56 78"}</div>;
    case "number":
      return <div className="ans-input">{q.placeholder || "0"}</div>;
    case "yes_no":
      return (
        <div className="yesno-row">
          <div className="pill-btn"><Icon name="check" className="ico" />Oui <span className="k">Y</span></div>
          <div className="pill-btn"><Icon name="x" className="ico" />Non <span className="k">N</span></div>
        </div>
      );
    case "rating":
      return (
        <div className="rating-stars">
          {Array.from({ length: q.max || 5 }).map((_, i) => (
            <span key={i} className={`star ${i < 3 ? "on" : ""}`}><Icon name="rating" className="ico-lg" /></span>
          ))}
        </div>
      );
    case "scale":
      return (
        <div className="scale-row">
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} className="num">{i + 1}</span>
          ))}
        </div>
      );
    case "date":
      return (
        <div className="date-mock">
          <div className="seg">JJ</div><div className="seg">MM</div><div className="seg">AAAA</div>
        </div>
      );
    case "dropdown":
      return <div className="dropdown-mock"><span style={{ flex: 1 }}>{q.placeholder || "Sélectionner…"}</span><Icon name="chevdown" className="ico" /></div>;
    case "file":
      return (
        <div className="file-drop">
          <Icon name="upload" className="ico" /><br />
          <strong style={{ color: "var(--text)" }}>Glissez un fichier</strong> ou cliquez pour parcourir<br />
          <span style={{ fontSize: 11, color: "var(--text-4)" }}>Max 10 Mo · PDF, JPG, PNG</span>
        </div>
      );
    case "slider": {
      const min = q.min ?? 0, max = q.max ?? 100, def = q.default ?? Math.round((min+max)/2);
      const pct = ((def - min) / (max - min)) * 100;
      return (
        <div className="slider-wrap">
          <div className="slider-value">{def}{q.unit ? ` ${q.unit}` : ""}</div>
          <div className="slider-track">
            <div className="fill" style={{ width: `${pct}%` }} />
            <div className="thumb" style={{ left: `${pct}%` }} />
          </div>
          <div className="slider-meta">
            <span>{min}{q.unit ? ` ${q.unit}` : ""}</span>
            <span>{max}{q.unit ? ` ${q.unit}` : ""}</span>
          </div>
        </div>
      );
    }
    default:
      return <div className="ans-input">aperçu indisponible</div>;
  }
}

// ── Choice editor with drag-reorder and add/delete ──────────────────────────
const SHORTCUTS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const ICON_CHOICES = ["flame","snow","droplet","sun","home","building","tools","euro","clock","zap","check","x","warning","user"];

function ChoiceEditor({ q, onChange }) {
  const [iconPickerFor, setIconPickerFor] = useState(null);
  const iconBtnRefs = useRef({});
  const [dragId, setDragId] = useState(null);
  const [dropAt, setDropAt] = useState(null);

  const setChoices = (next) => onChange(next);
  const updateChoice = (id, patch) => setChoices(q.choices.map((c) => c.id === id ? { ...c, ...patch } : c));
  const removeChoice = (id) => setChoices(q.choices.filter((c) => c.id !== id));
  const addChoice = () => {
    const i = q.choices.length;
    setChoices([...q.choices, { id: uid("c"), label: `Option ${i + 1}` }]);
  };

  const onDropOnRow = (targetId, where, srcId) => {
    if (srcId === targetId) return;
    const arr = [...q.choices];
    const src = arr.findIndex((c) => c.id === srcId);
    const tgt = arr.findIndex((c) => c.id === targetId);
    if (src < 0 || tgt < 0) return;
    const [m] = arr.splice(src, 1);
    const insertAt = arr.findIndex((c) => c.id === targetId) + (where === "below" ? 1 : 0);
    arr.splice(insertAt, 0, m);
    setChoices(arr);
  };

  return (
    <div className="choice-list">
      {q.choices.map((c, i) => {
        const drop = dropAt?.id === c.id ? dropAt.where : null;
        const setRef = (el) => (iconBtnRefs.current[c.id] = { current: el });
        return (
          <div
            key={c.id}
            className={`choice-row ${dragId === c.id ? "dragging" : ""} ${drop ? `drop-${drop}` : ""}`}
            draggable
            onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.id); }}
            onDragOver={(e) => {
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setDropAt({ id: c.id, where: e.clientY < r.top + r.height / 2 ? "above" : "below" });
            }}
            onDragLeave={() => setDropAt(null)}
            onDrop={(e) => {
              e.preventDefault();
              const src = e.dataTransfer.getData("text/plain");
              if (src) onDropOnRow(c.id, dropAt?.where || "below", src);
              setDragId(null); setDropAt(null);
            }}
            onDragEnd={() => { setDragId(null); setDropAt(null); }}
          >
            <button className="ch-icon" ref={setRef}
                    onClick={() => setIconPickerFor(iconPickerFor === c.id ? null : c.id)}
                    style={{ background: c.icon ? "var(--accent-tint)" : "var(--bg-2)",
                             color: c.icon ? "var(--accent-2)" : "var(--text-4)" }}>
              <Icon name={c.icon || "plus"} className="ico" />
            </button>
            <div className="ch-text">
              <Editable as="div" className="lbl"
                        placeholder="Libellé du choix"
                        value={c.label}
                        onChange={(v) => updateChoice(c.id, { label: v })} />
              <Editable as="div" className="desc"
                        placeholder="Ajouter une description…"
                        value={c.desc || ""}
                        onChange={(v) => updateChoice(c.id, { desc: v })} />
            </div>
            <span className="ch-shortcut">{SHORTCUTS[i]}</span>
            <button className="ch-del" onClick={(e) => { e.stopPropagation(); removeChoice(c.id); }}>
              <Icon name="x" className="ico-sm" />
            </button>

            <Popover anchor={iconBtnRefs.current[c.id]}
                     open={iconPickerFor === c.id}
                     onClose={() => setIconPickerFor(null)}>
              <div style={{ padding: 6, width: 200 }}>
                <MenuLabel>Choisir une icône</MenuLabel>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 2, padding: 4 }}>
                  <button className="menu-item" style={{ padding: 0, justifyContent: "center", height: 28 }}
                          onClick={() => { updateChoice(c.id, { icon: null }); setIconPickerFor(null); }}
                          title="Aucune">
                    <Icon name="x" className="ico-sm" />
                  </button>
                  {ICON_CHOICES.map((ic) => (
                    <button key={ic} className="menu-item"
                            style={{ padding: 0, justifyContent: "center", height: 28,
                                     background: c.icon === ic ? "var(--accent-tint)" : "transparent",
                                     color: c.icon === ic ? "var(--accent-2)" : "var(--text)" }}
                            onClick={() => { updateChoice(c.id, { icon: ic }); setIconPickerFor(null); }}>
                      <Icon name={ic} className="ico" />
                    </button>
                  ))}
                </div>
                <MenuSep />
                <MenuItem icon="image" onClick={() => { setIconPickerFor(null); }}>Importer une image…</MenuItem>
              </div>
            </Popover>
          </div>
        );
      })}

      <button className="choice-add" onClick={addChoice}>
        <Icon name="plus" className="ico-sm" />
        <span>Ajouter un choix</span>
      </button>
    </div>
  );
}

// ── Inspector (right column) ────────────────────────────────────────────────
function Inspector({ form, question, onChangeQ, onChangeChoices, onDeleteQuestion, onDuplicate, onAddLogicFrom }) {
  const [tab, setTab] = useState("content");
  if (!question) {
    return (
      <>
        <div className="pane-hd">Inspector</div>
        <div className="empty-state">Aucune question sélectionnée.</div>
      </>
    );
  }
  const t = QT[question.type];
  const rules = form.logic.filter((r) => r.from === question.id);

  return (
    <>
      <div className="pane-hd">
        <span>{question.ref} · {t.label}</span>
        <div className="actions">
          <button className="btn icon sm" title="Dupliquer" onClick={() => onDuplicate(question.id)}>
            <Icon name="copy" className="ico-sm" />
          </button>
          <button className="btn icon sm" title="Supprimer" onClick={() => onDeleteQuestion(question.id)}>
            <Icon name="trash" className="ico-sm" />
          </button>
        </div>
      </div>

      <div className="insp-tabs" role="tablist">
        <button className="insp-tab" role="tab" aria-selected={tab === "content"} onClick={() => setTab("content")}>Contenu</button>
        <button className="insp-tab" role="tab" aria-selected={tab === "settings"} onClick={() => setTab("settings")}>Réglages</button>
        <button className="insp-tab" role="tab" aria-selected={tab === "logic"} onClick={() => setTab("logic")}>
          Logique {rules.length > 0 && <span className="pill" style={{ marginLeft: 4 }}>{rules.length}</span>}
        </button>
      </div>

      <div className="pane-body">
        {tab === "content" && <InspectorContent q={question} onChangeQ={onChangeQ} />}
        {tab === "settings" && <InspectorSettings q={question} onChangeQ={onChangeQ} />}
        {tab === "logic" && <InspectorLogic form={form} q={question} onAddLogicFrom={onAddLogicFrom} />}
      </div>
    </>
  );
}

function InspectorContent({ q, onChangeQ }) {
  return (
    <>
      <div className="insp-section">
        <div className="insp-section-hd">Question</div>
        <Field label="Réf">
          <TextInput value={q.ref} onChange={(v) => onChangeQ({ ref: v })} mono />
        </Field>
        <Field label="Titre">
          <TextInput value={q.title} onChange={(v) => onChangeQ({ title: v })} placeholder="Posez votre question…" />
        </Field>
        <Field label="Sous-titre">
          <textarea className="text-input" rows={2} value={q.subtitle || ""}
                    onChange={(e) => onChangeQ({ subtitle: e.target.value })}
                    placeholder="Description ou aide…" />
        </Field>
      </div>

      {(q.type === "short_text" || q.type === "long_text" || q.type === "email" || q.type === "phone" || q.type === "number" || q.type === "dropdown") && (
        <div className="insp-section">
          <div className="insp-section-hd">Placeholder</div>
          <Field label="Texte indicatif">
            <TextInput value={q.placeholder || ""} onChange={(v) => onChangeQ({ placeholder: v })} />
          </Field>
        </div>
      )}

      {(q.type === "welcome" || q.type === "end") && (
        <div className="insp-section">
          <div className="insp-section-hd">Bouton</div>
          <Field label="Libellé">
            <TextInput value={q.cta || ""} onChange={(v) => onChangeQ({ cta: v })} placeholder="Commencer" />
          </Field>
        </div>
      )}

      {q.type === "slider" && (
        <div className="insp-section">
          <div className="insp-section-hd">Plage</div>
          <Field label="Min" row><NumberInput value={q.min} onChange={(v) => onChangeQ({ min: v })} /></Field>
          <Field label="Max" row><NumberInput value={q.max} onChange={(v) => onChangeQ({ max: v })} /></Field>
          <Field label="Pas"  row><NumberInput value={q.step} onChange={(v) => onChangeQ({ step: v })} /></Field>
          <Field label="Défaut" row><NumberInput value={q.default} onChange={(v) => onChangeQ({ default: v })} /></Field>
          <Field label="Unité"><TextInput value={q.unit || ""} onChange={(v) => onChangeQ({ unit: v })} placeholder="m², €, kWc…" /></Field>
        </div>
      )}

      {q.type === "rating" && (
        <div className="insp-section">
          <div className="insp-section-hd">Note</div>
          <Field label="Nombre max" row><NumberInput value={q.max || 5} onChange={(v) => onChangeQ({ max: v })} /></Field>
        </div>
      )}

      {(q.type === "multi_choice" || q.type === "single_choice") && (
        <div className="insp-section">
          <div className="insp-section-hd">Choix</div>
          <Field label="Sélection multiple" row>
            <Switch checked={q.type === "multi_choice"}
                    onChange={(on) => onChangeQ({ type: on ? "multi_choice" : "single_choice", multi: on })} />
          </Field>
          <Field label="Aléatoiriser l'ordre" row><Switch checked={!!q.randomize} onChange={(v) => onChangeQ({ randomize: v })} /></Field>
        </div>
      )}
    </>
  );
}

function InspectorSettings({ q, onChangeQ }) {
  return (
    <>
      <div className="insp-section">
        <div className="insp-section-hd">Validation</div>
        <Field label="Obligatoire" row>
          <Switch checked={!!q.required} onChange={(v) => onChangeQ({ required: v })} />
        </Field>
        {(q.type === "short_text" || q.type === "long_text") && (
          <Field label="Longueur max" row>
            <NumberInput value={q.maxLen} onChange={(v) => onChangeQ({ maxLen: v })} />
          </Field>
        )}
      </div>
      <div className="insp-section">
        <div className="insp-section-hd">Mapping CRM</div>
        <Field label="Clé d'export"><TextInput value={q.key || q.id} onChange={(v) => onChangeQ({ key: v })} mono /></Field>
        <Field label="Hidden field" row><Switch checked={!!q.hidden} onChange={(v) => onChangeQ({ hidden: v })} /></Field>
      </div>
      <div className="insp-section">
        <div className="insp-section-hd">Apparence</div>
        <Field label="Image de fond" row>
          <button className="btn outline sm"><Icon name="image" className="ico-sm" />Ajouter</button>
        </Field>
        <Field label="Alignement" row>
          <Segmented value={q.align || "left"} onChange={(v) => onChangeQ({ align: v })}
                     options={[{value:"left",label:"Gauche"},{value:"center",label:"Centre"}]} />
        </Field>
      </div>
    </>
  );
}

function InspectorLogic({ form, q, onAddLogicFrom }) {
  const rules = form.logic.filter((r) => r.from === q.id);
  const labelFor = (id) => form.questions.find((x) => x.id === id)?.title?.slice(0, 50) || "(question supprimée)";
  return (
    <>
      <div className="insp-section">
        <div className="insp-section-hd">Règles depuis cette question</div>
        {rules.length === 0 && (
          <div className="empty-state" style={{ padding: "16px 14px" }}>
            Aucune règle. Par défaut, le formulaire continue vers la question suivante.
          </div>
        )}
        {rules.map((r) => (
          <div key={r.id} className="logic-rule">
            <div className="rule-hd">
              <span className="pill logic">SI</span>
              <span style={{ flex: 1, fontSize: 12, color: "var(--text-2)" }}>{r.label}</span>
            </div>
            <div className="rule-body">
              {(r.cond.all || r.cond.any || []).map((c, i, arr) => {
                const f = form.questions.find((x) => x.id === c.field);
                const choiceLabel = f?.choices?.find((ch) => ch.id === c.value)?.label;
                return (
                  <React.Fragment key={i}>
                    <code>{f?.ref || c.field}</code>{" "}
                    <span style={{ color: "var(--text-3)" }}>{c.op}</span>{" "}
                    <code>{choiceLabel || c.value}</code>
                    {i < arr.length - 1 && <span style={{ color: "var(--logic-cond)", fontWeight: 600 }}> {r.cond.all ? "ET" : "OU"} </span>}
                  </React.Fragment>
                );
              })}
            </div>
            <div className="rule-target">→ aller vers <b>{labelFor(r.to)}</b></div>
          </div>
        ))}
        <div style={{ padding: "8px 14px 14px" }}>
          <button className="btn outline sm" onClick={() => onAddLogicFrom(q.id)}>
            <Icon name="plus" className="ico-sm" />Ajouter une règle
          </button>
        </div>
      </div>

      <div className="insp-section">
        <div className="insp-section-hd">Astuce</div>
        <div style={{ padding: "4px 14px 14px", fontSize: 12, color: "var(--text-3)", lineHeight: 1.55 }}>
          Ouvrez l'onglet <b style={{ color: "var(--text)" }}>Logique</b> en haut pour voir le flow complet et créer des branches visuellement.
        </div>
      </div>
    </>
  );
}

Object.assign(window, {
  BUILDER_CSS,
  TypePicker, QuestionList, QuestionEditor, Inspector,
});
