"use client";

import React from "react";
import { Trash2, Eye, EyeOff, ChevronUp, ChevronDown, Sparkles, RefreshCw, X } from "lucide-react";
import type { SiteSectionInstance, SnippetDefinition } from "@/types";
import { useRelumeBuilder } from "./RelumeBuilderProvider";

interface PropertiesPanelProps {
  onRegenerateSection?: (instanceId: string, prompt: string) => Promise<void>;
}

export function PropertiesPanel({ onRegenerateSection }: PropertiesPanelProps) {
  const { state, dispatch } = useRelumeBuilder();
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
      <div className="px-4 py-3 border-b border-white/10 flex gap-2">
        <button
          onClick={() => dispatch({ type: "TOGGLE_INSTANCE_VISIBILITY", payload: instance.id })}
          className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors px-2 py-1.5 rounded hover:bg-white/5"
        >
          {instance.is_hidden ? <Eye size={12} /> : <EyeOff size={12} />}
          {instance.is_hidden ? "Afficher" : "Masquer"}
        </button>
        <MoveButtons instance={instance} />
        <button
          onClick={() => {
            dispatch({ type: "REMOVE_INSTANCE", payload: instance.id });
          }}
          className="flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-400 transition-colors px-2 py-1.5 rounded hover:bg-red-500/5 ml-auto"
        >
          <Trash2 size={12} />
          Supprimer
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Snippets list */}
        <div className="px-4 py-3 border-b border-white/10">
          <div className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Contenu</div>
          <SnippetsEditor instance={instance} snippets={sectionDef.structure.snippets} />
        </div>

        {/* AI regenerate */}
        {onRegenerateSection && (
          <div className="px-4 py-3">
            <AIRegenerateSection instanceId={instance.id} onRegenerate={onRegenerateSection} />
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
      >
        <ChevronUp size={12} />
      </button>
      <button
        onClick={moveDown}
        disabled={idx >= ids.length - 1}
        className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors px-2 py-1.5 rounded hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronDown size={12} />
      </button>
    </>
  );
}

// ─── Snippet Editor ────────────────────────────────────────────────────────────

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
  heading: "Titre",
  paragraph: "Paragraphe",
  badge: "Badge",
  button: "Bouton",
  "button-group": "Groupe de boutons",
  image: "Image",
  "card-grid": "Grille de cartes",
  "testimonial-grid": "Témoignages",
  "faq-accordion": "FAQ",
  "contact-info": "Infos contact",
  "contact-form": "Formulaire",
  "stat-row": "Statistiques",
  "stat-grid": "Grille stats",
  "image-grid": "Grille d'images",
  "team-grid": "Équipe",
  "logo-row": "Logos",
  spacer: "Espacement",
  divider: "Séparateur",
};

function SnippetEditor({
  snippet,
  content,
  isExpanded,
  onToggle,
  onUpdateContent,
}: {
  snippet: SnippetDefinition;
  content: Record<string, unknown>;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdateContent: (key: string, value: unknown) => void;
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
              const currentVal = content[key] ?? "";
              return (
                <FieldEditor
                  key={field}
                  fieldName={field}
                  contentKey={key}
                  value={currentVal}
                  onUpdate={onUpdateContent}
                />
              );
            }
            return null;
          })}

          {/* Handle children recursively */}
          {snippet.children?.map((child) => (
            <SnippetEditor
              key={child.id}
              snippet={child}
              content={content}
              isExpanded={true}
              onToggle={() => {}}
              onUpdateContent={onUpdateContent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Field Editor ─────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  text: "Texte",
  heading: "Titre",
  subheading: "Sous-titre",
  src: "URL image",
  alt: "Texte alternatif",
  href: "Lien URL",
  body: "Corps",
  phone: "Téléphone",
  email: "Email",
  address: "Adresse",
  submitText: "Texte bouton",
  cards: "Cartes",
  testimonials: "Témoignages",
  items: "Éléments",
  stats: "Statistiques",
  faqs: "Questions",
  members: "Membres",
  logos: "Logos",
  images: "Images",
  buttons: "Boutons",
};

function FieldEditor({
  fieldName,
  contentKey,
  value,
  onUpdate,
}: {
  fieldName: string;
  contentKey: string;
  value: unknown;
  onUpdate: (key: string, value: unknown) => void;
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
    const isUrl = contentKey.includes("src") || contentKey.includes("href") || contentKey.includes("image");
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
      </div>
    );
  }

  return null;
}

// ─── Array Field Editor ────────────────────────────────────────────────────────

function ArrayFieldEditor({
  contentKey,
  items,
  onUpdate,
}: {
  contentKey: string;
  items: unknown[];
  onUpdate: (key: string, value: unknown) => void;
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
    const newItem = Object.fromEntries(
      Object.keys(template as Record<string, unknown>).map((k) => [k, ""])
    );
    onUpdate(contentKey, [...items, newItem]);
  };

  const removeItem = (index: number) => {
    onUpdate(contentKey, items.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {items.map((item, idx) => {
        const obj = item as Record<string, unknown>;
        const keys = Object.keys(obj).filter((k) => typeof obj[k] === "string");
        const previewKey = keys[0] ?? "";
        const preview = String(obj[previewKey] ?? `Élément ${idx + 1}`).slice(0, 30);

        return (
          <div key={idx} className="border border-white/10 rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-2 py-1.5">
              <button
                onClick={() => setExpandedItem(expandedItem === idx ? null : idx)}
                className="flex-1 text-left text-xs text-white/60 hover:text-white/80 transition-colors"
              >
                {preview || `Élément ${idx + 1}`}
              </button>
              <button
                onClick={() => removeItem(idx)}
                className="text-white/20 hover:text-red-400 transition-colors p-1"
              >
                <X size={10} />
              </button>
            </div>
            {expandedItem === idx && (
              <div className="px-2 pb-2 pt-1 space-y-2 border-t border-white/5">
                {keys.map((k) => (
                  <div key={k}>
                    <label className="text-xs text-white/30 block mb-0.5">{FIELD_LABELS[k] ?? k}</label>
                    <input
                      type="text"
                      value={String(obj[k] ?? "")}
                      onChange={(e) => updateItem(idx, k, e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                ))}
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

// ─── AI Section Regeneration ──────────────────────────────────────────────────

function AIRegenerateSection({
  instanceId,
  onRegenerate,
}: {
  instanceId: string;
  onRegenerate: (id: string, prompt: string) => Promise<void>;
}) {
  const [prompt, setPrompt] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleRegenerate = async () => {
    setLoading(true);
    try {
      await onRegenerate(instanceId, prompt);
      setPrompt("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles size={12} className="text-purple-400" />
        <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">IA Copywriting</span>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Rends ce contenu plus professionnel..."
        rows={2}
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
    </div>
  );
}
