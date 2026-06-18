"use client";

import React from "react";
import {
  FileText,
  Download,
  Link2,
  Layers,
  Plus,
  Check,
  X,
  ExternalLink,
} from "lucide-react";
import { RichTextEditor } from "./RichTextEditor";
import type { PlancheCard, PlancheCardContent, PlancheCardStyle, PlancheTodoItem } from "@/types";

export type CardViewProps = {
  card: PlancheCard;
  selected: boolean;
  editing: boolean;
  scale: number;
  onPointerDown: (e: React.PointerEvent, card: PlancheCard) => void;
  onResizeStart: (e: React.PointerEvent, card: PlancheCard) => void;
  onConnectStart: (e: React.PointerEvent, card: PlancheCard) => void;
  onDoubleClick: (card: PlancheCard) => void;
  onContentChange: (id: string, content: PlancheCardContent) => void;
  /** Persist the card. Pass a `patch` to persist values that were just set in
   *  the same tick (state updates are async and would otherwise be missed). */
  onCommit: (id: string, patch?: Partial<PlancheCard>) => void;
  onOpenBoard: (boardId: string) => void;
};

const uid = () => Math.random().toString(36).slice(2, 10);

export const CardView = React.memo(function CardView(props: CardViewProps) {
  const { card, selected, editing } = props;
  const style: PlancheCardStyle = card.style ?? {};

  const wrapperStyle: React.CSSProperties = {
    position: "absolute",
    left: card.position_x,
    top: card.position_y,
    width: card.width,
    height: card.height ?? undefined,
    zIndex: card.z_index,
    transform: card.rotation ? `rotate(${card.rotation}deg)` : undefined,
  };

  return (
    <div
      data-card-id={card.id}
      style={wrapperStyle}
      onPointerDown={(e) => props.onPointerDown(e, card)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        props.onDoubleClick(card);
      }}
      className={[
        "group select-none",
        selected ? "outline outline-2 outline-primary outline-offset-2 rounded-[10px]" : "",
      ].join(" ")}
    >
      <CardBody {...props} />

      {/* Resize handle */}
      {selected && card.type !== "text" && (
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            props.onResizeStart(e, card);
          }}
          className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-primary bg-background"
        />
      )}

      {/* Connection handle (drag to another card to draw an arrow) */}
      {selected && (
        <div
          title="Relier à une autre carte"
          onPointerDown={(e) => {
            e.stopPropagation();
            props.onConnectStart(e, card);
          }}
          className="absolute top-1/2 -right-3 h-3.5 w-3.5 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-primary bg-background opacity-0 transition-opacity group-hover:opacity-100"
        />
      )}
    </div>
  );
});

function CardBody(props: CardViewProps) {
  const { card, editing } = props;
  const style = card.style ?? {};
  const content = card.content ?? {};

  switch (card.type) {
    case "text":
      return (
        <div
          style={{ color: style.color, textAlign: style.align, fontSize: style.fontSize ?? 22 }}
          className="font-semibold leading-snug text-slate-800 dark:text-slate-100"
        >
          <RichTextEditor
            value={content.html ?? ""}
            editing={editing}
            placeholder="Titre…"
            onChange={(html) => props.onContentChange(card.id, { ...content, html })}
            onCommit={(html) => props.onCommit(card.id, { content: { ...content, html } })}
          />
        </div>
      );

    case "note":
      return (
        <div
          className="h-full overflow-hidden rounded-[10px] border border-black/5 p-3 text-sm leading-relaxed text-slate-800 shadow-sm dark:text-slate-100"
          style={{ background: style.background ?? "#ffffff", color: style.color }}
        >
          <RichTextEditor
            value={content.html ?? ""}
            editing={editing}
            placeholder="Écrire une note…"
            className="h-full"
            onChange={(html) => props.onContentChange(card.id, { ...content, html })}
            onCommit={(html) => props.onCommit(card.id, { content: { ...content, html } })}
          />
        </div>
      );

    case "color":
      return (
        <div
          className="relative flex h-full min-h-[80px] items-end rounded-[10px] p-2 shadow-sm"
          style={{ background: content.color ?? "#f59e0b" }}
        >
          <span className="rounded bg-black/20 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {content.color ?? "#f59e0b"}
          </span>
          {props.selected && (
            <input
              type="color"
              value={content.color ?? "#f59e0b"}
              onPointerDown={(e) => e.stopPropagation()}
              onChange={(e) =>
                props.onCommit(card.id, { content: { ...content, color: e.target.value } })
              }
              className="absolute right-1.5 top-1.5 h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
              title="Choisir une couleur"
            />
          )}
        </div>
      );

    case "image":
      return (
        <div className="overflow-hidden rounded-[10px] bg-muted shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={content.url}
            alt={content.file_name ?? ""}
            draggable={false}
            className="block w-full select-none"
            style={{ height: card.height ?? "auto", objectFit: "cover" }}
          />
        </div>
      );

    case "file":
      return (
        <div className="flex items-center gap-2.5 rounded-[10px] border bg-card p-3 shadow-sm">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={content.file_name}>
              {content.file_name ?? "Fichier"}
            </p>
            <p className="text-xs text-muted-foreground">
              {content.size ? `${(content.size / 1024).toFixed(0)} Ko` : ""}
            </p>
          </div>
          <a
            href={content.url}
            target="_blank"
            rel="noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Télécharger"
          >
            <Download className="h-4 w-4" />
          </a>
        </div>
      );

    case "link":
      return <LinkCard {...props} />;

    case "todo":
      return <TodoCard {...props} />;

    case "board":
      // Plain div so the wrapper's pointer handlers still drive select/drag;
      // double-click (handled by the canvas) or the explicit button opens it.
      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-primary/30 bg-primary/5 p-4 text-center">
          <Layers className="h-7 w-7 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {content.title || "Sous-planche"}
          </span>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={() => content.linked_board_id && props.onOpenBoard(content.linked_board_id)}
            className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/20"
          >
            Ouvrir →
          </button>
        </div>
      );

    default:
      return null;
  }
}

function LinkCard(props: CardViewProps) {
  const { card, editing } = props;
  const content = card.content ?? {};
  const [url, setUrl] = React.useState(content.url ?? "");

  React.useEffect(() => setUrl(content.url ?? ""), [content.url]);

  if (editing || !content.url) {
    return (
      <div
        className="rounded-[10px] border bg-card p-3 shadow-sm"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Link2 className="h-3.5 w-3.5" /> Lien
        </div>
        <input
          autoFocus
          value={url}
          placeholder="https://…"
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => props.onCommit(card.id, { content: { ...content, url: url.trim() } })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              props.onCommit(card.id, { content: { ...content, url: url.trim() } });
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="w-full rounded border bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    );
  }

  let host = content.url;
  try {
    host = new URL(content.url).hostname.replace(/^www\./, "");
  } catch {
    /* keep raw */
  }

  return (
    <a
      href={content.url}
      target="_blank"
      rel="noreferrer"
      onPointerDown={(e) => e.stopPropagation()}
      className="flex items-center gap-2.5 rounded-[10px] border bg-card p-3 shadow-sm transition-colors hover:bg-muted/50"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`}
        alt=""
        className="h-8 w-8 shrink-0 rounded"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{content.title || host}</p>
        <p className="truncate text-xs text-muted-foreground">{host}</p>
      </div>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
}

function TodoCard(props: CardViewProps) {
  const { card } = props;
  const content = card.content ?? {};
  const items: PlancheTodoItem[] = content.items ?? [];
  const [adding, setAdding] = React.useState("");

  const update = (next: Partial<PlancheCardContent>) => {
    props.onCommit(card.id, { content: { ...content, ...next } });
  };

  const toggle = (id: string) =>
    update({ items: items.map((it) => (it.id === id ? { ...it, done: !it.done } : it)) });

  const edit = (id: string, text: string) =>
    props.onContentChange(card.id, {
      ...content,
      items: items.map((it) => (it.id === id ? { ...it, text } : it)),
    });

  const remove = (id: string) => update({ items: items.filter((it) => it.id !== id) });

  const add = () => {
    if (!adding.trim()) return;
    update({ items: [...items, { id: uid(), text: adding.trim(), done: false }] });
    setAdding("");
  };

  return (
    <div className="rounded-[10px] border bg-card p-3 shadow-sm" onPointerDown={(e) => e.stopPropagation()}>
      <input
        value={content.title ?? ""}
        placeholder="Liste de tâches"
        onChange={(e) => props.onContentChange(card.id, { ...content, title: e.target.value })}
        onBlur={() => props.onCommit(card.id)}
        className="mb-2 w-full bg-transparent text-sm font-semibold outline-none"
      />
      <div className="space-y-1">
        {items.map((it) => (
          <div key={it.id} className="group/item flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggle(it.id)}
              className={[
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                it.done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
              ].join(" ")}
            >
              {it.done && <Check className="h-3 w-3" />}
            </button>
            <input
              value={it.text}
              onChange={(e) => edit(it.id, e.target.value)}
              onBlur={() => props.onCommit(card.id)}
              className={[
                "flex-1 bg-transparent text-sm outline-none",
                it.done ? "text-muted-foreground line-through" : "",
              ].join(" ")}
            />
            <button
              type="button"
              onClick={() => remove(it.id)}
              className="opacity-0 transition-opacity group-hover/item:opacity-100"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={adding}
          placeholder="Ajouter une tâche…"
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          onBlur={add}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </div>
    </div>
  );
}

export default CardView;
