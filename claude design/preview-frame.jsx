// preview-frame.jsx — live form preview (right panel + Preview tab).
// Renders the form as the end-user would see it.
// Supports two modes:
//  - "step": one question per page, big editorial style (Typeform-like)
//  - "scroll": all questions on one page

const PREVIEW_CSS = `
.preview-host {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  background: var(--bg);
  overflow: hidden;
}
.preview-chrome {
  height: 32px; flex-shrink: 0;
  display: flex; align-items: center;
  padding: 0 10px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  gap: 6px;
}
.preview-chrome .dots { display: flex; gap: 5px; }
.preview-chrome .dots i {
  width: 9px; height: 9px; border-radius: 50%;
  background: var(--border-2);
}
.preview-chrome .url {
  flex: 1;
  height: 20px;
  background: var(--bg-2);
  border-radius: 10px;
  padding: 0 10px;
  font: 11px/20px var(--font-mono);
  color: var(--text-3);
  display: flex; align-items: center; gap: 6px;
  margin: 0 8px;
}
.preview-chrome .url .ico { width: 10px; height: 10px; }
.preview-chrome .device-pick {
  display: flex; padding: 2px;
  background: var(--bg-2);
  border-radius: 6px;
}
.preview-chrome .device-pick button {
  appearance: none; border: 0; background: transparent;
  width: 24px; height: 20px;
  border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-3);
  cursor: default;
}
.preview-chrome .device-pick button[aria-pressed="true"] {
  background: var(--surface); color: var(--text);
  box-shadow: 0 1px 2px rgba(0,0,0,.05);
}

.preview-viewport {
  flex: 1; min-height: 0;
  overflow: auto;
  display: flex; align-items: flex-start; justify-content: center;
  padding: 16px;
}
.preview-frame {
  background: white;
  border-radius: 8px;
  box-shadow: 0 6px 24px rgba(20,18,14,.08), 0 1px 0 var(--border);
  overflow: hidden;
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
}
.preview-frame.device-desktop { max-width: 100%; min-height: 100%; }
.preview-frame.device-mobile { width: 380px; min-height: 720px; max-width: 380px; flex: 0 0 auto; }

/* Progress bar */
.pv-progress {
  position: relative;
  height: 4px;
  background: rgba(20,18,14,.06);
  flex-shrink: 0;
}
.pv-progress .fill {
  position: absolute; top: 0; left: 0; bottom: 0;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
  transition: width .35s cubic-bezier(.2,.7,.3,1);
}
.pv-progress .meta {
  position: absolute; top: 10px; right: 14px;
  font-family: var(--font-mono); font-size: 10.5px;
  color: var(--text-3);
}

.pv-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 56px;
  min-height: 0;
}
.preview-frame.device-mobile .pv-body { padding: 28px 22px; }
.pv-card {
  width: 100%;
  max-width: 580px;
}
.pv-step {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent-2);
  margin-bottom: 8px;
  display: flex; align-items: center; gap: 6px;
}
.pv-step svg { width: 11px; height: 11px; }
.pv-title {
  font-family: var(--font-form);
  font-size: 30px;
  font-weight: 600;
  letter-spacing: -.02em;
  line-height: 1.18;
  color: #14120E;
  margin-bottom: 10px;
}
.preview-frame.device-mobile .pv-title { font-size: 24px; }
.pv-subtitle {
  font-family: var(--font-form);
  font-size: 15.5px;
  color: rgba(20,18,14,.62);
  line-height: 1.55;
  margin-bottom: 32px;
}
.pv-answer { margin-top: 20px; }

/* User inputs */
.pv-text-input {
  width: 100%;
  border: 0;
  outline: 0;
  border-bottom: 2px solid rgba(20,18,14,.18);
  background: transparent;
  font-family: var(--font-form);
  font-size: 22px;
  padding: 10px 0 12px;
  color: #14120E;
  transition: border-color .15s;
}
.pv-text-input:focus { border-color: var(--accent); }
.pv-text-input::placeholder { color: rgba(20,18,14,.28); }
textarea.pv-text-input { resize: vertical; min-height: 80px; font-size: 18px; line-height: 1.5; }

/* Choices */
.pv-choices { display: flex; flex-direction: column; gap: 10px; }
.pv-choice {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px;
  border: 1.5px solid rgba(20,18,14,.14);
  background: white;
  border-radius: 10px;
  cursor: default;
  transition: transform .12s, border-color .12s, background .12s;
}
.pv-choice:hover { border-color: var(--accent); background: var(--accent-tint); }
.pv-choice.selected {
  border-color: var(--accent);
  background: var(--accent-tint);
}
.pv-choice .ch-icon {
  width: 36px; height: 36px; border-radius: 8px;
  background: var(--accent-tint);
  color: var(--accent-2);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.pv-choice .ch-text { flex: 1; min-width: 0; }
.pv-choice .ch-text .lbl {
  font-family: var(--font-form);
  font-size: 16px; font-weight: 500; color: #14120E;
  line-height: 1.3;
}
.pv-choice .ch-text .desc {
  font-family: var(--font-form);
  font-size: 13px; color: rgba(20,18,14,.5);
  margin-top: 2px;
}
.pv-choice .ch-key {
  width: 26px; height: 26px;
  border: 1.5px solid rgba(20,18,14,.18);
  border-radius: 6px;
  font: 12px/1 var(--font-mono);
  color: rgba(20,18,14,.5);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  background: white;
}
.pv-choice.selected .ch-key {
  background: var(--accent); color: white; border-color: var(--accent);
}

/* Yes/No */
.pv-yesno { display: flex; gap: 12px; }
.pv-yesno button {
  flex: 1;
  height: 60px;
  font: 17px/1 var(--font-form); font-weight: 500;
  border: 1.5px solid rgba(20,18,14,.14);
  background: white;
  border-radius: 10px;
  color: #14120E;
  display: flex; align-items: center; justify-content: center;
  gap: 8px;
  cursor: default;
}
.pv-yesno button:hover { border-color: var(--accent); background: var(--accent-tint); }
.pv-yesno button.on { background: var(--accent); color: white; border-color: var(--accent); }
.pv-yesno button .k {
  font-family: var(--font-mono); font-size: 11px;
  background: rgba(20,18,14,.06); padding: 2px 6px; border-radius: 4px;
}
.pv-yesno button.on .k { background: rgba(255,255,255,.2); color: white; }

/* Stars */
.pv-stars { display: flex; gap: 6px; align-items: center; }
.pv-star {
  width: 44px; height: 44px;
  display: flex; align-items: center; justify-content: center;
  color: rgba(20,18,14,.16);
  cursor: default;
}
.pv-star.on { color: var(--accent); }
.pv-star svg { width: 28px; height: 28px; }
.pv-star-label {
  margin-left: 10px;
  font-family: var(--font-form);
  font-size: 14px; color: var(--text-2);
}

/* Scale */
.pv-scale { display: flex; gap: 8px; flex-wrap: wrap; }
.pv-scale button {
  width: 44px; height: 44px;
  font: 16px/1 var(--font-form); font-weight: 500;
  border: 1.5px solid rgba(20,18,14,.14);
  background: white;
  border-radius: 8px;
  color: #14120E;
  cursor: default;
}
.pv-scale button:hover { border-color: var(--accent); }
.pv-scale button.on { background: var(--accent); color: white; border-color: var(--accent); }

/* Slider */
.pv-slider-value {
  font-family: var(--font-form);
  font-size: 44px; font-weight: 600;
  letter-spacing: -.02em;
  color: #14120E;
  margin-bottom: 18px;
}
.pv-slider {
  appearance: none; -webkit-appearance: none;
  width: 100%;
  height: 6px;
  background: rgba(20,18,14,.1);
  border-radius: 999px;
  outline: none;
}
.pv-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 22px; height: 22px;
  background: var(--accent);
  border: 4px solid white;
  border-radius: 50%;
  box-shadow: 0 0 0 1px rgba(20,18,14,.12);
}
.pv-slider::-moz-range-thumb {
  width: 22px; height: 22px;
  background: var(--accent);
  border: 4px solid white;
  border-radius: 50%;
}
.pv-slider-marks {
  margin-top: 14px;
  display: flex; justify-content: space-between;
  font: 13px var(--font-mono);
  color: rgba(20,18,14,.45);
}

/* Date */
.pv-date {
  display: flex; gap: 8px;
  font-family: var(--font-form);
}
.pv-date input {
  width: 70px; height: 56px;
  text-align: center;
  border: 1.5px solid rgba(20,18,14,.14);
  background: white;
  border-radius: 8px;
  font: 22px var(--font-form);
  color: #14120E;
  outline: none;
}
.pv-date input:focus { border-color: var(--accent); }
.pv-date .y { width: 100px; }

/* Dropdown */
.pv-dropdown {
  width: 100%;
  height: 52px;
  padding: 0 16px;
  border: 1.5px solid rgba(20,18,14,.14);
  background: white;
  border-radius: 10px;
  font: 16px var(--font-form);
  color: #14120E;
  display: flex; align-items: center; gap: 8px;
}
.pv-dropdown .ico { margin-left: auto; color: var(--text-3); }
.pv-dropdown.placeholder { color: rgba(20,18,14,.4); }

.pv-dropdown-list {
  margin-top: 6px;
  border: 1.5px solid rgba(20,18,14,.14);
  border-radius: 10px;
  background: white;
  overflow: hidden;
}
.pv-dropdown-list button {
  width: 100%;
  appearance: none; border: 0; background: transparent;
  text-align: left;
  padding: 12px 16px;
  font: 15px var(--font-form);
  color: #14120E;
  display: block;
}
.pv-dropdown-list button + button { border-top: 1px solid rgba(20,18,14,.06); }
.pv-dropdown-list button:hover { background: var(--accent-tint); }

/* File */
.pv-file {
  border: 2px dashed rgba(20,18,14,.16);
  border-radius: 12px;
  padding: 36px;
  text-align: center;
  color: rgba(20,18,14,.5);
  font-family: var(--font-form);
}
.pv-file .ico { color: var(--accent-2); width: 28px; height: 28px; margin-bottom: 8px; }

/* Footer CTA */
.pv-footer {
  margin-top: 28px;
  display: flex; align-items: center; gap: 14px;
}
.pv-cta {
  appearance: none; border: 0;
  height: 50px;
  padding: 0 24px;
  background: var(--accent);
  color: white;
  font: 14px var(--font-form); font-weight: 600;
  border-radius: 8px;
  display: inline-flex; align-items: center; gap: 10px;
  cursor: default;
  transition: background .12s;
}
.pv-cta:hover:not(:disabled) { background: var(--accent-2); }
.pv-cta:disabled { background: rgba(20,18,14,.18); cursor: not-allowed; }
.pv-cta .k {
  font: 10.5px var(--font-mono); font-weight: 500;
  background: rgba(255,255,255,.2); padding: 2px 6px; border-radius: 4px;
}
.pv-hint {
  font: 12px var(--font-form);
  color: rgba(20,18,14,.45);
}
.pv-hint b { color: #14120E; font-weight: 500; }

/* Welcome / End */
.pv-welcome { text-align: left; }
.pv-end { text-align: left; }
.pv-end .ok-icon {
  width: 56px; height: 56px;
  border-radius: 50%;
  background: var(--accent-tint);
  color: var(--accent);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 28px;
}
.pv-brand {
  position: absolute;
  bottom: 14px; left: 24px;
  display: flex; align-items: center; gap: 8px;
  font: 11px var(--font-mono);
  color: rgba(20,18,14,.4);
}
.pv-brand i {
  width: 18px; height: 18px;
  background: var(--accent);
  border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  color: white;
  font: 700 11px var(--font-mono);
}

/* Scroll mode */
.pv-scroll {
  display: flex; flex-direction: column;
  padding: 48px 56px 48px;
  gap: 56px;
}
.preview-frame.device-mobile .pv-scroll { padding: 24px 22px; }
.pv-scroll .pv-card-block {
  border-bottom: 1px dashed rgba(20,18,14,.08);
  padding-bottom: 56px;
}
.pv-scroll .pv-card-block:last-child { border-bottom: 0; padding-bottom: 0; }

/* Nav */
.pv-nav {
  position: absolute;
  right: 16px; bottom: 16px;
  display: flex; flex-direction: column; gap: 4px;
}
.pv-nav button {
  appearance: none; border: 1px solid rgba(20,18,14,.12);
  background: white;
  width: 32px; height: 28px;
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  color: rgba(20,18,14,.4);
  cursor: default;
  font-size: 12px;
}
.pv-nav button:hover { color: #14120E; }
.pv-nav button:disabled { opacity: .35; cursor: not-allowed; }
`;

function PreviewFrame({ form, mode = "step", device = "desktop" }) {
  const [answers, setAnswers] = useState({});
  const [idx, setIdx] = useState(0);
  // Resolve visible flow given answers
  const flow = useMemo(() => resolveFlow(form, answers), [form, answers]);
  const safeIdx = Math.min(idx, flow.length - 1);
  const currentId = flow[safeIdx];
  const current = form.questions.find((q) => q.id === currentId);
  const total = form.questions.filter((q) => q.type !== "welcome" && q.type !== "end").length;
  // For progress: which non-welcome/end position in the flow are we at?
  const progressIdx = flow.slice(0, safeIdx + 1).filter((id) => {
    const q = form.questions.find((x) => x.id === id);
    return q && q.type !== "welcome" && q.type !== "end";
  }).length;
  const progressPct = total === 0 ? 0 : Math.min(100, (progressIdx / total) * 100);

  const setAnswer = (qid, val) => setAnswers((a) => ({ ...a, [qid]: val }));

  const goNext = () => { if (safeIdx < flow.length - 1) setIdx(safeIdx + 1); };
  const goPrev = () => { if (safeIdx > 0) setIdx(safeIdx - 1); };

  // Reset when form structure changes substantially
  useEffect(() => { setIdx(0); }, [form.id]);
  // Clamp idx if questions removed
  useEffect(() => { if (safeIdx !== idx) setIdx(safeIdx); }, [flow.length]);

  return (
    <div className={`preview-frame device-${device}`}>
      <div className="pv-progress">
        <div className="fill" style={{ width: `${progressPct}%` }} />
        {form.settings.progressBar && <span className="meta">{progressIdx} / {total}</span>}
      </div>

      {mode === "step" ? (
        <div className="pv-body">
          {current && (
            <QuestionRenderer
              form={form}
              q={current}
              value={answers[current.id]}
              onChange={(v) => setAnswer(current.id, v)}
              onSubmit={goNext}
              showNumber={form.settings.showQuestionNumber}
              total={total}
              index={progressIdx}
            />
          )}
        </div>
      ) : (
        <div className="pv-scroll">
          {flow.map((id, i) => {
            const q = form.questions.find((x) => x.id === id);
            if (!q) return null;
            const isStruct = q.type === "welcome" || q.type === "end";
            return (
              <div key={id} className="pv-card-block">
                <QuestionRenderer
                  form={form}
                  q={q}
                  value={answers[id]}
                  onChange={(v) => setAnswer(id, v)}
                  onSubmit={() => {}}
                  showNumber={form.settings.showQuestionNumber && !isStruct}
                  total={total}
                  index={i + 1}
                  inline
                />
              </div>
            );
          })}
        </div>
      )}

      {mode === "step" && (
        <div className="pv-nav">
          <button onClick={goPrev} disabled={safeIdx === 0} title="Précédent"><Icon name="chevup" className="ico-sm" /></button>
          <button onClick={goNext} disabled={safeIdx >= flow.length - 1} title="Suivant"><Icon name="chevdown" className="ico-sm" /></button>
        </div>
      )}

      <div className="pv-brand">
        <i>T</i> propulsé par <b style={{ color: "rgba(20,18,14,.6)" }}>{form.brand.name}</b>
      </div>
    </div>
  );
}

function QuestionRenderer({ form, q, value, onChange, onSubmit, showNumber, total, index, inline }) {
  const t = QT[q.type];
  const isStruct = q.type === "welcome" || q.type === "end" || q.type === "statement";

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (q.type === "long_text") return;
      e.preventDefault();
      onSubmit?.();
    }
  };

  if (q.type === "welcome") {
    return (
      <div className="pv-card pv-welcome">
        <h1 className="pv-title" style={{ fontSize: 38 }}>{q.title}</h1>
        <p className="pv-subtitle" style={{ fontSize: 17 }}>{q.subtitle}</p>
        <div className="pv-footer">
          <button className="pv-cta" onClick={onSubmit}>{q.cta || "Commencer"} <span className="k">↵</span></button>
          <span className="pv-hint">prend <b>~2 minutes</b></span>
        </div>
      </div>
    );
  }

  if (q.type === "end") {
    return (
      <div className="pv-card pv-end">
        <div className="ok-icon"><Icon name="check" className="ico" /></div>
        <h1 className="pv-title">{q.title}</h1>
        <p className="pv-subtitle">{q.subtitle}</p>
        <div className="pv-footer">
          <button className="pv-cta">{q.cta || "Terminer"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pv-card">
      {showNumber && (
        <div className="pv-step">
          <Icon name="chevright" className="ico-sm" />
          {index} <span style={{ opacity: .5 }}>· {q.required ? "obligatoire" : "optionnel"}</span>
        </div>
      )}
      <h2 className="pv-title">{q.title}</h2>
      {q.subtitle && <p className="pv-subtitle">{q.subtitle}</p>}

      <div className="pv-answer" onKeyDown={onKeyDown}>
        <AnswerInput q={q} value={value} onChange={onChange} onSubmit={onSubmit} />
      </div>

      {!inline && !isStruct && (
        <div className="pv-footer">
          <button className="pv-cta" onClick={onSubmit}
                  disabled={q.required && (value === undefined || value === "" || (Array.isArray(value) && value.length === 0))}>
            OK <span className="k">↵</span>
          </button>
          <span className="pv-hint">appuyer <b>Entrée ↵</b></span>
        </div>
      )}
    </div>
  );
}

function AnswerInput({ q, value, onChange, onSubmit }) {
  switch (q.type) {
    case "short_text":
    case "email":
    case "phone":
      return <input className="pv-text-input" type={q.type === "email" ? "email" : "text"}
                    placeholder={q.placeholder || "Votre réponse…"}
                    value={value || ""} onChange={(e) => onChange(e.target.value)} autoFocus />;
    case "long_text":
      return <textarea className="pv-text-input" placeholder={q.placeholder || "Votre réponse…"}
                       value={value || ""} onChange={(e) => onChange(e.target.value)} autoFocus />;
    case "number":
      return <input className="pv-text-input" type="number"
                    placeholder={q.placeholder || "0"}
                    value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} autoFocus />;

    case "multi_choice":
    case "single_choice": {
      const isMulti = q.type === "multi_choice";
      const sel = isMulti ? (value || []) : value;
      const toggle = (id) => {
        if (isMulti) {
          const next = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
          onChange(next);
        } else {
          onChange(id);
          setTimeout(() => onSubmit?.(), 200);
        }
      };
      return (
        <div className="pv-choices">
          {q.choices.map((c, i) => {
            const on = isMulti ? sel.includes(c.id) : sel === c.id;
            return (
              <div key={c.id} className={`pv-choice ${on ? "selected" : ""}`} onClick={() => toggle(c.id)}>
                {c.icon && (
                  <div className="ch-icon"><Icon name={c.icon} className="ico-lg" /></div>
                )}
                <div className="ch-text">
                  <div className="lbl">{c.label}</div>
                  {c.desc && <div className="desc">{c.desc}</div>}
                </div>
                <div className="ch-key">{String.fromCharCode(65 + i)}</div>
              </div>
            );
          })}
        </div>
      );
    }

    case "dropdown": {
      const [open, setOpen] = useState(false);
      const sel = q.choices?.find((c) => c.id === value);
      return (
        <div>
          <div className={`pv-dropdown ${sel ? "" : "placeholder"}`} onClick={() => setOpen(!open)}>
            {sel ? sel.label : (q.placeholder || "Sélectionner une option…")}
            <Icon name="chevdown" className="ico" />
          </div>
          {open && (
            <div className="pv-dropdown-list">
              {q.choices?.map((c) => (
                <button key={c.id} onClick={() => { onChange(c.id); setOpen(false); }}>{c.label}</button>
              ))}
            </div>
          )}
        </div>
      );
    }

    case "yes_no":
      return (
        <div className="pv-yesno">
          <button className={value === "yes" ? "on" : ""}
                  onClick={() => { onChange("yes"); setTimeout(() => onSubmit?.(), 200); }}>
            <Icon name="check" className="ico" />Oui <span className="k">Y</span>
          </button>
          <button className={value === "no" ? "on" : ""}
                  onClick={() => { onChange("no"); setTimeout(() => onSubmit?.(), 200); }}>
            <Icon name="x" className="ico" />Non <span className="k">N</span>
          </button>
        </div>
      );

    case "rating": {
      const max = q.max || 5;
      const v = value || 0;
      const labels = ["", "Très insatisfait", "Insatisfait", "Correct", "Bien", "Excellent"];
      return (
        <div className="pv-stars">
          {Array.from({ length: max }).map((_, i) => (
            <span key={i} className={`pv-star ${i < v ? "on" : ""}`} onClick={() => onChange(i + 1)}>
              <Icon name="rating" />
            </span>
          ))}
          {v > 0 && <span className="pv-star-label">{labels[v] || `${v}/${max}`}</span>}
        </div>
      );
    }

    case "scale":
      return (
        <div className="pv-scale">
          {Array.from({ length: 10 }).map((_, i) => (
            <button key={i} className={value === i + 1 ? "on" : ""}
                    onClick={() => onChange(i + 1)}>{i + 1}</button>
          ))}
        </div>
      );

    case "slider": {
      const min = q.min ?? 0, max = q.max ?? 100, step = q.step ?? 1, def = q.default ?? Math.round((min+max)/2);
      const v = value ?? def;
      return (
        <div>
          <div className="pv-slider-value">{v}{q.unit ? ` ${q.unit}` : ""}</div>
          <input className="pv-slider" type="range" min={min} max={max} step={step}
                 value={v} onChange={(e) => onChange(Number(e.target.value))} />
          <div className="pv-slider-marks">
            <span>{min}{q.unit ? ` ${q.unit}` : ""}</span>
            <span>{max}{q.unit ? ` ${q.unit}` : ""}</span>
          </div>
        </div>
      );
    }

    case "date": {
      const v = value || {};
      return (
        <div className="pv-date">
          <input type="text" placeholder="JJ" maxLength={2} value={v.d || ""}
                 onChange={(e) => onChange({ ...v, d: e.target.value.replace(/\D/g,"") })} />
          <input type="text" placeholder="MM" maxLength={2} value={v.m || ""}
                 onChange={(e) => onChange({ ...v, m: e.target.value.replace(/\D/g,"") })} />
          <input className="y" type="text" placeholder="AAAA" maxLength={4} value={v.y || ""}
                 onChange={(e) => onChange({ ...v, y: e.target.value.replace(/\D/g,"") })} />
        </div>
      );
    }

    case "file":
      return (
        <div className="pv-file">
          <Icon name="upload" className="ico" /><br />
          <strong style={{ color: "#14120E" }}>Glissez un fichier</strong> ou cliquez pour parcourir<br />
          <span style={{ fontSize: 12, opacity: .6 }}>Max 10 Mo · PDF, JPG, PNG</span>
        </div>
      );

    case "statement":
      return null;

    default:
      return null;
  }
}

Object.assign(window, { PREVIEW_CSS, PreviewFrame });
