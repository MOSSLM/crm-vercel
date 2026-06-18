// board-atoms.jsx — shared primitives: markdown, popovers, pickers, menus.

const { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } = React;
const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 8)}`;

// ── Inline markdown → React nodes (**b** *i* `code` [t](url)) ────────────────
function renderInline(text) {
  if (!text) return null;
  const nodes = [];
  let i = 0, key = 0;
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let m, last = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] != null)      nodes.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[4] != null) nodes.push(<em key={key++}>{m[4]}</em>);
    else if (m[6] != null) nodes.push(<code key={key++}>{m[6]}</code>);
    else if (m[8] != null) nodes.push(<a key={key++} className="md-link" onClick={(e) => e.preventDefault()}>{m[8]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// ── Block-level markdown renderer ────────────────────────────────────────────
function Markdown({ source }) {
  const lines = (source || "").split("\n");
  const blocks = [];
  let list = null, listType = null, key = 0;
  const flush = () => {
    if (list) {
      const Tag = listType === "ol" ? "ol" : "ul";
      blocks.push(<Tag key={key++} className="md-list">{list}</Tag>);
      list = null; listType = null;
    }
  };
  lines.forEach((raw, idx) => {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) { flush(); return; }
    if (/^#\s+/.test(line))       { flush(); blocks.push(<div key={key++} className="md-h1">{renderInline(line.replace(/^#\s+/, ""))}</div>); return; }
    if (/^##\s+/.test(line))      { flush(); blocks.push(<div key={key++} className="md-h2">{renderInline(line.replace(/^##\s+/, ""))}</div>); return; }
    if (/^>\s?/.test(line))       { flush(); blocks.push(<blockquote key={key++} className="md-quote">{renderInline(line.replace(/^>\s?/, ""))}</blockquote>); return; }
    const ul = line.match(/^[-*]\s+(.*)/);
    if (ul) { if (listType !== "ul") flush(); listType = "ul"; (list = list || []).push(<li key={"li" + idx}>{renderInline(ul[1])}</li>); return; }
    const ol = line.match(/^\d+\.\s+(.*)/);
    if (ol) { if (listType !== "ol") flush(); listType = "ol"; (list = list || []).push(<li key={"li" + idx}>{renderInline(ol[1])}</li>); return; }
    flush();
    blocks.push(<p key={key++} className="md-p">{renderInline(line)}</p>);
  });
  flush();
  return <div className="md">{blocks}</div>;
}

// ── Portal popover anchored to a rect ────────────────────────────────────────
function Popover({ anchorRect, open, onClose, children, align = "start", offset = 6, className = "" }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    if (!open || !anchorRect) return;
    const r = anchorRect;
    let left = align === "end" ? r.right : r.left;
    let top = r.bottom + offset;
    setPos({ top, left, align });
  }, [open, anchorRect, align, offset]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.(); };
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  if (!open || !pos) return null;
  return ReactDOM.createPortal(
    <div ref={ref} className={`popover ${className}`}
         style={{ position: "fixed", top: pos.top, left: pos.left,
                  transform: pos.align === "end" ? "translateX(-100%)" : "none" }}>
      {children}
    </div>,
    document.body
  );
}

// ── Free-floating menu at a screen point (right-click) ───────────────────────
function FloatingMenu({ point, open, onClose, children, w = 224 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.(); };
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, onClose]);
  if (!open || !point) return null;
  const left = Math.min(point.x, window.innerWidth - w - 12);
  const top = Math.min(point.y, window.innerHeight - 360);
  return ReactDOM.createPortal(
    <div ref={ref} className="popover menu" style={{ position: "fixed", top, left, width: w }}>{children}</div>,
    document.body
  );
}

function MenuItem({ children, onClick, icon, danger, kbd, dot }) {
  return (
    <button className={`menu-item ${danger ? "danger" : ""}`} onClick={(e) => { e.stopPropagation(); onClick?.(e); }}>
      {dot ? <span className="menu-dot" style={{ background: dot }} /> : icon ? <Icon name={icon} className="ico" /> : <span className="menu-spacer" />}
      <span className="lbl">{children}</span>
      {kbd && <span className="kbd">{kbd}</span>}
    </button>
  );
}
function MenuSep() { return <div className="menu-sep" />; }
function MenuLabel({ children }) { return <div className="menu-label">{children}</div>; }

// ── Colour picker (vivid card colours) ───────────────────────────────────────
function ColorPicker({ value, onPick, palette }) {
  const pal = palette || BoardData.CARD_COLORS;
  return (
    <div className="color-grid">
      {pal.map((c) => (
        <button key={c.id} className={`swatch ${value === c.id ? "on" : ""}`}
                style={{ background: c.hex || c.bg }} title={c.id}
                onClick={(e) => { e.stopPropagation(); onPick(c.id); }}>
          {value === c.id && <Icon name="check" className="ico-xs" />}
        </button>
      ))}
    </div>
  );
}

// ── Icon picker (sub-board glyphs) ───────────────────────────────────────────
const PICK_ICONS = ["doc","folder","board","target","star","rocket","camera","layers",
  "calendar","megaphone","bulb","code","pen","palette","globe","file","clock","pin","comment","zap"];
function IconPicker({ value, onPick }) {
  return (
    <div className="icon-grid">
      {PICK_ICONS.map((n) => (
        <button key={n} className={`icon-cell ${value === n ? "on" : ""}`}
                onClick={(e) => { e.stopPropagation(); onPick(n); }}>
          <Icon name={n} className="ico" />
        </button>
      ))}
    </div>
  );
}

// ── Markdown formatting toolbar (appears over a focused note) ────────────────
function FormatBar({ onCmd }) {
  const btn = (cmd, icon, title) => (
    <button className="fmt-btn" title={title} onMouseDown={(e) => { e.preventDefault(); onCmd(cmd); }}>
      <Icon name={icon} className="ico-sm" />
    </button>
  );
  return (
    <div className="format-bar" onMouseDown={(e) => e.stopPropagation()}>
      {btn("h1", "h1", "Titre")}
      {btn("h2", "h2", "Sous-titre")}
      <span className="fmt-sep" />
      {btn("bold", "bold", "Gras")}
      {btn("italic", "italic", "Italique")}
      {btn("code", "code", "Code")}
      <span className="fmt-sep" />
      {btn("ul", "listUl", "Liste à puces")}
      {btn("ol", "listOl", "Liste numérotée")}
      {btn("quote", "quote", "Citation")}
    </div>
  );
}

// ── Striped image placeholder ────────────────────────────────────────────────
function StripePlaceholder({ label, height = 96, radius = 8 }) {
  return (
    <div className="stripe-ph" style={{ height, borderRadius: radius }}>
      <span className="stripe-cap">{label}</span>
    </div>
  );
}

// ── Editable inline text ─────────────────────────────────────────────────────
function Editable({ value, onChange, onFocus, onBlur, multiline, placeholder, className = "", style, tag = "div" }) {
  const ref = useRef(null);
  const ext = useRef(value);
  useEffect(() => {
    if (ext.current !== value && ref.current && ref.current.innerText !== value) ref.current.innerText = value || "";
    ext.current = value;
  }, [value]);
  const Tag = tag;
  return (
    <Tag ref={ref} className={`editable ${className}`} contentEditable suppressContentEditableWarning
         spellCheck={false} data-ph={placeholder} style={style}
         onMouseDown={(e) => e.stopPropagation()}
         onFocus={onFocus} onBlur={onBlur}
         onInput={(e) => { const v = e.currentTarget.innerText; ext.current = v; onChange?.(v); }}
         onKeyDown={(e) => { if (!multiline && e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } if (e.key === "Escape") e.currentTarget.blur(); }}>
      {value || ""}
    </Tag>
  );
}

window.BoardAtoms = {
  uid, Markdown, renderInline, Popover, FloatingMenu,
  MenuItem, MenuSep, MenuLabel, ColorPicker, IconPicker, FormatBar,
  StripePlaceholder, Editable,
};
