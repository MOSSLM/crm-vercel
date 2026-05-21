"use client";

import React from "react";
import { ChevronDown, ChevronUp, Copy, GripVertical, Plus, Tag, Trash2 } from "lucide-react";
import type { SectionBlockInstance, SectionBlockSchema, SectionSchema, StyleGuide } from "@/types";
import { findBlockSchema, getBlockDefaults } from "@/data/section-schemas";
import { parseServiceTags } from "@/lib/site-builder/menu-overrides";
import { SchemaEditor } from "./SchemaEditor";

interface BlocksEditorProps {
  schema: SectionSchema;
  blocks: SectionBlockInstance[];
  styleGuide: StyleGuide;
  onAdd: (blockType: string, settings?: Record<string, unknown>) => void;
  onUpdate: (blockId: string, settings: Record<string, unknown>) => void;
  onRemove: (blockId: string) => void;
  onDuplicate: (blockId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** Optional: when provided, each block gets a service-tag picker. */
  onUpdateTag?: (blockId: string, service_tag: string | null) => void;
  variables?: Record<string, string>;
  siteId?: string;
}

export function BlocksEditor({
  schema,
  blocks,
  styleGuide,
  onAdd,
  onUpdate,
  onRemove,
  onDuplicate,
  onReorder,
  onUpdateTag,
  variables,
  siteId,
}: BlocksEditorProps) {
  // Service-tag options come from the site's linked enterprise.
  const enterpriseTags = parseServiceTags(variables);
  const [expandedId, setExpandedId] = React.useState<string | null>(blocks[0]?.id ?? null);

  if (!schema.blocks || schema.blocks.length === 0) return null;

  const maxReached = typeof schema.max_blocks === "number" && blocks.length >= schema.max_blocks;

  // Per-type usage counters (to disable adding when block.limit reached)
  const perTypeCount: Record<string, number> = {};
  for (const b of blocks) perTypeCount[b.type] = (perTypeCount[b.type] ?? 0) + 1;

  const addableTypes = schema.blocks.filter((bs) => {
    if (typeof bs.limit === "number" && (perTypeCount[bs.type] ?? 0) >= bs.limit) return false;
    return true;
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">
          Blocs ({blocks.length}{schema.max_blocks ? ` / ${schema.max_blocks}` : ""})
        </div>
      </div>

      {blocks.length === 0 && (
        <p className="text-[11px] text-white/30 text-center py-3 border border-dashed border-white/10 rounded">
          Aucun bloc. Ajoutez-en un ci-dessous.
        </p>
      )}

      {blocks.map((block, idx) => {
        const blockSchema = findBlockSchema(schema, block.type);
        if (!blockSchema) {
          return (
            <div key={block.id} className="border border-orange-500/20 rounded p-2 text-[11px] text-orange-300/70">
              Type de bloc inconnu : <code>{block.type}</code>
              <button onClick={() => onRemove(block.id)} className="ml-2 text-red-400 hover:underline">Supprimer</button>
            </div>
          );
        }
        const isExpanded = expandedId === block.id;
        const preview = blockPreview(blockSchema, block.settings);
        const tag = block.service_tag ?? null;
        const isFiltered = !!(tag && !enterpriseTags.includes(tag));
        const showTagPicker = !!onUpdateTag;

        return (
          <div
            key={block.id}
            className="border border-white/10 rounded-md overflow-hidden bg-white/[0.02]"
            style={isFiltered ? { opacity: 0.45 } : undefined}
          >
            <div className="flex items-center gap-1 px-2 py-1.5 hover:bg-white/[0.04] transition-colors">
              <button
                onMouseDown={(e) => e.preventDefault()}
                disabled={idx === 0}
                onClick={() => onReorder(idx, idx - 1)}
                className="text-white/20 hover:text-white/60 disabled:opacity-20 disabled:cursor-not-allowed"
                title="Monter"
              >
                <ChevronUp size={11} />
              </button>
              <button
                disabled={idx === blocks.length - 1}
                onClick={() => onReorder(idx, idx + 1)}
                className="text-white/20 hover:text-white/60 disabled:opacity-20 disabled:cursor-not-allowed"
                title="Descendre"
              >
                <ChevronDown size={11} />
              </button>
              <GripVertical size={10} className="text-white/10" />
              <button
                onClick={() => setExpandedId(isExpanded ? null : block.id)}
                className="flex-1 text-left text-[11px] text-white/70 hover:text-white truncate min-w-0"
              >
                <span className="text-white/40 mr-1.5">{blockSchema.name}</span>
                <span className="truncate">{preview}</span>
              </button>
              {tag && (
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide"
                  style={{
                    background: isFiltered ? "rgba(251,113,133,0.15)" : "rgba(96,165,250,0.18)",
                    color: isFiltered ? "#fb7185" : "#93c5fd",
                  }}
                  title={isFiltered ? "Bloc masqué : tag absent de l'entreprise" : `Service tag: ${tag}`}
                >
                  {tag}
                </span>
              )}
              <button
                onClick={() => onDuplicate(block.id)}
                disabled={maxReached}
                className="text-white/20 hover:text-white/60 p-1 disabled:opacity-20 disabled:cursor-not-allowed"
                title="Dupliquer"
              >
                <Copy size={11} />
              </button>
              <button
                onClick={() => onRemove(block.id)}
                className="text-white/20 hover:text-red-400 p-1"
                title="Supprimer"
              >
                <Trash2 size={11} />
              </button>
            </div>
            {isExpanded && (
              <div className="px-3 pb-3 pt-1 border-t border-white/5 space-y-3">
                {showTagPicker && (
                  <ServiceTagPicker
                    value={tag}
                    options={enterpriseTags}
                    onChange={(v) => onUpdateTag!(block.id, v)}
                  />
                )}
                <SchemaEditor
                  schema={{ name: blockSchema.name, settings: blockSchema.settings }}
                  content={block.settings}
                  onUpdate={(key, value) => onUpdate(block.id, { [key]: value })}
                  styleGuide={styleGuide}
                  variables={variables}
                  siteId={siteId}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Add button(s) */}
      {!maxReached && addableTypes.length > 0 && (
        <AddBlockMenu
          types={addableTypes}
          onAdd={(type) => {
            const bs = findBlockSchema(schema, type);
            const defaults = bs ? getBlockDefaults(bs) : {};
            onAdd(type, defaults);
          }}
        />
      )}
      {maxReached && (
        <p className="text-[10px] text-white/30 text-center pt-1">
          Limite atteinte ({schema.max_blocks} blocs maximum).
        </p>
      )}
    </div>
  );
}

function ServiceTagPicker({
  value,
  options,
  onChange,
}: {
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-widest">
        <Tag size={10} />
        Service tag
      </div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className="w-full text-[11px] px-2 py-1 bg-white/5 border border-white/10 rounded text-white/80"
      >
        <option value="">— Aucun (toujours afficher)</option>
        {options.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      {options.length === 0 && (
        <p className="text-[10px] text-amber-300/60 leading-snug">
          Aucun service tag sur l&apos;entreprise liée au site.
        </p>
      )}
      <p className="text-[10px] text-white/30 leading-snug">
        Si défini, ce bloc n&apos;apparaît que si l&apos;entreprise a ce service.
      </p>
    </div>
  );
}

function blockPreview(blockSchema: SectionBlockSchema, settings: Record<string, unknown>): string {
  // Find the first non-empty text-like setting
  for (const f of blockSchema.settings) {
    if (f.type === "header" || f.type === "paragraph") continue;
    if (f.type === "text" || f.type === "textarea" || f.type === "richtext") {
      const v = settings[(f as { id: string }).id];
      if (typeof v === "string" && v.trim()) return v.slice(0, 50);
    }
  }
  return "(vide)";
}

function AddBlockMenu({
  types,
  onAdd,
}: {
  types: SectionBlockSchema[];
  onAdd: (type: string) => void;
}) {
  const [open, setOpen] = React.useState(false);

  // Single block type: render a flat add button
  if (types.length === 1) {
    return (
      <button
        onClick={() => onAdd(types[0].type)}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-blue-400/70 hover:text-blue-400 border border-dashed border-blue-500/20 hover:border-blue-500/40 rounded transition-all"
      >
        <Plus size={11} />
        Ajouter un {types[0].name.toLowerCase()}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] text-blue-400/70 hover:text-blue-400 border border-dashed border-blue-500/20 hover:border-blue-500/40 rounded transition-all"
      >
        <Plus size={11} />
        Ajouter un bloc
      </button>
      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-[#1a1a1a] border border-white/10 rounded shadow-lg overflow-hidden">
          {types.map((bs) => (
            <button
              key={bs.type}
              onClick={() => { onAdd(bs.type); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/5 hover:text-white"
            >
              {bs.name}
              {bs.description && <span className="block text-[10px] text-white/30 mt-0.5">{bs.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
