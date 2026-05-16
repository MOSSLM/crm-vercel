"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Bold, Italic, Underline as UnderlineIcon, Eraser, Variable as VariableIcon } from "lucide-react";
import { sanitizeRichText } from "@/lib/site-builder/sanitize-html";

/**
 * Lightweight rich-text editor used by the element panel.
 *
 *  - <div contentEditable> styled like a textarea.
 *  - Floating toolbar (portaled) appears above the current selection and
 *    exposes Bold / Italic / Underline / color / weight / clear-format.
 *  - Insertion of `{{ variable }}` tokens via a dropdown.
 *  - On every change we debounce a sanitized HTML output through `onChange`.
 *  - On blur we flush immediately so saves stay snappy.
 *
 * The editor is **uncontrolled**: `value` is only read on the first render
 * (and when `value` changes from outside while the editor is not focused),
 * so the caret never jumps.
 */

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Extra className appended after the built-in `.textarea` look. */
  className?: string;
  /** Style overrides for the editor surface. */
  style?: React.CSSProperties;
  /** Variables available for the `{{ var }}` picker. */
  variables?: Record<string, string>;
  /** Minimum height in px (defaults to 80). */
  minHeight?: number;
  autoFocus?: boolean;
}

interface SelectionRect { top: number; left: number; width: number; height: number }

function getSelectionInside(host: HTMLElement | null): { range: Range; rect: SelectionRect } | null {
  if (!host) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!host.contains(range.commonAncestorContainer)) return null;
  const rects = range.getClientRects();
  const r = rects[0] ?? range.getBoundingClientRect();
  if (!r || (r.width === 0 && r.height === 0)) return null;
  return { range, rect: { top: r.top, left: r.left, width: r.width, height: r.height } };
}

export const RichTextEditor = React.forwardRef<HTMLDivElement, RichTextEditorProps>(function RichTextEditor(
  { value, onChange, placeholder, className, style, variables = {}, minHeight = 80, autoFocus },
  forwardedRef,
) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement, []);

  const [selection, setSelection] = React.useState<{ range: Range; rect: SelectionRect } | null>(null);
  const [varOpen, setVarOpen] = React.useState(false);
  const [colorDraft, setColorDraft] = React.useState("#000000");
  const lastEmitted = React.useRef<string>("");

  // Seed the editor once. Subsequent external `value` updates only override
  // when the editor isn't focused, to avoid clobbering the caret.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.innerHTML === value) return;
    el.innerHTML = sanitizeRichText(value);
    lastEmitted.current = el.innerHTML;
  }, [value]);

  // Autofocus.
  React.useEffect(() => {
    if (!autoFocus) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Move caret to end.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [autoFocus]);

  // Track the user's selection so we can position the floating toolbar.
  React.useEffect(() => {
    const onSelectionChange = () => {
      const next = getSelectionInside(ref.current);
      setSelection(next);
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  const emit = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const html = sanitizeRichText(el.innerHTML);
    if (html === lastEmitted.current) return;
    lastEmitted.current = html;
    onChange(html);
  }, [onChange]);

  const debouncedEmit = useDebouncedFn(emit, 200);

  const exec = (cmd: string, arg?: string) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // execCommand is deprecated but still the simplest cross-browser path
    // for bold/italic/underline/forecolor on a contentEditable surface.
    document.execCommand(cmd, false, arg);
    debouncedEmit();
  };

  const insertVariable = (key: string) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    document.execCommand("insertText", false, `{{ ${key} }}`);
    setVarOpen(false);
    debouncedEmit();
  };

  const applyWeight = (weight: number) => {
    // execCommand has no weight; wrap selection in a <span style="font-weight:N">.
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const span = document.createElement("span");
    span.style.fontWeight = String(weight);
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.addRange(newRange);
    } catch {
      // surroundContents-like failures are silent
    }
    debouncedEmit();
  };

  return (
    <>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder ?? ""}
        onInput={debouncedEmit}
        onBlur={emit}
        onPaste={(e) => {
          // Force plain text paste so we don't ingest arbitrary HTML.
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        className={`textarea rte-surface${className ? ` ${className}` : ""}`}
        style={{ minHeight, whiteSpace: "pre-wrap", outline: "none", ...style }}
      />

      {/* Floating selection toolbar */}
      {selection && typeof window !== "undefined" && createPortal(
        <div
          className="sb-skin"
          style={{ position: "fixed", top: 0, left: 0, pointerEvents: "none", zIndex: 200 }}
        >
          <div
            className="pop"
            style={{
              position: "absolute",
              top: Math.max(8, selection.rect.top + window.scrollY - 38),
              left: Math.max(8, selection.rect.left + window.scrollX),
              display: "flex",
              alignItems: "center",
              gap: 2,
              padding: 3,
              pointerEvents: "auto",
            }}
            onMouseDown={(e) => {
              // Prevent the editor from losing the selection when clicking buttons.
              e.preventDefault();
            }}
          >
            <button className="btn ghost xs icon" title="Gras" onClick={() => exec("bold")}><Bold size={12} /></button>
            <button className="btn ghost xs icon" title="Italique" onClick={() => exec("italic")}><Italic size={12} /></button>
            <button className="btn ghost xs icon" title="Souligné" onClick={() => exec("underline")}><UnderlineIcon size={12} /></button>
            <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 2px" }} />
            <label style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "0 4px", fontSize: 10, color: "var(--text-3)", cursor: "default" }} title="Couleur du texte sélectionné">
              <input
                type="color"
                value={colorDraft}
                onChange={(e) => {
                  setColorDraft(e.target.value);
                  exec("foreColor", e.target.value);
                }}
                style={{ width: 16, height: 16, border: 0, padding: 0, background: "transparent", cursor: "default" }}
              />
              <span style={{ fontFamily: "var(--font-mono)" }}>{colorDraft}</span>
            </label>
            <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 2px" }} />
            <input
              type="number"
              min={100}
              max={900}
              step={50}
              defaultValue={400}
              title="Poids appliqué à la sélection (100–900, step 50)"
              className="input mono"
              style={{ width: 64, height: 22, padding: "0 6px", fontSize: 11 }}
              onChange={(e) => {
                const w = Number(e.target.value);
                if (!isNaN(w) && w >= 100 && w <= 900) applyWeight(w);
              }}
            />
            <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 2px" }} />
            <button className="btn ghost xs icon" title="Effacer la mise en forme" onClick={() => exec("removeFormat")}>
              <Eraser size={12} />
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* Variables picker — anchored under the editor, no selection needed. */}
      {Object.keys(variables).length > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4, position: "relative" }}>
          <button
            type="button"
            className="btn ghost xs"
            onClick={() => setVarOpen((v) => !v)}
          >
            <VariableIcon size={10} />Variables<span style={{ marginLeft: 2, opacity: 0.5 }}>{varOpen ? "▴" : "▾"}</span>
          </button>
          {varOpen && (
            <div
              className="pop"
              style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", minWidth: 220, maxHeight: 240, overflow: "auto", padding: 4, zIndex: 50 }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {Object.keys(variables).map((k) => (
                <button
                  key={k}
                  className="btn ghost sm"
                  style={{ width: "100%", justifyContent: "space-between" }}
                  onClick={() => insertVariable(k)}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{`{{ ${k} }}`}</span>
                  <span style={{ fontSize: 10, color: "var(--text-4)", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(variables[k]).slice(0, 24)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
});

function useDebouncedFn(fn: () => void, delay: number): () => void {
  const fnRef = React.useRef(fn);
  fnRef.current = fn;
  const tRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  return React.useCallback(() => {
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => { fnRef.current(); }, delay);
  }, [delay]);
}
