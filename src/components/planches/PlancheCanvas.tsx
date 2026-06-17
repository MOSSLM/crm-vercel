"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  StickyNote,
  Type,
  CheckSquare,
  ImagePlus,
  Paperclip,
  Link2,
  Palette,
  Layers,
  Loader2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Trash2,
  Copy,
} from "lucide-react";
import Link from "next/link";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { planchesApi } from "@/lib/planches/api";
import { CardView } from "./CardView";
import type {
  PlancheBoard,
  PlancheCard,
  PlancheCardContent,
  PlancheCardType,
  PlancheConnection,
} from "@/types";

type View = { x: number; y: number; scale: number };

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;

const DEFAULTS: Record<
  PlancheCardType,
  { width: number; height: number | null; content?: PlancheCardContent }
> = {
  note: { width: 220, height: null },
  text: { width: 300, height: null, content: { html: "" } },
  todo: { width: 240, height: null, content: { items: [] } },
  link: { width: 260, height: null, content: {} },
  color: { width: 120, height: 120, content: { color: "#f59e0b" } },
  board: { width: 200, height: 130 },
  image: { width: 260, height: null },
  file: { width: 240, height: null },
  column: { width: 240, height: 320, content: {} },
};

const TOOLS: { type: PlancheCardType; label: string; icon: React.ElementType; upload?: boolean }[] =
  [
    { type: "note", label: "Note", icon: StickyNote },
    { type: "text", label: "Texte / titre", icon: Type },
    { type: "todo", label: "Liste de tâches", icon: CheckSquare },
    { type: "image", label: "Image", icon: ImagePlus, upload: true },
    { type: "file", label: "Fichier", icon: Paperclip, upload: true },
    { type: "link", label: "Lien", icon: Link2 },
    { type: "color", label: "Couleur", icon: Palette },
    { type: "board", label: "Sous-planche", icon: Layers },
  ];

type Interaction =
  | { kind: "pan"; startX: number; startY: number; origX: number; origY: number }
  | { kind: "drag"; startX: number; startY: number; moved: boolean; cards: { id: string; x: number; y: number }[] }
  | { kind: "resize"; cardId: string; startX: number; startY: number; startW: number; startH: number; aspect: number | null }
  | { kind: "marquee"; start: { x: number; y: number }; current: { x: number; y: number } }
  | { kind: "connect"; fromId: string; current: { x: number; y: number } }
  | null;

export function PlancheCanvas({ boardId }: { boardId: string }) {
  const router = useRouter();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [board, setBoard] = React.useState<PlancheBoard | null>(null);
  const [cards, setCards] = React.useState<PlancheCard[]>([]);
  const [connections, setConnections] = React.useState<PlancheConnection[]>([]);
  const [breadcrumb, setBreadcrumb] = React.useState<Pick<PlancheBoard, "id" | "title">[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [titleDraft, setTitleDraft] = React.useState("");

  const [view, setView] = React.useState<View>({ x: 0, y: 0, scale: 1 });
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [marquee, setMarquee] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [, forceTick] = React.useReducer((n) => n + 1, 0);

  const interaction = React.useRef<Interaction>(null);
  const viewRef = React.useRef(view);
  viewRef.current = view;
  const cardsRef = React.useRef(cards);
  cardsRef.current = cards;
  const spaceDown = React.useRef(false);
  const heights = React.useRef<Map<string, number>>(new Map());

  // ----- load --------------------------------------------------------------
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
        setConnections(data.connections);
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

  // ----- geometry helpers --------------------------------------------------
  const screenToWorld = React.useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    const sx = clientX - (rect?.left ?? 0);
    const sy = clientY - (rect?.top ?? 0);
    return { x: (sx - v.x) / v.scale, y: (sy - v.y) / v.scale };
  }, []);

  const viewportCenterWorld = React.useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return screenToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [screenToWorld]);

  const cardHeight = React.useCallback((c: PlancheCard) => {
    return heights.current.get(c.id) ?? c.height ?? 100;
  }, []);

  const maxZ = React.useCallback(
    () => cardsRef.current.reduce((m, c) => Math.max(m, c.z_index), 0),
    [],
  );

  // ----- card measurement (for connection endpoints) ----------------------
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.cardId;
        if (!id) continue;
        const h = (entry.target as HTMLElement).offsetHeight;
        if (heights.current.get(id) !== h) {
          heights.current.set(id, h);
          changed = true;
        }
      }
      if (changed) forceTick();
    });
    el.querySelectorAll<HTMLElement>("[data-card-id]").forEach((node) => ro.observe(node));
    return () => ro.disconnect();
  }, [cards.length]);

  // ----- persistence -------------------------------------------------------
  const persistCard = React.useCallback(async (id: string) => {
    const card = cardsRef.current.find((c) => c.id === id);
    if (!card || card.id.startsWith("tmp-")) return;
    try {
      await planchesApi.updateCard(id, {
        position_x: card.position_x,
        position_y: card.position_y,
        width: card.width,
        height: card.height,
        z_index: card.z_index,
        content: card.content,
        style: card.style,
      });
    } catch (err) {
      console.error(err);
    }
  }, []);

  const persistBulk = React.useCallback(async (ids: string[]) => {
    const payload = cardsRef.current
      .filter((c) => ids.includes(c.id) && !c.id.startsWith("tmp-"))
      .map((c) => ({
        id: c.id,
        position_x: c.position_x,
        position_y: c.position_y,
        width: c.width,
        height: c.height,
        z_index: c.z_index,
      }));
    if (payload.length === 0) return;
    try {
      await planchesApi.bulkUpdateCards(boardId, payload);
    } catch (err) {
      console.error(err);
    }
  }, [boardId]);

  const updateContent = React.useCallback((id: string, content: PlancheCardContent) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, content } : c)));
  }, []);

  // ----- create / delete / duplicate --------------------------------------
  const addCard = React.useCallback(
    async (type: PlancheCardType, at?: { x: number; y: number }) => {
      const def = DEFAULTS[type];
      const pos = at ?? viewportCenterWorld();
      const z = maxZ() + 1;
      try {
        const card = await planchesApi.createCard(boardId, {
          type,
          position_x: Math.round(pos.x - def.width / 2),
          position_y: Math.round(pos.y - (def.height ?? 60) / 2),
          width: def.width,
          height: def.height,
          z_index: z,
          content: def.content ?? {},
        });
        setCards((prev) => [...prev, card]);
        setSelectedIds(new Set([card.id]));
        if (type === "note" || type === "text" || type === "link") setEditingId(card.id);
      } catch (err) {
        console.error(err);
        toast.error("Création échouée");
      }
    },
    [boardId, maxZ, viewportCenterWorld],
  );

  const deleteSelected = React.useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setCards((prev) => prev.filter((c) => !selectedIds.has(c.id)));
    setConnections((prev) =>
      prev.filter((cn) => !selectedIds.has(cn.from_card_id) && !selectedIds.has(cn.to_card_id)),
    );
    setSelectedIds(new Set());
    setEditingId(null);
    await Promise.all(ids.map((id) => planchesApi.deleteCard(id).catch((e) => console.error(e))));
  }, [selectedIds]);

  const duplicateSelected = React.useCallback(async () => {
    const toCopy = cardsRef.current.filter((c) => selectedIds.has(c.id) && c.type !== "board");
    if (toCopy.length === 0) return;
    const newIds = new Set<string>();
    let z = maxZ();
    for (const c of toCopy) {
      try {
        const created = await planchesApi.createCard(boardId, {
          type: c.type,
          position_x: c.position_x + 24,
          position_y: c.position_y + 24,
          width: c.width,
          height: c.height,
          z_index: ++z,
          content: c.content,
          style: c.style,
        });
        setCards((prev) => [...prev, created]);
        newIds.add(created.id);
      } catch (err) {
        console.error(err);
      }
    }
    setSelectedIds(newIds);
  }, [boardId, maxZ, selectedIds]);

  // ----- selection + drag --------------------------------------------------
  const onCardPointerDown = React.useCallback(
    (e: React.PointerEvent, card: PlancheCard) => {
      if (editingId === card.id) return;
      e.stopPropagation();
      setEditingId(null);

      let nextSelected: Set<string>;
      if (e.shiftKey) {
        nextSelected = new Set(selectedIds);
        if (nextSelected.has(card.id)) nextSelected.delete(card.id);
        else nextSelected.add(card.id);
      } else if (selectedIds.has(card.id)) {
        nextSelected = new Set(selectedIds);
      } else {
        nextSelected = new Set([card.id]);
      }
      setSelectedIds(nextSelected);

      const dragging = cardsRef.current.filter((c) => nextSelected.has(c.id));
      interaction.current = {
        kind: "drag",
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        cards: dragging.map((c) => ({ id: c.id, x: c.position_x, y: c.position_y })),
      };
    },
    [editingId, selectedIds],
  );

  const onResizeStart = React.useCallback((e: React.PointerEvent, card: PlancheCard) => {
    const h = card.height ?? heights.current.get(card.id) ?? 120;
    const aspect = card.type === "image" ? card.width / h : null;
    interaction.current = {
      kind: "resize",
      cardId: card.id,
      startX: e.clientX,
      startY: e.clientY,
      startW: card.width,
      startH: h,
      aspect,
    };
  }, []);

  const onConnectStart = React.useCallback(
    (e: React.PointerEvent, card: PlancheCard) => {
      interaction.current = {
        kind: "connect",
        fromId: card.id,
        current: screenToWorld(e.clientX, e.clientY),
      };
      forceTick();
    },
    [screenToWorld],
  );

  const onDoubleClickCard = React.useCallback((card: PlancheCard) => {
    if (card.type === "board") return;
    setSelectedIds(new Set([card.id]));
    setEditingId(card.id);
  }, []);

  const openBoard = React.useCallback(
    (id: string) => router.push(`/planches/${id}`),
    [router],
  );

  // ----- background interactions ------------------------------------------
  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || spaceDown.current) {
      interaction.current = {
        kind: "pan",
        startX: e.clientX,
        startY: e.clientY,
        origX: viewRef.current.x,
        origY: viewRef.current.y,
      };
      return;
    }
    if (e.button !== 0) return;
    setEditingId(null);
    if (!e.shiftKey) setSelectedIds(new Set());
    const w = screenToWorld(e.clientX, e.clientY);
    interaction.current = { kind: "marquee", start: w, current: w };
  };

  // global pointer move / up
  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const it = interaction.current;
      if (!it) return;
      const v = viewRef.current;
      if (it.kind === "pan") {
        setView((p) => ({ ...p, x: it.origX + (e.clientX - it.startX), y: it.origY + (e.clientY - it.startY) }));
      } else if (it.kind === "drag") {
        const dx = (e.clientX - it.startX) / v.scale;
        const dy = (e.clientY - it.startY) / v.scale;
        if (Math.abs(e.clientX - it.startX) + Math.abs(e.clientY - it.startY) > 3) it.moved = true;
        setCards((prev) =>
          prev.map((c) => {
            const s = it.cards.find((x) => x.id === c.id);
            return s ? { ...c, position_x: Math.round(s.x + dx), position_y: Math.round(s.y + dy) } : c;
          }),
        );
      } else if (it.kind === "resize") {
        const dx = (e.clientX - it.startX) / v.scale;
        const newW = Math.max(60, Math.round(it.startW + dx));
        const newH = it.aspect ? Math.round(newW / it.aspect) : Math.max(40, Math.round(it.startH + (e.clientY - it.startY) / v.scale));
        setCards((prev) => prev.map((c) => (c.id === it.cardId ? { ...c, width: newW, height: newH } : c)));
      } else if (it.kind === "marquee") {
        it.current = screenToWorld(e.clientX, e.clientY);
        const x = Math.min(it.start.x, it.current.x);
        const y = Math.min(it.start.y, it.current.y);
        const w = Math.abs(it.current.x - it.start.x);
        const h = Math.abs(it.current.y - it.start.y);
        setMarquee({ x, y, w, h });
        const sel = new Set<string>();
        for (const c of cardsRef.current) {
          const ch = cardHeight(c);
          if (c.position_x < x + w && c.position_x + c.width > x && c.position_y < y + h && c.position_y + ch > y) {
            sel.add(c.id);
          }
        }
        setSelectedIds(sel);
      } else if (it.kind === "connect") {
        it.current = screenToWorld(e.clientX, e.clientY);
        forceTick();
      }
    };

    const onUp = (e: PointerEvent) => {
      const it = interaction.current;
      interaction.current = null;
      if (!it) return;
      if (it.kind === "drag" && it.moved) {
        void persistBulk(it.cards.map((c) => c.id));
      } else if (it.kind === "resize") {
        void persistCard(it.cardId);
      } else if (it.kind === "marquee") {
        setMarquee(null);
      } else if (it.kind === "connect") {
        const w = screenToWorld(e.clientX, e.clientY);
        const target = [...cardsRef.current].reverse().find((c) => {
          const ch = cardHeight(c);
          return c.id !== it.fromId && w.x >= c.position_x && w.x <= c.position_x + c.width && w.y >= c.position_y && w.y <= c.position_y + ch;
        });
        if (target) {
          planchesApi
            .createConnection(boardId, it.fromId, target.id)
            .then((cn) => setConnections((prev) => [...prev, cn]))
            .catch((err) => console.error(err));
        }
        forceTick();
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [boardId, cardHeight, persistBulk, persistCard, screenToWorld]);

  // ----- wheel (pan + zoom) ------------------------------------------------
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const factor = Math.exp(-e.deltaY * 0.0015);
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
        const k = newScale / v.scale;
        setView({ scale: newScale, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
      } else {
        setView((p) => ({ ...p, x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ----- keyboard ----------------------------------------------------------
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (e.code === "Space" && !typing) spaceDown.current = true;
      if (typing) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0) {
        e.preventDefault();
        void deleteSelected();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        void duplicateSelected();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelectedIds(new Set(cardsRef.current.map((c) => c.id)));
      }
      if (e.key === "Escape") {
        setEditingId(null);
        setSelectedIds(new Set());
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [deleteSelected, duplicateSelected, selectedIds.size]);

  // ----- uploads -----------------------------------------------------------
  const uploadFiles = React.useCallback(
    async (files: File[], at: { x: number; y: number }) => {
      if (files.length === 0) return;
      const toastId = toast.loading(`Import de ${files.length} fichier(s)…`);
      try {
        const { cards: created, failures } = await planchesApi.uploadFiles(boardId, files, {
          x: at.x,
          y: at.y,
          z: maxZ() + 1,
        });
        setCards((prev) => [...prev, ...created]);
        if (failures.length) toast.error(`${failures.length} échec(s)`, { id: toastId });
        else toast.success(`${created.length} ajouté(s)`, { id: toastId });
      } catch (err) {
        console.error(err);
        toast.error("Import échoué", { id: toastId });
      }
    },
    [boardId, maxZ],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void uploadFiles(files, screenToWorld(e.clientX, e.clientY));
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
    const files = Array.from(e.clipboardData.files);
    const center = viewportCenterWorld();
    if (files.length) {
      void uploadFiles(files, center);
      return;
    }
    const text = e.clipboardData.getData("text/plain").trim();
    if (!text) return;
    if (/^https?:\/\//i.test(text)) void addCard("link", center).then(() => {});
    else void addCard("note", center);
  };

  const onToolClick = (tool: (typeof TOOLS)[number]) => {
    if (tool.upload) {
      fileInputRef.current?.click();
    } else {
      void addCard(tool.type);
    }
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length) void uploadFiles(files, viewportCenterWorld());
  };

  const saveTitle = async () => {
    if (!board || titleDraft.trim() === board.title) return;
    try {
      const updated = await planchesApi.updateBoard(board.id, { title: titleDraft.trim() });
      setBoard(updated);
    } catch (err) {
      console.error(err);
    }
  };

  // ----- connection geometry ----------------------------------------------
  const centerOf = (c: PlancheCard) => ({
    x: c.position_x + c.width / 2,
    y: c.position_y + cardHeight(c) / 2,
  });

  const cardById = React.useMemo(() => {
    const m = new Map<string, PlancheCard>();
    for (const c of cards) m.set(c.id, c);
    return m;
  }, [cards]);

  const zoomBy = (factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = rect.width / 2;
    const py = rect.height / 2;
    setView((v) => {
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = newScale / v.scale;
      return { scale: newScale, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
    });
  };

  const resetView = () => setView({ x: 0, y: 0, scale: 1 });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement de la planche…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-2 border-b bg-background px-4 py-2">
        <Link
          href="/planches"
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex items-center gap-1 text-sm">
          {breadcrumb.slice(0, -1).map((b) => (
            <React.Fragment key={b.id}>
              <Link href={`/planches/${b.id}`} className="text-muted-foreground hover:text-foreground">
                {b.title}
              </Link>
              <span className="text-muted-foreground/50">/</span>
            </React.Fragment>
          ))}
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="min-w-[120px] rounded bg-transparent px-1 py-0.5 font-semibold outline-none hover:bg-muted focus:bg-muted"
          />
        </div>
        <div className="ml-auto flex items-center gap-1">
          {selectedIds.size > 0 && (
            <>
              <button
                onClick={duplicateSelected}
                title="Dupliquer (Cmd+D)"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                onClick={deleteSelected}
                title="Supprimer (Suppr)"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <div className="mx-1 h-5 w-px bg-border" />
            </>
          )}
          <button onClick={() => zoomBy(1 / 1.2)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-10 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(view.scale * 100)}%
          </span>
          <button onClick={() => zoomBy(1.2)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button onClick={resetView} title="Réinitialiser la vue" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
            <Maximize className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        {/* Tool palette */}
        <div className="absolute left-3 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-2xl border bg-background/95 p-1.5 shadow-lg backdrop-blur">
          {TOOLS.map((tool) => (
            <Tooltip key={tool.type}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onToolClick(tool)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <tool.icon className="h-5 w-5" strokeWidth={1.8} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{tool.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* Canvas */}
        <div
          ref={containerRef}
          onPointerDown={onBackgroundPointerDown}
          onDoubleClick={(e) => {
            if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.canvasbg) {
              void addCard("note", screenToWorld(e.clientX, e.clientY));
            }
          }}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onPaste={onPaste}
          tabIndex={0}
          className="relative flex-1 overflow-hidden bg-[var(--bg-2,#f6f6f4)] outline-none dark:bg-slate-950"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(120,120,120,0.18) 1px, transparent 1px)",
            backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
            cursor: spaceDown.current ? "grab" : "default",
          }}
        >
          <div
            data-canvasbg="1"
            className="absolute left-0 top-0 h-full w-full"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transformOrigin: "0 0" }}
          >
            {/* Connections */}
            <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" style={{ width: 1, height: 1 }}>
              <defs>
                <marker id="planche-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                </marker>
              </defs>
              {connections.map((cn) => {
                const from = cardById.get(cn.from_card_id);
                const to = cardById.get(cn.to_card_id);
                if (!from || !to) return null;
                const a = centerOf(from);
                const b = centerOf(to);
                return (
                  <g key={cn.id} className="pointer-events-auto cursor-pointer">
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="transparent"
                      strokeWidth={12}
                      onClick={() => {
                        setConnections((prev) => prev.filter((c) => c.id !== cn.id));
                        void planchesApi.deleteConnection(cn.id).catch((e) => console.error(e));
                      }}
                    />
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="#94a3b8"
                      strokeWidth={2}
                      markerEnd="url(#planche-arrow)"
                    />
                  </g>
                );
              })}
              {interaction.current?.kind === "connect" &&
                (() => {
                  const from = cardById.get(interaction.current.fromId);
                  if (!from) return null;
                  const a = centerOf(from);
                  const b = interaction.current.current;
                  return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 4" />;
                })()}
            </svg>

            {/* Cards */}
            {cards.map((card) => (
              <CardView
                key={card.id}
                card={card}
                selected={selectedIds.has(card.id)}
                editing={editingId === card.id}
                scale={view.scale}
                onPointerDown={onCardPointerDown}
                onResizeStart={onResizeStart}
                onConnectStart={onConnectStart}
                onDoubleClick={onDoubleClickCard}
                onContentChange={updateContent}
                onCommit={persistCard}
                onOpenBoard={openBoard}
              />
            ))}

            {/* Marquee */}
            {marquee && (
              <div
                className="pointer-events-none absolute border border-primary/60 bg-primary/10"
                style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
              />
            )}
          </div>

          {cards.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <StickyNote className="mx-auto mb-3 h-10 w-10 opacity-30" />
                <p className="text-sm">Double-cliquez pour ajouter une note,</p>
                <p className="text-sm">déposez des fichiers, ou utilisez la palette à gauche.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onFilePicked}
      />
    </div>
  );
}

export default PlancheCanvas;
