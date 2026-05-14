"use client";

import React from "react";
import { Plus, Trash2, Eye, EyeOff, GripVertical } from "lucide-react";
import type { SiteSectionDef } from "@/types";
import { DynamicSectionRenderer } from "../DynamicSectionRenderer";
import { useRelumeBuilder } from "./RelumeBuilderProvider";
import AnimatedSection from "../AnimatedSection";
import type { SectionAnimation } from "@/types";

interface RelumeCanvasProps {
  sectionDefs: Record<string, SiteSectionDef>;
  onAddSection?: () => void;
}

export function RelumeCanvas({ sectionDefs, onAddSection }: RelumeCanvasProps) {
  const { state, dispatch } = useRelumeBuilder();
  const pageInstanceIds = state.instancesByPage[state.activePage] ?? [];

  const deviceWidth = state.deviceView === "mobile" ? "390px" : "100%";

  return (
    <div
      className="flex-1 overflow-y-auto bg-[#141416] flex flex-col items-center"
      style={{ minHeight: 0 }}
      onClick={() => dispatch({ type: "SELECT_INSTANCE", payload: null })}
    >
      {/* Device frame */}
      <div
        className="relative transition-all duration-300 w-full flex flex-col"
        style={{
          maxWidth: deviceWidth,
          minHeight: "100%",
          backgroundColor: state.styleGuide.colors.background,
        }}
      >
        {pageInstanceIds.length === 0 ? (
          <EmptyCanvas onAddSection={onAddSection} />
        ) : (
          <div className="flex flex-col">
            {pageInstanceIds.map((instanceId, idx) => {
              const instance = state.instances[instanceId];
              if (!instance) return null;
              const sectionDef = instance.section_def ?? (instance.section_id ? sectionDefs[instance.section_id] : null);
              if (!sectionDef) return null;

              const isSelected = state.selectedInstanceId === instanceId;

              return (
                <CanvasSectionWrapper
                  key={instanceId}
                  instanceId={instanceId}
                  isSelected={isSelected}
                  idx={idx}
                  total={pageInstanceIds.length}
                >
                  <AnimatedSection
                    animation={
                      (instance.content?.__animation_type as SectionAnimation) ??
                      state.styleGuide.animations?.defaultType ??
                      "none"
                    }
                    duration={
                      (instance.content?.__animation_duration as number) ??
                      state.styleGuide.animations?.defaultDuration ??
                      600
                    }
                    delay={
                      (instance.content?.__animation_delay as number) ??
                      state.styleGuide.animations?.defaultDelay ??
                      0
                    }
                    easing={
                      (instance.content?.__animation_easing as string) ??
                      state.styleGuide.animations?.defaultEasing ??
                      "ease-out"
                    }
                  >
                    <DynamicSectionRenderer
                      instance={{ ...instance, section_def: sectionDef }}
                      sectionDef={sectionDef}
                      styleGuide={state.styleGuide}
                      editorMode={true}
                      selected={isSelected}
                      onSelect={() => dispatch({ type: "SELECT_INSTANCE", payload: instanceId })}
                      selectedSnippetId={isSelected ? state.selectedSnippetId : null}
                      onSelectSnippet={(id) => dispatch({ type: "SELECT_SNIPPET", payload: id })}
                    />
                  </AnimatedSection>
                </CanvasSectionWrapper>
              );
            })}
          </div>
        )}

        {/* Add section button at bottom */}
        <div className="py-6 flex justify-center">
          <button
            onClick={(e) => { e.stopPropagation(); onAddSection?.(); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-dashed border-white/20 hover:border-blue-500/40 text-white/40 hover:text-white/70 rounded-lg text-sm transition-all"
          >
            <Plus size={16} />
            Ajouter une section
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Section Wrapper (editor chrome) ─────────────────────────────────────────

function CanvasSectionWrapper({
  instanceId,
  isSelected,
  idx,
  total,
  children,
}: {
  instanceId: string;
  isSelected: boolean;
  idx: number;
  total: number;
  children: React.ReactNode;
}) {
  const { state, dispatch } = useRelumeBuilder();
  const instance = state.instances[instanceId];
  const [hovered, setHovered] = React.useState(false);

  if (!instance) return null;

  const showChrome = hovered || isSelected;

  return (
    <div
      className="relative group/canvas-section"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        dispatch({ type: "SELECT_INSTANCE", payload: instanceId });
      }}
      style={{
        outline: isSelected ? "2px solid #3b82f6" : hovered ? "2px solid #3b82f650" : "2px solid transparent",
        outlineOffset: "-2px",
      }}
    >
      {children}

      {/* Hover/selected toolbar */}
      {showChrome && (
        <div
          className="absolute top-2 right-2 flex items-center gap-1 z-30"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center bg-[#1a1a1e]/90 backdrop-blur-sm border border-white/10 rounded-lg overflow-hidden shadow-lg">
            <button
              onClick={() => dispatch({ type: "REORDER_INSTANCES", payload: { pageSlug: instance.page_slug, fromIndex: idx, toIndex: idx - 1 } })}
              disabled={idx === 0}
              className="px-2 py-1.5 text-white/50 hover:text-white/90 hover:bg-white/5 transition-colors disabled:opacity-30 text-xs"
              title="Monter"
            >
              ↑
            </button>
            <button
              onClick={() => dispatch({ type: "REORDER_INSTANCES", payload: { pageSlug: instance.page_slug, fromIndex: idx, toIndex: idx + 1 } })}
              disabled={idx === total - 1}
              className="px-2 py-1.5 text-white/50 hover:text-white/90 hover:bg-white/5 transition-colors disabled:opacity-30 text-xs border-l border-white/10"
              title="Descendre"
            >
              ↓
            </button>
            <button
              onClick={() => dispatch({ type: "TOGGLE_INSTANCE_VISIBILITY", payload: instanceId })}
              className="px-2 py-1.5 text-white/50 hover:text-white/90 hover:bg-white/5 transition-colors border-l border-white/10"
              title={instance.is_hidden ? "Afficher" : "Masquer"}
            >
              {instance.is_hidden ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
            <button
              onClick={() => dispatch({ type: "REMOVE_INSTANCE", payload: instanceId })}
              className="px-2 py-1.5 text-red-400/70 hover:text-red-400 hover:bg-red-500/5 transition-colors border-l border-white/10"
              title="Supprimer"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Section label (when selected) */}
      {isSelected && (
        <div
          className="absolute top-0 left-0 z-30 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-br font-medium"
          style={{ lineHeight: "1.5" }}
        >
          {instance.section_def?.name ?? "Section"}
        </div>
      )}
    </div>
  );
}

// ─── Empty Canvas ──────────────────────────────────────────────────────────────

function EmptyCanvas({ onAddSection }: { onAddSection?: () => void }) {
  const { dispatch } = useRelumeBuilder();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
        <Plus size={24} className="text-white/30" />
      </div>
      <h3 className="text-white/60 font-medium mb-2">Page vide</h3>
      <p className="text-white/30 text-sm mb-6 max-w-xs">
        Ajoutez des sections depuis la bibliothèque ou utilisez l'IA pour générer le site complet.
      </p>
      <div className="flex gap-3">
        <button
          onClick={onAddSection}
          className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white/70 hover:text-white text-sm rounded-lg transition-all border border-white/10"
        >
          Ajouter une section
        </button>
        <button
          onClick={() => dispatch({ type: "TOGGLE_AI_PANEL" })}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-all"
        >
          ✨ Générer avec l'IA
        </button>
      </div>
    </div>
  );
}
