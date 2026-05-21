"use client";

import React from "react";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  Plus,
  Trash2,
  FlaskConical,
  RotateCcw,
  Layers,
  Tag,
  Box,
  EyeOff,
} from "lucide-react";
import { useRelumeBuilder } from "./RelumeBuilderProvider";
import { useServiceTags } from "@/hooks/useServiceTags";
import { DynamicSectionRenderer } from "../DynamicSectionRenderer";
import { PropertiesPanel } from "./PropertiesPanel";
import { AdaptiveSectionContentPanel } from "./AdaptiveSectionContentPanel";
import { Btn, Pane } from "./skin-primitives";
import type { SiteSectionDef } from "@/types";

interface StatItem {
  label: string;
  value: string;
  display_order?: number;
}

function eq<T>(a: T, b: T): boolean {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function parseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch { return []; }
}

/**
 * Contenu workspace — edits the content of each section's blocks and lets
 * the user tag blocks/pages with a `service_tag` to control which enterprises
 * see them. Mirrors the three-column shape of DesignWorkspace (sections list,
 * live preview, right properties pane) plus a topbar tag simulator.
 */
export function ContentWorkspace({
  enterpriseId,
}: {
  enterpriseId: number | undefined;
}) {
  const { state, dispatch } = useRelumeBuilder();
  const variables = state.variableContext;
  const availableTags = useServiceTags();

  // Real tags = the enterprise's actual tags, captured at mount/enterprise change.
  const [realTags, setRealTags] = React.useState<string[]>(() => parseTags(variables.__service_tags));
  // Simulated tags = override applied via the topbar chips. null = use real.
  const [simulatedTags, setSimulatedTags] = React.useState<string[] | null>(null);

  // When the enterprise changes upstream (different __service_tags in the
  // context), recapture the real tags and drop any active simulation.
  const prevEnterpriseId = React.useRef<number | undefined>(enterpriseId);
  if (prevEnterpriseId.current !== enterpriseId) {
    prevEnterpriseId.current = enterpriseId;
    const nextRealTags = parseTags(variables.__service_tags);
    if (!eq(nextRealTags, realTags)) setRealTags(nextRealTags);
    if (simulatedTags !== null) setSimulatedTags(null);
  }

  const activeTags = simulatedTags ?? realTags;

  function applyTags(tags: string[]) {
    dispatch({
      type: "SET_VARIABLE_CONTEXT",
      payload: { ...state.variableContext, __service_tags: JSON.stringify(tags) },
    });
  }
  function toggleSimTag(tag: string) {
    const base = simulatedTags ?? realTags;
    const next = base.includes(tag) ? base.filter((t) => t !== tag) : [...base, tag];
    setSimulatedTags(next);
    applyTags(next);
  }
  function clearSimulation() {
    setSimulatedTags(null);
    applyTags(realTags);
  }

  // ── Stats (enterprise key figures) ────────────────────────────────────────
  const [stats, setStats] = React.useState<StatItem[]>([]);
  const [statsSnapshot, setStatsSnapshot] = React.useState<StatItem[]>([]);
  const [statsLoading, setStatsLoading] = React.useState(false);
  const [savingStats, setSavingStats] = React.useState(false);

  React.useEffect(() => {
    if (!enterpriseId) {
      setStats([]); setStatsSnapshot([]); return;
    }
    let cancelled = false;
    setStatsLoading(true);
    fetch(`/api/entreprises/${enterpriseId}/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { stats?: StatItem[] } | null) => {
        if (cancelled) return;
        const s = data?.stats ?? [];
        setStats(s); setStatsSnapshot(s);
      })
      .finally(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, [enterpriseId]);

  const statsDirty = !eq(stats, statsSnapshot);

  async function saveStats() {
    if (!enterpriseId) return;
    setSavingStats(true);
    try {
      const res = await fetch(`/api/entreprises/${enterpriseId}/stats`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stats }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { stats: StatItem[] };
      setStats(data.stats);
      setStatsSnapshot(data.stats);
      toast.success("Chiffres clés enregistrés");
      // Push the new stats into variables so previews refresh.
      dispatch({
        type: "SET_VARIABLE_CONTEXT",
        payload: { ...state.variableContext, __stats: JSON.stringify(data.stats) },
      });
    } catch (err) {
      console.error(err);
      toast.error("Échec de l'enregistrement");
    } finally {
      setSavingStats(false);
    }
  }

  // ── Page / instance navigation ────────────────────────────────────────────
  const pageInstanceIds = state.instancesByPage[state.activePage] ?? [];
  const selectedInstance = state.selectedInstanceId
    ? state.instances[state.selectedInstanceId]
    : null;
  const selectedIsAdaptive = !!selectedInstance?.section_def?.is_tag_adaptive;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", flex: 1, minHeight: 0, position: "relative" }}>

      {/* ─ Left: pages + sections + stats ───────────────────────────────── */}
      <aside className="pane" style={{ width: 280, flexShrink: 0, overflowY: "auto" }}>
        <div className="pane-hd contextual">
          <div className="title-with-icon">
            <Layers size={12} style={{ color: "var(--text-3)" }} />
            <span>Contenu</span>
          </div>
        </div>
        <div className="pane-body" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 12 }}>

          {/* Page picker */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Page
            </div>
            <select
              value={state.activePage}
              onChange={(e) => dispatch({ type: "SET_ACTIVE_PAGE", payload: e.target.value })}
              style={{ width: "100%", fontSize: 12, padding: "6px 8px", border: "1px solid var(--line-1)", borderRadius: 6 }}
            >
              {state.sitemap.map((p) => {
                const filtered = !!(p.service_tag && !activeTags.includes(p.service_tag));
                return (
                  <option key={p.id} value={p.slug}>
                    {p.title}{p.service_tag ? ` · ${p.service_tag}` : ""}{filtered ? " (cachée)" : ""}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Section list of active page */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
              Sections ({pageInstanceIds.length})
            </div>
            {pageInstanceIds.length === 0 ? (
              <p style={{ fontSize: 11, color: "var(--text-3)", fontStyle: "italic", margin: 0 }}>
                Aucune section. Ajoutez-en depuis le Wireframe.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {pageInstanceIds.map((id) => {
                  const inst = state.instances[id];
                  if (!inst) return null;
                  const isSel = state.selectedInstanceId === id;
                  const name = inst.section_def?.name ?? "Section";
                  const adaptive = !!inst.section_def?.is_tag_adaptive;
                  const idx = pageInstanceIds.indexOf(id);
                  return (
                    <button
                      key={id}
                      onClick={() => dispatch({ type: "SELECT_INSTANCE", payload: id })}
                      style={{
                        textAlign: "left",
                        fontSize: 12,
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: "1px solid",
                        borderColor: isSel ? "var(--brand)" : "var(--line-1)",
                        background: isSel ? "var(--brand-bg)" : "transparent",
                        color: isSel ? "var(--brand-text)" : "var(--text-2)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-4)", flexShrink: 0 }}>
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <Box size={11} />
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                      {inst.is_hidden && <EyeOff size={10} />}
                      {adaptive && (
                        <span
                          style={{
                            fontSize: 9,
                            padding: "1px 5px",
                            borderRadius: 999,
                            background: "rgba(122,90,224,0.16)",
                            color: "var(--magic, #7A5AE0)",
                          }}
                          title="Section adaptative aux services"
                        >
                          <Tag size={8} style={{ display: "inline", marginRight: 2 }} />
                          Adaptative
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Stats editor (enterprise-scoped) */}
          <Pane>
            <div style={{ padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <h3 style={{ margin: 0, fontSize: 12, fontWeight: 600 }}>Chiffres clés</h3>
                <Btn onClick={() => setStats((s) => [...s, { label: "", value: "" }])} style={{ padding: "2px 6px", fontSize: 10 }}>
                  <Plus size={10} /> Ajouter
                </Btn>
              </div>
              <p style={{ margin: "0 0 8px", fontSize: 10, color: "var(--text-3)" }}>
                Stockés sur l&apos;entreprise, injectés dans les sections « stats ».
              </p>
              {statsLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : stats.length === 0 ? (
                <p style={{ fontSize: 11, color: "var(--text-3)", fontStyle: "italic", margin: 0 }}>
                  Aucun chiffre clé.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {stats.map((s, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr 22px", gap: 5, alignItems: "center" }}>
                      <input
                        value={s.value}
                        onChange={(e) => setStats((arr) => arr.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                        placeholder="500"
                        style={{ fontSize: 11, padding: "3px 6px", border: "1px solid var(--line-1)", borderRadius: 4 }}
                      />
                      <input
                        value={s.label}
                        onChange={(e) => setStats((arr) => arr.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                        placeholder="clients satisfaits"
                        style={{ fontSize: 11, padding: "3px 6px", border: "1px solid var(--line-1)", borderRadius: 4 }}
                      />
                      <button
                        onClick={() => setStats((arr) => arr.filter((_, j) => j !== i))}
                        style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 2 }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Btn
                variant="primary"
                onClick={saveStats}
                disabled={savingStats || !statsDirty || !enterpriseId}
                style={{ marginTop: 8, width: "100%", justifyContent: "center", fontSize: 11 }}
              >
                {savingStats ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                {statsDirty ? "Enregistrer" : "À jour"}
              </Btn>
            </div>
          </Pane>
        </div>
      </aside>

      {/* ─ Center: tag simulator + scrollable preview ─────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <TagSimulatorBar
          availableTags={availableTags}
          realTags={realTags}
          activeTags={activeTags}
          isSimulating={simulatedTags !== null}
          onToggle={toggleSimTag}
          onClear={clearSimulation}
        />
        <div style={{ flex: 1, overflowY: "auto", background: state.styleGuide.colors.background }}>
          {pageInstanceIds.length === 0 ? (
            <div style={{ padding: 80, textAlign: "center", color: "#9ca3af" }}>
              Aucune section sur cette page.
            </div>
          ) : (
            <div>
              {pageInstanceIds.map((id) => {
                const inst = state.instances[id];
                if (!inst) return null;
                const secDef: SiteSectionDef | null = inst.section_def ?? null;
                if (!secDef) return null;
                const isSel = state.selectedInstanceId === id;
                return (
                  <div key={id} style={{ position: "relative", outline: isSel ? "2px solid var(--brand, #3b82f6)" : undefined }}>
                    <DynamicSectionRenderer
                      instance={inst}
                      sectionDef={secDef}
                      styleGuide={state.styleGuide}
                      menus={state.menus}
                      variables={state.variableContext}
                      editorMode
                      selected={isSel}
                      onSelect={() => dispatch({ type: "SELECT_INSTANCE", payload: id })}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─ Right: properties — adaptive sections get a dedicated editor ───── */}
      <aside
        className="pane"
        style={{ width: 320, flexShrink: 0, overflow: "hidden", display: "flex", flexDirection: "column", background: "#171717" }}
      >
        {selectedInstance && selectedIsAdaptive ? (
          <>
            <div className="pane-hd contextual" style={{ background: "#171717", borderColor: "rgba(255,255,255,0.08)" }}>
              <div className="title-with-icon" style={{ color: "rgba(255,255,255,0.85)" }}>
                <Tag size={12} style={{ color: "var(--magic, #7A5AE0)" }} />
                <span>{selectedInstance.section_def?.name ?? "Section"} · adaptative</span>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", color: "#fff" }}>
              <AdaptiveSectionContentPanel instance={selectedInstance} />
            </div>
          </>
        ) : (
          <PropertiesPanel />
        )}
      </aside>
    </div>
  );
}

function TagSimulatorBar({
  availableTags,
  realTags,
  activeTags,
  isSimulating,
  onToggle,
  onClear,
}: {
  availableTags: string[];
  realTags: string[];
  activeTags: string[];
  isSimulating: boolean;
  onToggle: (tag: string) => void;
  onClear: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderBottom: "1px solid var(--line-1)",
        background: "var(--surface)",
        flexShrink: 0,
      }}
    >
      <FlaskConical size={13} style={{ color: "var(--text-3)" }} />
      <span style={{ fontSize: 11, color: "var(--text-2)", fontWeight: 500 }}>Simuler tags :</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1, minWidth: 0 }}>
        {availableTags.length === 0 && (
          <span style={{ fontSize: 11, color: "var(--text-3)" }}>aucun tag disponible</span>
        )}
        {availableTags.map((tag) => {
          const on = activeTags.includes(tag);
          const isReal = realTags.includes(tag);
          return (
            <button
              key={tag}
              onClick={() => onToggle(tag)}
              title={isReal ? "Tag présent sur l'entreprise" : "Tag simulé uniquement"}
              style={{
                fontSize: 11,
                padding: "3px 9px",
                borderRadius: 999,
                border: "1px solid var(--line-1)",
                background: on ? "var(--brand-bg, #dbeafe)" : "transparent",
                color: on ? "var(--brand-text, #1e40af)" : "var(--text-2)",
                cursor: "pointer",
                fontStyle: isReal ? "normal" : "italic",
              }}
            >
              {tag}
            </button>
          );
        })}
      </div>
      {isSimulating && (
        <button
          onClick={onClear}
          style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
        >
          <RotateCcw size={11} /> Tags réels
        </button>
      )}
    </div>
  );
}
