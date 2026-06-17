"use client";

import React from "react";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  ListChecks,
  Link2,
} from "lucide-react";

/** Strip obviously dangerous markup before persisting author HTML. */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/ on\w+="[^"]*"/gi, "")
    .replace(/ on\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

type Props = {
  value: string;
  editing: boolean;
  placeholder?: string;
  onChange: (html: string) => void;
  /** Called when editing ends (blur / Escape) with the final HTML. */
  onCommit: (html: string) => void;
  className?: string;
};

/**
 * A lightweight WYSIWYG editor used by note / text cards. Authors type and see
 * the rendered result (bold, headings, lists, checklists) — never the raw
 * markdown symbols. Markdown shortcuts (`# `, `## `, `- `, `[] `) are honoured
 * as you type for muscle-memory, but the stored value is HTML.
 */
export function RichTextEditor({
  value,
  editing,
  placeholder,
  onChange,
  onCommit,
  className,
}: Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const lastValue = React.useRef(value);

  // Keep the DOM in sync with external value changes only (not every keystroke,
  // which would reset the caret).
  React.useEffect(() => {
    if (ref.current && value !== ref.current.innerHTML && value !== lastValue.current) {
      ref.current.innerHTML = value;
      lastValue.current = value;
    }
  }, [value]);

  React.useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      // Place caret at end.
      const sel = window.getSelection();
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(ref.current);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  }, [editing]);

  const exec = (command: string, arg?: string) => {
    document.execCommand(command, false, arg);
    if (ref.current) {
      const html = sanitizeHtml(ref.current.innerHTML);
      lastValue.current = html;
      onChange(html);
    }
  };

  const handleInput = () => {
    if (!ref.current) return;
    const html = sanitizeHtml(ref.current.innerHTML);
    lastValue.current = html;
    onChange(html);
  };

  const applyBlock = (tag: string) => exec("formatBlock", tag);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Markdown-style shortcuts: only at the very start of a line.
    if (e.key === " ") {
      const sel = window.getSelection();
      const node = sel?.anchorNode;
      const text = node?.textContent ?? "";
      const caret = sel?.anchorOffset ?? 0;
      const prefix = text.slice(0, caret);
      const rule: Record<string, () => void> = {
        "#": () => applyBlock("H1"),
        "##": () => applyBlock("H2"),
        "###": () => applyBlock("H3"),
        "-": () => exec("insertUnorderedList"),
        "*": () => exec("insertUnorderedList"),
        "1.": () => exec("insertOrderedList"),
      };
      if (rule[prefix]) {
        e.preventDefault();
        // Remove the typed marker, then apply the block format.
        if (node && sel) {
          const range = sel.getRangeAt(0);
          range.setStart(node, 0);
          range.deleteContents();
        }
        rule[prefix]();
        handleInput();
        return;
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      exec("bold");
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") {
      e.preventDefault();
      exec("italic");
    }
    if (e.key === "Escape") {
      e.preventDefault();
      ref.current?.blur();
    }
  };

  const insertLink = () => {
    const url = window.prompt("URL du lien :");
    if (url) exec("createLink", url);
  };

  return (
    <div className={className} onPointerDown={(e) => editing && e.stopPropagation()}>
      {editing && (
        <div
          className="mb-1.5 flex items-center gap-0.5 rounded-md border bg-background/95 p-0.5 shadow-sm"
          // Keep focus in the editor when clicking toolbar buttons.
          onMouseDown={(e) => e.preventDefault()}
        >
          <ToolBtn onClick={() => exec("bold")} title="Gras">
            <Bold className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => exec("italic")} title="Italique">
            <Italic className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => applyBlock("H1")} title="Titre 1">
            <Heading1 className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => applyBlock("H2")} title="Titre 2">
            <Heading2 className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => exec("insertUnorderedList")} title="Liste">
            <List className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn onClick={() => exec("insertOrderedList")} title="Liste numérotée">
            <ListChecks className="h-3.5 w-3.5" />
          </ToolBtn>
          <ToolBtn onClick={insertLink} title="Lien">
            <Link2 className="h-3.5 w-3.5" />
          </ToolBtn>
        </div>
      )}
      <div
        ref={ref}
        contentEditable={editing}
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={() => onCommit(sanitizeHtml(ref.current?.innerHTML ?? ""))}
        className={`planche-richtext outline-none ${editing ? "cursor-text" : ""}`}
      />
    </div>
  );
}

function ToolBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

export default RichTextEditor;
