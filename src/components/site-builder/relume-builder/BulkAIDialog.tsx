"use client";

import React from "react";
import { X, Loader2, Check, Sparkles, AlertCircle, RotateCcw } from "lucide-react";
import { ModelDropdown } from "./SitemapWorkspace";
import { useAIModel } from "@/hooks/useAIModel";
import { VariableTextarea } from "./VariableTextarea";
import type { SiteSectionInstance, SiteSectionDef } from "@/types";
import { Btn, ModalBody, ModalFt, ModalHd, ModalShell, Pill } from "./skin-primitives";
import { authedFetch } from "@/utils/authedFetch";

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
          const res = await authedFetch("/api/site-builder/ai/regenerate-section", {
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
            prev.map((r, j) => j === i ? { ...r, after: data.content, loading: false } : r),
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "Erreur";
          setResults((prev) =>
            prev.map((r, j) => j === i ? { ...r, error: message, loading: false } : r),
          );
        }
      }),
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
    <ModalShell open={open} onClose={running ? () => {} : onClose} size="md">
      <ModalHd
        icon={<Sparkles size={14} />}
        iconTone="magic"
        title="Régénération IA groupée"
        subtitle={`${instances.length} section${instances.length !== 1 ? "s" : ""} sélectionnée${instances.length !== 1 ? "s" : ""}`}
        right={<Btn variant="ghost" size="sm" icon onClick={onClose} disabled={running}><X size={13} /></Btn>}
      />

      <div className="ai-box" style={{ margin: "12px 18px 0", borderRadius: 8 }}>
        <div className="ai-box-hd">
          <Sparkles size={12} />
          <span>Prompt IA</span>
          <ModelDropdown value={selectedModel} onChange={setSelectedModel} />
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

      <ModalBody dense>
        {!hasResults && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {instances.map(({ instance, def }) => {
              const fieldCount = Object.keys(instance.content).filter((k) => !k.startsWith("__")).length;
              return (
                <div key={instance.id} className="layer-section" style={{ pointerEvents: "none", padding: "0 12px" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, border: "1.5px solid var(--magic)", background: "var(--magic-tint)", flexShrink: 0 }} />
                  <span className="name">{def?.name ?? "Section"}</span>
                  <Pill>{fieldCount} champ{fieldCount !== 1 ? "s" : ""}</Pill>
                </div>
              );
            })}
          </div>
        )}

        {hasResults && results.map((r) => {
          const tone = r.error ? "danger" : r.loading ? "default" : "ok";
          return (
            <div
              key={r.instanceId}
              style={{
                borderRadius: 8,
                border: `1px solid ${r.error ? "rgba(181,50,47,.22)" : r.loading ? "var(--border-2)" : "rgba(31,138,91,.28)"}`,
                background: r.error ? "rgba(181,50,47,.06)" : r.loading ? "var(--surface-2)" : "rgba(31,138,91,.06)",
                marginBottom: 8,
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                {r.loading ? (
                  <Loader2 size={12} className="animate-spin" style={{ color: "var(--text-3)" }} />
                ) : r.error ? (
                  <AlertCircle size={12} style={{ color: "var(--danger)" }} />
                ) : (
                  <Check size={12} style={{ color: "var(--ok)" }} />
                )}
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{r.name}</span>
                {r.error && <Pill tone="danger">{r.error}</Pill>}
                {!r.loading && !r.error && <Pill tone={tone === "ok" ? "ok" : "default"} >Prêt</Pill>}
              </div>

              {!r.loading && !r.error && r.after && (() => {
                const changedKeys = Object.keys(r.after)
                  .filter((k) => typeof r.after![k] === "string" && r.after![k] !== r.before[k])
                  .slice(0, 4);
                if (changedKeys.length === 0) return (
                  <div style={{ padding: "8px 10px", fontSize: 10, color: "var(--text-4)", fontStyle: "italic" }}>Aucun changement textuel</div>
                );
                return (
                  <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {changedKeys.map((k) => (
                      <div key={k} style={{ fontSize: 10.5 }}>
                        <div style={{ color: "var(--text-3)", fontWeight: 600, fontFamily: "var(--font-mono)" }}>{k}</div>
                        <div style={{ paddingLeft: 8, borderLeft: "2px solid rgba(181,50,47,.45)", color: "var(--danger)", textDecoration: "line-through", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {String(r.before[k] ?? "").slice(0, 120)}
                        </div>
                        <div style={{ paddingLeft: 8, borderLeft: "2px solid var(--ok)", color: "var(--ok)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                          {String(r.after![k]).slice(0, 120)}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </ModalBody>

      <ModalFt>
        {!hasResults ? (
          <>
            <Btn variant="outline" onClick={onClose}>Annuler</Btn>
            <span className="grow" />
            <Btn variant="magic" onClick={handleGenerate} disabled={!prompt.trim()}>
              <Sparkles size={12} />
              Générer pour {instances.length} section{instances.length !== 1 ? "s" : ""}
            </Btn>
          </>
        ) : (
          <>
            <Btn variant="outline" onClick={() => { setResults([]); setApplied(false); }} disabled={running}>
              <RotateCcw size={11} /> Recommencer
            </Btn>
            <span className="grow" />
            <Btn variant="magic" onClick={handleApplyAll} disabled={running || applied || successCount === 0}>
              {applied ? <Check size={12} /> : <Sparkles size={12} />}
              {applied ? "Appliqué !" : `Tout appliquer (${successCount})`}
            </Btn>
          </>
        )}
      </ModalFt>
    </ModalShell>
  );
}
