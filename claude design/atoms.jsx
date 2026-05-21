// atoms.jsx — small reusable UI atoms used across builder/logic/preview.

const { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect, useReducer } = React;

// ── Inline editable text (single line or paragraph) ─────────────────────────
function Editable({ value, onChange, multiline = false, placeholder = "",
                    className = "", style, as = "div", autoFocus = false }) {
  const ref = useRef(null);
  const lastExternal = useRef(value);
  // Sync only when external value changes from outside this element.
  useEffect(() => {
    if (lastExternal.current !== value && ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value || "";
    }
    lastExternal.current = value;
  }, [value]);

  useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);

  const Tag = as;
  return (
    <Tag
      ref={ref}
      className={`editable ${className}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder}
      style={style}
      onInput={(e) => {
        const v = multiline ? e.currentTarget.innerText : e.currentTarget.textContent;
        lastExternal.current = v;
        onChange?.(v);
      }}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === "Escape") e.currentTarget.blur();
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      }}
    >
      {value || ""}
    </Tag>
  );
}

// ── Tooltip-free menu (popover) ─────────────────────────────────────────────
function Popover({ anchor, open, onClose, children, placement = "bottom-start", offset = 4 }) {
  const popRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!open || !anchor?.current) return;
    const r = anchor.current.getBoundingClientRect();
    let top = r.bottom + offset, left = r.left;
    if (placement === "bottom-end") left = r.right;
    if (placement === "top-start")  top = r.top - offset;
    setPos({ top, left });
  }, [open, anchor, placement, offset]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (popRef.current?.contains(e.target)) return;
      if (anchor?.current?.contains(e.target)) return;
      onClose?.();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchor, onClose]);
  if (!open) return null;
  return ReactDOM.createPortal(
    <div ref={popRef} className="popover"
         style={{ position: "fixed", top: pos.top, left: pos.left,
                  transform: placement === "bottom-end" ? "translateX(-100%)" : "none" }}>
      {children}
    </div>,
    document.body
  );
}

// ── Menu items ──────────────────────────────────────────────────────────────
function MenuItem({ children, onClick, icon, danger = false, kbd, disabled = false }) {
  return (
    <button className={`menu-item ${danger ? "danger" : ""}`}
            disabled={disabled}
            onClick={(e) => { e.stopPropagation(); onClick?.(e); }}>
      {icon && <Icon name={icon} className="ico" />}
      <span className="lbl">{children}</span>
      {kbd && <span className="kbd">{kbd}</span>}
    </button>
  );
}
function MenuSep() { return <div className="menu-sep" />; }
function MenuLabel({ children }) { return <div className="menu-label">{children}</div>; }

// ── Inputs used inside the inspector panel ──────────────────────────────────
function Field({ label, hint, children, row = false }) {
  return (
    <div className={`field ${row ? "row" : ""}`}>
      <div className="field-lbl">{label}</div>
      <div className="field-ctl">{children}</div>
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, mono = false, ...rest }) {
  return (
    <input
      className={`text-input ${mono ? "mono" : ""}`}
      type="text"
      value={value ?? ""}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      {...rest}
    />
  );
}

function NumberInput({ value, onChange, ...rest }) {
  return (
    <input className="text-input mono" type="number" value={value ?? ""}
           onChange={(e) => onChange?.(e.target.value === "" ? undefined : Number(e.target.value))} {...rest} />
  );
}

function Select({ value, onChange, children }) {
  return (
    <select className="select-input" value={value ?? ""} onChange={(e) => onChange?.(e.target.value)}>
      {children}
    </select>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <label className="switch">
      <span className="switch-track" data-on={checked ? "1" : "0"}><i /></span>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange?.(e.target.checked)} hidden />
      {label && <span className="switch-lbl">{label}</span>}
    </label>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value}
                onClick={() => onChange?.(o.value)}>
          {o.icon && <Icon name={o.icon} className="ico-sm" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Useful: short id generator ──────────────────────────────────────────────
const uid = (prefix = "id") => `${prefix}_${Math.random().toString(36).slice(2, 8)}`;

// ── Atoms style (one shared block) ──────────────────────────────────────────
const ATOMS_CSS = `
.editable {
  outline: none;
  border-radius: 4px;
  padding: 1px 3px;
  margin: -1px -3px;
  cursor: text;
  white-space: pre-wrap;
  word-break: break-word;
}
.editable:empty::before {
  content: attr(data-placeholder);
  color: var(--text-4);
  pointer-events: none;
}
.editable:hover { background: var(--hover); }
.editable:focus { background: var(--hover); box-shadow: 0 0 0 1px var(--accent-tint-2); }

.popover {
  background: var(--surface);
  border: 1px solid var(--border-2);
  border-radius: 10px;
  box-shadow: var(--shadow-pop);
  padding: 4px;
  min-width: 200px;
  z-index: 2000;
  font-size: 12.5px;
}
.menu-item {
  appearance: none; border: 0; background: transparent;
  width: 100%; height: 28px; padding: 0 8px;
  display: flex; align-items: center; gap: 8px;
  font: inherit; font-size: 12.5px; color: var(--text);
  border-radius: 6px;
  cursor: default;
  text-align: left;
}
.menu-item:hover:not([disabled]) { background: var(--hover); }
.menu-item[disabled] { opacity: .4; }
.menu-item .lbl { flex: 1; }
.menu-item .kbd {
  font-family: var(--font-mono); font-size: 10.5px; color: var(--text-4);
}
.menu-item.danger { color: var(--danger); }
.menu-item.danger:hover { background: rgba(181,50,47,.06); }
.menu-sep { height: 1px; background: var(--border); margin: 4px 0; }
.menu-label {
  padding: 6px 10px 4px; font-size: 10.5px;
  text-transform: uppercase; letter-spacing: .06em;
  color: var(--text-3); font-weight: 600;
}

.field { display: flex; flex-direction: column; gap: 6px; padding: 8px 14px; }
.field.row { flex-direction: row; align-items: center; justify-content: space-between; padding: 6px 14px; }
.field.row .field-lbl { margin: 0; }
.field-lbl { font-size: 11px; font-weight: 500; color: var(--text-2); letter-spacing: .01em; }
.field-hint { font-size: 11px; color: var(--text-3); line-height: 1.4; }

.text-input {
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border-2);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  outline: none;
  transition: border-color .12s, background .12s, box-shadow .12s;
}
.text-input.mono { font-family: var(--font-mono); }
.text-input:hover { border-color: var(--border-strong); }
.text-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-tint); }
textarea.text-input { padding: 6px 8px; height: auto; min-height: 60px; resize: vertical; font-family: inherit; }

.select-input {
  appearance: none;
  width: 100%; height: 28px;
  padding: 0 24px 0 8px;
  border: 1px solid var(--border-2);
  border-radius: 6px;
  background: var(--surface) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M0 0h10L5 6z' fill='%2314120E'/></svg>") no-repeat right 8px center;
  font: inherit; font-size: 12.5px; color: var(--text);
  outline: none;
}
.select-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-tint); }

.switch { display: inline-flex; align-items: center; gap: 8px; cursor: default; }
.switch-track {
  position: relative;
  width: 28px; height: 16px;
  background: var(--border-strong);
  border-radius: 999px;
  transition: background .15s;
}
.switch-track i {
  position: absolute; top: 2px; left: 2px;
  width: 12px; height: 12px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0,0,0,.2);
  transition: transform .15s;
}
.switch-track[data-on="1"] { background: var(--accent); }
.switch-track[data-on="1"] i { transform: translateX(12px); }

.segmented {
  display: inline-flex; padding: 2px;
  background: var(--bg-2);
  border-radius: 7px;
  border: 1px solid var(--border);
}
.segmented button {
  appearance: none; border: 0; background: transparent;
  height: 22px; padding: 0 8px;
  font: inherit; font-size: 11.5px; font-weight: 500;
  color: var(--text-2);
  border-radius: 5px;
  cursor: default;
  display: inline-flex; align-items: center; gap: 4px;
}
.segmented button:hover { color: var(--text); }
.segmented button[aria-checked="true"] {
  background: var(--surface); color: var(--text);
  box-shadow: 0 1px 2px rgba(0,0,0,.05);
}
`;

Object.assign(window, {
  Editable, Popover, MenuItem, MenuSep, MenuLabel,
  Field, TextInput, NumberInput, Select, Switch, Segmented,
  uid, ATOMS_CSS,
});
