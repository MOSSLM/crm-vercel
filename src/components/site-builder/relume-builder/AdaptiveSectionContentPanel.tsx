"use client";

import React from "react";
import { ChevronDown, ChevronRight, Tag, Layers, AlertCircle } from "lucide-react";
import type { SiteSectionInstance } from "@/types";
import { useRelumeBuilder } from "./RelumeBuilderProvider";
import { getSchemaForSection, getBlockDefaults } from "@/data/section-schemas";
import { SchemaEditor } from "@/components/site-builder/editors/SchemaEditor";

/** Block type used for the repeatable item of a tag-adaptive section. */
const TAG_ITEM_TYPE = "tag_item";

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Content editor for a tag-adaptive section: edits the fixed section-level
 * fields, then one card per service tag (the repeatable `tag_item` block).
 * The card list is auto-synced with the enterprise service tags via
 * SYNC_ADAPTIVE_BLOCKS — one block materialised per tag.
 */
export function AdaptiveSectionContentPanel({ instance }: { instance: SiteSectionInstance }) {
  const { state, dispatch } = useRelumeBuilder();
  const sectionDef = instance.section_def;
  const schema = sectionDef ? getSchemaForSection(sectionDef) : null;
  const itemSchema = schema?.blocks?.[0] ?? null;

  const tagsRaw = state.variableContext.__service_tags;
  const activeTags = React.useMemo(() => parseTags(tagsRaw), [tagsRaw]);

  // Materialise one tag_item block per active service tag (idempotent).
  React.useEffect(() => {
    if (!itemSchema || activeTags.length === 0) return;
    dispatch({
      type: "SYNC_ADAPTIVE_BLOCKS",
      payload: {
        instanceId: instance.id,
        tags: activeTags,
        blockType: TAG_ITEM_TYPE,
        defaults: getBlockDefaults(itemSchema),
      },
    });
  }, [instance.id, activeTags, itemSchema, dispatch]);

  const [openTag, setOpenTag] = React.useState<string | null>(null);
  const [sectionOpen, setSectionOpen] = React.useState(true);

  if (!sectionDef || !schema || !itemSchema) {
    return (
      <div className="p-4 text-[12px] text-white/40">
        Cette section adaptative n&apos;a pas de schéma valide (bloc <code>tag_item</code> manquant).
      </div>
    );
  }

  const tagItemBlocks = instance.blocks.filter((b) => b.type === TAG_ITEM_TYPE);
  const blockByTag = new Map(tagItemBlocks.filter((b) => b.service_tag).map((b) => [b.service_tag!, b]));
  // Orphan blocks: a tag that is no longer active keeps its content but is hidden.
  const orphanBlocks = tagItemBlocks.filter((b) => !b.service_tag || !activeTags.includes(b.service_tag));

  const updateContent = (key: string, value: unknown) => {
    dispatch({ type: "UPDATE_INSTANCE_CONTENT", payload: { id: instance.id, content: { [key]: value } } });
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Section-level fixed content */}
      <div className="border-b border-white/5">
        <button
          onClick={() => setSectionOpen((v) => !v)}
          className="flex items-center gap-2 w-full px-3 py-2.5 text-left hover:bg-white/[0.03]"
        >
          <Layers size={12} className="text-white/40" />
          <span className="text-[11px] font-semibold text-white/60 uppercase tracking-widest flex-1">
            Contenu de section
          </span>
          <ChevronDown size={12} className={`text-white/30 transition-transform ${sectionOpen ? "" : "-rotate-90"}`} />
        </button>
        {sectionOpen && (
          <div className="px-3 pb-3">
            {schema.settings.length > 0 ? (
              <SchemaEditor
                schema={{ name: "section", settings: schema.settings }}
                content={instance.content}
                onUpdate={updateContent}
                styleGuide={state.styleGuide}
                variables={state.variableContext}
                siteId={state.siteId}
              />
            ) : (
              <p className="text-[11px] text-white/30">Aucun champ fixe.</p>
            )}
          </div>
        )}
      </div>

      {/* Per-tag cards */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 mb-2">
          <Tag size={12} className="text-white/40" />
          <span className="text-[11px] font-semibold text-white/60 uppercase tracking-widest flex-1">
            Services ({activeTags.length})
          </span>
        </div>

        {activeTags.length === 0 && (
          <div className="flex items-start gap-2 text-[11px] text-amber-300/70 border border-amber-500/20 rounded p-2">
            <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
            <span>
              Aucun service tag sur cette entreprise. Ajoutez des tags à la fiche entreprise, ou
              utilisez le simulateur pour en tester.
            </span>
          </div>
        )}

        <div className="space-y-2">
          {activeTags.map((tag) => {
            const block = blockByTag.get(tag);
            const open = openTag === tag;
            return (
              <div key={tag} className="border border-white/10 rounded-md overflow-hidden bg-white/[0.02]">
                <button
                  onClick={() => setOpenTag(open ? null : tag)}
                  className="flex items-center gap-2 w-full px-2.5 py-2 text-left hover:bg-white/[0.04]"
                >
                  {open ? <ChevronDown size={12} className="text-white/40" /> : <ChevronRight size={12} className="text-white/40" />}
                  <span className="text-[12px] text-white/80 flex-1 truncate">{tag}</span>
                </button>
                {open && (
                  <div className="px-3 pb-3 pt-1 border-t border-white/5">
                    {block ? (
                      <SchemaEditor
                        schema={{ name: tag, settings: itemSchema.settings }}
                        content={block.settings}
                        onUpdate={(key, value) =>
                          dispatch({
                            type: "UPDATE_BLOCK",
                            payload: { instanceId: instance.id, blockId: block.id, settings: { [key]: value } },
                          })
                        }
                        styleGuide={state.styleGuide}
                        variables={state.variableContext}
                        siteId={state.siteId}
                      />
                    ) : (
                      <p className="text-[11px] text-white/30 py-2">Initialisation…</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Orphan content: tags no longer on the enterprise. Kept, not rendered. */}
        {orphanBlocks.length > 0 && (
          <p className="mt-3 text-[10px] text-white/30 leading-snug">
            {orphanBlocks.length} fiche(s) de service conservée(s) pour des tags absents de
            l&apos;entreprise — masquée(s) au rendu, restaurée(s) si le tag revient.
          </p>
        )}
      </div>
    </div>
  );
}
