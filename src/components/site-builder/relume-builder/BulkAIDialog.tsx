"use client";

import React from "react";
import { X, Loader2, Check, Sparkles, AlertCircle, RotateCcw } from "lucide-react";
import { ModelDropdown } from "./SitemapWorkspace";
import { useAIModel } from "@/hooks/useAIModel";
import { VariableTextarea } from "./VariableTextarea";
import type { SiteSectionInstance, SiteSectionDef } from "@/types";

interface BulkResult {
  instanceId: string;
  name: string;
  before: Record<string, unknown>;
  after: Record<string, unknown> | null;
  error: string | null;
  loading: boolean;
}

interface BulkAIDialogProps {
  open: boolean;
  onClose: () => void;
  instances: Array<{ instance: SiteSectionInstance; def: SiteSectionDef | null }>;
  onApplyAll: (updates: Array<{ id: string; content: Record<string, unknown> }>) => void;
  variableContext?: Record<string, string>;
}

export function BulkAIDialog({ open, onClose, instances, onApplyAll, variableContext }: BulkAIDialogProps) {
  const [selectedModel, setSelectedModel] = useAIModel();
  const [prompt, setPrompt] = React.useState("");
  const [results, setResults] = React.useState<BulkResult[]>([]);
  const [running, setRunning] = React.useState(false);
  const [applied, setApplied] = React.useState(false);

  if (!open) return null;

  const hasResults = results.length > 0;
  const successCount = results.filter((r) => r.after !== null && !r.error).length;

  const handleGenerate = async () => {
    setRunning(true);
    setApplied(false);

    const initial: BulkResult[] = instances.map(({ instance, def }) => ({
      instanceId: instance.id,
      name: def?.name ?? "Section",
      before: instance.content,
      after: null,
      error: null,
      loading: true,
    }));
    setResults(initial);

    await Promise.all(
      instances.map(async ({ instance, def }, i) => {
        try {
          const res = await fetch("/api/site-builder/ai/regenerate-section", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              siteId: instance.site_id,
              instanceId: instance.id,
              sectionType: def?.type ?? "generic",
              currentContent: instance.content,
              defaultContent: def?.default_content ?? {},
              prompt: prompt.trim() || undefined,
              model: selectedModel,
              variableContext,
            }),
          });
          if (!res.ok) throw new Error(`Erreur ${res.status}`);
          const data = await res.json() as { content: Record<string, unknown> };
          setResults((prev) =>
            prev.map((r, j) => j === i ? { ...r, after: data.content, loading: false } : r)
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "Erreur";
          setResults((prev) =>
            prev.map((r, j) => j === i ? { ...r, error: message, loading: false } : r)
          );
        }
      })
    );

    setRunning(false);
  };

  const handleApplyAll = () => {
    const updates = results
      .filter((r) => r.after !== null && !r.error)
      .map((r) => ({ id: r.instanceId, content: r.after! }));
    onApplyAll(updates);
    setApplied(true);
    setTimeout(onClose, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={running ? undefined : onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl flex flex-col mx-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <Sparkles size={15} className="text-purple-500" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Régénération IA groupée</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {instances.length} section{instances.length !== 1 ? "s" : ""} sélectionnée{instances.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={running}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Prompt area */}
        <div className="px-6 py-4 border-b border-gray-100 space-y-3">
          <div className="flex items-center gap-2">
            <ModelDropdown value={selectedModel} onChange={setSelectedModel} />
            <span className="text-xs text-gray-400">Appliqué à toutes les sections</span>
          </div>
          <VariableTextarea
            value={prompt}
            onChange={setPrompt}
            placeholder="Ex: Rends le contenu plus dynamique et orienté conversion. Utilise un ton professionnel."
            rows={3}
            variables={variableContext}
            autoFocus={!hasResults}
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 min-h-0">
          {!hasResults && (
            <div className="space-y-2">
              {instances.map(({ instance, def }) => {
                const fieldCount = Object.keys(instance.content).filter((k) => !k.startsWith("__")).length;
                return (
                  <div key={instance.id} className="flex items-center gap-2.5 p-2.5 bg-gray-50 rounded-lg">
                    <div className="w-5 h-5 rounded border-2 border-gray-200 flex-shrink-0" />
                    <span className="text-xs font-medium text-gray-700">{def?.name ?? "Section"}</span>
                    <span className="text-[10px] text-gray-400 ml-auto">{fieldCount} champ{fieldCount !== 1 ? "s" : ""}</span>
                  </div>
                );
              })}
            </div>
          )}

          {hasResults && results.map((r) => (
            <div
              key={r.instanceId}
              className={`rounded-xl border overflow-hidden ${
                r.error ? "border-red-200 bg-red-50" :
                r.loading ? "border-gray-200 bg-gray-50" :
                "border-green-200 bg-green-50/40"
              }`}
            >
              <div className="flex items-center gap-2 px-3 py-2 border-b border-black/5">
                {r.loading ? (
                  <Loader2 size={12} className="animate-spin text-gray-400 flex-shrink-0" />
                ) : r.error ? (
                  <AlertCircle size={12} className="text-red-500 flex-shrink-0" />
                ) : (
                  <Check size={12} className="text-green-600 flex-shrink-0" />
                )}
                <span className="text-xs font-semibold text-gray-700">{r.name}</span>
                {r.error && <span className="text-[10px] text-red-500 ml-auto">{r.error}</span>}
                {!r.loading && !r.error && (
                  <span className="text-[10px] text-green-600 ml-auto">Prêt</span>
                )}
              </div>

              {!r.loading && !r.error && r.after && (() => {
                const changedKeys = Object.keys(r.after)
                  .filter((k) => typeof r.after![k] === "string" && r.after![k] !== r.before[k])
                  .slice(0, 4);
                if (changedKeys.length === 0) return (
                  <div className="px-3 py-2 text-[10px] text-gray-400 italic">Aucun changement textuel</div>
                );
                return (
                  <div className="px-3 py-2 space-y-2">
                    {changedKeys.map((k) => (
                      <div key={k} className="text-[10px] space-y-0.5">
                        <span className="text-gray-500 font-semibold">{k}</span>
                        <div className="pl-2 border-l-2 border-red-300 text-red-600 line-through truncate">
                          {String(r.before[k] ?? "").slice(0, 100)}
                        </div>
                        <div className="pl-2 border-l-2 border-green-500 text-green-700 truncate">
                          {String(r.after![k]).slice(0, 100)}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-3">
          {!hasResults ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                <Sparkles size={13} />
                Générer pour {instances.length} section{instances.length !== 1 ? "s" : ""}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setResults([]); setApplied(false); }}
                disabled={running}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                <RotateCcw size={12} />
                Recommencer
              </button>
              <button
                onClick={handleApplyAll}
                disabled={running || applied || successCount === 0}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {applied ? <Check size={13} /> : <Sparkles size={13} />}
                {applied ? "Appliqué !" : `Tout appliquer (${successCount})`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
