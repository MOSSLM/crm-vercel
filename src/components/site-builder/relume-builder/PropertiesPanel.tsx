"use client";

import React, { useState } from "react";
import { Trash2, Eye, EyeOff, ChevronUp, ChevronDown, Sparkles, RefreshCw, X, Settings, Palette, FileText, Zap } from "lucide-react";
import type { SiteSectionInstance, SnippetDefinition } from "@/types";
import { useRelumeBuilder } from "./RelumeBuilderProvider";
import { ModelDropdown } from "./SitemapWorkspace";
import { useAIModel } from "@/hooks/useAIModel";
import { SchemaEditor, splitSchemaFields } from "@/components/site-builder/editors/SchemaEditor";
import { BlocksEditor } from "@/components/site-builder/editors/BlocksEditor";
import { ColorSchemeField } from "@/components/site-builder/editors/ColorSchemeField";
import { getSchemaForSection } from "@/data/section-schemas";
import type { ColorSchemePreset } from "@/lib/color-utils";
import type { SectionAnimation, SectionPreset } from "@/types";
import { AnimationFieldEditor } from "@/components/site-builder/editors/AnimationFieldEditor";

interface PropertiesPanelProps {
  onRegenerateSection?: (instanceId: string, prompt: string, model: string) => Promise<void>;
}

type TabId = "content" | "style" | "animation" | "ai";

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "content", label: "Contenu", icon: FileText },
  { id: "style", label: "Style", icon: Palette },
  { id: "animation", label: "Anim.", icon: Zap },
  { id: "ai", label: "IA", icon: Sparkles },
];

export function PropertiesPanel({ onRegenerateSection }: PropertiesPanelProps) {
  const { state, dispatch } = useRelumeBuilder();
  const [activeTab, setActiveTab] = useState<TabId>("content");
  const instance = state.selectedInstanceId ? state.instances[state.selectedInstanceId] : null;
  const sectionDef = instance?.section_def;

  if (!instance || !sectionDef) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <div className="text-white/20 text-4xl mb-3">◻</div>
        <p className="text-white/30 text-sm">Sélectionnez une section</p>
        <p className="text-white/20 text-xs mt-1">pour modifier ses propriétés</p>
      </div>
    );
  }

  const schema = getSchemaForSection(sectionDef);

  const updateContent = (key: string, value: unknown) => {
    dispatch({
      type: "UPDATE_INSTANCE_CONTENT",
      payload: { id: instance.id, content: { [key]: value } },
    });
  };

  const applyPreset = (preset: SectionPreset) => {
    dispatch({ type: "APPLY_PRESET", payload: { instanceId: instance.id, preset } });
  };

  // Determine which tabs are shown
  const showAI = !!onRegenerateSection;

  return (
    <div className="flex flex-col h-full text-white">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{sectionDef.name}</div>
          <div className="text-xs text-white/40 mt-0.5">{sectionDef.category}</div>
        </div>
        <button
          onClick={() => dispatch({ type: "SELECT_INSTANCE", payload: null })}
          className="text-white/30 hover:text-white/70 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Section actions */}
      <div className="px-4 py-2.5 border-b border-white/10 flex gap-1">
        <button
          onClick={() => dispatch({ type: "TOGGLE_INSTANCE_VISIBILITY", payload: instance.id })}
          className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors px-2 py-1.5 rounded hover:bg-white/5"
        >
          {instance.is_hidden ? <Eye size={12} /> : <EyeOff size={12} />}
          {instance.is_hidden ? "Afficher" : "Masquer"}
        </button>
        <MoveButtons instance={instance} />
        <button
          onClick={() => dispatch({ type: "REMOVE_INSTANCE", payload: instance.id })}
          className="flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-400 transition-colors px-2 py-1.5 rounded hover:bg-red-500/5 ml-auto"
        >
          <Trash2 size={12} />
          Suppr.
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {TABS.filter((t) => t.id !== "ai" || showAI).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs transition-colors border-b-2 ${
              activeTab === id
                ? "border-blue-400 text-blue-300"
                : "border-transparent text-white/40 hover:text-white/60"
            }`}
          >
            <Icon size={11} />
            {label}
          </button>
        ))}
        {!showAI && (
          <button
            onClick={() => setActiveTab("ai")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs transition-colors border-b-2 ${
              activeTab === "ai"
                ? "border-blue-400 text-blue-300"
                : "border-transparent text-white/40 hover:text-white/60"
            }`}
          >
            <Sparkles size={11} />
            IA
          </button>
        )}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "content" && (
          <div className="px-4 py-3 space-y-4">
            {/* Presets selector (only when the schema declares any) */}
            {schema?.presets && schema.presets.length > 0 && (
              <PresetsPicker presets={schema.presets} onApply={applyPreset} />
            )}

            {schema ? (
              <>
                {(() => {
                  const { contentFields } = splitSchemaFields(schema);
                  const contentOnlySchema = { ...schema, settings: contentFields };
                  return (
                    <SchemaEditor
                      schema={contentOnlySchema}
                      content={instance.content}
                      onUpdate={updateContent}
                      styleGuide={state.styleGuide}
                      variables={state.variableContext}
                      siteId={state.siteId}
                    />
                  );
                })()}
                {/* Blocks editor — only when schema declares blocks */}
                {schema.blocks && schema.blocks.length > 0 && (
                  <BlocksEditor
                    schema={schema}
                    blocks={instance.blocks ?? []}
                    styleGuide={state.styleGuide}
                    onAdd={(blockType, settings) => dispatch({ type: "ADD_BLOCK", payload: { instanceId: instance.id, blockType, settings } })}
                    onUpdate={(blockId, settings) => dispatch({ type: "UPDATE_BLOCK", payload: { instanceId: instance.id, blockId, settings } })}
                    onRemove={(blockId) => dispatch({ type: "REMOVE_BLOCK", payload: { instanceId: instance.id, blockId } })}
                    onDuplicate={(blockId) => dispatch({ type: "DUPLICATE_BLOCK", payload: { instanceId: instance.id, blockId } })}
                    onReorder={(fromIndex, toIndex) => dispatch({ type: "REORDER_BLOCKS", payload: { instanceId: instance.id, fromIndex, toIndex } })}
                    variables={state.variableContext}
                    siteId={state.siteId}
                  />
                )}
              </>
            ) : sectionDef.structure?.snippets?.length > 0 ? (
              <SnippetsEditor instance={instance} snippets={sectionDef.structure.snippets} />
            ) : (
              <GenericContentEditor instance={instance} />
            )}
          </div>
        )}

        {activeTab === "style" && (
          <div className="px-4 py-3 space-y-4">
            {/* Color Scheme */}
            <div>
              <div className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">Palette de couleurs</div>
              <ColorSchemeField
                setting={{ type: "color_scheme", id: "__color_scheme", label: "Palette" }}
                value={(instance.content.__color_scheme as string) ?? "default"}
                onChange={(preset: ColorSchemePreset) => updateContent("__color_scheme", preset)}
                styleGuide={state.styleGuide}
              />
            </div>

            {/* Layout fields from schema */}
            {schema && (() => {
              const { layoutFields } = splitSchemaFields(schema);
              if (layoutFields.length === 0) return null;
              return (
                <div>
                  <div className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">Mise en page</div>
                  <SchemaEditor
                    schema={{ name: "layout", settings: layoutFields }}
                    content={instance.content}
                    onUpdate={updateContent}
                    styleGuide={state.styleGuide}
                    variables={state.variableContext}
                    siteId={state.siteId}
                  />
                </div>
              );
            })()}

            {/* Style fields from schema (excluding color scheme rendered above) */}
            {schema && (() => {
              const { styleFields } = splitSchemaFields(schema);
              const filteredStyle = styleFields.filter((f) => !("id" in f) || f.id !== "__color_scheme");
              if (filteredStyle.length === 0) return null;
              return (
                <div>
                  <div className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">Style</div>
                  <SchemaEditor
                    schema={{ name: "style", settings: filteredStyle }}
                    content={instance.content}
                    onUpdate={updateContent}
                    styleGuide={state.styleGuide}
                    variables={state.variableContext}
                    siteId={state.siteId}
                  />
                </div>
              );
            })()}

            {/* Custom style overrides */}
            <div>
              <div className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">Avancé</div>
              <CustomStyleEditor instance={instance} />
            </div>
          </div>
        )}

        {activeTab === "animation" && (
          <div className="px-4 py-4">
            <AnimationFieldEditor
              type={(instance.content.__animation_type as SectionAnimation) ?? "none"}
              duration={(instance.content.__animation_duration as number) ?? 600}
              delay={(instance.content.__animation_delay as number) ?? 0}
              easing={(instance.content.__animation_easing as string) ?? "ease-out"}
              onUpdate={({ type, duration, delay, easing }) => {
                if (type !== undefined) updateContent("__animation_type", type);
                if (duration !== undefined) updateContent("__animation_duration", duration);
                if (delay !== undefined) updateContent("__animation_delay", delay);
                if (easing !== undefined) updateContent("__animation_easing", easing);
              }}
            />
          </div>
        )}

        {activeTab === "ai" && (
          <div className="px-4 py-3">
            {onRegenerateSection ? (
              <AIRegenerateSection instanceId={instance.id} onRegenerate={(id, prompt, model) => onRegenerateSection(id, prompt, model)} />
            ) : (
              <div className="text-center py-6 space-y-2">
                <Sparkles size={20} className="text-purple-400/30 mx-auto" />
                <p className="text-xs text-white/30">Régénération IA non disponible</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Move Buttons ─────────────────────────────────────────────────────────────

function MoveButtons({ instance }: { instance: SiteSectionInstance }) {
  const { state, dispatch } = useRelumeBuilder();
  const ids = state.instancesByPage[instance.page_slug] ?? [];
  const idx = ids.indexOf(instance.id);

  const moveUp = () => {
    if (idx <= 0) return;
    dispatch({ type: "REORDER_INSTANCES", payload: { pageSlug: instance.page_slug, fromIndex: idx, toIndex: idx - 1 } });
  };
  const moveDown = () => {
    if (idx >= ids.length - 1) return;
    dispatch({ type: "REORDER_INSTANCES", payload: { pageSlug: instance.page_slug, fromIndex: idx, toIndex: idx + 1 } });
  };

  return (
    <>
      <button
        onClick={moveUp}
        disabled={idx <= 0}
        className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors px-2 py-1.5 rounded hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Monter"
      >
        <ChevronUp size={12} />
      </button>
      <button
        onClick={moveDown}
        disabled={idx >= ids.length - 1}
        className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors px-2 py-1.5 rounded hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Descendre"
      >
        <ChevronDown size={12} />
      </button>
    </>
  );
}

// ─── Custom Style Editor (advanced CSS overrides) ─────────────────────────────

function CustomStyleEditor({ instance }: { instance: SiteSectionInstance }) {
  const { dispatch } = useRelumeBuilder();
  const style = (instance.custom_style ?? {}) as Record<string, string>;

  const updateStyle = (key: string, value: string) => {
    dispatch({
      type: "UPDATE_INSTANCE_STYLE",
      payload: { id: instance.id, style: { [key]: value } },
    });
  };

  const commonProps: { key: string; label: string; placeholder: string }[] = [
    { key: "paddingTop", label: "Padding haut", placeholder: "var(--section-padding)" },
    { key: "paddingBottom", label: "Padding bas", placeholder: "var(--section-padding)" },
    { key: "borderRadius", label: "Radius", placeholder: "0px" },
  ];

  return (
    <div className="space-y-2">
      {commonProps.map(({ key, label, placeholder }) => (
        <div key={key}>
          <label className="text-[11px] text-white/40 block mb-1">{label}</label>
          <input
            type="text"
            value={style[key] ?? ""}
            placeholder={placeholder}
            onChange={(e) => updateStyle(key, e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-white/30"
          />
        </div>
      ))}
    </div>
  );
}

// ─── Snippet Editor (legacy fallback) ─────────────────────────────────────────

function SnippetsEditor({
  instance,
  snippets,
}: {
  instance: SiteSectionInstance;
  snippets: SnippetDefinition[];
}) {
  const { dispatch } = useRelumeBuilder();
  const [expandedSnippet, setExpandedSnippet] = React.useState<string | null>(snippets[0]?.id ?? null);

  const updateContent = (key: string, value: unknown) => {
    dispatch({
      type: "UPDATE_INSTANCE_CONTENT",
      payload: { id: instance.id, content: { [key]: value } },
    });
  };

  return (
    <div className="space-y-2">
      {snippets.map((snippet) => (
        <SnippetEditor
          key={snippet.id}
          snippet={snippet}
          content={instance.content}
          isExpanded={expandedSnippet === snippet.id}
          onToggle={() => setExpandedSnippet(expandedSnippet === snippet.id ? null : snippet.id)}
          onUpdateContent={updateContent}
        />
      ))}
    </div>
  );
}

// ─── Individual Snippet Editor ─────────────────────────────────────────────────

const SNIPPET_TYPE_LABELS: Record<string, string> = {
  heading: "Titre", paragraph: "Paragraphe", badge: "Badge", button: "Bouton",
  "button-group": "Groupe de boutons", image: "Image", "card-grid": "Grille de cartes",
  "testimonial-grid": "Témoignages", "faq-accordion": "FAQ", "contact-info": "Infos contact",
  "contact-form": "Formulaire", "stat-row": "Statistiques", "stat-grid": "Grille stats",
  "image-grid": "Galerie", "team-grid": "Équipe", "logo-row": "Logos",
  spacer: "Espacement", divider: "Séparateur",
};

function SnippetEditor({
  snippet, content, isExpanded, onToggle, onUpdateContent,
}: {
  snippet: SnippetDefinition; content: Record<string, unknown>; isExpanded: boolean;
  onToggle: () => void; onUpdateContent: (key: string, value: unknown) => void;
}) {
  const editableFields = snippet.editable ?? [];
  if (editableFields.length === 0 && (!snippet.children || snippet.children.length === 0)) return null;
  const label = SNIPPET_TYPE_LABELS[snippet.type] ?? snippet.type;

  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5 transition-colors"
      >
        <span className="text-xs font-medium text-white/70">{label}</span>
        <span className="text-white/30 text-xs">{isExpanded ? "−" : "+"}</span>
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-white/5">
          {editableFields.map((field) => {
            const propVal = snippet.props[field];
            if (typeof propVal === "string" && propVal.startsWith("{{")) {
              const key = propVal.replace(/^\{\{|\}\}$/g, "").trim();
              return (
                <FieldEditor key={field} fieldName={field} contentKey={key} value={content[key]} onUpdate={onUpdateContent} />
              );
            }
            return null;
          })}
          {snippet.children?.map((child) => (
            <SnippetEditor key={child.id} snippet={child} content={content} isExpanded={true} onToggle={() => {}} onUpdateContent={onUpdateContent} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Field Editor (for snippet fallback) ──────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  text: "Texte", heading: "Titre", subheading: "Sous-titre", src: "URL image",
  alt: "Texte alternatif", href: "Lien URL", body: "Corps", phone: "Téléphone",
  email: "Email", address: "Adresse", submitText: "Texte bouton", cards: "Cartes",
  testimonials: "Témoignages", items: "Éléments", stats: "Statistiques", faqs: "Questions",
  members: "Membres", logos: "Logos", images: "Images", buttons: "Boutons",
};

function FieldEditor({ fieldName, contentKey, value, onUpdate }: {
  fieldName: string; contentKey: string; value: unknown; onUpdate: (key: string, value: unknown) => void;
}) {
  const label = FIELD_LABELS[contentKey] ?? FIELD_LABELS[fieldName] ?? fieldName;

  if (Array.isArray(value)) {
    return (
      <div>
        <label className="text-xs text-white/40 block mb-1">{label}</label>
        <ArrayFieldEditor contentKey={contentKey} items={value} onUpdate={onUpdate} />
      </div>
    );
  }

  if (typeof value === "string") {
    const isImageUrl = contentKey.includes("src") || contentKey.includes("image") || contentKey.includes("img");
    const isUrl = isImageUrl || contentKey.includes("href") || contentKey.includes("url");
    const isLong = value.length > 80 || contentKey === "body" || contentKey === "subheading";

    return (
      <div>
        <label className="text-xs text-white/40 block mb-1">{label}</label>
        {isLong ? (
          <textarea
            value={value}
            onChange={(e) => onUpdate(contentKey, e.target.value)}
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50 resize-none"
          />
        ) : (
          <input
            type={isUrl ? "url" : "text"}
            value={value}
            onChange={(e) => onUpdate(contentKey, e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-blue-500/50"
          />
        )}
        {isImageUrl && value && (
          <div className="mt-1.5 w-full h-16 rounded overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          </div>
        )}
      </div>
    );
  }
  return null;
}

// ─── Generic Content Editor (fallback) ────────────────────────────────────────

function GenericContentEditor({ instance }: { instance: SiteSectionInstance }) {
  const { dispatch } = useRelumeBuilder();
  const content = instance.content ?? {};
  const keys = Object.keys(content).filter(
    (k) => !k.startsWith("__") && (typeof content[k] === "string" || Array.isArray(content[k]))
  );

  const updateContent = (key: string, value: unknown) => {
    dispatch({ type: "UPDATE_INSTANCE_CONTENT", payload: { id: instance.id, content: { [key]: value } } });
  };

  if (keys.length === 0) {
    return <p className="text-xs text-white/30 text-center py-2">Aucun contenu éditable</p>;
  }

  return (
    <div className="space-y-3">
      {keys.map((key) => (
        <FieldEditor key={key} fieldName={key} contentKey={key} value={content[key]} onUpdate={updateContent} />
      ))}
    </div>
  );
}

// ─── Array Field Editor ────────────────────────────────────────────────────────

function ArrayFieldEditor({ contentKey, items, onUpdate }: {
  contentKey: string; items: unknown[]; onUpdate: (key: string, value: unknown) => void;
}) {
  const [expandedItem, setExpandedItem] = React.useState<number | null>(0);

  const updateItem = (index: number, field: string, value: string) => {
    const updated = items.map((item, i) => {
      if (i !== index) return item;
      return { ...(item as Record<string, unknown>), [field]: value };
    });
    onUpdate(contentKey, updated);
  };

  const addItem = () => {
    const template = items[0] ?? {};
    const newItem = Object.fromEntries(Object.keys(template as Record<string, unknown>).map((k) => [k, ""]));
    onUpdate(contentKey, [...items, newItem]);
  };

  const removeItem = (index: number) => onUpdate(contentKey, items.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const obj = item as Record<string, unknown>;
        const keys = Object.keys(obj).filter((k) => typeof obj[k] === "string");
        const preview = String(obj[keys[0]] ?? `Élément ${idx + 1}`).slice(0, 30);

        return (
          <div key={idx} className="border border-white/10 rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1.5">
              <button
                onClick={() => setExpandedItem(expandedItem === idx ? null : idx)}
                className="flex-1 text-left text-xs text-white/60 hover:text-white/80 transition-colors"
              >
                {preview || `Élément ${idx + 1}`}
              </button>
              <button onClick={() => removeItem(idx)} className="text-white/20 hover:text-red-400 transition-colors p-1">
                <X size={10} />
              </button>
            </div>
            {expandedItem === idx && (
              <div className="px-2 pb-2 pt-1 space-y-2 border-t border-white/5">
                {keys.map((k) => {
                  const isImageUrl = k.includes("src") || k.includes("image") || k.includes("img");
                  const val = String(obj[k] ?? "");
                  return (
                    <div key={k}>
                      <label className="text-xs text-white/30 block mb-0.5">{FIELD_LABELS[k] ?? k}</label>
                      <input
                        type={isImageUrl ? "url" : "text"}
                        value={val}
                        onChange={(e) => updateItem(idx, k, e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500/50"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={addItem}
        className="w-full py-1.5 text-xs text-blue-400/70 hover:text-blue-400 border border-dashed border-blue-500/20 hover:border-blue-500/40 rounded transition-all"
      >
        + Ajouter
      </button>
    </div>
  );
}

// ─── Presets Picker ───────────────────────────────────────────────────────────

function PresetsPicker({ presets, onApply }: { presets: SectionPreset[]; onApply: (p: SectionPreset) => void }) {
  const [open, setOpen] = React.useState(false);
  const [confirmIndex, setConfirmIndex] = React.useState<number | null>(null);

  return (
    <div className="border border-white/10 rounded-md overflow-hidden bg-white/[0.02]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/[0.04] transition-colors"
      >
        <div>
          <div className="text-[11px] font-medium text-white/70">Presets</div>
          <div className="text-[10px] text-white/30 mt-0.5">{presets.length} configuration{presets.length > 1 ? "s" : ""} prêt{presets.length > 1 ? "es" : "e"} à l&apos;emploi</div>
        </div>
        <Sparkles size={11} className="text-purple-400/60" />
      </button>
      {open && (
        <div className="border-t border-white/5">
          {presets.map((preset, i) => (
            <div key={i} className="border-b border-white/5 last:border-b-0">
              <button
                onClick={() => setConfirmIndex(confirmIndex === i ? null : i)}
                className="w-full text-left px-3 py-2 hover:bg-white/[0.04] transition-colors"
              >
                <div className="text-[11px] text-white/80">{preset.name}</div>
                {preset.description && <div className="text-[10px] text-white/30 mt-0.5">{preset.description}</div>}
              </button>
              {confirmIndex === i && (
                <div className="flex gap-2 px-3 pb-2">
                  <button
                    onClick={() => { onApply(preset); setConfirmIndex(null); setOpen(false); }}
                    className="flex-1 text-[10px] py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded"
                  >
                    Appliquer (remplace le contenu)
                  </button>
                  <button
                    onClick={() => setConfirmIndex(null)}
                    className="text-[10px] py-1 px-2 text-white/40 hover:text-white/70"
                  >
                    Annuler
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AI Section Regeneration ──────────────────────────────────────────────────

function AIRegenerateSection({
  instanceId, onRegenerate,
}: {
  instanceId: string; onRegenerate: (id: string, prompt: string, model: string) => Promise<void>;
}) {
  const [prompt, setPrompt] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [selectedModel, setSelectedModel] = useAIModel();

  const handleRegenerate = async () => {
    setLoading(true);
    try {
      await onRegenerate(instanceId, prompt, selectedModel);
      setPrompt("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles size={12} className="text-purple-400" />
        <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">IA Copywriting</span>
      </div>
      <div>
        <label className="text-[11px] text-white/40 block mb-1">Modèle IA</label>
        <ModelDropdown value={selectedModel} onChange={setSelectedModel} />
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Rends ce contenu plus professionnel..."
        rows={3}
        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-purple-500/50 resize-none"
      />
      <button
        onClick={handleRegenerate}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 rounded transition-all disabled:opacity-50"
      >
        {loading ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
        {loading ? "Génération..." : "Régénérer le contenu"}
      </button>
      <p className="text-[10px] text-white/20 text-center leading-relaxed">
        L&apos;IA va réécrire le contenu de cette section en conservant la structure existante.
      </p>
    </div>
  );
}
