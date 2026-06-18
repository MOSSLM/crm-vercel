"use client";

import React from "react";

/** Inline markdown → React nodes: **bold** *italic* `code` [text](url) */
export function renderInline(text: string): React.ReactNode[] {
  if (!text) return [];
  const nodes: React.ReactNode[] = [];
  let key = 0;
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] != null) nodes.push(<strong key={key++}>{m[2]}</strong>);
    else if (m[4] != null) nodes.push(<em key={key++}>{m[4]}</em>);
    else if (m[6] != null) nodes.push(<code key={key++}>{m[6]}</code>);
    else if (m[8] != null)
      nodes.push(
        <a key={key++} className="md-link" href={m[9]} target="_blank" rel="noreferrer">
          {m[8]}
        </a>,
      );
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Block-level markdown renderer (#, ##, >, -, 1., paragraphs). */
export function Markdown({ source }: { source: string }) {
  const lines = (source || "").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: React.ReactNode[] | null = null;
  let listType: "ul" | "ol" | null = null;
  let key = 0;
  const flush = () => {
    if (list) {
      const Tag = listType === "ol" ? "ol" : "ul";
      blocks.push(
        <Tag key={key++} className="md-list">
          {list}
        </Tag>,
      );
      list = null;
      listType = null;
    }
  };
  lines.forEach((raw, idx) => {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      flush();
      return;
    }
    if (/^#\s+/.test(line)) {
      flush();
      blocks.push(
        <div key={key++} className="md-h1">
          {renderInline(line.replace(/^#\s+/, ""))}
        </div>,
      );
      return;
    }
    if (/^##\s+/.test(line)) {
      flush();
      blocks.push(
        <div key={key++} className="md-h2">
          {renderInline(line.replace(/^##\s+/, ""))}
        </div>,
      );
      return;
    }
    if (/^>\s?/.test(line)) {
      flush();
      blocks.push(
        <blockquote key={key++} className="md-quote">
          {renderInline(line.replace(/^>\s?/, ""))}
        </blockquote>,
      );
      return;
    }
    const ul = line.match(/^[-*]\s+(.*)/);
    if (ul) {
      if (listType !== "ul") flush();
      listType = "ul";
      (list = list || []).push(<li key={"li" + idx}>{renderInline(ul[1])}</li>);
      return;
    }
    const ol = line.match(/^\d+\.\s+(.*)/);
    if (ol) {
      if (listType !== "ol") flush();
      listType = "ol";
      (list = list || []).push(<li key={"li" + idx}>{renderInline(ol[1])}</li>);
      return;
    }
    flush();
    blocks.push(
      <p key={key++} className="md-p">
        {renderInline(line)}
      </p>,
    );
  });
  flush();
  return <div className="md">{blocks}</div>;
}

/** Inline contentEditable text. Mirrors the design's `Editable` atom. */
export function Editable({
  value,
  onChange,
  onFocus,
  onBlur,
  multiline,
  placeholder,
  className = "",
  style,
  tag = "div",
}: {
  value: string;
  onChange?: (v: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  tag?: "div" | "span";
}) {
  const ref = React.useRef<HTMLElement>(null);
  const ext = React.useRef(value);
  React.useEffect(() => {
    if (ext.current !== value && ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value || "";
    }
    ext.current = value;
  }, [value]);
  const Tag = tag as "div";
  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`editable ${className}`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-ph={placeholder}
      style={style}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onFocus={onFocus}
      onBlur={onBlur}
      onInput={(e) => {
        const v = (e.currentTarget as HTMLElement).innerText;
        ext.current = v;
        onChange?.(v);
      }}
      onKeyDown={(e) => {
        if (!multiline && e.key === "Enter") {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
        if (e.key === "Escape") (e.currentTarget as HTMLElement).blur();
      }}
    >
      {value || ""}
    </Tag>
  );
}
