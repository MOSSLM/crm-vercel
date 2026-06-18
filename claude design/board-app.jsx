// board-app.jsx — shell: topbar + breadcrumb, left rail, canvas, drag, menus, trash.

const { uid, Popover, FloatingMenu, MenuItem, MenuSep, MenuLabel, ColorPicker, IconPicker, Editable: Ed } = BoardAtoms;
const { CARD_HEX, CARD_COLORS, NOTE_COLORS, NOTE_BG, CRUMBS, BOARD } = BoardData;
const { ElementToolbar, CardEl, NoteEl, TodoEl, LinkEl, FileEl, ImageEl, TableEl,
        LineEl, ColumnEl, CardRowEl } = BoardElements;

// ── recursive tree helpers ───────────────────────────────────────────────────
function mapTree(els, id, fn) {
  return els.map((el) => {
    if (el.id === id) return fn(el);
    if (el.children) return { ...el, children: el.children.map((c) => c.id === id ? fn(c) : c) };
    if (el.cards)    return { ...el, cards: el.cards.map((c) => c.id === id ? fn(c) : c) };
    return el;
  });
}
function findTree(els, id) {
  for (const el of els) {
    if (el.id === id) return el;
    if (el.children) { const c = el.children.find((x) => x.id === id); if (c) return c; }
    if (el.cards)    { const c = el.cards.find((x) => x.id === id); if (c) return c; }
  }
  return null;
}

// pull a column child out into a free top-level element (or move it if already free)
function detachToFree(arr, id, x, y, w) {
  if (arr.some((e) => e.id === id)) return arr.map((e) => e.id === id ? { ...e, x, y } : e);
  let moved = null;
  const next = arr.map((el) => {
    if (el.children && el.children.some((c) => c.id === id)) {
      moved = el.children.find((c) => c.id === id);
      return { ...el, children: el.children.filter((c) => c.id !== id) };
    }
    return el;
  });
  if (moved) next.push({ ...moved, x, y, w: moved.w || w });
  return next;
}

// ── new element factory ──────────────────────────────────────────────────────
function newEl(type, x, y) {
  const base = { id: uid(type), x, y };
  switch (type) {
    case "note":  return { ...base, type: "note", w: 280, color: "paper", title: "Nouvelle note", body: "Écrivez en **markdown**…" };
    case "card":  return { ...base, type: "card", w: 280, icon: "board", color: "blue", title: "Nouvelle planche", meta: "0 carte" };
    case "todo":  return { ...base, type: "todo", w: 300, title: "À faire", items: [{ id: uid("t"), text: "Première tâche", done: false }] };
    case "link":  return { ...base, type: "link", w: 300, color: "blue", title: "Nouveau lien", url: "exemple.com", desc: "Aperçu du lien" };
    case "file":  return { ...base, type: "file", w: 300, kind: "pdf", color: "slate", name: "document.pdf", size: "—" };
    case "image": return { ...base, type: "image", w: 320, title: "Galerie", cols: 2, cells: ["image 1", "image 2"] };
    case "table": return { ...base, type: "table", w: 360, color: "violet", title: "Tableau",
                            columns: ["Colonne A", "Colonne B"], rows: [[{ t: "" }, { t: "" }], [{ t: "" }, { t: "" }]] };
    case "line":  return { ...base, type: "line", x1: x, y1: y, x2: x + 120, y2: y + 60, color: "violet" };
    case "column":return { ...base, type: "column", w: 320, accent: "blue", title: "Nouvelle colonne", subtitle: "", children: [] };
    default: return base;
  }
}

// ════════════════════════════════════════════════════════════════════════════
function App() {
  const [els, setEls] = useState(BOARD.elements);
  const [sel, setSel] = useState(null);
  const [trash, setTrash] = useState([]);
  const [ctx, setCtx] = useState(null);       // {x,y, canvasX, canvasY}
  const [zoom, setZoom] = useState(1);
  const [menu, setMenu] = useState(null);      // share | export | view | rail-more | trash
  const [menuRect, setMenuRect] = useState(null);
  const scrollRef = useRef(null);
  const drag = useRef(null);

  const patch = useCallback((id, p) => setEls((e) => mapTree(e, id, (x) => ({ ...x, ...p }))), []);
  const remove = useCallback((id) => setEls((e) => {
    const top = e.find((x) => x.id === id);
    if (top) { setTrash((t) => [{ ...top, _at: "à l'instant" }, ...t]); setSel(null); return e.filter((x) => x.id !== id); }
    return e.map((el) => {
      if (el.children?.some((c) => c.id === id)) { const c = el.children.find((x) => x.id === id); setTrash((t) => [{ ...c, _at: "à l'instant" }, ...t]); return { ...el, children: el.children.filter((x) => x.id !== id) }; }
      if (el.cards?.some((c) => c.id === id)) return { ...el, cards: el.cards.filter((x) => x.id !== id) };
      return el;
    });
  }), []);
  const duplicate = useCallback((id) => setEls((e) => {
    const top = e.find((x) => x.id === id);
    if (top) { const d = { ...JSON.parse(JSON.stringify(top)), id: uid(top.type), x: (top.x || 40) + 28, y: (top.y || 40) + 28 }; setSel(d.id); return [...e, d]; }
    return e.map((el) => {
      if (el.children?.some((c) => c.id === id)) { const src = el.children.find((x) => x.id === id); const idx = el.children.findIndex((x) => x.id === id); const d = { ...JSON.parse(JSON.stringify(src)), id: uid(src.type) }; const ch = [...el.children]; ch.splice(idx + 1, 0, d); return { ...el, children: ch }; }
      return el;
    });
  }), []);

  const addEl = useCallback((type, atX, atY) => {
    const sc = scrollRef.current;
    let x = atX, y = atY;
    if (x == null) { x = (sc ? sc.scrollLeft + sc.clientWidth / 2 - 140 : 200) / zoom; y = (sc ? sc.scrollTop + 160 : 160) / zoom; }
    const el = newEl(type, Math.round(x), Math.round(y));
    setEls((e) => [...e, el]); setSel(el.id); setCtx(null);
  }, [zoom]);

  const restore = (id) => { const it = trash.find((t) => t.id === id); if (!it) return; const { _at, ...clean } = it; setEls((e) => [...e, clean]); setTrash((t) => t.filter((x) => x.id !== id)); };

  // ── drag ───────────────────────────────────────────────────────────────────
  const startDrag = (e, id) => {
    if (e.button !== 0) return;
    if (e.target.closest(".editable, textarea, input, button, a, .todo-box, .tbl-cell, .el-toolbar, .file-dl")) { setSel(id); return; }
    setSel(id);
    const el = findTree(els, id);
    drag.current = { id, sx: e.clientX, sy: e.clientY, ox: el.x || 0, oy: el.y || 0, moved: false };
    const move = (ev) => {
      const d = drag.current; if (!d) return;
      const dx = (ev.clientX - d.sx) / zoom, dy = (ev.clientY - d.sy) / zoom;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      setEls((arr) => mapTree(arr, d.id, (x) => ({ ...x, x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) })));
    };
    const up = () => { drag.current = null; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ── resize (horizontal width) ────────────────────────────────────────────────
  const startResize = (e, id) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setSel(id);
    const el = findTree(els, id);
    const r = { sx: e.clientX, ow: el.w || 280 };
    const move = (ev) => {
      const dw = (ev.clientX - r.sx) / zoom;
      setEls((arr) => mapTree(arr, id, (x) => ({ ...x, w: Math.max(180, Math.round(r.ow + dw)) })));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ── detach a column child by dragging it out ─────────────────────────────────
  const startChildDrag = (e, childId) => {
    if (e.button !== 0) return;
    if (e.target.closest(".editable, textarea, input, button, a, .todo-box, .tbl-cell, .el-toolbar, .file-dl")) { setSel(childId); return; }
    e.stopPropagation();
    setSel(childId);
    const rect = e.currentTarget.getBoundingClientRect();
    const st = { sx: e.clientX, sy: e.clientY, grabX: e.clientX - rect.left, grabY: e.clientY - rect.top,
                 w: Math.round(rect.width / zoom), detached: false };
    const sc = scrollRef.current;
    const move = (ev) => {
      if (!st.detached) { if (Math.abs(ev.clientX - st.sx) + Math.abs(ev.clientY - st.sy) < 6) return; st.detached = true; }
      const scRect = sc.getBoundingClientRect();
      const nx = Math.round((ev.clientX - st.grabX - scRect.left + sc.scrollLeft) / zoom);
      const ny = Math.round((ev.clientY - st.grabY - scRect.top + sc.scrollTop) / zoom);
      setEls((arr) => detachToFree(arr, childId, nx, ny, st.w));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onCanvasContext = (e) => {
    if (e.target.closest(".free-el, .el-toolbar, .popover")) return;
    e.preventDefault();
    const sc = scrollRef.current;
    setCtx({ x: e.clientX, y: e.clientY,
             cx: (sc.scrollLeft + (e.clientX - sc.getBoundingClientRect().left)) / zoom - 140,
             cy: (sc.scrollTop + (e.clientY - sc.getBoundingClientRect().top)) / zoom - 20 });
  };

  const openMenu = (name, e) => { setMenuRect(e.currentTarget.getBoundingClientRect()); setMenu(name); };

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.matches("input, textarea, [contenteditable=true]")) return;
      if ((e.key === "Backspace" || e.key === "Delete") && sel) { e.preventDefault(); remove(sel); }
      if (e.key === "Escape") { setSel(null); setCtx(null); setMenu(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, remove]);

  // ── render free element body ─────────────────────────────────────────────────
  const renderBody = (el) => {
    switch (el.type) {
      case "card":   return <CardEl el={el} onPatch={(p) => patch(el.id, p)} />;
      case "note":   return <NoteEl el={el} selected={sel === el.id} onPatch={(p) => patch(el.id, p)} />;
      case "todo":   return <TodoEl el={el} onPatch={(p) => patch(el.id, p)} />;
      case "link":   return <LinkEl el={el} onPatch={(p) => patch(el.id, p)} />;
      case "file":   return <FileEl el={el} onPatch={(p) => patch(el.id, p)} />;
      case "image":  return <ImageEl el={el} onPatch={(p) => patch(el.id, p)} />;
      case "table":  return <TableEl el={el} selected={sel === el.id} onPatch={(p) => patch(el.id, p)} />;
      case "cardrow":return <CardRowEl el={el} onPatchCard={(cid, p) => patch(cid, p)} />;
      case "column": return <ColumnEl el={el} selectedId={sel}
                              onSelectChild={setSel} onChildPointerDown={startChildDrag}
                              onPatchChild={patch} onDeleteChild={remove} onDuplicateChild={duplicate}
                              onPatch={(p) => patch(el.id, p)} />;
      default: return null;
    }
  };

  const toolbarKind = (el) => el.type === "card" ? "card" : el.type;

  return (
    <div id="app">
      {/* ── Top bar ── */}
      <header className="topbar">
        <div className="tb-left">
          <div className="brand"><span className="brand-mark"><Icon name="board" className="ico" /></span></div>
          <nav className="crumbs">
            {CRUMBS.map((c, i) => (
              <React.Fragment key={c.id}>
                {i > 0 && <span className="crumb-sep">/</span>}
                <button className={`crumb ${c.current ? "cur" : ""}`}>
                  {c.home ? <Icon name="home" className="ico-sm" /> : <span className="crumb-dot" style={{ background: CARD_HEX[c.color] }} />}
                  <span>{c.label}</span>
                </button>
              </React.Fragment>
            ))}
          </nav>
          <span className="saved"><i />enregistré</span>
        </div>

        <div className="tb-right">
          <button className="ic-btn" title="Annuler"><Icon name="undo" className="ico-sm" /></button>
          <button className="ic-btn" title="Rétablir"><Icon name="redo" className="ico-sm" /></button>
          <span className="tb-div" />
          <button className="ic-btn" title="Rechercher"><Icon name="search" className="ico-sm" /></button>
          <button className="ic-btn" title="Notifications"><Icon name="bell" className="ico-sm" /></button>
          <button className="ic-btn" title="Aide"><Icon name="help" className="ico-sm" /></button>
          <button className="ic-btn" title="Réglages"><Icon name="settings" className="ico-sm" /></button>
        </div>
      </header>

      {/* ── Sub header: title + actions ── */}
      <div className="subhead">
        <div className="subhead-spacer" />
        <h1 className="board-title">{BOARD.title}</h1>
        <div className="subhead-actions">
          <button className="btn ghost" onClick={(e) => openMenu("share", e)}><Icon name="userPlus" className="ico-sm" />Partager</button>
          <button className="btn ghost" onClick={(e) => openMenu("export", e)}><Icon name="download" className="ico-sm" />Exporter<Icon name="chevdown" className="ico-xs" /></button>
          <button className="btn ghost" onClick={(e) => openMenu("view", e)}><Icon name="eye" className="ico-sm" />Vue<Icon name="chevdown" className="ico-xs" /></button>
        </div>
      </div>

      {/* ── Body: rail + canvas ── */}
      <div className="body">
        <aside className="rail">
          <RailTool icon="note"  label="Note"   onClick={() => addEl("note")} />
          <RailTool icon="link"  label="Lien"   onClick={() => addEl("link")} />
          <RailTool icon="todo"  label="À faire" onClick={() => addEl("todo")} />
          <RailTool icon="line"  label="Ligne"  onClick={() => addEl("line")} />
          <RailTool icon="board" label="Planche" active onClick={() => addEl("card")} />
          <RailTool icon="more"  label="Plus" onClick={(e) => openMenu("railmore", e)} />
          <span className="rail-div" />
          <RailTool icon="image"  label="Images"   onClick={() => addEl("image")} />
          <RailTool icon="upload" label="Importer" onClick={() => addEl("file")} />
          <RailTool icon="draw"   label="Dessiner" onClick={() => addEl("line")} />
          <span className="rail-grow" />
          <RailTool icon="trash" label="Corbeille" badge={trash.length || null} onClick={(e) => openMenu("trash", e)} />
        </aside>

        <div className="canvas-scroll" ref={scrollRef} onContextMenu={onCanvasContext}
             onMouseDown={(e) => { if (e.target.classList.contains("canvas") || e.target.classList.contains("canvas-scroll")) { setSel(null); setCtx(null); } }}>
          <div className="canvas" style={{ transform: `scale(${zoom})` }}>
            {els.map((el) => {
              if (el.type === "line") return (
                <div key={el.id} className={`free-el line-wrap ${sel === el.id ? "sel" : ""}`}
                     style={{ left: Math.min(el.x1, el.x2) - 12, top: Math.min(el.y1, el.y2) - 12 }}
                     onMouseDown={() => setSel(el.id)}>
                  {sel === el.id && <div className="el-toolbar" onMouseDown={(e) => e.stopPropagation()}><button className="tb-btn" onClick={() => remove(el.id)}><Icon name="trash" className="ico-sm" /></button></div>}
                  <LineEl el={el} />
                </div>
              );
              return (
                <div key={el.id} className={`free-el ${sel === el.id ? "sel" : ""} ${el.type}`}
                     style={{ left: el.x, top: el.y, width: el.w }}
                     onPointerDown={(e) => startDrag(e, el.id)}>
                  {sel === el.id && el.type !== "cardrow" && el.type !== "column" && (
                    <ElementToolbar kind={toolbarKind(el)} el={el} onPatch={(p) => patch(el.id, p)} onDelete={() => remove(el.id)} onDuplicate={() => duplicate(el.id)} />
                  )}
                  {sel === el.id && el.type === "column" && (
                    <ElementToolbar kind="column" el={el} onPatch={(p) => patch(el.id, p)} onDelete={() => remove(el.id)} onDuplicate={() => duplicate(el.id)} />
                  )}
                  {renderBody(el)}
                  {sel === el.id && el.type !== "cardrow" && (
                    <div className="resize-e" title="Redimensionner" onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => startResize(e, el.id)}><span /></div>
                  )}
                </div>
              );
            })}
          </div>

          {/* À trier pill */}
          <div className="tosort-pill"><b>{BOARD.toSort}</b> à trier</div>

          {/* Zoom controls */}
          <div className="zoom-ctl">
            <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}><Icon name="minus" className="ico-sm" /></button>
            <span onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))}><Icon name="plus" className="ico-sm" /></button>
          </div>
        </div>
      </div>

      {/* ── Right-click add menu ── */}
      <FloatingMenu point={ctx ? { x: ctx.x, y: ctx.y } : null} open={!!ctx} onClose={() => setCtx(null)}>
        <MenuLabel>Ajouter au canvas</MenuLabel>
        <MenuItem icon="note"  onClick={() => addEl("note", ctx.cx, ctx.cy)}>Note</MenuItem>
        <MenuItem icon="board" onClick={() => addEl("card", ctx.cx, ctx.cy)}>Planche</MenuItem>
        <MenuItem icon="todo"  onClick={() => addEl("todo", ctx.cx, ctx.cy)}>Liste à faire</MenuItem>
        <MenuItem icon="column" onClick={() => addEl("column", ctx.cx, ctx.cy)}>Colonne</MenuItem>
        <MenuItem icon="link"  onClick={() => addEl("link", ctx.cx, ctx.cy)}>Lien</MenuItem>
        <MenuItem icon="table" onClick={() => addEl("table", ctx.cx, ctx.cy)}>Tableau</MenuItem>
        <MenuItem icon="image" onClick={() => addEl("image", ctx.cx, ctx.cy)}>Galerie d'images</MenuItem>
        <MenuItem icon="upload" onClick={() => addEl("file", ctx.cx, ctx.cy)}>Fichier</MenuItem>
        <MenuSep />
        <MenuItem icon="line"  onClick={() => addEl("line", ctx.cx, ctx.cy)}>Ligne / flèche</MenuItem>
      </FloatingMenu>

      {/* ── Rail "more" menu ── */}
      <Popover open={menu === "railmore"} anchorRect={menuRect} onClose={() => setMenu(null)} className="menu">
        <MenuLabel>Autres éléments</MenuLabel>
        <MenuItem icon="column" onClick={() => { addEl("column"); setMenu(null); }}>Colonne</MenuItem>
        <MenuItem icon="table" onClick={() => { addEl("table"); setMenu(null); }}>Tableau</MenuItem>
        <MenuItem icon="upload" onClick={() => { addEl("file"); setMenu(null); }}>Fichier</MenuItem>
        <MenuItem icon="comment" onClick={() => setMenu(null)}>Commentaire</MenuItem>
      </Popover>

      {/* ── Share menu ── */}
      <Popover open={menu === "share"} anchorRect={menuRect} onClose={() => setMenu(null)} align="end" className="sheet">
        <div className="sheet-title">Partager cette planche</div>
        <div className="share-row">
          <input className="share-input" placeholder="email@studio.com" />
          <button className="btn accent sm">Inviter</button>
        </div>
        <div className="share-people">
          <div className="person"><span className="avatar" style={{ background: CARD_HEX.violet }}>SA</span><div><b>Vous</b><span>Propriétaire</span></div></div>
          <div className="person"><span className="avatar" style={{ background: CARD_HEX.teal }}>ML</span><div><b>Maison Lumen</b><span>Lecture seule</span></div><Icon name="chevdown" className="ico-xs" /></div>
        </div>
        <MenuSep />
        <MenuItem icon="link" onClick={() => setMenu(null)}>Copier le lien de partage</MenuItem>
        <MenuItem icon="globe" onClick={() => setMenu(null)}>Publier sur le web</MenuItem>
      </Popover>

      {/* ── Export menu ── */}
      <Popover open={menu === "export"} anchorRect={menuRect} onClose={() => setMenu(null)} align="end" className="menu">
        <MenuLabel>Exporter la planche</MenuLabel>
        <MenuItem icon="file" onClick={() => setMenu(null)}>PDF</MenuItem>
        <MenuItem icon="image" onClick={() => setMenu(null)}>Image PNG</MenuItem>
        <MenuItem icon="type" onClick={() => setMenu(null)}>Markdown (.md)</MenuItem>
        <MenuItem icon="doc" onClick={() => setMenu(null)}>Word (.docx)</MenuItem>
        <MenuSep />
        <MenuItem icon="external" onClick={() => setMenu(null)}>Envoyer vers le CRM</MenuItem>
      </Popover>

      {/* ── View menu ── */}
      <Popover open={menu === "view"} anchorRect={menuRect} onClose={() => setMenu(null)} align="end" className="menu">
        <MenuLabel>Affichage</MenuLabel>
        <MenuItem icon="expand" onClick={() => { setZoom(1); setMenu(null); }}>Zoom 100 %</MenuItem>
        <MenuItem icon="collapse" onClick={() => { setZoom(0.6); setMenu(null); }}>Vue d'ensemble</MenuItem>
        <MenuItem icon="play" onClick={() => setMenu(null)}>Mode présentation</MenuItem>
        <MenuSep />
        <MenuItem icon="board" onClick={() => setMenu(null)}>Afficher la grille</MenuItem>
      </Popover>

      {/* ── Trash menu ── */}
      <Popover open={menu === "trash"} anchorRect={menuRect} onClose={() => setMenu(null)} className="sheet">
        <div className="sheet-title">Corbeille</div>
        {trash.length === 0 && <div className="trash-empty">La corbeille est vide</div>}
        {trash.map((t) => (
          <div key={t.id} className="trash-row">
            <span className="trash-ic"><Icon name={t.type === "note" ? "note" : t.type === "todo" ? "todo" : t.type === "link" ? "link" : t.type === "table" ? "table" : t.type === "image" ? "image" : t.type === "file" ? "file" : "board"} className="ico-sm" /></span>
            <div className="trash-meta"><b>{t.title || t.name || t.type}</b><span>supprimé {t._at}</span></div>
            <button className="btn ghost sm" onClick={() => { restore(t.id); }}>Restaurer</button>
          </div>
        ))}
        {trash.length > 0 && <><MenuSep /><MenuItem icon="trash" danger onClick={() => setTrash([])}>Vider la corbeille</MenuItem></>}
      </Popover>
    </div>
  );
}

function RailTool({ icon, label, active, badge, onClick }) {
  return (
    <button className={`rail-tool ${active ? "active" : ""}`} onClick={onClick} title={label}>
      <span className="rail-ic">
        <Icon name={icon} className="ico" />
        {badge != null && <span className="rail-badge">{badge}</span>}
      </span>
      <span className="rail-lbl">{label}</span>
    </button>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
