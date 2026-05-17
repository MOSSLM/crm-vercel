"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Bold, Italic, Underline as UnderlineIcon, Eraser, Variable as VariableIcon } from "lucide-react";
import { sanitizeRichText } from "@/lib/site-builder/sanitize-html";

/**
 * Lightweight rich-text editor used by the element panel.
 *
 *  - `<div contentEditable>` styled like a textarea.
 *  - Floating toolbar (portaled) appears above any active selection
 *    inside a contentEditable on the page — including a canvas element
 *    the user has made editable for inline WYSIWYG editing.
 *  - Bold / Italic / Underline / color / weight / clear-format apply
 *    to the **selected portion** of the host element. The toolbar
 *    preserves the selection across button clicks by calling
 *    `e.preventDefault()` on mousedown for every interactive element,
 *    and by restoring the saved Range before each `execCommand`.
 *  - Insertion of `{{ variable }}` tokens via the picker under the
 *    editor surface.
 *  - On every change we debounce a sanitized HTML output through
 *    `onChange`. On blur we flush immediately.
 *
 * The editor is **uncontrolled**: `value` is only read on the first
 * render (and re-applied when `value` changes while the editor is
 * blurred), so the caret never jumps.
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

function findContentEditableAncestor(node: Node | null): HTMLElement | null {
  let n: Node | null = node;
  while (n) {
    if (n instanceof HTMLElement && n.isContentEditable) return n;
    n = n.parentNode;
  }
  return null;
}

function getActiveSelection(): { range: Range; host: HTMLElement; rect: SelectionRect } | null {
  if (typeof window === "undefined") return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const host = findContentEditableAncestor(range.commonAncestorContainer);
  if (!host) return null;
  const rects = range.getClientRects();
  const r = rects[0] ?? range.getBoundingClientRect();
  if (!r || (r.width === 0 && r.height === 0)) return null;
  return { range, host, rect: { top: r.top, left: r.left, width: r.width, height: r.height } };
}

export const RichTextEditor = React.forwardRef<HTMLDivElement, RichTextEditorProps>(function RichTextEditor(
  { value, onChange, placeholder, className, style, variables = {}, minHeight = 80, autoFocus },
  forwardedRef,
) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  React.useImperativeHandle(forwardedRef, () => ref.current as HTMLDivElement, []);

  // Track the latest non-collapsed selection inside ANY contentEditable on
  // the page (sidebar editor *or* an inline-editable canvas element). The
  // toolbar floats above this selection and operates on it.
  const savedRangeRef = React.useRef<Range | null>(null);
  const savedHostRef = React.useRef<HTMLElement | null>(null);
  const [selectionView, setSelectionView] = React.useState<{ rect: SelectionRect } | null>(null);

  const [varOpen, setVarOpen] = React.useState(false);
  const [colorPopOpen, setColorPopOpen] = React.useState(false);
  const [weightPopOpen, setWeightPopOpen] = React.useState(false);
  const [colorDraft, setColorDraft] = React.useState("#000000");
  const lastEmittedRef = React.useRef<string>("");

  // Common swatches shown in the inline color popover. These are pulled
  // from the warm-neutral skin tokens so they always match the design.
  const SWATCHES = ["#14120E", "#E2552B", "#C73E16", "#FFFAF2", "#5C5953", "#1F8A5B", "#2A6FDB", "#7A5AE0", "#C8881F", "#B5322F"];
  const WEIGHT_CHIPS = [300, 400, 500, 600, 700, 800] as const;

  // Tell the browser to apply CSS styles via <span style="…"> instead of
  // legacy <font>/<b> tags. Without this, foreColor produces <font
  // color="…"> which our sanitizer strips on emit — the color appears
  // briefly then disappears on the next round-trip.
  React.useEffect(() => {
    try { document.execCommand("styleWithCSS", false, "true"); } catch { /* unsupported in some browsers */ }
  }, []);

  // Seed the editor once. Subsequent external `value` updates only override
  // when the editor isn't focused, to avoid clobbering the caret.
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.innerHTML === value) return;
    el.innerHTML = sanitizeRichText(value);
    lastEmittedRef.current = el.innerHTML;
  }, [value]);

  React.useEffect(() => {
    if (!autoFocus) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, [autoFocus]);

  // Track selection. We save the *latest non-collapsed* range that lives
  // inside a contentEditable so the toolbar can restore it even after a
  // button click moves focus away.
  React.useEffect(() => {
    const onSelectionChange = () => {
      const active = getActiveSelection();
      if (active) {
        savedRangeRef.current = active.range.cloneRange();
        savedHostRef.current = active.host;
        setSelectionView({ rect: active.rect });
      } else {
        setSelectionView(null);
      }
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  // Dismiss color / weight popovers on outside-click. We can't bind to a
  // ref inside a portal cleanly, so we just close on any non-prevented
  // pointerdown — the popover's own mousedown handler calls
  // preventDefault, so its descendants don't trigger this.
  React.useEffect(() => {
    if (!colorPopOpen && !weightPopOpen) return;
    const onDown = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      setColorPopOpen(false);
      setWeightPopOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [colorPopOpen, weightPopOpen]);

  /** Emit the sidebar editor's sanitized HTML — only for the local surface,
   *  not for an external contentEditable (those have their own onInput). */
  const emit = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const html = sanitizeRichText(el.innerHTML);
    if (html === lastEmittedRef.current) return;
    lastEmittedRef.current = html;
    onChange(html);
  }, [onChange]);

  const debouncedEmit = useDebouncedFn(emit, 200);

  /** Re-install the saved Range as the document selection (does NOT move
   *  focus — focus shifts can collapse the caret on some browsers).
   *  Returns the contentEditable host the range belongs to. */
  const restoreSelection = (): HTMLElement | null => {
    const range = savedRangeRef.current;
    const host = savedHostRef.current;
    if (!range || !host) return null;
    try {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    } catch {
      return null;
    }
    return host;
  };

  /** Refresh savedRangeRef after execCommand (the DOM may have changed). */
  const refreshSavedRange = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const exec = (cmd: string, arg?: string) => {
    const host = restoreSelection();
    if (!host) return;
    try { document.execCommand("styleWithCSS", false, "true"); } catch { /* */ }
    document.execCommand(cmd, false, arg);
    refreshSavedRange();
    // If the host is *our* surface, emit debounced. If it's an external
    // contentEditable (canvas), its own input listener handles persistence.
    if (host === ref.current) {
      debouncedEmit();
    } else {
      host.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };

  const applyWeight = (weight: number) => {
    const host = restoreSelection();
    if (!host) return;
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
      savedRangeRef.current = newRange.cloneRange();
    } catch {
      // surroundContents-like failures are silent.
    }
    if (host === ref.current) debouncedEmit();
    else host.dispatchEvent(new Event("input", { bubbles: true }));
  };

  /** Inserting a variable always targets *our* sidebar surface — it's the
   *  picker under the editor, not something the user invokes from a
   *  canvas selection. */
  const insertVariable = (key: string) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Restore caret to the last position inside the editor if we have one.
    if (savedRangeRef.current && savedHostRef.current === el) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(savedRangeRef.current);
    }
    document.execCommand("insertText", false, `{{ ${key} }}`);
    setVarOpen(false);
    refreshSavedRange();
    debouncedEmit();
  };

  /**
   * mousedown handler for EVERY interactive element of the toolbar.
   * Saves the user's current selection at the exact moment of click —
   * before any focus shift wipes it — and calls preventDefault so the
   * browser doesn't transfer focus away from the active contentEditable.
   */
  const stopFocusSteal = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const host = findContentEditableAncestor(range.commonAncestorContainer);
      if (host) {
        savedRangeRef.current = range.cloneRange();
        savedHostRef.current = host;
      }
    }
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
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        className={`textarea rte-surface${className ? ` ${className}` : ""}`}
        style={{ minHeight, whiteSpace: "pre-wrap", outline: "none", ...style }}
      />

      {/* Floating selection toolbar — operates on whichever contentEditable
          has the active selection (this editor *or* a canvas element). */}
      {selectionView && typeof window !== "undefined" && createPortal(
        <div
          className="sb-skin"
          style={{ position: "fixed", top: 0, left: 0, pointerEvents: "none", zIndex: 200 }}
        >
          <div
            className="pop rte-toolbar"
            onMouseDown={stopFocusSteal}
            style={{
              position: "absolute",
              top: Math.max(8, selectionView.rect.top + window.scrollY - 42),
              left: Math.max(8, Math.min(window.innerWidth - 360, selectionView.rect.left + window.scrollX)),
              display: "flex",
              alignItems: "center",
              gap: 2,
              padding: 3,
              pointerEvents: "auto",
            }}
          >
            <button type="button" tabIndex={-1} className="btn ghost xs icon" title="Gras" onMouseDown={stopFocusSteal} onClick={() => exec("bold")}>
              <Bold size={12} />
            </button>
            <button type="button" tabIndex={-1} className="btn ghost xs icon" title="Italique" onMouseDown={stopFocusSteal} onClick={() => exec("italic")}>
              <Italic size={12} />
            </button>
            <button type="button" tabIndex={-1} className="btn ghost xs icon" title="Souligné" onMouseDown={stopFocusSteal} onClick={() => exec("underline")}>
              <UnderlineIcon size={12} />
            </button>
            <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 2px" }} />

            {/* Color — custom popover, no native picker (which steals
                focus and leaves the saved range stale). */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                tabIndex={-1}
                className="btn ghost xs"
                title="Couleur du texte sélectionné"
                onMouseDown={stopFocusSteal}
                onClick={() => { setColorPopOpen((v) => !v); setWeightPopOpen(false); }}
                style={{ height: 22, padding: "0 4px" }}
              >
                <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: colorDraft, border: "1px solid var(--border-2)" }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>A</span>
              </button>
              {colorPopOpen && (
                <div
                  className="pop"
                  onMouseDown={stopFocusSteal}
                  style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, padding: 8, width: 180, zIndex: 220 }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 8 }}>
                    {SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        tabIndex={-1}
                        title={hex}
                        onMouseDown={stopFocusSteal}
                        onClick={() => {
                          setColorDraft(hex);
                          exec("foreColor", hex);
                          setColorPopOpen(false);
                        }}
                        style={{ width: 24, height: 24, borderRadius: 4, background: hex, border: "1.5px solid var(--surface)", boxShadow: "0 0 0 1px var(--border-2)", cursor: "default" }}
                      />
                    ))}
                  </div>
                  <div className="hex-input-row">
                    <span style={{ display: "inline-block", width: 22, height: 22, borderRadius: 4, background: colorDraft, border: "1px solid var(--border-2)" }} />
                    <input
                      type="text"
                      value={colorDraft}
                      onMouseDown={stopFocusSteal}
                      onChange={(e) => setColorDraft(e.target.value)}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(v)) {
                          exec("foreColor", v);
                        }
                      }}
                      className="input mono"
                      style={{ flex: 1, height: 22, fontSize: 10.5 }}
                      placeholder="#000000"
                    />
                  </div>
                </div>
              )}
            </div>

            <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 2px" }} />

            {/* Weight — chips popover, no number input that steals focus. */}
            <div style={{ position: "relative" }}>
              <button
                type="button"
                tabIndex={-1}
                className="btn ghost xs"
                title="Poids (s'applique à la sélection)"
                onMouseDown={stopFocusSteal}
                onClick={() => { setWeightPopOpen((v) => !v); setColorPopOpen(false); }}
                style={{ height: 22, padding: "0 6px", fontFamily: "var(--font-mono)", fontSize: 11 }}
              >
                Aa
              </button>
              {weightPopOpen && (
                <div
                  className="pop"
                  onMouseDown={stopFocusSteal}
                  style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, padding: 6, display: "flex", gap: 4, zIndex: 220 }}
                >
                  {WEIGHT_CHIPS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      tabIndex={-1}
                      onMouseDown={stopFocusSteal}
                      onClick={() => { applyWeight(w); setWeightPopOpen(false); }}
                      className="btn outline xs"
                      style={{ height: 22, padding: "0 8px", fontWeight: w, fontFamily: "var(--font-mono)" }}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 2px" }} />
            <button type="button" tabIndex={-1} className="btn ghost xs icon" title="Effacer la mise en forme" onMouseDown={stopFocusSteal} onClick={() => exec("removeFormat")}>
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
            onMouseDown={stopFocusSteal}
            onClick={() => setVarOpen((v) => !v)}
          >
            <VariableIcon size={10} />Variables<span style={{ marginLeft: 2, opacity: 0.5 }}>{varOpen ? "▴" : "▾"}</span>
          </button>
          {varOpen && (
            <div
              className="pop"
              style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", minWidth: 220, maxHeight: 240, overflow: "auto", padding: 4, zIndex: 50 }}
              onMouseDown={stopFocusSteal}
            >
              {Object.keys(variables).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="btn ghost sm"
                  style={{ width: "100%", justifyContent: "space-between" }}
                  onMouseDown={stopFocusSteal}
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
