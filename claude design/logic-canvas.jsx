// logic-canvas.jsx — node-graph view of the form flow.
// Nodes are auto-placed using a simple layered layout based on form order;
// users can drag to reposition. Edges = sequential default + logic rules.

const LOGIC_CSS = `
.logic-wrap {
  position: relative;
  flex: 1; min-height: 0;
  overflow: hidden;
  background:
    radial-gradient(circle, var(--border) 1px, transparent 1px) 0 0 / 24px 24px,
    var(--bg);
  cursor: grab;
}
.logic-wrap.panning { cursor: grabbing; }
.logic-pan {
  position: absolute; top: 0; left: 0;
  transform-origin: 0 0;
  width: 100%; height: 100%;
  pointer-events: none;
}
.logic-pan > * { pointer-events: auto; }

.logic-toolbar {
  position: absolute;
  top: 12px; left: 12px;
  display: flex; gap: 6px;
  z-index: 5;
}
.logic-zoom {
  position: absolute;
  bottom: 12px; left: 12px;
  display: flex; gap: 4px;
  background: var(--surface);
  border: 1px solid var(--border-2);
  border-radius: 8px;
  padding: 3px;
  box-shadow: var(--shadow-1);
  z-index: 5;
}
.logic-zoom button {
  width: 26px; height: 24px;
  border: 0; background: transparent;
  border-radius: 5px;
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 11px;
  display: flex; align-items: center; justify-content: center;
  cursor: default;
}
.logic-zoom button:hover { background: var(--hover); color: var(--text); }
.logic-zoom .zoom-val {
  min-width: 42px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
  text-align: center;
  display: flex; align-items: center; justify-content: center;
}

.flow-legend {
  position: absolute;
  top: 12px; right: 12px;
  background: var(--surface);
  border: 1px solid var(--border-2);
  border-radius: 8px;
  box-shadow: var(--shadow-1);
  padding: 8px 12px;
  font-size: 11.5px;
  color: var(--text-2);
  z-index: 5;
  white-space: nowrap;
}
.flow-legend .lg-row { display: flex; align-items: center; gap: 6px; }
.flow-legend .lg-row + .lg-row { margin-top: 5px; }
.flow-legend .lg-swatch {
  width: 16px; height: 2px; border-radius: 2px;
}

/* Node */
.node {
  position: absolute;
  width: 240px;
  background: var(--surface);
  border: 1px solid var(--border-2);
  border-radius: 10px;
  box-shadow: var(--shadow-1);
  font-size: 12.5px;
  user-select: none;
  z-index: 2;
  transition: box-shadow .12s;
}
.node:hover { box-shadow: var(--shadow-2); border-color: var(--border-strong); }
.node.selected { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-tint), var(--shadow-1); z-index: 4; }
.node.type-welcome { background: var(--surface); }
.node.type-end { background: var(--surface); }
.node-hd {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 10px 6px;
  border-bottom: 1px solid var(--border);
  cursor: grab;
}
.node-hd:active { cursor: grabbing; }
.node-hd .nref {
  font-family: var(--font-mono);
  font-size: 10px;
  background: var(--bg-2);
  color: var(--text-3);
  padding: 1px 5px; border-radius: 4px;
}
.node-hd .ntype {
  width: 16px; height: 16px;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-2);
}
.node-hd .ntype-lbl { font-size: 10.5px; color: var(--text-3); text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
.node-hd .spacer { flex: 1; }
.node-hd .nflag {
  width: 14px; height: 14px; color: var(--text-4);
  display: flex; align-items: center; justify-content: center;
}
.node-hd .nflag.req { color: var(--accent); }
.node-hd .nflag.logic { color: var(--logic-cond); }
.node-body { padding: 9px 10px 10px; }
.node-title {
  font-weight: 500; color: var(--text);
  line-height: 1.3;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 13px;
}
.node-rules {
  margin-top: 8px;
  border-top: 1px dashed var(--border);
  padding-top: 8px;
  display: flex; flex-direction: column; gap: 4px;
}
.node-rule {
  display: flex; align-items: center; gap: 5px;
  padding: 3px 5px;
  background: var(--logic-cond-tint);
  color: var(--logic-cond);
  border-radius: 5px;
  font-size: 11px;
  line-height: 1.3;
}
.node-rule .ico { width: 11px; height: 11px; }
.node-rule .lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.node-rule.default {
  background: transparent;
  color: var(--text-3);
  border: 1px dashed var(--border-2);
}

/* Ports — small dots on right/left edges */
.node .port {
  position: absolute;
  width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--surface);
  border: 2px solid var(--border-strong);
  top: 50%; transform: translateY(-50%);
}
.node .port.in { left: -6px; }
.node .port.out { right: -6px; background: var(--text); border-color: var(--text); }

/* SVG layer */
.logic-svg {
  position: absolute; top: 0; left: 0;
  overflow: visible;
  pointer-events: none;
  z-index: 1;
}
.logic-svg .edge {
  fill: none;
  stroke: var(--border-strong);
  stroke-width: 1.5;
}
.logic-svg .edge.logic {
  stroke: var(--logic-cond);
  stroke-width: 1.6;
  stroke-dasharray: 0;
}
.logic-svg .edge-label {
  font-family: var(--font-ui);
  font-size: 10.5px;
  font-weight: 500;
  fill: var(--logic-cond);
}
.logic-svg .edge-label-bg {
  fill: var(--bg);
  stroke: var(--logic-cond-tint);
  stroke-width: 1;
}
.logic-svg .edge-label.default { fill: var(--text-3); }
.logic-svg .edge-label-bg.default {
  fill: var(--bg);
  stroke: var(--border);
}
.logic-svg .arrow {
  fill: var(--border-strong);
}
.logic-svg .arrow.logic { fill: var(--logic-cond); }
`;

// ── Layout: layered (left → right), grouping by depth from welcome ──────────
function autoLayout(form) {
  const NODE_W = 240, NODE_H = 100, COL_W = 320, ROW_H = 130;
  const order = form.questions.map((q) => q.id);
  const indexById = Object.fromEntries(order.map((id, i) => [id, i]));

  // Group: split into "columns" of ~4 questions to keep the canvas readable.
  const PER_COL = 4;
  const positions = {};
  form.questions.forEach((q, i) => {
    const col = Math.floor(i / PER_COL);
    const row = i % PER_COL;
    positions[q.id] = {
      x: 60 + col * COL_W,
      y: 60 + row * ROW_H,
      w: NODE_W,
      h: NODE_H,
    };
  });
  return { positions, NODE_W, NODE_H };
}

function LogicCanvas({ form, selectedId, onSelect, onAddRule }) {
  const wrapRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.9);
  const panState = useRef(null);
  const [dragNode, setDragNode] = useState(null); // {id, dx, dy}
  const [layout, setLayout] = useState(() => autoLayout(form));
  const [overrides, setOverrides] = useState({}); // user-moved positions

  // Re-layout if questions list changes (length only — preserve existing overrides)
  useEffect(() => {
    setLayout(autoLayout(form));
  }, [form.questions.length, form.questions.map((q) => q.id).join(",")]);

  const positions = useMemo(() => {
    const base = layout.positions;
    const merged = {};
    Object.keys(base).forEach((id) => { merged[id] = { ...base[id], ...(overrides[id] || {}) }; });
    return merged;
  }, [layout, overrides]);

  // Edges: default sequential + each logic rule
  const edges = useMemo(() => {
    const out = [];
    // Default sequential (only when no rule from this node matches "fallthrough")
    form.questions.forEach((q, i) => {
      const next = form.questions[i + 1];
      if (!next) return;
      // is there a rule that points to the immediate next? if so, default is implicit
      out.push({ from: q.id, to: next.id, kind: "default" });
    });
    form.logic.forEach((r) => {
      out.push({ from: r.from, to: r.to, kind: "logic", label: r.label, id: r.id });
    });
    return out;
  }, [form]);

  // Pan
  const onWrapPointerDown = (e) => {
    if (e.target.closest(".node")) return;
    if (e.target.closest(".logic-toolbar")) return;
    if (e.target.closest(".logic-zoom")) return;
    panState.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    wrapRef.current?.classList.add("panning");
    const move = (ev) => {
      setPan({ x: panState.current.px + (ev.clientX - panState.current.x),
               y: panState.current.py + (ev.clientY - panState.current.y) });
    };
    const up = () => {
      wrapRef.current?.classList.remove("panning");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      panState.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Zoom via wheel/pinch
  const onWheel = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setZoom((z) => Math.max(0.4, Math.min(2, z - e.deltaY * 0.002)));
  };

  // Drag a node
  const startDragNode = (e, id) => {
    e.stopPropagation();
    const p = positions[id];
    const start = { x: e.clientX, y: e.clientY, ox: p.x, oy: p.y };
    setDragNode({ id });
    onSelect(id);
    const move = (ev) => {
      const dx = (ev.clientX - start.x) / zoom;
      const dy = (ev.clientY - start.y) / zoom;
      setOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), x: start.ox + dx, y: start.oy + dy } }));
    };
    const up = () => {
      setDragNode(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const resetLayout = () => { setOverrides({}); setPan({ x: 0, y: 0 }); setZoom(0.9); };
  const zoomIn = () => setZoom((z) => Math.min(2, z + 0.1));
  const zoomOut = () => setZoom((z) => Math.max(0.4, z - 0.1));
  const fit = () => { setZoom(0.85); setPan({ x: 0, y: 0 }); };

  // Build edge paths
  const renderEdges = () => {
    const items = [];
    edges.forEach((e, i) => {
      const a = positions[e.from], b = positions[e.to];
      if (!a || !b) return;
      const sx = a.x + a.w, sy = a.y + a.h / 2;
      const tx = b.x,        ty = b.y + b.h / 2;
      const dx = Math.max(60, Math.abs(tx - sx) * 0.5);
      const c1x = sx + dx, c1y = sy;
      const c2x = tx - dx, c2y = ty;
      const path = `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`;
      const midX = (sx + tx) / 2, midY = (sy + ty) / 2;
      const arrow = (() => {
        // small arrowhead at endpoint
        const angle = Math.atan2(ty - c2y, tx - c2x);
        const ax = tx, ay = ty;
        const w = 5, h = 4;
        const p1 = [ax - Math.cos(angle) * w - Math.sin(angle) * h, ay - Math.sin(angle) * w + Math.cos(angle) * h];
        const p2 = [ax - Math.cos(angle) * w + Math.sin(angle) * h, ay - Math.sin(angle) * w - Math.cos(angle) * h];
        return `M ${ax} ${ay} L ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} Z`;
      })();
      items.push(
        <g key={i}>
          <path className={`edge ${e.kind}`} d={path} />
          <path className={`arrow ${e.kind}`} d={arrow} />
          {e.kind === "logic" && e.label && (
            <>
              <rect className="edge-label-bg" x={midX - (e.label.length * 3.4)} y={midY - 8} width={e.label.length * 6.8} height={16} rx={8} />
              <text className="edge-label" x={midX} y={midY + 3} textAnchor="middle">{e.label}</text>
            </>
          )}
        </g>
      );
    });
    return items;
  };

  return (
    <div ref={wrapRef} className="logic-wrap" onPointerDown={onWrapPointerDown} onWheel={onWheel}>
      <div className="logic-toolbar">
        <button className="btn outline sm" onClick={resetLayout}>
          <Icon name="refresh" className="ico-sm" />Auto-layout
        </button>
        <button className="btn outline sm">
          <Icon name="plus" className="ico-sm" />Nouvelle règle
        </button>
      </div>

      <div className="flow-legend">
        <div className="lg-row"><span className="lg-swatch" style={{ background: "var(--border-strong)" }} />Flux par défaut</div>
        <div className="lg-row"><span className="lg-swatch" style={{ background: "var(--logic-cond)" }} />Règle conditionnelle</div>
      </div>

      <div className="logic-zoom">
        <button onClick={zoomOut} title="Dézoomer">−</button>
        <span className="zoom-val">{Math.round(zoom * 100)}%</span>
        <button onClick={zoomIn} title="Zoomer">+</button>
        <button onClick={fit} title="Fit" style={{ width: 36 }}>fit</button>
      </div>

      <div className="logic-pan" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <svg className="logic-svg" width="3000" height="2000">
          {renderEdges()}
        </svg>
        {form.questions.map((q) => {
          const p = positions[q.id];
          if (!p) return null;
          const t = QT[q.type];
          const rules = form.logic.filter((r) => r.from === q.id);
          const isSel = selectedId === q.id;
          return (
            <div key={q.id}
                 className={`node type-${q.type} ${isSel ? "selected" : ""}`}
                 style={{ left: p.x, top: p.y, width: p.w }}
                 onClick={(e) => { e.stopPropagation(); onSelect(q.id); }}>
              <div className="node-hd" onPointerDown={(e) => startDragNode(e, q.id)}>
                <span className="nref">{q.ref}</span>
                <span className="ntype"><Icon name={t.icon} className="ico-sm" /></span>
                <span className="ntype-lbl">{t.label}</span>
                <span className="spacer" />
                {q.required && <span className="nflag req" title="Obligatoire"><Icon name="warning" className="ico-sm" /></span>}
                {rules.length > 0 && <span className="nflag logic" title="Logique"><Icon name="branch" className="ico-sm" /></span>}
              </div>
              <div className="node-body">
                <div className="node-title">{q.title || <em>Sans titre</em>}</div>
                {rules.length > 0 && (
                  <div className="node-rules">
                    {rules.map((r) => {
                      const target = form.questions.find((x) => x.id === r.to);
                      return (
                        <div key={r.id} className="node-rule">
                          <Icon name="branch" className="ico-sm" />
                          <span className="lbl">{r.label} → {target?.ref}</span>
                        </div>
                      );
                    })}
                    <div className="node-rule default">
                      <Icon name="chevright" className="ico-sm" />
                      <span className="lbl">sinon → suivante</span>
                    </div>
                  </div>
                )}
              </div>
              <span className="port in" />
              <span className="port out" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { LOGIC_CSS, LogicCanvas });
