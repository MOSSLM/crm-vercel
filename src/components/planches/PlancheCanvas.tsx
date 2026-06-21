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
  TableEl,
  LineEl,
  ColumnEl,
  TextEl,
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
  text: { w: 300, content: { body: "Titre" } },
  board: { w: 150, content: { title: "Nouvelle planche", icon: "board", color: "blue", meta: "Ouvrir →" } },
  todo: { w: 300, content: { title: "À faire", items: [{ id: "t1", text: "Première tâche", done: false }] } },
  link: { w: 300, content: { title: "Nouveau lien", url: "exemple.com", desc: "Aperçu du lien", color: "blue" } },
  file: { w: 300, content: { name: "document.pdf", kind: "pdf", size: "—", color: "slate" } },
  image: { w: 320, content: { title: "Galerie", cols: 2, cells: ["image 1", "image 2"] } },
  table: {
    w: 360,
    content: {
      title: "Tableau",
      color: "violet",
      columns: ["Colonne A", "Colonne B"],
      rows: [
        [{ t: "" }, { t: "" }],
        [{ t: "" }, { t: "" }],
      ],
    },
  },
  column: { w: 320, content: { title: "Nouvelle colonne", subtitle: "", accent: "blue" } },
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
  const [saving, setSaving] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState("");

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  // Single-selection id (for the per-element toolbar / resize / inline editing).
  const sel = selected.size === 1 ? (selected.values().next().value as string) : null;
  const setSel = React.useCallback(
    (id: string | null) => setSelected(id ? new Set([id]) : new Set()),
    [],
  );
  const selectedRef = React.useRef(selected);
  selectedRef.current = selected;
  const [marquee, setMarquee] = React.useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [ctx, setCtx] = React.useState<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [menu, setMenu] = React.useState<Menu>(null);
  const [menuRect, setMenuRect] = React.useState<DOMRect | null>(null);
  const [trash, setTrash] = React.useState<(PlancheCard & { _at: string })[]>([]);

  const cardsRef = React.useRef(cards);
  cardsRef.current = cards;
  const zoomRef = React.useRef(zoom);
  zoomRef.current = zoom;
  const saveTimers = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [dropTarget, setDropTarget] = React.useState<{ columnId: string; index: number } | null>(null);
  const dropTargetRef = React.useRef<{ columnId: string; index: number } | null>(null);

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
  const savingRef = React.useRef(0);
  const beginSave = React.useCallback(() => {
    savingRef.current += 1;
    setSaving(true);
  }, []);
  const endSave = React.useCallback(() => {
    savingRef.current = Math.max(0, savingRef.current - 1);
    if (savingRef.current === 0) setSaving(false);
  }, []);

  const persistCard = React.useCallback(async (id: string) => {
    const c = cardsRef.current.find((x) => x.id === id);
    if (!c) return;
    beginSave();
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
    } finally {
      endSave();
    }
  }, [beginSave, endSave]);

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
      const content =
        type === "line"
          ? { x1: Math.round(pos.x), y1: Math.round(pos.y), x2: Math.round(pos.x) + 140, y2: Math.round(pos.y) + 80, color: "violet" }
          : def.content;
      try {
        const card = await planchesApi.createCard(boardId, {
          type: type as PlancheCardType,
          position_x: Math.round(pos.x),
          position_y: Math.round(pos.y),
          width: def.w,
          height: null,
          z_index: maxZ() + 1,
          content,
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

  // ── column children ─────────────────────────────────────────────────────────
  const addChild = React.useCallback(
    async (columnId: string) => {
      const siblings = cardsRef.current.filter((c) => c.parent_card_id === columnId);
      const so = siblings.reduce((m, c) => Math.max(m, c.sort_order), 0) + 1;
      try {
        const card = await planchesApi.createCard(boardId, {
          type: "note",
          parent_card_id: columnId,
          sort_order: so,
          width: 240,
          height: null,
          z_index: maxZ() + 1,
          content: { title: "Nouvelle note", body: "", color: "paper" },
        });
        setCards((prev) => [...prev, card]);
        setSel(card.id);
      } catch (err) {
        console.error(err);
      }
    },
    [boardId, maxZ],
  );

  const dupChild = React.useCallback(
    async (id: string) => {
      const c = cardsRef.current.find((x) => x.id === id);
      if (!c) return;
      try {
        const created = await planchesApi.createCard(boardId, {
          type: c.type,
          parent_card_id: c.parent_card_id,
          sort_order: c.sort_order + 0.5,
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

  // ── line dragging ───────────────────────────────────────────────────────────
  const startLineDrag = React.useCallback(
    (e: React.PointerEvent, id: string) => {
      if (e.button !== 0) return;
      if (isInteractive(e.target)) {
        setSel(id);
        return;
      }
      setSel(id);
      const c = cardsRef.current.find((x) => x.id === id);
      if (!c) return;
      const ct = c.content as { x1?: number; y1?: number; x2?: number; y2?: number };
      const st = { sx: e.clientX, sy: e.clientY, x1: ct.x1 ?? 0, y1: ct.y1 ?? 0, x2: ct.x2 ?? 0, y2: ct.y2 ?? 0, moved: false };
      const move = (ev: PointerEvent) => {
        const z = zoomRef.current;
        const dx = (ev.clientX - st.sx) / z;
        const dy = (ev.clientY - st.sy) / z;
        if (Math.abs(dx) + Math.abs(dy) > 2) st.moved = true;
        setCards((arr) =>
          arr.map((x) =>
            x.id === id
              ? {
                  ...x,
                  content: {
                    ...x.content,
                    x1: Math.round(st.x1 + dx),
                    y1: Math.round(st.y1 + dy),
                    x2: Math.round(st.x2 + dx),
                    y2: Math.round(st.y2 + dy),
                  },
                }
              : x,
          ),
        );
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (st.moved) void persistCard(id);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [persistCard],
  );

  const startLineEndpoint = React.useCallback(
    (e: React.PointerEvent, id: string, which: "a" | "b") => {
      e.stopPropagation();
      if (e.button !== 0) return;
      setSel(id);
      const move = (ev: PointerEvent) => {
        const p = clientToCanvas(ev.clientX, ev.clientY);
        setCards((arr) =>
          arr.map((x) =>
            x.id === id
              ? {
                  ...x,
                  content: {
                    ...x.content,
                    ...(which === "a"
                      ? { x1: Math.round(p.x), y1: Math.round(p.y) }
                      : { x2: Math.round(p.x), y2: Math.round(p.y) }),
                  },
                }
              : x,
          ),
        );
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        void persistCard(id);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [clientToCanvas, persistCard],
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

  // ── drag (unified: free move + magnetic drop into / out of columns) ───────────
  const columnHitTest = React.useCallback((clientX: number, clientY: number, draggingId: string) => {
    const bodies = document.querySelectorAll<HTMLElement>(".pboard .column-body[data-col-id]");
    for (const body of Array.from(bodies)) {
      const colId = body.dataset.colId;
      if (!colId || colId === draggingId) continue;
      const r = body.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        const kids = Array.from(body.querySelectorAll<HTMLElement>(":scope > [data-child-id]")).filter(
          (k) => k.dataset.childId !== draggingId,
        );
        let index = kids.length;
        for (let i = 0; i < kids.length; i++) {
          const kr = kids[i].getBoundingClientRect();
          if (clientY < kr.top + kr.height / 2) {
            index = i;
            break;
          }
        }
        return { columnId: colId, index };
      }
    }
    return null;
  }, []);

  const attachToColumn = React.useCallback(async (id: string, columnId: string, index: number) => {
    const sibs = cardsRef.current
      .filter((c) => c.parent_card_id === columnId && c.id !== id)
      .sort((a, b) => a.sort_order - b.sort_order);
    let so: number;
    if (sibs.length === 0) so = 1;
    else if (index <= 0) so = sibs[0].sort_order - 1;
    else if (index >= sibs.length) so = sibs[sibs.length - 1].sort_order + 1;
    else so = (sibs[index - 1].sort_order + sibs[index].sort_order) / 2;
    setCards((arr) => arr.map((c) => (c.id === id ? { ...c, parent_card_id: columnId, sort_order: so } : c)));
    beginSave();
    try {
      await planchesApi.updateCard(id, { parent_card_id: columnId, sort_order: so });
    } catch (err) {
      console.error(err);
    } finally {
      endSave();
    }
  }, [beginSave, endSave]);

  const persistFreePosition = React.useCallback(async (id: string) => {
    const c = cardsRef.current.find((x) => x.id === id);
    if (!c) return;
    beginSave();
    try {
      await planchesApi.updateCard(id, {
        parent_card_id: c.parent_card_id,
        position_x: c.position_x,
        position_y: c.position_y,
        width: c.width,
      });
    } catch (err) {
      console.error(err);
    } finally {
      endSave();
    }
  }, [beginSave, endSave]);

  const beginDrag = React.useCallback(
    (e: React.PointerEvent, id: string) => {
      if (e.button !== 0) return;
      if (isInteractive(e.target)) {
        setSel(id);
        return;
      }
      e.stopPropagation();

      // Shift-click toggles membership without starting a drag.
      if (e.shiftKey) {
        setSelected((prev) => {
          const n = new Set(prev);
          if (n.has(id)) n.delete(id);
          else n.add(id);
          return n;
        });
        return;
      }

      // Group move: dragging one element of a multi-selection moves them all.
      if (selectedRef.current.has(id) && selectedRef.current.size > 1) {
        const starts = Array.from(selectedRef.current)
          .map((sid) => cardsRef.current.find((c) => c.id === sid))
          .filter((c): c is PlancheCard => !!c && !c.parent_card_id)
          .map((c) => ({ id: c.id, ox: c.position_x, oy: c.position_y }));
        let moved = false;
        const move = (ev: PointerEvent) => {
          const z = zoomRef.current;
          const dx = (ev.clientX - e.clientX) / z;
          const dy = (ev.clientY - e.clientY) / z;
          if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
          setCards((arr) =>
            arr.map((c) => {
              const s = starts.find((x) => x.id === c.id);
              return s ? { ...c, position_x: Math.round(s.ox + dx), position_y: Math.round(s.oy + dy) } : c;
            }),
          );
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
          if (moved) void Promise.all(starts.map((s) => persistFreePosition(s.id)));
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        return;
      }

      setSel(id);
      const card = cardsRef.current.find((c) => c.id === id);
      const sc = scrollRef.current;
      if (!card || !sc) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const st = {
        sx: e.clientX,
        sy: e.clientY,
        grabX: e.clientX - rect.left,
        grabY: e.clientY - rect.top,
        w: Math.max(180, Math.round(rect.width / zoomRef.current)),
        moved: false,
        wasChild: !!card.parent_card_id,
      };
      const moveFree = (ev: PointerEvent) => {
        const scRect = sc.getBoundingClientRect();
        const nx = Math.round((ev.clientX - st.grabX - scRect.left + sc.scrollLeft) / zoomRef.current);
        const ny = Math.round((ev.clientY - st.grabY - scRect.top + sc.scrollTop) / zoomRef.current);
        setCards((arr) =>
          arr.map((c) =>
            c.id === id
              ? { ...c, parent_card_id: null, position_x: nx, position_y: ny, width: c.parent_card_id ? st.w : c.width }
              : c,
          ),
        );
      };
      const move = (ev: PointerEvent) => {
        if (!st.moved) {
          if (Math.abs(ev.clientX - st.sx) + Math.abs(ev.clientY - st.sy) < 4) return;
          st.moved = true;
        }
        const over = columnHitTest(ev.clientX, ev.clientY, id);
        dropTargetRef.current = over;
        setDropTarget(over);
        if (!over) moveFree(ev);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const over = dropTargetRef.current;
        dropTargetRef.current = null;
        setDropTarget(null);
        if (!st.moved) return;
        if (over) void attachToColumn(id, over.columnId, over.index);
        else void persistFreePosition(id);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [attachToColumn, columnHitTest, persistFreePosition],
  );

  // Rubber-band selection: drag on empty canvas to select everything inside.
  const startMarquee = React.useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (!target.classList.contains("canvas") && !target.classList.contains("canvas-scroll")) return;
    setCtx(null);
    const additive = e.shiftKey;
    const base = additive ? new Set(selectedRef.current) : new Set<string>();
    if (!additive) setSelected(new Set());
    const x0 = e.clientX;
    const y0 = e.clientY;
    const move = (ev: PointerEvent) => {
      const left = Math.min(x0, ev.clientX);
      const top = Math.min(y0, ev.clientY);
      const width = Math.abs(ev.clientX - x0);
      const height = Math.abs(ev.clientY - y0);
      setMarquee({ left, top, width, height });
      const next = new Set(base);
      document.querySelectorAll<HTMLElement>(".pboard .canvas > .free-el[data-el-id]").forEach((node) => {
        const r = node.getBoundingClientRect();
        if (r.left < left + width && r.right > left && r.top < top + height && r.bottom > top) {
          if (node.dataset.elId) next.add(node.dataset.elId);
        }
      });
      setSelected(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setMarquee(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, []);

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

  const deleteSelected = React.useCallback(async () => {
    const ids = Array.from(selectedRef.current);
    if (ids.length === 0) return;
    const snaps = cardsRef.current.filter((c) => ids.includes(c.id));
    setTrash((t) => [...snaps.map((c) => ({ ...c, _at: "à l'instant" })), ...t].slice(0, 30));
    setSelected(new Set());
    setCards((prev) => prev.filter((c) => !ids.includes(c.id)));
    await Promise.all(ids.map((id) => planchesApi.deleteCard(id).catch((err) => console.error(err))));
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.matches?.("input, textarea, [contenteditable=true]")) return;
      if ((e.key === "Backspace" || e.key === "Delete") && selectedRef.current.size > 0) {
        e.preventDefault();
        void deleteSelected();
      }
      if (e.key === "Escape") {
        setSelected(new Set());
        setCtx(null);
        setMenu(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelected]);

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
  const childrenByParent = React.useMemo(() => {
    const m = new Map<string, PlancheCard[]>();
    for (const c of cards) {
      if (c.parent_card_id) {
        const a = m.get(c.parent_card_id) ?? [];
        a.push(c);
        m.set(c.parent_card_id, a);
      }
    }
    for (const a of m.values()) a.sort((x, y) => x.sort_order - y.sort_order);
    return m;
  }, [cards]);

  const freeCards = React.useMemo(() => cards.filter((c) => !c.parent_card_id), [cards]);

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
            floating
            onPatch={onPatch}
            onCommit={onCommit}
            onOpen={() => el.linked_board_id && router.push(`/planches/${el.linked_board_id}`)}
          />
        );
      case "note":
        return <NoteEl el={el} selected={sel === c.id} onPatch={onPatch} onCommit={onCommit} />;
      case "text":
        return <TextEl el={el} selected={sel === c.id} onPatch={onPatch} onCommit={onCommit} />;
      case "todo":
        return <TodoEl el={el} onPatch={onPatch} onCommit={onCommit} />;
      case "link":
        return <LinkEl el={el} onPatch={onPatch} onCommit={onCommit} />;
      case "file":
        return <FileEl el={el} onPatch={onPatch} onCommit={onCommit} />;
      case "image":
        return <ImageEl el={el} onPatch={onPatch} onCommit={onCommit} />;
      case "table":
        return <TableEl el={el} onPatch={onPatch} onCommit={onCommit} />;
      case "column": {
        const kids = (childrenByParent.get(c.id) ?? []).map(toEl);
        return (
          <ColumnEl
            el={el}
            items={kids}
            selectedId={sel}
            onSelectChild={setSel}
            onChildPointerDown={beginDrag}
            onPatchChild={patchContent}
            onCommitChild={(cid) => scheduleSave(cid)}
            onDeleteChild={removeEl}
            onDuplicateChild={dupChild}
            onPatch={onPatch}
            onCommit={onCommit}
            onAddChild={() => addChild(c.id)}
            onOpenBoard={(bid) => router.push(`/planches/${bid}`)}
            dropIndex={dropTarget?.columnId === c.id ? dropTarget.index : null}
          />
        );
      }
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
          <span className="saved">
            {loading ? (
              <><span className="saved-spin" />chargement…</>
            ) : saving ? (
              <><span className="saved-spin" />enregistrement…</>
            ) : (
              <><i />enregistré</>
            )}
          </span>
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
          placeholder="Planche"
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
          <RailTool icon="type" label="Texte" onClick={() => addEl("text")} />
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
          onPointerDown={startMarquee}
        >
          <div className="canvas" style={{ transform: `scale(${zoom})`, width: canvasSize.w, height: canvasSize.h }}>
            {freeCards.map((c) => {
              if (c.type === "line") {
                const el = toEl(c);
                const x1 = el.x1 ?? 0, y1 = el.y1 ?? 0, x2 = el.x2 ?? 0, y2 = el.y2 ?? 0;
                const left = Math.min(x1, x2) - 12;
                const top = Math.min(y1, y2) - 12;
                return (
                  <div
                    key={c.id}
                    data-el-id={c.id}
                    className={`free-el line-wrap ${selected.has(c.id) ? "sel" : ""}`}
                    style={{ left, top }}
                    onPointerDown={(e) => startLineDrag(e, c.id)}
                  >
                    {sel === c.id && (
                      <ElementToolbar
                        kind="line"
                        el={el}
                        onPatch={(p) => { patchContent(c.id, p); void persistCard(c.id); }}
                        onDelete={() => removeEl(c.id)}
                        onDuplicate={() => duplicateEl(c.id)}
                      />
                    )}
                    <LineEl el={el} />
                    {sel === c.id && (
                      <>
                        <span className="line-handle" style={{ left: x1 - left - 5, top: y1 - top - 5 }} onPointerDown={(e) => startLineEndpoint(e, c.id, "a")} />
                        <span className="line-handle" style={{ left: x2 - left - 5, top: y2 - top - 5 }} onPointerDown={(e) => startLineEndpoint(e, c.id, "b")} />
                      </>
                    )}
                  </div>
                );
              }
              return (
                <div
                  key={c.id}
                  data-el-id={c.id}
                  className={`free-el ${selected.has(c.id) ? "sel" : ""} ${c.type}`}
                  style={{ left: c.position_x, top: c.position_y, width: c.width }}
                  onPointerDown={(e) => beginDrag(e, c.id)}
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
              );
            })}

            {!loading && cards.length === 0 && (
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

          {marquee && (
            <div
              className="marquee"
              style={{ position: "fixed", left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }}
            />
          )}
        </div>
      </div>

      {/* Right-click add menu */}
      <FloatingMenu point={ctx ? { x: ctx.x, y: ctx.y } : null} open={!!ctx} onClose={() => setCtx(null)}>
        <MenuLabel>Ajouter au canvas</MenuLabel>
        <MenuItem icon="note" onClick={() => ctx && addEl("note", { x: ctx.cx, y: ctx.cy })}>Note</MenuItem>
        <MenuItem icon="type" onClick={() => ctx && addEl("text", { x: ctx.cx, y: ctx.cy })}>Texte</MenuItem>
        <MenuItem icon="board" onClick={() => ctx && addEl("board", { x: ctx.cx, y: ctx.cy })}>Planche</MenuItem>
        <MenuItem icon="todo" onClick={() => ctx && addEl("todo", { x: ctx.cx, y: ctx.cy })}>Liste à faire</MenuItem>
        <MenuItem icon="column" onClick={() => ctx && addEl("column", { x: ctx.cx, y: ctx.cy })}>Colonne</MenuItem>
        <MenuItem icon="link" onClick={() => ctx && addEl("link", { x: ctx.cx, y: ctx.cy })}>Lien</MenuItem>
        <MenuItem icon="table" onClick={() => ctx && addEl("table", { x: ctx.cx, y: ctx.cy })}>Tableau</MenuItem>
        <MenuItem icon="image" onClick={() => ctx && addEl("image", { x: ctx.cx, y: ctx.cy })}>Galerie d&apos;images</MenuItem>
        <MenuSep />
        <MenuItem icon="line" onClick={() => ctx && addEl("line", { x: ctx.cx, y: ctx.cy })}>Ligne / flèche</MenuItem>
        <MenuItem icon="upload" onClick={() => pickFiles(false)}>Importer un fichier…</MenuItem>
      </FloatingMenu>

      {/* Rail "more" */}
      <Popover open={menu === "railmore"} anchorRect={menuRect} onClose={() => setMenu(null)} className="menu">
        <MenuLabel>Autres éléments</MenuLabel>
        <MenuItem icon="column" onClick={() => { void addEl("column"); setMenu(null); }}>Colonne</MenuItem>
        <MenuItem icon="table" onClick={() => { void addEl("table"); setMenu(null); }}>Tableau</MenuItem>
        <MenuItem icon="line" onClick={() => { void addEl("line"); setMenu(null); }}>Ligne / flèche</MenuItem>
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
