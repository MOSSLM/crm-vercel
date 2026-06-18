// board-elements.jsx — all board element renderers + per-element toolbar.

const { Markdown, Popover, MenuItem, MenuSep, MenuLabel, ColorPicker, IconPicker,
        FormatBar, StripePlaceholder, Editable, uid: _uid } = BoardAtoms;
const { CARD_HEX, NOTE_BG, NOTE_BAR, CARD_COLORS, NOTE_COLORS } = BoardData;

// ── Toolbar button that hosts its own popover ────────────────────────────────
function ToolBtn({ icon, title, swatch, onClick, children }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const toggle = (e) => {
    e.stopPropagation();
    if (children) {
      setRect(ref.current.getBoundingClientRect());
      setOpen((o) => !o);
    } else onClick?.(e);
  };
  return (
    <>
      <button ref={ref} className="tb-btn" title={title} onMouseDown={(e) => e.stopPropagation()} onClick={toggle}>
        {swatch ? <span className="tb-swatch" style={{ background: swatch }} /> : <Icon name={icon} className="ico-sm" />}
      </button>
      {children && (
        <Popover open={open} anchorRect={rect} onClose={() => setOpen(false)} className="pad">
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </Popover>
      )}
    </>
  );
}

// ── The floating toolbar shown above a selected element ──────────────────────
function ElementToolbar({ kind, el, onPatch, onDelete, onDuplicate }) {
  return (
    <div className="el-toolbar" onMouseDown={(e) => e.stopPropagation()}>
      {(kind === "card" || kind === "cardItem") && (
        <ToolBtn icon="swatch" title="Icône">
          {(close) => <IconPicker value={el.icon} onPick={(v) => { onPatch({ icon: v }); }} />}
        </ToolBtn>
      )}
      {(kind === "card" || kind === "cardItem" || kind === "link" || kind === "file" || kind === "table") && (
        <ToolBtn swatch={CARD_HEX[el.color] || "#697586"} title="Couleur">
          {(close) => <ColorPicker value={el.color} onPick={(v) => onPatch({ color: v })} />}
        </ToolBtn>
      )}
      {(kind === "note" || kind === "column") && (
        <ToolBtn swatch={kind === "note" ? (NOTE_BG[el.color] || "#fff") : CARD_HEX[el.accent]} title="Couleur">
          {(close) => kind === "note"
            ? <ColorPicker value={el.color} palette={NOTE_COLORS} onPick={(v) => onPatch({ color: v })} />
            : <ColorPicker value={el.accent} onPick={(v) => onPatch({ accent: v })} />}
        </ToolBtn>
      )}
      <span className="tb-sep" />
      <ToolBtn icon="copy" title="Dupliquer" onClick={onDuplicate} />
      <ToolBtn icon="trash" title="Supprimer" onClick={onDelete} />
    </div>
  );
}

// ── Card (sub-board) ─────────────────────────────────────────────────────────
function CardEl({ el, inline, onPatch, onOpen }) {
  const hex = CARD_HEX[el.color] || "#697586";
  return (
    <div className={`card-el ${inline ? "inline" : ""}`} onDoubleClick={(e) => { e.stopPropagation(); onOpen?.(); }}>
      <div className="card-icon" style={{ background: hex }}>
        <Icon name={el.icon || "board"} className="ico" />
      </div>
      <div className="card-meta">
        <Editable className="card-title" value={el.title} onChange={(v) => onPatch({ title: v })} placeholder="Sans titre" />
        <div className="card-sub">{el.meta}</div>
      </div>
    </div>
  );
}

// ── Note (markdown) ──────────────────────────────────────────────────────────
function applyFormat(ta, cmd) {
  if (!ta) return;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const val = ta.value, sel = val.slice(s, e);
  const wrap = (pre, suf = pre) => pre + (sel || "") + suf;
  const linePrefix = (pfx) => {
    const ls = val.lastIndexOf("\n", s - 1) + 1;
    return { ls, text: val.slice(ls, e).split("\n").map((l, i) => (typeof pfx === "function" ? pfx(i) : pfx) + l).join("\n") };
  };
  let next = val, caret = e;
  if (cmd === "bold")   { next = val.slice(0, s) + wrap("**") + val.slice(e); caret = e + 4; }
  else if (cmd === "italic") { next = val.slice(0, s) + wrap("*") + val.slice(e); caret = e + 2; }
  else if (cmd === "code")   { next = val.slice(0, s) + wrap("`") + val.slice(e); caret = e + 2; }
  else if (cmd === "h1" || cmd === "h2" || cmd === "quote" || cmd === "ul" || cmd === "ol") {
    const map = { h1: "# ", h2: "## ", quote: "> ", ul: "- " };
    const lp = cmd === "ol" ? linePrefix((i) => `${i + 1}. `) : linePrefix(map[cmd]);
    next = val.slice(0, lp.ls) + lp.text + val.slice(e);
    caret = lp.ls + lp.text.length;
  }
  ta.value = next;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(caret, caret); });
}

function NoteEl({ el, selected, onPatch }) {
  const [editing, setEditing] = useState(false);
  const taRef = useRef(null);
  const bg = NOTE_BG[el.color] || "#fff";
  const bar = NOTE_BAR[el.color] || "#D9D5CC";
  useEffect(() => { if (!selected) setEditing(false); }, [selected]);
  useEffect(() => {
    if (editing && taRef.current) {
      const ta = taRef.current;
      ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; ta.focus();
    }
  }, [editing]);
  return (
    <div className={`note-el ${el.sticky ? "sticky" : ""}`} style={{ background: bg, "--note-bar": bar }}>
      {editing && <FormatBar onCmd={(c) => applyFormat(taRef.current, c)} />}
      {!el.sticky && el.title !== undefined && (
        <Editable className="note-title" value={el.title} onChange={(v) => onPatch({ title: v })} placeholder="Titre" />
      )}
      {editing ? (
        <textarea ref={taRef} className="note-ta" value={el.body || ""}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => { onPatch({ body: e.target.value }); e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }}
                  onBlur={() => setEditing(false)} placeholder="Écrivez en markdown…" />
      ) : (
        <div className="note-body" onClick={(e) => { e.stopPropagation(); setEditing(true); }}>
          {el.body ? <Markdown source={el.body} /> : <span className="note-ph">Note vide — cliquez pour écrire</span>}
        </div>
      )}
    </div>
  );
}

// ── Todo list ────────────────────────────────────────────────────────────────
function TodoEl({ el, onPatch }) {
  const toggle = (id) => onPatch({ items: el.items.map((it) => it.id === id ? { ...it, done: !it.done } : it) });
  const setText = (id, text) => onPatch({ items: el.items.map((it) => it.id === id ? { ...it, text } : it) });
  const add = () => onPatch({ items: [...el.items, { id: _uid("t"), text: "Nouvelle tâche", done: false }] });
  return (
    <div className="todo-el">
      {el.title !== undefined && <Editable className="todo-title" value={el.title} onChange={(v) => onPatch({ title: v })} placeholder="Liste" />}
      <div className="todo-items">
        {el.items.map((it) => (
          <div key={it.id} className={`todo-row ${it.done ? "done" : ""}`}>
            <button className="todo-box" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); toggle(it.id); }}>
              {it.done && <Icon name="check" className="ico-xs" />}
            </button>
            <div className="todo-text-wrap">
              <Editable className="todo-text" value={it.text} onChange={(v) => setText(it.id, v)} multiline />
              {it.due && <div className="todo-due"><Icon name="alarm" className="ico-xs" />{it.due}</div>}
            </div>
          </div>
        ))}
      </div>
      <button className="todo-add" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); add(); }}>
        <Icon name="plus" className="ico-sm" />Ajouter une tâche
      </button>
    </div>
  );
}

// ── Link preview ─────────────────────────────────────────────────────────────
function LinkEl({ el, onPatch }) {
  const hex = CARD_HEX[el.color || el.thumb] || "#2A6FDB";
  return (
    <div className="link-el">
      <div className="link-thumb" style={{ "--lk": hex }}>
        <div className="link-thumb-bar"><i /><i /><i /></div>
        <Icon name="globe" className="ico link-thumb-globe" />
      </div>
      <div className="link-body">
        <Editable className="link-title" value={el.title} onChange={(v) => onPatch({ title: v })} placeholder="Titre du lien" />
        <div className="link-desc">{el.desc}</div>
        <div className="link-url"><Icon name="link" className="ico-xs" />{el.url}</div>
      </div>
    </div>
  );
}

// ── File attachment ──────────────────────────────────────────────────────────
const FILE_LABEL = { pdf: "PDF", fig: "FIG", img: "IMG", doc: "DOC", zip: "ZIP" };
function FileEl({ el, onPatch }) {
  const hex = CARD_HEX[el.color] || "#697586";
  return (
    <div className="file-el">
      <div className="file-badge" style={{ background: hex }}>
        <Icon name="file" className="ico" />
        <span className="file-ext">{FILE_LABEL[el.kind] || "FILE"}</span>
      </div>
      <div className="file-meta">
        <Editable className="file-name" value={el.name} onChange={(v) => onPatch({ name: v })} placeholder="fichier" />
        <div className="file-size">{el.size}</div>
      </div>
      <button className="file-dl" onMouseDown={(e) => e.stopPropagation()} title="Télécharger"><Icon name="download" className="ico-sm" /></button>
    </div>
  );
}

// ── Image grid ───────────────────────────────────────────────────────────────
function ImageEl({ el, onPatch }) {
  return (
    <div className="image-el">
      <Editable className="image-title" value={el.title} onChange={(v) => onPatch({ title: v })} placeholder="Galerie" />
      <div className="image-grid" style={{ gridTemplateColumns: `repeat(${el.cols || 2}, 1fr)` }}>
        {el.cells.map((c, i) => <StripePlaceholder key={i} label={c} height={92} />)}
      </div>
      <button className="image-add" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
        <Icon name="upload" className="ico-sm" />Déposer des images
      </button>
    </div>
  );
}

// ── Table (with coloured cells) ──────────────────────────────────────────────
function TableEl({ el, selected, onPatch }) {
  const hex = CARD_HEX[el.color] || "#7A5AE0";
  const [cellPick, setCellPick] = useState(null); // {r,c, rect}
  const setCell = (r, c, patch) => {
    const rows = el.rows.map((row, ri) => ri === r ? row.map((cell, ci) => ci === c ? { ...cell, ...patch } : cell) : row);
    onPatch({ rows });
  };
  const addRow = () => onPatch({ rows: [...el.rows, el.columns.map(() => ({ t: "" }))] });
  const addCol = () => onPatch({ columns: [...el.columns, `Colonne ${el.columns.length + 1}`], rows: el.rows.map((r) => [...r, { t: "" }]) });
  const removeRow = (ri) => onPatch({ rows: el.rows.filter((_, i) => i !== ri) });
  const removeCol = (ci) => onPatch({ columns: el.columns.filter((_, i) => i !== ci), rows: el.rows.map((r) => r.filter((_, i) => i !== ci)) });
  return (
    <div className="table-el" style={{ "--th": hex }}>
      <Editable className="table-title" value={el.title} onChange={(v) => onPatch({ title: v })} placeholder="Tableau" />
      <div className="tbl">
        <div className="tbl-row tbl-head" style={{ gridTemplateColumns: `repeat(${el.columns.length}, 1fr)` }}>
          {el.columns.map((col, ci) => (
            <div key={ci} className="tbl-cell th">
              <Editable value={col} onChange={(v) => { const cols = [...el.columns]; cols[ci] = v; onPatch({ columns: cols }); }} />
            </div>
          ))}
        </div>
        {el.rows.map((row, ri) => (
          <div key={ri} className="tbl-row" style={{ gridTemplateColumns: `repeat(${el.columns.length}, 1fr)` }}>
            {row.map((cell, ci) => (
              <div key={ci} className={`tbl-cell ${cell.tint ? "filled" : ""} ${cell.mono ? "mono" : ""}`}
                   style={{ background: cell.tint ? NOTE_BG[cell.tint] : undefined }}
                   onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCellPick({ r: ri, c: ci, rect: e.currentTarget.getBoundingClientRect() }); }}>
                {cell.tint ? <span className="tbl-swatch-dot" style={{ background: NOTE_BAR[cell.tint] }} /> : null}
                <Editable value={cell.t} onChange={(v) => setCell(ri, ci, { t: v })} placeholder="" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="tbl-actions">
        <button className="tbl-add" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); addRow(); }}>
          <Icon name="plus" className="ico-sm" />Ligne
        </button>
        <button className="tbl-add" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); addCol(); }}>
          <Icon name="plus" className="ico-sm" />Colonne
        </button>
      </div>
      <Popover open={!!cellPick} anchorRect={cellPick?.rect} onClose={() => setCellPick(null)} className="pad">
        <div className="pop-title">Couleur de cellule</div>
        <ColorPicker value={cellPick && el.rows[cellPick.r][cellPick.c].tint} palette={NOTE_COLORS}
                     onPick={(v) => { setCell(cellPick.r, cellPick.c, { tint: v }); setCellPick(null); }} />
        {cellPick && (el.rows[cellPick.r][cellPick.c].tint) && (
          <MenuItem icon="x" onClick={() => { setCell(cellPick.r, cellPick.c, { tint: undefined }); setCellPick(null); }}>Retirer la couleur</MenuItem>
        )}
        <MenuSep />
        <MenuItem icon="minus" onClick={() => { if (el.rows.length > 1) removeRow(cellPick.r); setCellPick(null); }}>Supprimer la ligne</MenuItem>
        <MenuItem icon="minus" onClick={() => { if (el.columns.length > 1) removeCol(cellPick.c); setCellPick(null); }}>Supprimer la colonne</MenuItem>
      </Popover>
    </div>
  );
}

// ── Connection line / arrow ──────────────────────────────────────────────────
function LineEl({ el }) {
  const hex = CARD_HEX[el.color] || "#7A5AE0";
  const w = Math.abs(el.x2 - el.x1) + 24, h = Math.abs(el.y2 - el.y1) + 24;
  return (
    <svg className="line-el" width={w} height={h} style={{ overflow: "visible" }}>
      <defs>
        <marker id={`arw-${el.id}`} markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
          <path d="M0 0 L9 4.5 L0 9 z" fill={hex} />
        </marker>
      </defs>
      <line x1="12" y1="12" x2={el.x2 - el.x1 + 12} y2={el.y2 - el.y1 + 12}
            stroke={hex} strokeWidth="2.5" strokeLinecap="round" markerEnd={`url(#arw-${el.id})`} />
    </svg>
  );
}

// ── Column container ─────────────────────────────────────────────────────────
function ColumnEl({ el, selectedId, onSelectChild, onChildPointerDown, onPatchChild, onDeleteChild, onDuplicateChild, onPatch }) {
  const accent = CARD_HEX[el.accent] || "#7A5AE0";
  return (
    <div className="column-el" style={{ "--accent": accent }}>
      <div className="column-hd">
        <Editable className="column-title" value={el.title} onChange={(v) => onPatch({ title: v })} placeholder="Colonne" />
        <Editable className="column-sub" value={el.subtitle} onChange={(v) => onPatch({ subtitle: v })} placeholder="" />
      </div>
      <div className="column-body">
        {el.children.map((ch) => (
          <ChildElement key={ch.id} el={ch} selected={selectedId === ch.id}
                        onSelect={() => onSelectChild(ch.id)}
                        onPointerDown={(e) => onChildPointerDown?.(e, ch.id)}
                        onPatch={(p) => onPatchChild(ch.id, p)}
                        onDelete={() => onDeleteChild(ch.id)}
                        onDuplicate={() => onDuplicateChild(ch.id)} />
        ))}
        <button className="column-add" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <Icon name="plus" className="ico-sm" />Ajouter
        </button>
      </div>
    </div>
  );
}

// ── A child element inside a column (selectable + detachable by drag) ────────
function ChildElement({ el, selected, onSelect, onPointerDown, onPatch, onDelete, onDuplicate }) {
  const kind = el.type === "card" ? "cardItem" : el.type;
  return (
    <div className={`child-el ${selected ? "sel" : ""}`} data-type={el.type}
         onPointerDown={onPointerDown}
         onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      {selected && <ElementToolbar kind={kind} el={el} onPatch={onPatch} onDelete={onDelete} onDuplicate={onDuplicate} />}
      {el.type === "card" && <CardEl el={el} inline onPatch={onPatch} />}
      {el.type === "note" && <NoteEl el={el} selected={selected} onPatch={onPatch} />}
      {el.type === "todo" && <TodoEl el={el} onPatch={onPatch} />}
      {el.type === "link" && <LinkEl el={el} onPatch={onPatch} />}
      {el.type === "file" && <FileEl el={el} onPatch={onPatch} />}
    </div>
  );
}

// ── Card row (free cluster of cards) ─────────────────────────────────────────
function CardRowEl({ el, onPatchCard }) {
  return (
    <div className="cardrow-el">
      {el.cards.map((c) => (
        <div key={c.id} className="cardrow-item">
          <div className="card-icon lg" style={{ background: CARD_HEX[c.color] || "#697586" }}>
            <Icon name={c.icon || "board"} className="ico" />
          </div>
          <Editable className="cardrow-title" value={c.title} onChange={(v) => onPatchCard(c.id, { title: v })} />
          <div className="cardrow-sub">{c.meta}</div>
        </div>
      ))}
    </div>
  );
}

window.BoardElements = {
  ElementToolbar, CardEl, NoteEl, TodoEl, LinkEl, FileEl, ImageEl, TableEl,
  LineEl, ColumnEl, ChildElement, CardRowEl, ToolBtn,
};
