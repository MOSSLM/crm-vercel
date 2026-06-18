"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "./boardIcons";
import { Editable } from "./Markdown";
import { FloatingMenu, Popover, MenuItem, MenuSep, MenuLabel } from "./BoardMenus";
import {
  ElementToolbar,
  CardEl,
  NoteEl,
  TodoEl,
  LinkEl,
  FileEl,
  ImageEl,
  type El,
} from "./BoardElements";
import { CARD_HEX } from "./boardData";
import { planchesApi } from "@/lib/planches/api";
import type { PlancheBoard, PlancheCard, PlancheCardContent, PlancheCardType } from "@/types";

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.6;

// Default geometry + content per element type (mirrors the SAMA design).
const DEFAULTS: Record<string, { w: number; content: Record<string, unknown> }> = {
  note: { w: 280, content: { title: "Nouvelle note", body: "Écrivez en **markdown**…", color: "paper" } },
  board: { w: 280, content: { title: "Nouvelle planche", icon: "board", color: "blue", meta: "Ouvrir →" } },
  todo: { w: 300, content: { title: "À faire", items: [{ id: "t1", text: "Première tâche", done: false }] } },
  link: { w: 300, content: { title: "Nouveau lien", url: "exemple.com", desc: "Aperçu du lien", color: "blue" } },
  file: { w: 300, content: { name: "document.pdf", kind: "pdf", size: "—", color: "slate" } },
  image: { w: 320, content: { title: "Galerie", cols: 2, cells: ["image 1", "image 2"] } },
};

type Menu = "share" | "export" | "view" | "railmore" | "trash" | null;

const isInteractive = (target: EventTarget | null) =>
  target instanceof Element &&
  !!target.closest(".editable, textarea, input, button, a, .todo-box, .el-toolbar, .popover, .file-dl");

export function PlancheCanvas({ boardId }: { boardId: string }) {
  const router = useRouter();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const fileAcceptImages = React.useRef(false);

  const [board, setBoard] = React.useState<PlancheBoard | null>(null);
  const [cards, setCards] = React.useState<PlancheCard[]>([]);
  const [breadcrumb, setBreadcrumb] = React.useState<Pick<PlancheBoard, "id" | "title">[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [titleDraft, setTitleDraft] = React.useState("");

  const [sel, setSel] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [ctx, setCtx] = React.useState<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [menu, setMenu] = React.useState<Menu>(null);
  const [menuRect, setMenuRect] = React.useState<DOMRect | null>(null);
  const [trash, setTrash] = React.useState<(PlancheCard & { _at: string })[]>([]);

  const cardsRef = React.useRef(cards);
  cardsRef.current = cards;
  const zoomRef = React.useRef(zoom);
  zoomRef.current = zoom;
  const drag = React.useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const saveTimers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── load ──────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    planchesApi
      .getBoard(boardId)
      .then((data) => {
        if (!alive) return;
        setBoard(data.board);
        setTitleDraft(data.board.title);
        setCards(data.cards);
        setBreadcrumb(data.breadcrumb);
      })
      .catch((err) => {
        console.error(err);
        toast.error("Planche introuvable");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [boardId]);

  // ── persistence ─────────────────────────────────────────────────────────────
  const persistCard = React.useCallback(async (id: string) => {
    const c = cardsRef.current.find((x) => x.id === id);
    if (!c) return;
    try {
      await planchesApi.updateCard(id, {
        position_x: c.position_x,
        position_y: c.position_y,
        width: c.width,
        height: c.height,
        z_index: c.z_index,
        content: c.content,
        style: c.style,
      });
    } catch (err) {
      console.error(err);
    }
  }, []);

  const scheduleSave = React.useCallback(
    (id: string) => {
      const timers = saveTimers.current;
      const existing = timers.get(id);
      if (existing) clearTimeout(existing);
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          void persistCard(id);
        }, 500),
      );
    },
    [persistCard],
  );

  const patchContent = React.useCallback((id: string, partial: Partial<El>) => {
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, content: { ...c.content, ...partial } } : c)),
    );
  }, []);

  // ── geometry helpers ─────────────────────────────────────────────────────────
  const maxZ = React.useCallback(() => cardsRef.current.reduce((m, c) => Math.max(m, c.z_index), 0), []);

  const viewportPoint = React.useCallback(() => {
    const sc = scrollRef.current;
    const z = zoomRef.current;
    if (!sc) return { x: 200, y: 160 };
    return { x: (sc.scrollLeft + sc.clientWidth / 2 - 150) / z, y: (sc.scrollTop + 140) / z };
  }, []);

  const clientToCanvas = React.useCallback((clientX: number, clientY: number) => {
    const sc = scrollRef.current;
    const z = zoomRef.current;
    if (!sc) return { x: 0, y: 0 };
    const r = sc.getBoundingClientRect();
    return { x: (clientX - r.left + sc.scrollLeft) / z, y: (clientY - r.top + sc.scrollTop) / z };
  }, []);

  // ── create / delete / duplicate ──────────────────────────────────────────────
  const addEl = React.useCallback(
    async (type: string, at?: { x: number; y: number }) => {
      const def = DEFAULTS[type] ?? DEFAULTS.note;
      const pos = at ?? viewportPoint();
      setCtx(null);
      try {
        const card = await planchesApi.createCard(boardId, {
          type: type as PlancheCardType,
          position_x: Math.round(pos.x),
          position_y: Math.round(pos.y),
          width: def.w,
          height: null,
          z_index: maxZ() + 1,
          content: def.content,
        });
        setCards((prev) => [...prev, card]);
        setSel(card.id);
      } catch (err) {
        console.error(err);
        toast.error("Création échouée");
      }
    },
    [boardId, maxZ, viewportPoint],
  );

  const removeEl = React.useCallback(
    async (id: string) => {
      const c = cardsRef.current.find((x) => x.id === id);
      if (!c) return;
      setTrash((t) => [{ ...c, _at: "à l'instant" }, ...t].slice(0, 30));
      setCards((prev) => prev.filter((x) => x.id !== id));
      if (sel === id) setSel(null);
      try {
        await planchesApi.deleteCard(id);
      } catch (err) {
        console.error(err);
      }
    },
    [sel],
  );

  const duplicateEl = React.useCallback(
    async (id: string) => {
      const c = cardsRef.current.find((x) => x.id === id);
      if (!c || c.type === "board") return;
      try {
        const created = await planchesApi.createCard(boardId, {
          type: c.type,
          position_x: c.position_x + 28,
          position_y: c.position_y + 28,
          width: c.width,
          height: c.height,
          z_index: maxZ() + 1,
          content: c.content,
          style: c.style,
        });
        setCards((prev) => [...prev, created]);
        setSel(created.id);
      } catch (err) {
        console.error(err);
      }
    },
    [boardId, maxZ],
  );

  const restore = React.useCallback(
    async (id: string) => {
      const it = trash.find((t) => t.id === id);
      if (!it) return;
      setTrash((t) => t.filter((x) => x.id !== id));
      try {
        const created = await planchesApi.createCard(boardId, {
          type: it.type,
          position_x: it.position_x,
          position_y: it.position_y,
          width: it.width,
          height: it.height,
          z_index: maxZ() + 1,
          content: it.content,
          style: it.style,
        });
        setCards((prev) => [...prev, created]);
      } catch (err) {
        console.error(err);
      }
    },
    [boardId, maxZ, trash],
  );

  // ── drag / resize ─────────────────────────────────────────────────────────────
  const startDrag = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    if (isInteractive(e.target)) {
      setSel(id);
      return;
    }
    setSel(id);
    const el = cardsRef.current.find((x) => x.id === id);
    if (!el) return;
    drag.current = { id, sx: e.clientX, sy: e.clientY, ox: el.position_x, oy: el.position_y, moved: false };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const z = zoomRef.current;
      const dx = (ev.clientX - d.sx) / z;
      const dy = (ev.clientY - d.sy) / z;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      setCards((arr) =>
        arr.map((x) => (x.id === d.id ? { ...x, position_x: Math.round(d.ox + dx), position_y: Math.round(d.oy + dy) } : x)),
      );
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (d?.moved) void persistCard(d.id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startResize = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setSel(id);
    const el = cardsRef.current.find((x) => x.id === id);
    if (!el) return;
    const r = { sx: e.clientX, ow: el.width };
    const move = (ev: PointerEvent) => {
      const dw = (ev.clientX - r.sx) / zoomRef.current;
      setCards((arr) => arr.map((x) => (x.id === id ? { ...x, width: Math.max(180, Math.round(r.ow + dw)) } : x)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      void persistCard(id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ── context menu + keyboard ───────────────────────────────────────────────────
  const onCanvasContext = (e: React.MouseEvent) => {
    if (e.target instanceof Element && e.target.closest(".free-el, .el-toolbar, .popover")) return;
    e.preventDefault();
    const p = clientToCanvas(e.clientX, e.clientY);
    setCtx({ x: e.clientX, y: e.clientY, cx: p.x - 140, cy: p.y - 20 });
  };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.matches?.("input, textarea, [contenteditable=true]")) return;
      if ((e.key === "Backspace" || e.key === "Delete") && sel) {
        e.preventDefault();
        void removeEl(sel);
      }
      if (e.key === "Escape") {
        setSel(null);
        setCtx(null);
        setMenu(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sel, removeEl]);

  // ── uploads ───────────────────────────────────────────────────────────────────
  const uploadFiles = React.useCallback(
    async (files: File[], at: { x: number; y: number }) => {
      if (!files.length) return;
      const id = toast.loading(`Import de ${files.length} fichier(s)…`);
      try {
        const { cards: created, failures } = await planchesApi.uploadFiles(boardId, files, {
          x: at.x,
          y: at.y,
          z: maxZ() + 1,
        });
        // Adapt uploaded cards to the design's content shape.
        const adapted: PlancheCard[] = created.map((c) => {
          const cu = c.content as Record<string, unknown>;
          if (c.type === "image") {
            return { ...c, content: { ...cu, image_url: cu.url, title: cu.file_name } as PlancheCardContent };
          }
          const ext = String(cu.file_name ?? "").split(".").pop()?.toLowerCase();
          const kind = ext === "pdf" ? "pdf" : ext === "zip" ? "zip" : ext === "doc" || ext === "docx" ? "doc" : "file";
          const size = typeof cu.size === "number" ? `${(cu.size / 1024).toFixed(0)} Ko` : "—";
          return { ...c, content: { ...cu, name: cu.file_name, kind, size, color: "slate" } as PlancheCardContent };
        });
        // Persist the adapted content so it survives a reload.
        setCards((prev) => [...prev, ...adapted]);
        for (const c of adapted) void planchesApi.updateCard(c.id, { content: c.content }).catch(() => {});
        if (failures.length) toast.error(`${failures.length} échec(s)`, { id });
        else toast.success(`${created.length} ajouté(s)`, { id });
      } catch (err) {
        console.error(err);
        toast.error("Import échoué", { id });
      }
    },
    [boardId, maxZ],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void uploadFiles(files, clientToCanvas(e.clientX, e.clientY));
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (isInteractive(e.target)) return;
    const files = Array.from(e.clipboardData.files);
    if (files.length) void uploadFiles(files, viewportPoint());
  };

  const pickFiles = (imagesOnly: boolean) => {
    fileAcceptImages.current = imagesOnly;
    if (fileRef.current) fileRef.current.accept = imagesOnly ? "image/*" : "";
    fileRef.current?.click();
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) void uploadFiles(files, viewportPoint());
  };

  // ── title + zoom + menus ────────────────────────────────────────────────────────
  const saveTitle = async () => {
    if (!board || titleDraft.trim() === board.title) return;
    try {
      const updated = await planchesApi.updateBoard(board.id, { title: titleDraft.trim() });
      setBoard(updated);
    } catch (err) {
      console.error(err);
    }
  };

  const openMenu = (name: Menu, e: React.MouseEvent) => {
    setMenuRect((e.currentTarget as HTMLElement).getBoundingClientRect());
    setMenu(name);
  };

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Lien copié");
    } catch {
      /* ignore */
    }
    setMenu(null);
  };

  // ── element rendering ──────────────────────────────────────────────────────────
  const toEl = (c: PlancheCard): El => ({ id: c.id, type: c.type, ...(c.content as Record<string, unknown>) });

  const renderBody = (c: PlancheCard) => {
    const el = toEl(c);
    const onPatch = (p: Partial<El>) => patchContent(c.id, p);
    const onCommit = () => scheduleSave(c.id);
    switch (c.type) {
      case "board":
        return (
          <CardEl
            el={el}
            onPatch={(p) => { onPatch(p); void persistCard(c.id); }}
            onOpen={() => el.linked_board_id && router.push(`/planches/${el.linked_board_id}`)}
          />
        );
      case "note":
        return <NoteEl el={el} selected={sel === c.id} onPatch={onPatch} onCommit={onCommit} />;
      case "todo":
        return <TodoEl el={el} onPatch={onPatch} onCommit={onCommit} />;
      case "link":
        return <LinkEl el={el} onPatch={onPatch} onCommit={onCommit} />;
      case "file":
        return <FileEl el={el} onPatch={onPatch} onCommit={onCommit} />;
      case "image":
        return <ImageEl el={el} onPatch={onPatch} onCommit={onCommit} />;
      default:
        return null;
    }
  };

  // canvas size grows to contain content
  const canvasSize = React.useMemo(() => {
    let w = 2200;
    let h = 1500;
    for (const c of cards) {
      w = Math.max(w, c.position_x + c.width + 400);
      h = Math.max(h, c.position_y + (c.height ?? 320) + 400);
    }
    return { w, h };
  }, [cards]);

  if (loading) {
    return (
      <div className="pboard" id="pboard-root" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="saved"><i />chargement…</span>
      </div>
    );
  }

  return (
    <div className="pboard" id="pboard-root">
      {/* Top bar */}
      <header className="topbar">
        <div className="tb-left">
          <button className="tb-back" title="Retour au CRM" onClick={() => router.push("/planches")}>
            <Icon name="back" className="ico-sm" />
          </button>
          <div className="brand">
            <span className="brand-mark"><Icon name="board" className="ico" /></span>
          </div>
          <nav className="crumbs">
            <button className="crumb" onClick={() => router.push("/planches")}>
              <Icon name="home" className="ico-sm" />
              <span>Planches</span>
            </button>
            {breadcrumb.map((b, i) => (
              <React.Fragment key={b.id}>
                <span className="crumb-sep">/</span>
                <button
                  className={`crumb ${i === breadcrumb.length - 1 ? "cur" : ""}`}
                  onClick={() => i < breadcrumb.length - 1 && router.push(`/planches/${b.id}`)}
                >
                  <span>{b.title}</span>
                </button>
              </React.Fragment>
            ))}
          </nav>
          <span className="saved"><i />enregistré</span>
        </div>
        <div className="tb-right">
          <button className="ic-btn" title="Rechercher" onClick={() => router.push("/planches")}><Icon name="search" className="ico-sm" /></button>
          <button className="ic-btn" title="Aide"><Icon name="help" className="ico-sm" /></button>
          <button className="ic-btn" title="Réglages" onClick={() => router.push("/settings")}><Icon name="settings" className="ico-sm" /></button>
        </div>
      </header>

      {/* Sub header */}
      <div className="subhead">
        <div />
        <input
          className="board-title"
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          style={{ border: 0, background: "transparent", outline: "none", minWidth: 240 }}
        />
        <div className="subhead-actions">
          <button className="btn ghost" onClick={(e) => openMenu("share", e)}><Icon name="userPlus" className="ico-sm" />Partager</button>
          <button className="btn ghost" onClick={(e) => openMenu("export", e)}><Icon name="download" className="ico-sm" />Exporter<Icon name="chevdown" className="ico-xs" /></button>
          <button className="btn ghost" onClick={(e) => openMenu("view", e)}><Icon name="eye" className="ico-sm" />Vue<Icon name="chevdown" className="ico-xs" /></button>
        </div>
      </div>

      {/* Body */}
      <div className="body">
        <aside className="rail">
          <RailTool icon="note" label="Note" onClick={() => addEl("note")} />
          <RailTool icon="link" label="Lien" onClick={() => addEl("link")} />
          <RailTool icon="todo" label="À faire" onClick={() => addEl("todo")} />
          <RailTool icon="board" label="Planche" active onClick={() => addEl("board")} />
          <RailTool icon="more" label="Plus" onClick={(e) => openMenu("railmore", e!)} />
          <span className="rail-div" />
          <RailTool icon="image" label="Images" onClick={() => pickFiles(true)} />
          <RailTool icon="upload" label="Importer" onClick={() => pickFiles(false)} />
          <span className="rail-grow" />
          <RailTool icon="trash" label="Corbeille" badge={trash.length || null} onClick={(e) => openMenu("trash", e!)} />
        </aside>

        <div
          className="canvas-scroll"
          ref={scrollRef}
          onContextMenu={onCanvasContext}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onPaste={onPaste}
          tabIndex={0}
          onMouseDown={(e) => {
            const cl = (e.target as HTMLElement).classList;
            if (cl.contains("canvas") || cl.contains("canvas-scroll")) {
              setSel(null);
              setCtx(null);
            }
          }}
        >
          <div className="canvas" style={{ transform: `scale(${zoom})`, width: canvasSize.w, height: canvasSize.h }}>
            {cards.map((c) => (
              <div
                key={c.id}
                className={`free-el ${sel === c.id ? "sel" : ""} ${c.type}`}
                style={{ left: c.position_x, top: c.position_y, width: c.width }}
                onPointerDown={(e) => startDrag(e, c.id)}
              >
                {sel === c.id && (
                  <ElementToolbar
                    kind={c.type}
                    el={toEl(c)}
                    onPatch={(p) => { patchContent(c.id, p); void persistCard(c.id); }}
                    onDelete={() => removeEl(c.id)}
                    onDuplicate={() => duplicateEl(c.id)}
                  />
                )}
                {renderBody(c)}
                {sel === c.id && (
                  <div className="resize-e" title="Redimensionner" onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => startResize(e, c.id)}>
                    <span />
                  </div>
                )}
              </div>
            ))}

            {cards.length === 0 && (
              <div style={{ position: "absolute", left: 60, top: 80, color: "var(--text-3)", fontSize: 13, maxWidth: 360 }}>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, color: "var(--text-2)", marginBottom: 6 }}>
                  Planche vide
                </div>
                Cliquez sur un outil à gauche, faites un clic droit pour ajouter, ou déposez des fichiers.
              </div>
            )}
          </div>

          <div className="tosort-pill"><b>{cards.length}</b> élément{cards.length > 1 ? "s" : ""}</div>

          <div className="zoom-ctl">
            <button onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.1).toFixed(2)))}><Icon name="minus" className="ico-sm" /></button>
            <span onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.1).toFixed(2)))}><Icon name="plus" className="ico-sm" /></button>
          </div>
        </div>
      </div>

      {/* Right-click add menu */}
      <FloatingMenu point={ctx ? { x: ctx.x, y: ctx.y } : null} open={!!ctx} onClose={() => setCtx(null)}>
        <MenuLabel>Ajouter au canvas</MenuLabel>
        <MenuItem icon="note" onClick={() => ctx && addEl("note", { x: ctx.cx, y: ctx.cy })}>Note</MenuItem>
        <MenuItem icon="board" onClick={() => ctx && addEl("board", { x: ctx.cx, y: ctx.cy })}>Planche</MenuItem>
        <MenuItem icon="todo" onClick={() => ctx && addEl("todo", { x: ctx.cx, y: ctx.cy })}>Liste à faire</MenuItem>
        <MenuItem icon="link" onClick={() => ctx && addEl("link", { x: ctx.cx, y: ctx.cy })}>Lien</MenuItem>
        <MenuItem icon="image" onClick={() => ctx && addEl("image", { x: ctx.cx, y: ctx.cy })}>Galerie d&apos;images</MenuItem>
        <MenuSep />
        <MenuItem icon="upload" onClick={() => pickFiles(false)}>Importer un fichier…</MenuItem>
      </FloatingMenu>

      {/* Rail "more" */}
      <Popover open={menu === "railmore"} anchorRect={menuRect} onClose={() => setMenu(null)} className="menu">
        <MenuLabel>Autres éléments</MenuLabel>
        <MenuItem icon="image" onClick={() => { void addEl("image"); setMenu(null); }}>Galerie d&apos;images</MenuItem>
        <MenuItem icon="upload" onClick={() => { setMenu(null); pickFiles(false); }}>Fichier</MenuItem>
      </Popover>

      {/* Share */}
      <Popover open={menu === "share"} anchorRect={menuRect} onClose={() => setMenu(null)} align="end" className="sheet">
        <div className="sheet-title">Partager cette planche</div>
        <MenuItem icon="link" onClick={copyShareLink}>Copier le lien de la planche</MenuItem>
      </Popover>

      {/* Export */}
      <Popover open={menu === "export"} anchorRect={menuRect} onClose={() => setMenu(null)} align="end" className="menu">
        <MenuLabel>Exporter</MenuLabel>
        <MenuItem icon="image" onClick={() => setMenu(null)}>Image PNG (bientôt)</MenuItem>
        <MenuItem icon="file" onClick={() => setMenu(null)}>PDF (bientôt)</MenuItem>
      </Popover>

      {/* View */}
      <Popover open={menu === "view"} anchorRect={menuRect} onClose={() => setMenu(null)} align="end" className="menu">
        <MenuLabel>Affichage</MenuLabel>
        <MenuItem icon="expand" onClick={() => { setZoom(1); setMenu(null); }}>Zoom 100 %</MenuItem>
        <MenuItem icon="collapse" onClick={() => { setZoom(0.6); setMenu(null); }}>Vue d&apos;ensemble</MenuItem>
      </Popover>

      {/* Trash */}
      <Popover open={menu === "trash"} anchorRect={menuRect} onClose={() => setMenu(null)} className="sheet">
        <div className="sheet-title">Corbeille</div>
        {trash.length === 0 && <div className="trash-empty">La corbeille est vide</div>}
        {trash.map((t) => {
          const el = toEl(t);
          return (
            <div key={t.id} className="trash-row">
              <span className="trash-ic"><Icon name={t.type === "board" ? "board" : t.type} className="ico-sm" /></span>
              <div className="trash-meta">
                <b>{el.title || el.name || t.type}</b>
                <span>supprimé {t._at}</span>
              </div>
              <button className="btn ghost sm" onClick={() => restore(t.id)}>Restaurer</button>
            </div>
          );
        })}
        {trash.length > 0 && (
          <>
            <MenuSep />
            <MenuItem icon="trash" danger onClick={() => setTrash([])}>Vider la corbeille</MenuItem>
          </>
        )}
      </Popover>

      <input ref={fileRef} type="file" multiple className="hidden" style={{ display: "none" }} onChange={onFilePicked} />
    </div>
  );
}

function RailTool({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  badge?: number | null;
  onClick?: (e?: React.MouseEvent) => void;
}) {
  return (
    <button className={`rail-tool ${active ? "active" : ""}`} onClick={(e) => onClick?.(e)} title={label}>
      <span className="rail-ic">
        <Icon name={icon} className="ico" />
        {badge != null && <span className="rail-badge">{badge}</span>}
      </span>
      <span className="rail-lbl">{label}</span>
    </button>
  );
}

export default PlancheCanvas;
