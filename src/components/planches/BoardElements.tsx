"use client";

import React from "react";
import { Icon } from "./boardIcons";
import { Markdown, Editable } from "./Markdown";
import { Popover, MenuItem } from "./BoardMenus";
import {
  CARD_COLORS,
  CARD_HEX,
  NOTE_COLORS,
  NOTE_BG,
  NOTE_BAR,
  PICK_ICONS,
  type ColorOption,
} from "./boardData";

export type El = {
  id: string;
  type: string;
  color?: string;
  accent?: string;
  icon?: string;
  title?: string;
  body?: string;
  sticky?: boolean;
  items?: { id: string; text: string; done: boolean; due?: string }[];
  url?: string;
  desc?: string;
  name?: string;
  kind?: string;
  size?: string;
  cells?: string[];
  cols?: number;
  image_url?: string;
  meta?: string;
  linked_board_id?: string;
  storage_path?: string;
};

type Patch = (p: Partial<El>) => void;
const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 8)}`;

// ── Colour & icon pickers ────────────────────────────────────────────────────
export function ColorPicker({
  value,
  onPick,
  palette,
}: {
  value?: string;
  onPick: (id: string) => void;
  palette?: readonly ColorOption[];
}) {
  const pal: readonly ColorOption[] = palette ?? CARD_COLORS;
  return (
    <div className="color-grid">
      {pal.map((c) => (
        <button
          key={c.id}
          className={`swatch ${value === c.id ? "on" : ""}`}
          style={{ background: c.hex || c.bg }}
          title={c.id}
          onClick={(e) => {
            e.stopPropagation();
            onPick(c.id);
          }}
        >
          {value === c.id && <Icon name="check" className="ico-xs" />}
        </button>
      ))}
    </div>
  );
}

export function IconPicker({ value, onPick }: { value?: string; onPick: (id: string) => void }) {
  return (
    <div className="icon-grid">
      {PICK_ICONS.map((n) => (
        <button
          key={n}
          className={`icon-cell ${value === n ? "on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onPick(n);
          }}
        >
          <Icon name={n} className="ico" />
        </button>
      ))}
    </div>
  );
}

function ToolBtn({
  icon,
  title,
  swatch,
  onClick,
  children,
}: {
  icon?: string;
  title: string;
  swatch?: string;
  onClick?: (e: React.MouseEvent) => void;
  children?: (close: () => void) => React.ReactNode;
}) {
  const ref = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  return (
    <>
      <button
        ref={ref}
        className="tb-btn"
        title={title}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (children) {
            setRect(ref.current?.getBoundingClientRect() ?? null);
            setOpen((o) => !o);
          } else onClick?.(e);
        }}
      >
        {swatch ? <span className="tb-swatch" style={{ background: swatch }} /> : <Icon name={icon ?? "swatch"} className="ico-sm" />}
      </button>
      {children && (
        <Popover open={open} anchorRect={rect} onClose={() => setOpen(false)} className="pad">
          {children(() => setOpen(false))}
        </Popover>
      )}
    </>
  );
}

export function ElementToolbar({
  kind,
  el,
  onPatch,
  onDelete,
  onDuplicate,
}: {
  kind: string;
  el: El;
  onPatch: Patch;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div className="el-toolbar" onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {kind === "board" && (
        <ToolBtn icon="swatch" title="Icône">
          {() => <IconPicker value={el.icon} onPick={(v) => onPatch({ icon: v })} />}
        </ToolBtn>
      )}
      {(kind === "board" || kind === "link" || kind === "file") && (
        <ToolBtn swatch={CARD_HEX[el.color ?? "slate"] || "#697586"} title="Couleur">
          {() => <ColorPicker value={el.color} onPick={(v) => onPatch({ color: v })} />}
        </ToolBtn>
      )}
      {kind === "note" && (
        <ToolBtn swatch={NOTE_BG[el.color ?? "paper"] || "#fff"} title="Couleur">
          {() => <ColorPicker value={el.color} palette={NOTE_COLORS} onPick={(v) => onPatch({ color: v })} />}
        </ToolBtn>
      )}
      <span className="tb-sep" />
      <ToolBtn icon="copy" title="Dupliquer" onClick={onDuplicate} />
      <ToolBtn icon="trash" title="Supprimer" onClick={onDelete} />
    </div>
  );
}

// ── Card (sub-board) ─────────────────────────────────────────────────────────
export function CardEl({ el, onPatch, onOpen }: { el: El; onPatch: Patch; onOpen?: () => void }) {
  const hex = CARD_HEX[el.color ?? "slate"] || "#697586";
  return (
    <div className="card-el" onDoubleClick={(e) => { e.stopPropagation(); onOpen?.(); }}>
      <div className="card-icon" style={{ background: hex }}>
        <Icon name={el.icon || "board"} className="ico" />
      </div>
      <div className="card-meta">
        <Editable className="card-title" value={el.title ?? ""} onChange={(v) => onPatch({ title: v })} placeholder="Sans titre" />
        <div className="card-sub">{el.meta || "Ouvrir →"}</div>
      </div>
    </div>
  );
}

// ── Note (markdown) ──────────────────────────────────────────────────────────
function applyFormat(ta: HTMLTextAreaElement | null, cmd: string) {
  if (!ta) return;
  const s = ta.selectionStart;
  const e = ta.selectionEnd;
  const val = ta.value;
  const sel = val.slice(s, e);
  const wrap = (pre: string, suf = pre) => pre + (sel || "") + suf;
  const linePrefix = (pfx: string | ((i: number) => string)) => {
    const ls = val.lastIndexOf("\n", s - 1) + 1;
    return {
      ls,
      text: val
        .slice(ls, e)
        .split("\n")
        .map((l, i) => (typeof pfx === "function" ? pfx(i) : pfx) + l)
        .join("\n"),
    };
  };
  let next = val;
  let caret = e;
  if (cmd === "bold") { next = val.slice(0, s) + wrap("**") + val.slice(e); caret = e + 4; }
  else if (cmd === "italic") { next = val.slice(0, s) + wrap("*") + val.slice(e); caret = e + 2; }
  else if (cmd === "code") { next = val.slice(0, s) + wrap("`") + val.slice(e); caret = e + 2; }
  else {
    const map: Record<string, string> = { h1: "# ", h2: "## ", quote: "> ", ul: "- " };
    const lp = cmd === "ol" ? linePrefix((i) => `${i + 1}. `) : linePrefix(map[cmd] ?? "");
    next = val.slice(0, lp.ls) + lp.text + val.slice(e);
    caret = lp.ls + lp.text.length;
  }
  ta.value = next;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
  requestAnimationFrame(() => {
    ta.focus();
    ta.setSelectionRange(caret, caret);
  });
}

function FormatBar({ onCmd }: { onCmd: (c: string) => void }) {
  const btn = (cmd: string, icon: string, title: string) => (
    <button className="fmt-btn" title={title} onMouseDown={(e) => { e.preventDefault(); onCmd(cmd); }}>
      <Icon name={icon} className="ico-sm" />
    </button>
  );
  return (
    <div className="format-bar" onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
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

export function NoteEl({ el, selected, onPatch, onCommit }: { el: El; selected: boolean; onPatch: Patch; onCommit?: () => void }) {
  const [editing, setEditing] = React.useState(false);
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const bg = NOTE_BG[el.color ?? "paper"] || "#fff";
  const bar = NOTE_BAR[el.color ?? "paper"] || "#D9D5CC";
  React.useEffect(() => {
    if (!selected) {
      if (editing) onCommit?.();
      setEditing(false);
    }
  }, [selected]);
  React.useEffect(() => {
    if (editing && taRef.current) {
      const ta = taRef.current;
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
      ta.focus();
    }
  }, [editing]);
  return (
    <div className={`note-el ${el.sticky ? "sticky" : ""}`} style={{ background: bg, ["--note-bar" as string]: bar }}>
      {editing && <FormatBar onCmd={(c) => applyFormat(taRef.current, c)} />}
      {!el.sticky && (
        <Editable className="note-title" value={el.title ?? ""} onChange={(v) => onPatch({ title: v })} onBlur={onCommit} placeholder="Titre" />
      )}
      {editing ? (
        <textarea
          ref={taRef}
          className="note-ta"
          value={el.body || ""}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            onPatch({ body: e.target.value });
            e.target.style.height = "auto";
            e.target.style.height = e.target.scrollHeight + "px";
          }}
          onBlur={() => {
            setEditing(false);
            onCommit?.();
          }}
          placeholder="Écrivez en markdown…"
        />
      ) : (
        <div
          className="note-body"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
        >
          {el.body ? <Markdown source={el.body} /> : <span className="note-ph">Note vide — cliquez pour écrire</span>}
        </div>
      )}
    </div>
  );
}

// ── Todo ─────────────────────────────────────────────────────────────────────
export function TodoEl({ el, onPatch, onCommit }: { el: El; onPatch: Patch; onCommit?: () => void }) {
  const items = el.items ?? [];
  const toggle = (id: string) => { onPatch({ items: items.map((it) => (it.id === id ? { ...it, done: !it.done } : it)) }); onCommit?.(); };
  const setText = (id: string, text: string) => onPatch({ items: items.map((it) => (it.id === id ? { ...it, text } : it)) });
  const add = () => { onPatch({ items: [...items, { id: uid("t"), text: "Nouvelle tâche", done: false }] }); onCommit?.(); };
  const remove = (id: string) => { onPatch({ items: items.filter((it) => it.id !== id) }); onCommit?.(); };
  return (
    <div className="todo-el">
      <Editable className="todo-title" value={el.title ?? ""} onChange={(v) => onPatch({ title: v })} onBlur={onCommit} placeholder="Liste" />
      <div className="todo-items">
        {items.map((it) => (
          <div key={it.id} className={`todo-row ${it.done ? "done" : ""}`}>
            <button className="todo-box" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); toggle(it.id); }}>
              {it.done && <Icon name="check" className="ico-xs" />}
            </button>
            <div className="todo-text-wrap">
              <Editable className="todo-text" value={it.text} onChange={(v) => setText(it.id, v)} onBlur={onCommit} multiline />
              {it.due && (
                <div className="todo-due">
                  <Icon name="alarm" className="ico-xs" />
                  {it.due}
                </div>
              )}
            </div>
            <button className="file-dl" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); remove(it.id); }} title="Supprimer">
              <Icon name="x" className="ico-sm" />
            </button>
          </div>
        ))}
      </div>
      <button className="todo-add" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); add(); }}>
        <Icon name="plus" className="ico-sm" />
        Ajouter une tâche
      </button>
    </div>
  );
}

// ── Link ─────────────────────────────────────────────────────────────────────
export function LinkEl({ el, onPatch, onCommit }: { el: El; onPatch: Patch; onCommit?: () => void }) {
  const hex = CARD_HEX[el.color ?? "blue"] || "#2A6FDB";
  return (
    <div className="link-el">
      <div className="link-thumb" style={{ ["--lk" as string]: hex }}>
        <div className="link-thumb-bar"><i /><i /><i /></div>
        <Icon name="globe" className="ico link-thumb-globe" />
      </div>
      <div className="link-body">
        <Editable className="link-title" value={el.title ?? ""} onChange={(v) => onPatch({ title: v })} onBlur={onCommit} placeholder="Titre du lien" />
        <Editable className="link-desc" value={el.desc ?? ""} onChange={(v) => onPatch({ desc: v })} onBlur={onCommit} placeholder="Description" multiline />
        <div className="link-url">
          <Icon name="link" className="ico-xs" />
          <Editable value={el.url ?? ""} onChange={(v) => onPatch({ url: v })} onBlur={onCommit} placeholder="exemple.com" />
        </div>
      </div>
    </div>
  );
}

// ── File ─────────────────────────────────────────────────────────────────────
const FILE_LABEL: Record<string, string> = { pdf: "PDF", fig: "FIG", img: "IMG", doc: "DOC", zip: "ZIP" };
export function FileEl({ el, onPatch, onCommit }: { el: El; onPatch: Patch; onCommit?: () => void }) {
  const hex = CARD_HEX[el.color ?? "slate"] || "#697586";
  return (
    <div className="file-el">
      <div className="file-badge" style={{ background: hex }}>
        <Icon name="file" className="ico" />
        <span className="file-ext">{FILE_LABEL[el.kind ?? ""] || "FILE"}</span>
      </div>
      <div className="file-meta">
        <Editable className="file-name" value={el.name ?? ""} onChange={(v) => onPatch({ name: v })} onBlur={onCommit} placeholder="fichier" />
        <div className="file-size">{el.size}</div>
      </div>
      {el.url && (
        <a className="file-dl" href={el.url} target="_blank" rel="noreferrer" onPointerDown={(e) => e.stopPropagation()} title="Télécharger">
          <Icon name="download" className="ico-sm" />
        </a>
      )}
    </div>
  );
}

// ── Image ────────────────────────────────────────────────────────────────────
export function ImageEl({ el, onPatch, onCommit }: { el: El; onPatch: Patch; onCommit?: () => void }) {
  return (
    <div className="image-el">
      <Editable className="image-title" value={el.title ?? ""} onChange={(v) => onPatch({ title: v })} onBlur={onCommit} placeholder="Image" />
      {el.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={el.image_url} alt={el.title ?? ""} draggable={false} className="image-single" />
      ) : (
        <div className="image-grid" style={{ gridTemplateColumns: `repeat(${el.cols || 2}, 1fr)` }}>
          {(el.cells ?? ["image 1", "image 2"]).map((c, i) => (
            <div key={i} className="stripe-ph" style={{ height: 92, borderRadius: 8 }}>
              <span className="stripe-cap">{c}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
