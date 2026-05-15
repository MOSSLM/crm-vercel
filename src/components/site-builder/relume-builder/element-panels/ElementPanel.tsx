"use client";

import React from "react";
import { Link as LinkIcon, ExternalLink, RefreshCw, Image as ImageIcon, MousePointer, FormInput, Type as TypeIcon } from "lucide-react";
import type { SiteSectionInstance } from "@/types";
import { useRelumeBuilder } from "../RelumeBuilderProvider";
import { resolveContentBinding, type BindingResult, type BindingLocation } from "@/lib/site-builder/resolve-content-binding";
import { VariableTextarea } from "../VariableTextarea";
import { ImagePickerField } from "@/components/site-builder/editors/ImagePickerField";
import type { ElementKind, ElementAttrs } from "../DesignWorkspace";

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

function TextPanel({ element, instance, binding }: { element: SelectedElementShape; instance: SiteSectionInstance; binding: BindingResult }) {
  const { state } = useRelumeBuilder();
  const dispatch = useDispatcher(instance);

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
    const ov = readOverride(instance, binding.pathStr, "text");
    if (ov !== undefined) currentValue = ov;
  }

  const onChange = (val: string) => {
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

  return (
    <div className="p-3 space-y-2">
      <PanelHeader kind="text" binding={binding} />
      <div className="space-y-1">
        <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block">Contenu</label>
        <VariableTextarea
          value={currentValue}
          onChange={onChange}
          placeholder="Texte…"
          rows={4}
          className="w-full border border-gray-200 rounded-md px-2.5 py-2 text-xs text-gray-800 focus:outline-none focus:border-blue-400 resize-none"
          variables={state.variableContext}
          variant="light"
        />
        {binding.strategy === "override" && (
          <p className="text-[10px] text-amber-700 bg-amber-50 rounded px-2 py-1">
            Ce texte est codé en dur dans la section. La modification est appliquée via un override DOM.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Image editor ─────────────────────────────────────────────────────────────

function ImagePanel({ element, instance, binding }: { element: SelectedElementShape; instance: SiteSectionInstance; binding: BindingResult }) {
  const { state } = useRelumeBuilder();
  const dispatch = useDispatcher(instance);

  let currentValue = element.attrs.src ?? "";
  let isFromVariable = false;
  if (binding.strategy === "direct" || binding.strategy === "field-id") {
    const settings = readSettings(instance, binding.location);
    const v = settings[binding.key];
    if (typeof v === "string") currentValue = v;
    else isFromVariable = true; // key undefined → image comes from variable fallback
  } else if (binding.strategy === "override") {
    const ov = readOverride(instance, binding.pathStr, "image");
    if (ov !== undefined) currentValue = ov;
  }

  const onChange = (url: string) => {
    if (binding.strategy === "direct" || binding.strategy === "field-id") {
      dispatch(binding.location, { [binding.key]: url });
    } else if (binding.strategy === "composite") {
      const settings = readSettings(instance, binding.location);
      const existing = compositeRead(settings, binding.key);
      dispatch(binding.location, { [binding.key]: { ...existing, src: url } });
    } else if (binding.strategy === "override") {
      setOverride(instance, dispatch, binding.pathStr, { kind: "image", value: url });
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
