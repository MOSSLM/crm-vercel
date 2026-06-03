"use client";

import React from "react";
import { Link as LinkIcon, ExternalLink, RefreshCw, Image as ImageIcon, MousePointer, FormInput, Type as TypeIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify, Trash2, RotateCcw } from "lucide-react";
import type { SiteSectionInstance } from "@/types";
import { useRelumeBuilder } from "../RelumeBuilderProvider";
import { resolveContentBinding, type BindingResult, type BindingLocation } from "@/lib/site-builder/resolve-content-binding";
import { VariableTextarea } from "../VariableTextarea";
import { ImagePickerField } from "@/components/site-builder/editors/ImagePickerField";
import type { ElementKind, ElementAttrs } from "../DesignWorkspace";
import { RichTextEditor } from "../rich-text-editor";
import { looksLikeRichText, sanitizeRichText } from "@/lib/site-builder/sanitize-html";

export interface SelectedElementShape {
  instanceId: string;
  kind: ElementKind;
  tag: string;
  text: string;
  path: number[];
  attrs: ElementAttrs;
  fieldId: string | null;
}

interface ElementPanelProps {
  element: SelectedElementShape;
  instance: SiteSectionInstance;
}

const KIND_LABELS: Record<ElementKind, string> = {
  text: "Texte",
  image: "Image",
  button: "Bouton",
  link: "Lien",
  input: "Champ de saisie",
  form: "Formulaire",
};

const KIND_ICONS: Record<ElementKind, React.ElementType> = {
  text: TypeIcon,
  image: ImageIcon,
  button: MousePointer,
  link: LinkIcon,
  input: FormInput,
  form: FormInput,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readSettings(instance: SiteSectionInstance, location: BindingLocation): Record<string, unknown> {
  if (location.scope === "instance") return instance.content;
  const block = instance.blocks.find((b) => b.id === location.blockId);
  return block?.settings ?? {};
}

function useDispatcher(instance: SiteSectionInstance) {
  const { dispatch } = useRelumeBuilder();
  return React.useCallback(
    (location: BindingLocation, patch: Record<string, unknown>) => {
      if (typeof console !== "undefined") {
        const keys = Object.keys(patch);
        const preview = keys
          .map((k) => {
            const v = patch[k];
            return `${k}=${typeof v === "string" ? v.slice(0, 40) : JSON.stringify(v).slice(0, 40)}`;
          })
          .join(", ");
        console.debug("[SB:dispatch] content", {
          scope: location.scope,
          blockId: location.scope === "block" ? location.blockId : undefined,
          instanceId: instance.id,
          patch: preview,
        });
      }
      if (location.scope === "block") {
        dispatch({
          type: "UPDATE_BLOCK",
          payload: { instanceId: instance.id, blockId: location.blockId, settings: patch },
        });
      } else {
        dispatch({
          type: "UPDATE_INSTANCE_CONTENT",
          payload: { id: instance.id, content: patch },
        });
      }
    },
    [dispatch, instance.id],
  );
}

function setOverride(
  instance: SiteSectionInstance,
  dispatch: (loc: BindingLocation, patch: Record<string, unknown>) => void,
  pathStr: string,
  entry: { kind: string; value: string; meta?: Record<string, unknown> } | null,
) {
  const current = (instance.content.__overrides as Record<string, unknown> | undefined) ?? {};
  const next = { ...current };
  // Compose key so label/text and href can coexist on the same path.
  // The applicator splits on ':' to recover kind. For attr overrides we
  // also append the attribute name so multiple attrs per element survive.
  const compositeKey = entry
    ? `${pathStr}:${entry.kind}${entry.kind === "attr" && entry.meta?.attrName ? `:${entry.meta.attrName}` : ""}`
    : pathStr;
  if (entry == null) {
    // Delete every entry that starts with the path.
    for (const k of Object.keys(next)) {
      if (k === pathStr || k.startsWith(`${pathStr}:`)) delete next[k];
    }
  } else {
    next[compositeKey] = entry;
  }
  if (typeof console !== "undefined") {
    console.debug("[SB:dispatch] override", {
      key: compositeKey,
      value: entry ? String(entry.value).slice(0, 60) : "(cleared)",
      totalOverrides: Object.keys(next).length,
    });
  }
  dispatch({ scope: "instance" }, { __overrides: next });
}

function readOverride(
  instance: SiteSectionInstance,
  pathStr: string,
  kind: string,
  attrName?: string,
): string | undefined {
  const all = (instance.content.__overrides as Record<string, { value?: string }> | undefined) ?? {};
  const key = `${pathStr}:${kind}${kind === "attr" && attrName ? `:${attrName}` : ""}`;
  const entry = all[key] ?? all[pathStr]; // back-compat for old single-entry shape
  return entry && typeof entry.value === "string" ? entry.value : undefined;
}

function compositeRead(settings: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = settings[key];
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

// ─── Hide / restore (shared) ──────────────────────────────────────────────────

/** True when a `display: none` style override exists on the given path. */
function isElementHidden(instance: SiteSectionInstance, pathStr: string): boolean {
  const all = (instance.content.__overrides as Record<string, { kind?: string; meta?: { style?: Record<string, string> } }> | undefined) ?? {};
  const entry = all[`${pathStr}:style`];
  return entry?.meta?.style?.display === "none";
}

/** Footer with a destructive "Hide" button (and "Restore" when already hidden).
 *  Hiding writes `display: none` into the path's style override so the change
 *  survives reload, snapshot and SSR (applyOverridesToHTML applies it). */
function DeleteRestoreFooter({
  instance,
  pathStr,
  label,
}: {
  instance: SiteSectionInstance;
  pathStr: string;
  label: string;
}) {
  const dispatch = useDispatcher(instance);
  const hidden = isElementHidden(instance, pathStr);
  return (
    <div style={{ marginTop: 8, paddingTop: 10, borderTop: "1px dashed var(--border-2, #e5e2da)" }}>
      {hidden ? (
        <button
          type="button"
          className="btn outline xs"
          style={{ width: "100%", justifyContent: "center", gap: 6 }}
          onClick={() => writeStyleOverride(instance, dispatch, pathStr, { display: undefined })}
          title="Réafficher cet élément"
        >
          <RotateCcw size={11} />Restaurer {label.toLowerCase()}
        </button>
      ) : (
        <button
          type="button"
          className="btn outline xs"
          style={{
            width: "100%", justifyContent: "center", gap: 6,
            color: "var(--danger, #b91c1c)", borderColor: "var(--danger, #fecaca)",
          }}
          onClick={() => writeStyleOverride(instance, dispatch, pathStr, { display: "none" })}
          title="Cacher cet élément (réversible)"
        >
          <Trash2 size={11} />Supprimer {label.toLowerCase()}
        </button>
      )}
      {hidden && (
        <p style={{ fontSize: 10, color: "var(--text-4)", marginTop: 6, lineHeight: 1.4 }}>
          Élément masqué via override. Il est invisible en preview et sur le site publié.
        </p>
      )}
    </div>
  );
}

// ─── Panel header (shared) ────────────────────────────────────────────────────

function PanelHeader({ kind, binding }: { kind: ElementKind; binding: BindingResult }) {
  const Icon = KIND_ICONS[kind];
  let target = "";
  if (binding.strategy === "field-id") target = `content.${binding.key} (data-field-id)`;
  else if (binding.strategy === "direct" || binding.strategy === "composite") target = `content.${binding.key}`;
  else if (binding.strategy === "pair") target = `${binding.labelKey} + ${binding.hrefKey}`;
  else target = `Override DOM ${binding.pathStr}`;

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
      <div className="flex items-center gap-2 min-w-0">
        <Icon size={14} className="text-gray-500 shrink-0" />
        <span className="text-xs font-semibold text-gray-700">{KIND_LABELS[kind]}</span>
      </div>
      <span className="text-[9px] font-mono text-gray-400 truncate max-w-[160px]" title={target}>
        {target}
      </span>
    </div>
  );
}

// ─── Text editor ──────────────────────────────────────────────────────────────

const FONT_FAMILY_OPTIONS = [
  "(inherit)",
  "Instrument Serif", "Fraunces", "Playfair Display", "Bodoni Moda", "DM Serif Display",
  "Cormorant Garamond", "Lora", "EB Garamond", "Crimson Pro", "PT Serif",
  "Merriweather", "Source Serif 4",
  "Geist", "Inter", "Instrument Sans", "Manrope", "Outfit", "Unbounded",
  "DM Sans", "Plus Jakarta Sans", "Sora", "Space Grotesk", "Work Sans",
  "Anton", "Archivo Black", "Bebas Neue", "Oswald",
];

const ALIGN_OPTIONS: Array<{ id: "left" | "center" | "right" | "justify"; Icon: React.ElementType; label: string }> = [
  { id: "left", Icon: AlignLeft, label: "Gauche" },
  { id: "center", Icon: AlignCenter, label: "Centre" },
  { id: "right", Icon: AlignRight, label: "Droite" },
  { id: "justify", Icon: AlignJustify, label: "Justifié" },
];

const STYLE_GUIDE_COLOR_KEYS = ["primary", "secondary", "accent", "background", "text", "textMuted"] as const;

/** Read a style override map for a given DOM path. Stored as `<pathStr>:style`
 *  → entry { kind: "style", meta: { style: { …camelCase keys… } } }. */
function readStyleOverride(instance: SiteSectionInstance, pathStr: string): Record<string, string> {
  const all = (instance.content.__overrides as Record<string, { kind?: string; meta?: { style?: Record<string, string> } }> | undefined) ?? {};
  const entry = all[`${pathStr}:style`];
  return entry?.meta?.style ?? {};
}

/** Merge a patch into the style override map for a given path. */
function writeStyleOverride(
  instance: SiteSectionInstance,
  dispatch: (loc: BindingLocation, patch: Record<string, unknown>) => void,
  pathStr: string,
  patch: Record<string, string | undefined>,
): void {
  const current = readStyleOverride(instance, pathStr);
  const merged: Record<string, string> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (!v) delete merged[k];
    else merged[k] = v;
  }
  const all = { ...((instance.content.__overrides as Record<string, unknown> | undefined) ?? {}) };
  const key = `${pathStr}:style`;
  if (Object.keys(merged).length === 0) {
    delete all[key];
  } else {
    all[key] = { kind: "style", value: "", meta: { style: merged } };
  }
  dispatch({ scope: "instance" }, { __overrides: all });
}

// ─── Shared appearance editor (box + flex overrides) ──────────────────────────

const SHADOW_PRESETS: Array<{ id: string; label: string; value: string | undefined }> = [
  { id: "none", label: "Aucune", value: undefined },
  { id: "sm", label: "S", value: "0 1px 2px rgba(0,0,0,0.08)" },
  { id: "md", label: "M", value: "0 4px 12px rgba(0,0,0,0.12)" },
  { id: "lg", label: "L", value: "0 12px 32px rgba(0,0,0,0.18)" },
];

const BORDER_STYLE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "", label: "Aucune" },
  { id: "solid", label: "Pleine" },
  { id: "dashed", label: "Tirets" },
  { id: "dotted", label: "Points" },
];

const RADIUS_PRESETS = [0, 8, 16, 24];

/** Style-guide colour swatches + hex input, shared by border / background. */
function ColorSwatchRow({
  value, onPick, onClear, colors,
}: {
  value: string;
  onPick: (hex: string) => void;
  onClear: () => void;
  colors: Record<string, string>;
}) {
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {STYLE_GUIDE_COLOR_KEYS.map((k) => {
          const hex = colors[k] ?? "#000000";
          const isOn = value.toLowerCase() === hex.toLowerCase();
          return (
            <button
              key={k}
              title={`${k} · ${hex}`}
              onClick={() => onPick(hex)}
              style={{
                width: 24, height: 24, borderRadius: 6, background: hex,
                border: "1.5px solid var(--surface)",
                boxShadow: isOn ? "0 0 0 2px var(--text)" : "0 0 0 1px var(--border-2)",
                cursor: "default",
              }}
            />
          );
        })}
        {value && (
          <button className="btn ghost xs" onClick={onClear} title="Retirer" style={{ height: 22 }}>Auto</button>
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => (e.target.value ? onPick(e.target.value) : onClear())}
        placeholder="#RRGGBB"
        className="input mono"
        style={{ width: "100%", height: 24, padding: "0 6px", fontSize: 11 }}
      />
    </div>
  );
}

/** Generic per-element appearance editor: border-radius, border, shadow,
 *  background, spacing and flex/grid layout. Every value is written as a
 *  `<path>:style` override, so it applies in preview AND on the deployed site
 *  (via applyOverridesToHTML) WITHOUT touching the global style guide.
 *  Reused for section-level styling with `pathStr=""` (the section root). */
export function AppearancePanel({
  instance, pathStr, showFlex = true,
}: {
  instance: SiteSectionInstance;
  pathStr: string;
  showFlex?: boolean;
}) {
  const { state } = useRelumeBuilder();
  const dispatch = useDispatcher(instance);
  const s = readStyleOverride(instance, pathStr);
  const patch = (p: Record<string, string | undefined>) => writeStyleOverride(instance, dispatch, pathStr, p);

  const radiusPx = s.borderRadius ? parseInt(s.borderRadius) : null;
  const borderStyleVal = s.borderStyle ?? "";
  const borderWidthPx = s.borderWidth ? parseInt(s.borderWidth) : 1;
  const shadowVal = s.boxShadow ?? "";
  const shadowPreset = SHADOW_PRESETS.find((p) => p.value === shadowVal);
  const gapPx = s.gap ? parseInt(s.gap) : null;

  const setBorderStyle = (style: string) => {
    if (!style) { patch({ borderStyle: undefined, borderWidth: undefined, borderColor: undefined }); return; }
    patch({
      borderStyle: style,
      borderWidth: s.borderWidth ?? "1px",
      borderColor: s.borderColor ?? state.styleGuide.colors.text,
    });
  };

  return (
    <div>
      <div className="field-label"><span>Apparence</span></div>

      {/* ARRONDI */}
      <div className="range-row">
        <label>Arrondi</label>
        <input
          type="range" min={0} max={64} step={1}
          value={radiusPx ?? 0}
          onChange={(e) => patch({ borderRadius: `${e.target.value}px` })}
        />
        <input
          type="number" min={0} max={200} value={radiusPx ?? ""} placeholder="px"
          onChange={(e) => { const n = parseInt(e.target.value); patch({ borderRadius: isNaN(n) ? undefined : `${n}px` }); }}
          className="input mono" style={{ width: 56, height: 22, padding: "0 4px", fontSize: 10.5 }}
        />
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
        {RADIUS_PRESETS.map((r) => (
          <button key={r} className="btn outline xs" style={{ height: 22, padding: "0 8px" }} onClick={() => patch({ borderRadius: `${r}px` })}>{r}</button>
        ))}
        <button className="btn outline xs" style={{ height: 22, padding: "0 8px" }} onClick={() => patch({ borderRadius: "9999px" })} title="Totalement arrondi">Plein</button>
        {radiusPx != null && (
          <button className="btn ghost xs" style={{ height: 22 }} onClick={() => patch({ borderRadius: undefined })}>Auto</button>
        )}
      </div>

      {/* BORDURE */}
      <div className="field" style={{ marginTop: 10 }}>
        <div className="field-label"><span>Bordure</span></div>
        <select className="select" value={borderStyleVal} onChange={(e) => setBorderStyle(e.target.value)}>
          {BORDER_STYLE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </div>
      {borderStyleVal && (
        <>
          <div className="range-row">
            <label>Épaisseur</label>
            <input
              type="range" min={1} max={12} step={1} value={borderWidthPx}
              onChange={(e) => patch({ borderWidth: `${e.target.value}px` })}
            />
            <input
              type="number" min={1} max={40} value={borderWidthPx} placeholder="px"
              onChange={(e) => { const n = parseInt(e.target.value); patch({ borderWidth: isNaN(n) ? undefined : `${n}px` }); }}
              className="input mono" style={{ width: 56, height: 22, padding: "0 4px", fontSize: 10.5 }}
            />
          </div>
          <ColorSwatchRow
            value={s.borderColor ?? ""}
            onPick={(hex) => patch({ borderColor: hex })}
            onClear={() => patch({ borderColor: undefined })}
            colors={state.styleGuide.colors}
          />
        </>
      )}

      {/* OMBRE */}
      <div className="field" style={{ marginTop: 10 }}>
        <div className="field-label"><span>Ombre</span></div>
        <div className="seg full">
          {SHADOW_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={(shadowPreset?.id ?? (shadowVal ? "custom" : "none")) === p.id ? "true" : "false"}
              onClick={() => patch({ boxShadow: p.value })}
            >{p.label}</button>
          ))}
        </div>
      </div>

      {/* FOND */}
      <div className="field" style={{ marginTop: 10 }}>
        <div className="field-label"><span>Fond</span></div>
        <ColorSwatchRow
          value={s.backgroundColor ?? ""}
          onPick={(hex) => patch({ backgroundColor: hex })}
          onClear={() => patch({ backgroundColor: undefined })}
          colors={state.styleGuide.colors}
        />
      </div>

      {/* ESPACEMENT */}
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 9, color: "var(--text-4)" }}>Padding</label>
          <input
            type="text" value={s.padding ?? ""} placeholder="ex: 16px"
            onChange={(e) => patch({ padding: e.target.value || undefined })}
            className="input mono" style={{ width: "100%", height: 24, padding: "0 6px", fontSize: 11 }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 9, color: "var(--text-4)" }}>Marge</label>
          <input
            type="text" value={s.margin ?? ""} placeholder="ex: 0 0 16px"
            onChange={(e) => patch({ margin: e.target.value || undefined })}
            className="input mono" style={{ width: "100%", height: 24, padding: "0 6px", fontSize: 11 }}
          />
        </div>
      </div>

      {/* FLEX / DISPOSITION */}
      {showFlex && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ fontSize: 10.5, color: "var(--text-3)", cursor: "default", userSelect: "none" }}>
            Disposition (flex / grille)
          </summary>
          <div style={{ marginTop: 6 }}>
            <p style={{ fontSize: 10, color: "var(--text-4)", marginBottom: 6, lineHeight: 1.4 }}>
              N'a d'effet que si l'élément est un conteneur flex / grille.
            </p>
            <div className="range-row">
              <label>Gap</label>
              <input
                type="range" min={0} max={64} step={1} value={gapPx ?? 0}
                onChange={(e) => patch({ gap: `${e.target.value}px` })}
              />
              <input
                type="number" min={0} max={200} value={gapPx ?? ""} placeholder="px"
                onChange={(e) => { const n = parseInt(e.target.value); patch({ gap: isNaN(n) ? undefined : `${n}px` }); }}
                className="input mono" style={{ width: 56, height: 22, padding: "0 4px", fontSize: 10.5 }}
              />
            </div>
            <div className="field" style={{ marginTop: 6 }}>
              <div className="field-label"><span>Justifier</span></div>
              <select className="select" value={s.justifyContent ?? ""} onChange={(e) => patch({ justifyContent: e.target.value || undefined })}>
                <option value="">(auto)</option>
                <option value="flex-start">Début</option>
                <option value="center">Centre</option>
                <option value="flex-end">Fin</option>
                <option value="space-between">Espacé</option>
                <option value="space-around">Autour</option>
              </select>
            </div>
            <div className="field" style={{ marginTop: 6 }}>
              <div className="field-label"><span>Aligner</span></div>
              <select className="select" value={s.alignItems ?? ""} onChange={(e) => patch({ alignItems: e.target.value || undefined })}>
                <option value="">(auto)</option>
                <option value="stretch">Étirer</option>
                <option value="flex-start">Début</option>
                <option value="center">Centre</option>
                <option value="flex-end">Fin</option>
              </select>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-2)", marginTop: 6 }}>
              <input
                type="checkbox" checked={(s.flexWrap ?? "") === "wrap"}
                onChange={(e) => patch({ flexWrap: e.target.checked ? "wrap" : undefined })}
              />
              Retour à la ligne (wrap)
            </label>
          </div>
        </details>
      )}
    </div>
  );
}

function TextPanel({ element, instance, binding }: { element: SelectedElementShape; instance: SiteSectionInstance; binding: BindingResult }) {
  const { state } = useRelumeBuilder();
  const dispatch = useDispatcher(instance);
  const pathStr = binding.strategy === "override" ? binding.pathStr : element.path.join(".");

  let currentValue = element.text;
  if (binding.strategy === "direct" || binding.strategy === "field-id") {
    const settings = readSettings(instance, binding.location);
    const v = settings[binding.key];
    if (typeof v === "string") currentValue = v;
  } else if (binding.strategy === "composite") {
    const settings = readSettings(instance, binding.location);
    const label = compositeRead(settings, binding.key).label;
    if (typeof label === "string") currentValue = label;
  } else if (binding.strategy === "override") {
    // Prefer the rich_text override, fall back to plain text.
    const ovRich = readOverride(instance, binding.pathStr, "rich_text");
    const ov = ovRich ?? readOverride(instance, binding.pathStr, "text");
    if (ov !== undefined) currentValue = ov;
  }

  /** Persist whatever the editor emits. If it contains markup we store it
   *  as `rich_text` (override) — even on direct/composite bindings we
   *  reuse the same key but the renderer detects HTML and switches mode. */
  const handleRichChange = React.useCallback((val: string) => {
    const isRich = looksLikeRichText(val);
    if (binding.strategy === "direct" || binding.strategy === "field-id") {
      dispatch(binding.location, { [binding.key]: val });
    } else if (binding.strategy === "composite") {
      const settings = readSettings(instance, binding.location);
      const existing = compositeRead(settings, binding.key);
      dispatch(binding.location, { [binding.key]: { ...existing, label: val } });
    } else if (binding.strategy === "pair") {
      dispatch(binding.location, { [binding.labelKey]: val });
    } else {
      setOverride(instance, dispatch, binding.pathStr, { kind: isRich ? "rich_text" : "text", value: val });
    }
  }, [binding, dispatch, instance]);

  // Inline canvas editing: locate the DOM node corresponding to this
  // element in the live preview and make it contentEditable. The user
  // can then type / select / format directly in the canvas — the same
  // floating toolbar (from RichTextEditor) operates on whichever
  // contentEditable currently owns the selection.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const container = document.querySelector<HTMLElement>(`[data-section-id="${instance.id}"], [data-lsi="${instance.id}"]`);
    if (!container) return;
    const root = container.firstElementChild as HTMLElement | null;
    if (!root) return;
    let node: HTMLElement | null = root;
    for (const idx of element.path) {
      if (!node || !node.children[idx]) { node = null; break; }
      node = node.children[idx] as HTMLElement;
    }
    if (!node) return;

    const previousEditable = node.getAttribute("contenteditable");
    node.setAttribute("contenteditable", "true");
    node.setAttribute("data-canvas-edit", "1");

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onInput = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const html = node!.innerHTML;
        handleRichChange(html);
      }, 200);
    };
    // Swallow click/mousedown so the section's own onClick (which would
    // reset selectedElement to null) doesn't fire while editing.
    const onClick = (e: Event) => { e.stopPropagation(); };
    node.addEventListener("input", onInput);
    node.addEventListener("click", onClick);
    node.addEventListener("mousedown", onClick);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      node.removeEventListener("input", onInput);
      node.removeEventListener("click", onClick);
      node.removeEventListener("mousedown", onClick);
      if (previousEditable == null) node.removeAttribute("contenteditable");
      else node.setAttribute("contenteditable", previousEditable);
      node.removeAttribute("data-canvas-edit");
    };
  }, [instance.id, element.path, handleRichChange]);

  const elementStyle = readStyleOverride(instance, pathStr);
  const patchStyle = (patch: Record<string, string | undefined>) => writeStyleOverride(instance, dispatch, pathStr, patch);

  const fontSizePx = elementStyle.fontSize ? parseInt(elementStyle.fontSize) : null;
  const lineHeight = elementStyle.lineHeight ? parseFloat(elementStyle.lineHeight) : null;
  const fontWeight = elementStyle.fontWeight ? parseInt(elementStyle.fontWeight) : null;
  const align = (elementStyle.textAlign as "left" | "center" | "right" | "justify" | undefined) ?? undefined;
  const colorOverride = elementStyle.color ?? "";
  const isItalic = elementStyle.fontStyle === "italic";
  const isUnderline = (elementStyle.textDecoration ?? "").includes("underline");

  return (
    <div className="p-3" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <PanelHeader kind="text" binding={binding} />

      {/* TEXTE */}
      <div>
        <div className="field-label"><span>Contenu</span></div>
        <RichTextEditor
          value={looksLikeRichText(currentValue) ? sanitizeRichText(currentValue) : currentValue}
          onChange={handleRichChange}
          placeholder="Texte…"
          variables={state.variableContext}
          minHeight={92}
        />
        {binding.strategy === "override" && (
          <p className="alert-soft warn" style={{ marginTop: 6, fontSize: 10.5 }}>
            Ce texte est codé en dur dans la section. La modification est appliquée via un override DOM.
          </p>
        )}
      </div>

      {/* TYPOGRAPHIE */}
      <div>
        <div className="field-label"><span>Typographie</span></div>

        <div className="field">
          <div className="field-label"><span>Famille</span></div>
          <select
            className="select"
            value={elementStyle.fontFamily ?? "(inherit)"}
            onChange={(e) => patchStyle({ fontFamily: e.target.value === "(inherit)" ? undefined : e.target.value })}
          >
            {FONT_FAMILY_OPTIONS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div className="range-row">
          <label>Taille</label>
          <input
            type="range" min={10} max={120} step={1}
            value={fontSizePx ?? 16}
            onChange={(e) => patchStyle({ fontSize: `${e.target.value}px` })}
          />
          <input
            type="number" min={10} max={200}
            value={fontSizePx ?? ""}
            placeholder="px"
            onChange={(e) => {
              const n = parseInt(e.target.value);
              patchStyle({ fontSize: isNaN(n) ? undefined : `${n}px` });
            }}
            className="input mono"
            style={{ width: 56, height: 22, padding: "0 4px", fontSize: 10.5 }}
          />
        </div>

        <div className="range-row">
          <label>Hauteur ligne</label>
          <input
            type="range" min={0.8} max={2.4} step={0.05}
            value={lineHeight ?? 1.2}
            onChange={(e) => patchStyle({ lineHeight: e.target.value })}
          />
          <input
            type="number" min={0.5} max={3} step={0.05}
            value={lineHeight ?? ""}
            placeholder="1.2"
            onChange={(e) => patchStyle({ lineHeight: e.target.value || undefined })}
            className="input mono"
            style={{ width: 56, height: 22, padding: "0 4px", fontSize: 10.5 }}
          />
        </div>

        <div className="range-row">
          <label>Poids</label>
          <input
            type="range" min={100} max={900} step={50}
            value={fontWeight ?? 400}
            onChange={(e) => patchStyle({ fontWeight: e.target.value })}
          />
          <input
            type="number" min={100} max={900} step={50}
            value={fontWeight ?? ""}
            placeholder="400"
            onChange={(e) => {
              const n = parseInt(e.target.value);
              patchStyle({ fontWeight: isNaN(n) ? undefined : String(n) });
            }}
            className="input mono"
            style={{ width: 56, height: 22, padding: "0 4px", fontSize: 10.5 }}
          />
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
          {[300, 400, 500, 600, 700, 800].map((w) => (
            <button
              key={w}
              className="btn outline xs"
              style={{
                height: 22, padding: "0 8px",
                background: fontWeight === w ? "var(--text)" : undefined,
                color: fontWeight === w ? "var(--bg)" : undefined,
                borderColor: fontWeight === w ? "var(--text)" : undefined,
              }}
              onClick={() => patchStyle({ fontWeight: String(w) })}
            >{w}</button>
          ))}
        </div>

        <div className="field" style={{ marginTop: 10 }}>
          <div className="field-label"><span>Alignement</span></div>
          <div className="seg full">
            {ALIGN_OPTIONS.map(({ id, Icon, label }) => (
              <button
                key={id}
                type="button"
                aria-pressed={align === id ? "true" : "false"}
                onClick={() => patchStyle({ textAlign: align === id ? undefined : id })}
                title={label}
              >
                <Icon size={12} />
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button
            type="button"
            className="btn outline xs"
            style={{ flex: 1, justifyContent: "center", background: isItalic ? "var(--text)" : undefined, color: isItalic ? "var(--bg)" : undefined, borderColor: isItalic ? "var(--text)" : undefined }}
            onClick={() => patchStyle({ fontStyle: isItalic ? undefined : "italic" })}
            title="Italique sur tout l'élément"
          >
            Italique élément
          </button>
          <button
            type="button"
            className="btn outline xs"
            style={{ flex: 1, justifyContent: "center", background: isUnderline ? "var(--text)" : undefined, color: isUnderline ? "var(--bg)" : undefined, borderColor: isUnderline ? "var(--text)" : undefined }}
            onClick={() => patchStyle({ textDecoration: isUnderline ? undefined : "underline" })}
            title="Souligné sur tout l'élément"
          >
            Souligné élément
          </button>
        </div>
      </div>

      {/* COULEUR */}
      <div>
        <div className="field-label"><span>Couleur</span></div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {STYLE_GUIDE_COLOR_KEYS.map((k) => {
            const hex = state.styleGuide.colors[k];
            const isOn = colorOverride.toLowerCase() === hex.toLowerCase();
            return (
              <button
                key={k}
                title={`${k} · ${hex}`}
                onClick={() => patchStyle({ color: hex })}
                style={{
                  width: 24, height: 24, borderRadius: 6,
                  background: hex,
                  border: "1.5px solid var(--surface)",
                  boxShadow: isOn
                    ? "0 0 0 2px var(--text)"
                    : "0 0 0 1px var(--border-2)",
                  cursor: "default",
                }}
              />
            );
          })}
          {colorOverride && (
            <button
              className="btn ghost xs"
              onClick={() => patchStyle({ color: undefined })}
              title="Revenir à la couleur héritée"
              style={{ height: 22 }}
            >
              Auto
            </button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="text"
            value={colorOverride}
            onChange={(e) => patchStyle({ color: e.target.value || undefined })}
            placeholder="#RRGGBB ou #RRGGBBAA"
            className="input mono"
            style={{ flex: 1, height: 26, fontSize: 11 }}
          />
        </div>
      </div>

      <AppearancePanel instance={instance} pathStr={pathStr} showFlex={false} />

      <DeleteRestoreFooter instance={instance} pathStr={pathStr} label="le texte" />
    </div>
  );
}

// ─── Image editor ─────────────────────────────────────────────────────────────

const ASPECT_RATIO_OPTIONS: Array<{ id: string; label: string; value: string | undefined }> = [
  { id: "auto", label: "Auto", value: undefined },
  { id: "1/1", label: "1:1", value: "1 / 1" },
  { id: "4/3", label: "4:3", value: "4 / 3" },
  { id: "3/2", label: "3:2", value: "3 / 2" },
  { id: "16/9", label: "16:9", value: "16 / 9" },
  { id: "2/3", label: "2:3", value: "2 / 3" },
];

function ImagePanel({ element, instance, binding }: { element: SelectedElementShape; instance: SiteSectionInstance; binding: BindingResult }) {
  const { state } = useRelumeBuilder();
  const dispatch = useDispatcher(instance);
  const pathStr = element.path.join(".");

  const isBackground = element.attrs.isBackground === true;
  const overrideKind = isBackground ? "bg_image" : "image";

  let currentValue = element.attrs.src ?? "";
  let isFromVariable = false;
  if (binding.strategy === "direct" || binding.strategy === "field-id") {
    const settings = readSettings(instance, binding.location);
    const v = settings[binding.key];
    if (typeof v === "string") currentValue = v;
    else isFromVariable = true; // key undefined → image comes from variable fallback
  } else if (binding.strategy === "override") {
    const ov = readOverride(instance, binding.pathStr, overrideKind)
      ?? readOverride(instance, binding.pathStr, isBackground ? "image" : "bg_image");
    if (ov !== undefined) currentValue = ov;
  }

  // Style overrides (ratio / dimensions)
  const elementStyle = readStyleOverride(instance, pathStr);
  const patchStyle = (patch: Record<string, string | undefined>) => writeStyleOverride(instance, dispatch, pathStr, patch);
  const currentRatio = elementStyle.aspectRatio ?? "";
  const currentWidth = elementStyle.width ?? "";
  const currentHeight = elementStyle.height ?? "";

  // Mobile image (image_mobile override)
  const mobileSrc = readOverride(instance, pathStr, "image_mobile") ?? "";
  const [mobileEnabled, setMobileEnabled] = React.useState<boolean>(mobileSrc.length > 0);
  React.useEffect(() => { if (mobileSrc.length > 0) setMobileEnabled(true); }, [mobileSrc]);

  const setMobileImage = (url: string) => {
    if (!url) {
      setOverride(instance, dispatch, pathStr, { kind: "image_mobile", value: "" });
      // Clean up: also drop the wrapper by writing an empty override
      // (applicator removes the source). Then clear the entry entirely.
      const all = { ...((instance.content.__overrides as Record<string, unknown> | undefined) ?? {}) };
      delete all[`${pathStr}:image_mobile`];
      dispatch({ scope: "instance" }, { __overrides: all });
      return;
    }
    setOverride(instance, dispatch, pathStr, { kind: "image_mobile", value: url });
  };

  const onChange = (url: string) => {
    if (typeof console !== "undefined") {
      console.debug("[SB:dispatch] image", { strategy: binding.strategy, isBackground, key: ("key" in binding ? binding.key : "pathStr" in binding ? binding.pathStr : "pair"), value: url.slice(0, 60) });
    }
    if (binding.strategy === "direct" || binding.strategy === "field-id") {
      dispatch(binding.location, { [binding.key]: url });
    } else if (binding.strategy === "composite") {
      const settings = readSettings(instance, binding.location);
      const existing = compositeRead(settings, binding.key);
      dispatch(binding.location, { [binding.key]: { ...existing, src: url } });
    } else if (binding.strategy === "override") {
      setOverride(instance, dispatch, binding.pathStr, { kind: overrideKind, value: url });
    }
  };

  const restoreVariable = () => {
    if (binding.strategy === "direct" || binding.strategy === "field-id") {
      dispatch(binding.location, { [binding.key]: "" });
    } else if (binding.strategy === "override") {
      setOverride(instance, dispatch, binding.pathStr, null);
    }
  };

  return (
    <div className="p-3 space-y-3">
      <PanelHeader kind="image" binding={binding} />
      <ImagePickerField
        setting={{ type: "image_picker", id: "image", label: "Image" }}
        value={currentValue}
        onChange={onChange}
        siteId={state.siteId}
      />
      {(binding.strategy === "direct" || binding.strategy === "field-id") && currentValue && isFromVariable === false && (
        <button
          onClick={restoreVariable}
          className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-700 transition-colors"
          title="Vider la valeur pour revenir à la variable par défaut (logo entreprise, etc.)"
        >
          <RefreshCw size={10} />
          Rétablir la valeur de la variable
        </button>
      )}
      {binding.strategy === "override" && (
        <p className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1">
          Cette image est codée en dur dans la section. La modification est appliquée via un override DOM.
        </p>
      )}

      {/* RATIO */}
      <div>
        <div className="field-label"><span>Format (ratio)</span></div>
        <div className="seg full" style={{ flexWrap: "wrap" }}>
          {ASPECT_RATIO_OPTIONS.map((r) => {
            const isOn = (r.value ?? "") === currentRatio;
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={isOn ? "true" : "false"}
                onClick={() => patchStyle({ aspectRatio: r.value, objectFit: r.value ? "cover" : undefined })}
                title={`Ratio ${r.label}`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* DIMENSIONS */}
      <div>
        <div className="field-label"><span>Dimensions</span></div>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 9, color: "var(--text-4)" }}>Largeur</label>
            <input
              type="text"
              value={currentWidth}
              placeholder="ex: 100%, 320px"
              onChange={(e) => patchStyle({ width: e.target.value || undefined })}
              className="input mono"
              style={{ width: "100%", height: 24, padding: "0 6px", fontSize: 11 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 9, color: "var(--text-4)" }}>Hauteur</label>
            <input
              type="text"
              value={currentHeight}
              placeholder="ex: auto, 240px"
              onChange={(e) => patchStyle({ height: e.target.value || undefined })}
              className="input mono"
              style={{ width: "100%", height: 24, padding: "0 6px", fontSize: 11 }}
            />
          </div>
        </div>
      </div>

      {/* MOBILE VARIANT */}
      {!isBackground && (
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-2)", cursor: "default" }}>
            <input
              type="checkbox"
              checked={mobileEnabled}
              onChange={(e) => {
                const on = e.target.checked;
                setMobileEnabled(on);
                if (!on) setMobileImage("");
              }}
            />
            Image différente sur mobile (&lt; 768 px)
          </label>
          {mobileEnabled && (
            <div style={{ marginTop: 6 }}>
              <ImagePickerField
                setting={{ type: "image_picker", id: "image_mobile", label: "Image mobile" }}
                value={mobileSrc}
                onChange={setMobileImage}
                siteId={state.siteId}
              />
              <p style={{ fontSize: 10, color: "var(--text-4)", marginTop: 4, lineHeight: 1.4 }}>
                L'image desktop reste utilisée au-dessus de 768 px.
              </p>
            </div>
          )}
        </div>
      )}

      <AppearancePanel instance={instance} pathStr={pathStr} showFlex={false} />

      <DeleteRestoreFooter instance={instance} pathStr={pathStr} label="l'image" />
    </div>
  );
}

// ─── Button editor (label + href + target) ────────────────────────────────────

function ButtonOrLinkPanel({
  element, instance, binding, kind,
}: {
  element: SelectedElementShape;
  instance: SiteSectionInstance;
  binding: BindingResult;
  kind: "button" | "link";
}) {
  const { state } = useRelumeBuilder();
  const dispatch = useDispatcher(instance);

  let label = element.text;
  let href = element.attrs.href ?? "";
  let target = element.attrs.target ?? "_self";

  if (binding.strategy === "field-id" || binding.strategy === "direct") {
    const settings = readSettings(instance, binding.location);
    const v = settings[binding.key];
    if (typeof v === "string") label = v;
  } else if (binding.strategy === "composite") {
    const settings = readSettings(instance, binding.location);
    const obj = compositeRead(settings, binding.key);
    if (typeof obj.label === "string") label = obj.label;
    if (typeof obj.href === "string") href = obj.href;
    if (obj.target === "_blank" || obj.target === "_self") target = obj.target;
  } else if (binding.strategy === "pair") {
    const settings = readSettings(instance, binding.location);
    if (typeof settings[binding.labelKey] === "string") label = settings[binding.labelKey] as string;
    if (typeof settings[binding.hrefKey] === "string") href = settings[binding.hrefKey] as string;
  } else {
    const textOv = readOverride(instance, binding.pathStr, "text");
    if (textOv !== undefined) label = textOv;
  }

  // Any strategy may carry an override for href/target on the same DOM path.
  const pathForOverride = binding.strategy === "override" ? binding.pathStr : element.path.join(".");
  const hrefOv = readOverride(instance, pathForOverride, kind === "button" ? "button_href" : "link_href");
  if (hrefOv !== undefined) href = hrefOv;
  const targetOv = readOverride(instance, pathForOverride, "attr", "target");
  if (targetOv === "_blank" || targetOv === "_self") target = targetOv;

  const setLabel = (val: string) => {
    if (binding.strategy === "direct" || binding.strategy === "field-id") {
      dispatch(binding.location, { [binding.key]: val });
    } else if (binding.strategy === "composite") {
      const settings = readSettings(instance, binding.location);
      const existing = compositeRead(settings, binding.key);
      dispatch(binding.location, { [binding.key]: { ...existing, label: val } });
    } else if (binding.strategy === "pair") {
      dispatch(binding.location, { [binding.labelKey]: val });
    } else {
      setOverride(instance, dispatch, binding.pathStr, { kind: "text", value: val });
    }
  };

  const fallbackPath = element.path.join(".");

  const setHref = (val: string) => {
    if (binding.strategy === "composite") {
      const settings = readSettings(instance, binding.location);
      const existing = compositeRead(settings, binding.key);
      dispatch(binding.location, { [binding.key]: { ...existing, href: val } });
    } else if (binding.strategy === "pair") {
      dispatch(binding.location, { [binding.hrefKey]: val });
    } else {
      // direct / field-id / override → write a DOM-path override so the
      // applicator can set the href even when section code reads it in dur.
      const pathStr = binding.strategy === "override" ? binding.pathStr : fallbackPath;
      setOverride(instance, dispatch, pathStr, {
        kind: kind === "button" ? "button_href" : "link_href",
        value: val,
      });
    }
  };

  const setTarget = (val: "_self" | "_blank") => {
    if (binding.strategy === "composite") {
      const settings = readSettings(instance, binding.location);
      const existing = compositeRead(settings, binding.key);
      dispatch(binding.location, { [binding.key]: { ...existing, target: val } });
    } else {
      const pathStr = binding.strategy === "override" ? binding.pathStr : fallbackPath;
      setOverride(instance, dispatch, pathStr, {
        kind: "attr",
        value: val,
        meta: { attrName: "target" },
      });
    }
  };

  // Href is always editable: composite/pair update the bound key, other
  // strategies fall back to a DOM-path override so hardcoded section hrefs
  // still update post-render.
  const hrefIsViaOverride = binding.strategy !== "composite" && binding.strategy !== "pair";

  return (
    <div className="p-3 space-y-3">
      <PanelHeader kind={kind} binding={binding} />

      <div>
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Texte du {kind === "button" ? "bouton" : "lien"}</label>
        <VariableTextarea
          value={label}
          onChange={setLabel}
          placeholder="Texte…"
          rows={2}
          className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-400 resize-none"
          variables={state.variableContext}
          variant="light"
        />
      </div>

      <div>
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
          Lien (href)
          {hrefIsViaOverride && (
            <span className="ml-1 text-[9px] font-normal text-gray-400 normal-case tracking-normal">
              · via override
            </span>
          )}
        </label>
        <VariableTextarea
          value={href}
          onChange={setHref}
          placeholder="/page ou https://…"
          rows={1}
          className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-400 resize-none"
          variables={state.variableContext}
          variant="light"
        />
      </div>

      <div>
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Ouverture</label>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setTarget("_self")}
              className={`flex-1 px-2 py-1.5 text-[10px] rounded border ${target === "_self" ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600"}`}
            >
              Même onglet
            </button>
            <button
              type="button"
              onClick={() => setTarget("_blank")}
              className={`flex-1 px-2 py-1.5 text-[10px] rounded border flex items-center justify-center gap-1 ${target === "_blank" ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-600"}`}
            >
              <ExternalLink size={9} /> Nouvel onglet
            </button>
          </div>
        </div>

      <AppearancePanel instance={instance} pathStr={pathForOverride} />

      <DeleteRestoreFooter instance={instance} pathStr={fallbackPath} label={kind === "button" ? "le bouton" : "le lien"} />
    </div>
  );
}

// ─── Input editor ─────────────────────────────────────────────────────────────

function InputPanel({ element, instance, binding }: { element: SelectedElementShape; instance: SiteSectionInstance; binding: BindingResult }) {
  const { state } = useRelumeBuilder();
  const dispatch = useDispatcher(instance);
  const fallbackPath = element.path.join(".");
  const overridePath = binding.strategy === "override" ? binding.pathStr : fallbackPath;

  let placeholder = element.attrs.placeholder ?? "";
  let name = element.attrs.name ?? "";
  let inputType = element.attrs.inputType ?? "text";

  if (binding.strategy === "field-id" || binding.strategy === "direct") {
    const settings = readSettings(instance, binding.location);
    const v = settings[binding.key];
    if (typeof v === "string") placeholder = v;
  } else if (binding.strategy === "composite") {
    const settings = readSettings(instance, binding.location);
    const obj = compositeRead(settings, binding.key);
    if (typeof obj.placeholder === "string") placeholder = obj.placeholder;
    if (typeof obj.name === "string") name = obj.name;
    if (typeof obj.input_type === "string") inputType = obj.input_type;
  }

  // Any strategy can carry attr overrides for placeholder/name/type.
  const pOv = readOverride(instance, overridePath, "attr", "placeholder");
  if (pOv !== undefined) placeholder = pOv;
  const nOv = readOverride(instance, overridePath, "attr", "name");
  if (nOv !== undefined) name = nOv;
  const tOv = readOverride(instance, overridePath, "attr", "type");
  if (tOv !== undefined) inputType = tOv;

  // Update routing: composite writes inline, direct/field-id writes the
  // string value to its single key for placeholder only, everything else
  // falls back to a DOM-path attribute override.
  const update = (patch: Record<string, unknown>) => {
    if (binding.strategy === "composite") {
      const settings = readSettings(instance, binding.location);
      const existing = compositeRead(settings, binding.key);
      dispatch(binding.location, { [binding.key]: { ...existing, ...patch } });
      return;
    }
    if ((binding.strategy === "direct" || binding.strategy === "field-id") && "placeholder" in patch) {
      dispatch(binding.location, { [binding.key]: patch.placeholder });
      // also clear any stale attr override for placeholder
      setOverride(instance, dispatch, overridePath, null);
      // Re-write other attrs if any
      if ("name" in patch && typeof patch.name === "string") {
        setOverride(instance, dispatch, overridePath, { kind: "attr", value: patch.name, meta: { attrName: "name" } });
      }
      if ("input_type" in patch && typeof patch.input_type === "string") {
        setOverride(instance, dispatch, overridePath, { kind: "attr", value: patch.input_type, meta: { attrName: "type" } });
      }
      return;
    }
    // Fallback: write attr overrides for each touched field.
    if ("placeholder" in patch && typeof patch.placeholder === "string") {
      setOverride(instance, dispatch, overridePath, { kind: "attr", value: patch.placeholder, meta: { attrName: "placeholder" } });
    }
    if ("name" in patch && typeof patch.name === "string") {
      setOverride(instance, dispatch, overridePath, { kind: "attr", value: patch.name, meta: { attrName: "name" } });
    }
    if ("input_type" in patch && typeof patch.input_type === "string") {
      setOverride(instance, dispatch, overridePath, { kind: "attr", value: patch.input_type, meta: { attrName: "type" } });
    }
  };

  const viaOverride = binding.strategy !== "composite";

  return (
    <div className="p-3 space-y-3">
      <PanelHeader kind="input" binding={binding} />

      <div>
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
          Placeholder
          {viaOverride && (
            <span className="ml-1 text-[9px] font-normal text-gray-400 normal-case tracking-normal">· via override</span>
          )}
        </label>
        <VariableTextarea
          value={placeholder}
          onChange={(v) => update({ placeholder: v })}
          placeholder="Texte d'aide…"
          rows={1}
          className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-400 resize-none"
          variables={state.variableContext}
          variant="light"
        />
      </div>

      <div>
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Type</label>
        <select
          value={inputType}
          onChange={(e) => update({ input_type: e.target.value })}
          className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-400"
        >
          <option value="text">Texte</option>
          <option value="email">Email</option>
          <option value="tel">Téléphone</option>
          <option value="number">Nombre</option>
          <option value="url">URL</option>
          <option value="password">Mot de passe</option>
          <option value="date">Date</option>
        </select>
      </div>

      <div>
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Nom du champ (name)</label>
        <input
          type="text"
          value={name}
          onChange={(e) => update({ name: e.target.value })}
          className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-400"
        />
      </div>

      <AppearancePanel instance={instance} pathStr={overridePath} showFlex={false} />

      <DeleteRestoreFooter instance={instance} pathStr={overridePath} label="le champ" />
    </div>
  );
}

// ─── Form editor ──────────────────────────────────────────────────────────────

function FormPanel({ element, instance, binding }: { element: SelectedElementShape; instance: SiteSectionInstance; binding: BindingResult }) {
  const { state } = useRelumeBuilder();
  const dispatch = useDispatcher(instance);

  let action = element.attrs.action ?? "";
  let method = element.attrs.method ?? "POST";
  let editable = false;

  if (binding.strategy === "composite") {
    const settings = readSettings(instance, binding.location);
    const obj = compositeRead(settings, binding.key);
    if (typeof obj.action === "string") action = obj.action;
    if (typeof obj.method === "string") method = obj.method;
    editable = true;
  }

  const update = (patch: Record<string, unknown>) => {
    if (binding.strategy === "composite") {
      const settings = readSettings(instance, binding.location);
      const existing = compositeRead(settings, binding.key);
      dispatch(binding.location, { [binding.key]: { ...existing, ...patch } });
    }
  };

  return (
    <div className="p-3 space-y-3">
      <PanelHeader kind="form" binding={binding} />

      <div>
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Action (URL de soumission)</label>
        <VariableTextarea
          value={action}
          onChange={(v) => update({ action: v })}
          placeholder="/api/contact"
          rows={1}
          className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-400 resize-none"
          variables={state.variableContext}
          variant="light"
        />
      </div>

      <div>
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">Méthode</label>
        <select
          value={method}
          onChange={(e) => update({ method: e.target.value })}
          className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-400"
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
        </select>
      </div>

      {!editable && (
        <p className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1">
          Ce formulaire est codé en dur. Pour le rendre éditable, déclare-le comme objet composite <code className="font-mono">{`{ action, method, submit_label }`}</code> dans le content.
        </p>
      )}

      <AppearancePanel instance={instance} pathStr={element.path.join(".")} />

      <DeleteRestoreFooter instance={instance} pathStr={element.path.join(".")} label="le formulaire" />
    </div>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function ElementPanel({ element, instance }: ElementPanelProps) {
  const binding = React.useMemo(
    () => resolveContentBinding(element, instance.content, instance.blocks),
    [element, instance.content, instance.blocks],
  );

  switch (element.kind) {
    case "text": return <TextPanel element={element} instance={instance} binding={binding} />;
    case "image": return <ImagePanel element={element} instance={instance} binding={binding} />;
    case "button": return <ButtonOrLinkPanel element={element} instance={instance} binding={binding} kind="button" />;
    case "link": return <ButtonOrLinkPanel element={element} instance={instance} binding={binding} kind="link" />;
    case "input": return <InputPanel element={element} instance={instance} binding={binding} />;
    case "form": return <FormPanel element={element} instance={instance} binding={binding} />;
    default: return null;
  }
}
