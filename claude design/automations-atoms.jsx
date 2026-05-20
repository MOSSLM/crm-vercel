// automations-atoms.jsx — shared atoms (SupaSelect, Field, Toggle, etc.)
// SupaSelect renders a Supabase-aware dropdown bound to one of the mock tables.

const { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } = React;

const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 7)}`;

// ── Outside-click hook ─────────────────────────────────────────────────────
function useOutsideClose(ref, onClose, ignore = []) {
  useEffect(() => {
    const onDown = (e) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target)) return;
      for (const r of ignore) {
        if (r?.current?.contains(e.target)) return;
      }
      onClose?.();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, onClose]);
}

// ── Section accordion ──────────────────────────────────────────────────────
function Section({ label, count, defaultOpen = true, children, accessory }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <div className="section-hd" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <XI name="chevdown" className="ico-xs chev" />
        <span>{label}</span>
        {count !== undefined && <span className="count">{count}</span>}
        {accessory && <span style={{ marginLeft: "auto" }}>{accessory}</span>}
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

// ── Field row ─────────────────────────────────────────────────────────────
function Field({ label, hint, required, children }) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        {required && <span className="req">·</span>}
        {hint && <span className="hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({ label, desc, checked, onChange, accent = false }) {
  return (
    <div className="toggle-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="lbl">{label}</div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      <button className={`toggle ${accent ? "accent" : ""}`}
              aria-checked={!!checked}
              onClick={() => onChange?.(!checked)} />
    </div>
  );
}

// ── Segmented (compact) ───────────────────────────────────────────────────
function SegFull({ value, onChange, options }) {
  return (
    <div className="seg" style={{ width: "100%" }}>
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const label = typeof o === "string" ? o : o.label;
        return (
          <button key={v} style={{ flex: 1, justifyContent: "center" }}
                  aria-pressed={value === v}
                  onClick={() => onChange?.(v)}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── Status dot + label combo (for automation list) ────────────────────────
function StatusBadge({ status }) {
  const map = {
    on:     { label: "Active",   cls: "on" },
    paused: { label: "En pause", cls: "paused" },
    draft:  { label: "Brouillon",cls: "draft" },
    error:  { label: "Erreur",   cls: "error" },
  };
  const s = map[status] || map.draft;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11.5, color: "var(--text-2)" }}>
      <span className={`status-dot ${s.cls}`} />
      {s.label}
    </span>
  );
}

// ── Mini avatar (initials + color) ────────────────────────────────────────
function Av({ user, size = 22, ring }) {
  if (!user) return null;
  return (
    <span style={{
      width: size, height: size, borderRadius: "50%",
      background: user.color || "var(--bg-2)",
      color: "#fff", fontSize: Math.round(size * 0.42), fontWeight: 600,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      letterSpacing: "-.02em", flexShrink: 0,
      boxShadow: ring ? `0 0 0 2px var(--surface), 0 0 0 3px ${user.color || "var(--accent)"}` : "none",
    }}>{user.initials || (user.name || "?").slice(0, 2).toUpperCase()}</span>
  );
}

// ── SupaSelect ─────────────────────────────────────────────────────────────
// A "Supabase-aware" dropdown. Props:
//   table      — string, key into SUPA (e.g. "pipelines")
//   value      — selected row id
//   onChange   — (id) => void
//   placeholder
//   filterFK   — { foreignKey: value }  e.g. { pipeline_id: "pip_prosp" }
//   labelKey   — which row field to display (default "name")
//   metaKey    — extra field shown as a meta chip (default depends on table)
//   icon       — show source icon at the left (default "table")
//   disabled
//   showSwatch — render the row's color as a small dot
//
function SupaSelect({
  table, value, onChange, placeholder = "Sélectionner…",
  filterFK = null, labelKey = "name", metaKey, icon = "table",
  disabled = false, showSwatch = true, allowClear = true,
}) {
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const supaTable = SUPA[table];

  const rows = useMemo(() => {
    if (!supaTable) return [];
    let r = supaTable.rows;
    if (filterFK) {
      for (const [k, v] of Object.entries(filterFK)) {
        r = r.filter((row) => row[k] === v);
      }
    }
    if (q) {
      const needle = q.toLowerCase();
      r = r.filter((row) => (row[labelKey] || "").toLowerCase().includes(needle)
        || (row.id || "").toLowerCase().includes(needle));
    }
    return r;
  }, [supaTable, filterFK, q, labelKey]);

  const selected = supaTable?.rows.find((r) => r.id === value);

  // dropdown position
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(260, r.width) });
  }, [open]);

  // close on outside
  const popRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (popRef.current?.contains(e.target)) return;
      if (triggerRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // pick a meta value to show
  const inferredMetaKey = metaKey ||
    (table === "pipelines" ? "count" :
     table === "stages"    ? "position" :
     table === "forms"     ? "submissions" :
     table === "tags"      ? "count" :
     table === "users"     ? "role" :
     table === "email_templates" ? "subject" :
     null);

  return (
    <>
      <button
        ref={triggerRef}
        className="supa-select"
        data-open={open ? "true" : "false"}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="lead" title={`${supaTable?.schema}.${supaTable?.name}`}>
          <XI name={icon} className="ico-sm" />
        </span>
        <span className="vals">
          {selected ? (
            <>
              {showSwatch && selected.color && (
                <span style={{
                  width: 10, height: 10, borderRadius: 3,
                  background: selected.color, flexShrink: 0,
                  border: "1px solid rgba(0,0,0,.06)",
                }} />
              )}
              <span className="main">{selected[labelKey]}</span>
              {inferredMetaKey && selected[inferredMetaKey] != null && (
                <span className="meta">
                  {table === "pipelines" || table === "tags" ? `${selected[inferredMetaKey]}` :
                   table === "stages" ? `pos ${selected[inferredMetaKey]}` :
                   table === "forms" ? `${selected[inferredMetaKey]} subs` :
                   table === "users" ? selected[inferredMetaKey] :
                   selected[inferredMetaKey]}
                </span>
              )}
            </>
          ) : (
            <span className="placeholder">{placeholder}</span>
          )}
        </span>
        {allowClear && selected && (
          <span className="clear" onClick={(e) => { e.stopPropagation(); onChange?.(null); }}
                role="button" title="Effacer">
            <XI name="x" className="ico-xs" />
          </span>
        )}
        <XI name="chevdown" className="ico-xs chev" />
      </button>
      {open && supaTable && ReactDOM.createPortal(
        <div ref={popRef} className="supa-pop"
             style={{ top: pos.top, left: pos.left, minWidth: pos.width }}>
          <div className="src">
            <XI name="database" className="ico-xs" />
            <span className="schema">{supaTable.schema}.</span>
            <span className="name">{supaTable.name}</span>
            <span className="rowcount">{rows.length}/{supaTable.rows.length}</span>
          </div>
          <div className="search-wrap">
            <XI name="search" className="ico-sm" />
            <input
              autoFocus
              placeholder={`Filtrer dans ${supaTable.name}…`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && rows[0]) { onChange?.(rows[0].id); setOpen(false); }
              }}
            />
          </div>
          <div className="opts">
            {rows.length === 0 && <div className="empty-row">Aucun résultat</div>}
            {rows.map((row) => (
              <div key={row.id}
                   className="opt"
                   aria-selected={row.id === value}
                   onClick={() => { onChange?.(row.id); setOpen(false); }}>
                {row.color && <span className="swatch" style={{ background: row.color }} />}
                {!row.color && row.icon && (
                  <XI name={row.icon} className="ico-sm" style={{ color: "var(--text-3)" }} />
                )}
                <span className="label">{row[labelKey]}</span>
                {inferredMetaKey && row[inferredMetaKey] != null && (
                  <span className="meta">
                    {table === "stages" ? `pos ${row[inferredMetaKey]}` :
                     table === "forms" ? `${row[inferredMetaKey]} subs` :
                     table === "tags" ? `${row[inferredMetaKey]} liés` :
                     table === "pipelines" ? `${row[inferredMetaKey]} opp.` :
                     row[inferredMetaKey]}
                  </span>
                )}
                {row.id === value && <XI name="check" className="ico-sm" style={{ color: "var(--accent)" }} />}
              </div>
            ))}
          </div>
          <div className="ft">
            <XI name="database" className="ico-xs" />
            <span>lié à <b>{supaTable.schema}.{supaTable.name}</b></span>
            <span style={{ marginLeft: "auto" }}><kbd>↵</kbd> sélectionner · <kbd>esc</kbd> fermer</span>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Op (operator) select for conditions: =, !=, contains, ≥… ─────────────
const OPS = [
  { id: "eq",       label: "=",          symbol: "=" },
  { id: "neq",      label: "≠",          symbol: "≠" },
  { id: "gt",       label: ">",          symbol: ">" },
  { id: "gte",      label: "≥",          symbol: "≥" },
  { id: "lt",       label: "<",          symbol: "<" },
  { id: "lte",      label: "≤",          symbol: "≤" },
  { id: "contains", label: "contient",   symbol: "∋" },
  { id: "in",       label: "dans",       symbol: "∈" },
  { id: "isset",    label: "renseigné",  symbol: "∃" },
  { id: "isnotset", label: "vide",       symbol: "∅" },
];

function OpSelect({ value, onChange }) {
  return (
    <select className="select" style={{ width: 80, height: 26, fontFamily: "var(--font-mono)", fontSize: 12 }}
            value={value || "eq"}
            onChange={(e) => onChange?.(e.target.value)}>
      {OPS.map((o) => (
        <option key={o.id} value={o.id}>{o.symbol}  {o.label}</option>
      ))}
    </select>
  );
}

// ── Field select (picks a column of an entity) ────────────────────────────
function FieldSelect({ entity, value, onChange, allowEmpty = false }) {
  const fields = SUPA_FIELDS[entity] || [];
  return (
    <select className="select" style={{ height: 26, fontSize: 12 }}
            value={value || ""}
            onChange={(e) => onChange?.(e.target.value)}>
      {allowEmpty && <option value="">— champ —</option>}
      {fields.map((f) => (
        <option key={f.id} value={f.id}>{f.label}</option>
      ))}
    </select>
  );
}

// ── A small SQL-style chip used to indicate a Supabase-bound row ──────────
function SupaChip({ table, id, label }) {
  return (
    <span className="pill supa" title={`${SUPA[table]?.schema}.${SUPA[table]?.name}`}>
      <XI name="table" className="ico-xs" />{label || id}
    </span>
  );
}

// ── Searchable inline input bar (used at the top of list pages) ──────────
function SearchInput({ value, onChange, placeholder = "Rechercher…", style }) {
  return (
    <div className="search-wrap" style={style}>
      <XI name="search" className="ico-sm" />
      <input className="input" value={value || ""}
             onChange={(e) => onChange?.(e.target.value)}
             placeholder={placeholder} />
    </div>
  );
}

// ── Mini Sparkline (10 points) ───────────────────────────────────────────
function Spark({ data, color = "var(--ok)", height = 18, width = 64 }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const w = width / Math.max(data.length - 1, 1);
  const pts = data.map((v, i) => `${i * w},${height - (v / max) * (height - 2) - 1}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── Tweak panel wiring (shared) ──────────────────────────────────────────
const APP_CSS = "";  /* placeholder — main styles are in the HTML */

Object.assign(window, {
  useOutsideClose, Section, Field, ToggleRow, SegFull,
  StatusBadge, Av, SupaSelect, OpSelect, FieldSelect, SupaChip,
  SearchInput, Spark, uid, OPS, APP_CSS,
});
