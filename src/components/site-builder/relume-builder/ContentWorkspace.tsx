"use client";

import React from "react";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  FlaskConical,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import { useRelumeBuilder } from "./RelumeBuilderProvider";
import { SimpleImagePicker } from "@/components/services-content/SimpleImagePicker";
import { Btn, Pane } from "./skin-primitives";

interface ServiceTagDefault {
  id: string;
  service_tag: string;
  slug: string;
  display_label: string | null;
  icon: string | null;
  headline_template: string | null;
  subheadline_template: string | null;
  description_template: string | null;
  trust_title_template: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_href: string | null;
}

interface ServiceOverride {
  label?: string;
  headline_template?: string;
  subheadline_template?: string;
  description_template?: string;
  trust_title_template?: string;
  image_url?: string;
  cta_label?: string;
  cta_href?: string;
  is_active?: boolean;
}

interface StatItem {
  label: string;
  value: string;
  display_order?: number;
}

interface ContentOverrides {
  services?: Record<string, ServiceOverride>;
  stats?: StatItem[];
}

/** Quick deep-ish compare for our simple POJOs */
function eq<T>(a: T, b: T): boolean {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function parseVarArray<T>(raw: string | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch { return []; }
}

function parseVarObject<T extends Record<string, unknown>>(raw: string | undefined): T {
  if (!raw) return {} as T;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as T;
    return {} as T;
  } catch { return {} as T; }
}

export function ContentWorkspace({
  enterpriseId,
}: {
  enterpriseId: number | undefined;
}) {
  const { state, dispatch } = useRelumeBuilder();
  const siteId = state.siteId;
  const variables = state.variableContext;

  const enterpriseTags = React.useMemo(
    () => parseVarArray<string>(variables.__service_tags),
    [variables.__service_tags],
  );
  const defaults = React.useMemo(
    () => parseVarObject<Record<string, ServiceTagDefault>>(variables.__service_tag_defaults),
    [variables.__service_tag_defaults],
  );

  // Per-site overrides (services keyed by slug, stats array).
  const [overrides, setOverrides] = React.useState<ContentOverrides>({});
  const [overridesSnapshot, setOverridesSnapshot] = React.useState<ContentOverrides>({});
  const [stats, setStats] = React.useState<StatItem[]>([]);
  const [statsSnapshot, setStatsSnapshot] = React.useState<StatItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingOverrides, setSavingOverrides] = React.useState(false);
  const [savingStats, setSavingStats] = React.useState(false);
  const [expandedSlug, setExpandedSlug] = React.useState<string | null>(null);

  // ── Tag simulation ────────────────────────────────────────────────────────
  // When non-null, replaces __service_tags in the global variable context so
  // the Wireframe preview shows the section as if the enterprise had these
  // tags. Cleared automatically when the user changes enterprise.
  const [simulatedTags, setSimulatedTags] = React.useState<string[] | null>(null);
  React.useEffect(() => {
    setSimulatedTags(null);
  }, [enterpriseId]);

  // Initial load of overrides + stats from the API.
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const tasks: Array<Promise<unknown>> = [
      fetch(`/api/site-builder/sites/${siteId}/content-overrides`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { content_overrides?: ContentOverrides } | null) => {
          if (cancelled) return;
          const ov = data?.content_overrides ?? {};
          setOverrides(ov);
          setOverridesSnapshot(ov);
        }),
    ];
    if (enterpriseId) {
      tasks.push(
        fetch(`/api/entreprises/${enterpriseId}/stats`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data: { stats?: StatItem[] } | null) => {
            if (cancelled) return;
            const s = data?.stats ?? [];
            setStats(s);
            setStatsSnapshot(s);
          }),
      );
    } else {
      setStats([]);
      setStatsSnapshot([]);
    }
    Promise.all(tasks).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [siteId, enterpriseId]);

  const overridesDirty = !eq(overrides, overridesSnapshot);
  const statsDirty = !eq(stats, statsSnapshot);

  // The tags actually shown in the right panel: simulated or real.
  const displayedTags = simulatedTags ?? enterpriseTags;

  // ── Persist helpers ───────────────────────────────────────────────────────
  async function saveOverrides() {
    setSavingOverrides(true);
    try {
      const res = await fetch(`/api/site-builder/sites/${siteId}/content-overrides`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: overrides.services ?? {} }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { content_overrides: ContentOverrides };
      setOverrides(data.content_overrides);
      setOverridesSnapshot(data.content_overrides);
      toast.success("Contenus enregistrés");
      // Re-fetch variables so the preview reflects the new overrides.
      refreshVariables();
    } catch (err) {
      console.error(err);
      toast.error("Échec de l'enregistrement");
    } finally {
      setSavingOverrides(false);
    }
  }

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
      refreshVariables();
    } catch (err) {
      console.error(err);
      toast.error("Échec de l'enregistrement");
    } finally {
      setSavingStats(false);
    }
  }

  function refreshVariables() {
    if (!enterpriseId) return;
    const params = new URLSearchParams({ enterprise: String(enterpriseId) });
    if (siteId) params.set("site", siteId);
    fetch(`/api/site-builder/variables?${params.toString()}`)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (data && typeof data === "object" && !Array.isArray(data)) {
          dispatch({ type: "SET_VARIABLE_CONTEXT", payload: data as Record<string, string> });
        }
      })
      .catch(() => {});
  }

  // ── Simulation handlers ───────────────────────────────────────────────────
  function applySimulation(tags: string[]) {
    setSimulatedTags(tags);
    dispatch({
      type: "SET_VARIABLE_CONTEXT",
      payload: { ...variables, __service_tags: JSON.stringify(tags) },
    });
  }

  function clearSimulation() {
    setSimulatedTags(null);
    dispatch({
      type: "SET_VARIABLE_CONTEXT",
      payload: { ...variables, __service_tags: JSON.stringify(enterpriseTags) },
    });
  }

  function toggleSimTag(tag: string) {
    const current = simulatedTags ?? enterpriseTags;
    const next = current.includes(tag)
      ? current.filter((t) => t !== tag)
      : [...current, tag];
    applySimulation(next);
  }

  // ── Overrides mutation helpers ────────────────────────────────────────────
  function updateOverride(slug: string, patch: Partial<ServiceOverride>) {
    setOverrides((prev) => {
      const services = { ...(prev.services ?? {}) };
      services[slug] = { ...(services[slug] ?? {}), ...patch };
      return { ...prev, services };
    });
  }
  function clearOverride(slug: string) {
    setOverrides((prev) => {
      const services = { ...(prev.services ?? {}) };
      delete services[slug];
      return { ...prev, services };
    });
  }

  // All known service tags (entreprise + global defaults — useful to simulate
  // an entreprise that doesn't yet have a tag in DB).
  const allKnownTags = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of enterpriseTags) set.add(t);
    for (const k of Object.keys(defaults)) set.add(k);
    return Array.from(set).sort();
  }, [enterpriseTags, defaults]);

  return (
    <div style={{ display: "flex", flex: "1 1 auto", minHeight: 0, overflow: "hidden", gap: 16, padding: 16 }}>
      {/* ── LEFT: simulator + stats ─────────────────────────────────────── */}
      <div style={{ width: 360, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", minHeight: 0 }}>
        <Pane>
          <div style={{ padding: 12 }}>
            <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <FlaskConical size={14} /> Simuler les services
            </h3>
            <p style={{ margin: "6px 0 10px", fontSize: 11, color: "var(--text-3)", lineHeight: 1.4 }}>
              Cochez les tags pour prévisualiser comment le site s&apos;affiche avec ces services. Bascule vers l&apos;onglet <em>Wireframe</em> pour voir le rendu.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {allKnownTags.length === 0 && (
                <span style={{ fontSize: 11, color: "var(--text-3)" }}>Aucun tag disponible.</span>
              )}
              {allKnownTags.map((tag) => {
                const active = (simulatedTags ?? enterpriseTags).includes(tag);
                const isReal = enterpriseTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleSimTag(tag)}
                    title={isReal ? "Tag présent sur cette entreprise" : "Tag uniquement simulé"}
                    style={{
                      fontSize: 11,
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: "1px solid var(--line-1)",
                      background: active ? "var(--brand-bg)" : "transparent",
                      color: active ? "var(--brand-text)" : "var(--text-2)",
                      cursor: "pointer",
                      fontStyle: isReal ? "normal" : "italic",
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            {simulatedTags && (
              <button
                onClick={clearSimulation}
                style={{ marginTop: 10, fontSize: 11, color: "var(--text-3)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                <RotateCcw size={11} /> Revenir aux tags réels
              </button>
            )}
          </div>
        </Pane>

        <Pane>
          <div style={{ padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Chiffres clés</h3>
              <Btn
                onClick={() => setStats((s) => [...s, { label: "", value: "" }])}
                style={{ padding: "2px 6px", fontSize: 11 }}
              >
                <Plus size={11} /> Ajouter
              </Btn>
            </div>
            <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--text-3)" }}>
              Stockés sur l&apos;entreprise (réutilisés sur tous ses sites).
            </p>
            {stats.length === 0 ? (
              <p style={{ fontSize: 11, color: "var(--text-3)", fontStyle: "italic" }}>
                Aucun chiffre clé. Ajoutez-en pour les sections « stats ».
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {stats.map((s, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "70px 1fr 22px", gap: 6, alignItems: "center" }}>
                    <input
                      value={s.value}
                      onChange={(e) => setStats((arr) => arr.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                      placeholder="500"
                      style={{ fontSize: 12, padding: "4px 6px", border: "1px solid var(--line-1)", borderRadius: 4 }}
                    />
                    <input
                      value={s.label}
                      onChange={(e) => setStats((arr) => arr.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                      placeholder="clients satisfaits"
                      style={{ fontSize: 12, padding: "4px 6px", border: "1px solid var(--line-1)", borderRadius: 4 }}
                    />
                    <button
                      onClick={() => setStats((arr) => arr.filter((_, j) => j !== i))}
                      style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 2 }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Btn
              variant="primary"
              onClick={saveStats}
              disabled={savingStats || !statsDirty || !enterpriseId}
              style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
            >
              {savingStats ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {statsDirty ? "Enregistrer" : "À jour"}
            </Btn>
          </div>
        </Pane>
      </div>

      {/* ── RIGHT: service overrides per tag ─────────────────────────────── */}
      <div style={{ flex: "1 1 auto", display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Contenu par service</h2>
            <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-3)" }}>
              Override locale du contenu par défaut pour chaque service de l&apos;entreprise.{" "}
              <a href="/services-content" target="_blank" style={{ color: "var(--brand)", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: 3 }}>
                Modifier les défauts globaux <ExternalLink size={10} />
              </a>
            </p>
          </div>
          <Btn
            variant="primary"
            onClick={saveOverrides}
            disabled={savingOverrides || !overridesDirty}
          >
            {savingOverrides ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {overridesDirty ? "Enregistrer les overrides" : "À jour"}
          </Btn>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : displayedTags.length === 0 ? (
          <Pane>
            <div style={{ padding: 16, fontSize: 12, color: "var(--text-3)" }}>
              Aucun service-tag sur cette entreprise. Ajoutez des tags dans la fiche entreprise, ou simulez-en via le panneau de gauche pour tester l&apos;affichage.
            </div>
          </Pane>
        ) : (
          <div style={{ flex: "1 1 auto", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            {displayedTags.map((tag) => {
              const def = defaults[tag];
              const slug = def?.slug ?? tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
              const ov = overrides.services?.[slug] ?? {};
              const open = expandedSlug === slug;
              const hasOverride = Object.keys(ov).length > 0;
              const isSimOnly = !enterpriseTags.includes(tag);
              return (
                <Pane key={tag}>
                  <div style={{ padding: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={() => setExpandedSlug(open ? null : slug)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}
                      >
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                          {def?.display_label ?? tag}
                          {hasOverride && (
                            <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "var(--brand-bg)", color: "var(--brand-text)" }}>
                              override
                            </span>
                          )}
                          {isSimOnly && (
                            <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(255,193,7,.15)", color: "#a07300" }}>
                              simulé
                            </span>
                          )}
                          {!def && (
                            <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(255,0,0,.08)", color: "#a02020" }}>
                              pas de défaut global
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-3)" }}>
                          {tag} · /{slug}
                        </div>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--text-2)" }}>
                        <input
                          type="checkbox"
                          checked={ov.is_active !== false}
                          onChange={(e) => updateOverride(slug, { is_active: e.target.checked })}
                        />
                        actif
                      </label>
                      {hasOverride && (
                        <button
                          onClick={() => clearOverride(slug)}
                          style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 4, fontSize: 11 }}
                          title="Supprimer l'override (revient aux défauts)"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>

                    {open && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line-1)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <FieldRow label="Headline (override du défaut)" full>
                          <TextArea
                            value={ov.headline_template ?? ""}
                            placeholder={def?.headline_template ?? "(aucun défaut)"}
                            onChange={(v) => updateOverride(slug, { headline_template: v || undefined })}
                          />
                        </FieldRow>
                        <FieldRow label="Sous-headline" full>
                          <TextArea
                            value={ov.subheadline_template ?? ""}
                            placeholder={def?.subheadline_template ?? "(aucun défaut)"}
                            onChange={(v) => updateOverride(slug, { subheadline_template: v || undefined })}
                          />
                        </FieldRow>
                        <FieldRow label="Description" full>
                          <TextArea
                            value={ov.description_template ?? ""}
                            placeholder={def?.description_template ?? "(aucun défaut)"}
                            onChange={(v) => updateOverride(slug, { description_template: v || undefined })}
                            rows={3}
                          />
                        </FieldRow>
                        <FieldRow label="CTA — label">
                          <TextInput
                            value={ov.cta_label ?? ""}
                            placeholder={def?.cta_label ?? ""}
                            onChange={(v) => updateOverride(slug, { cta_label: v || undefined })}
                          />
                        </FieldRow>
                        <FieldRow label="CTA — lien">
                          <TextInput
                            value={ov.cta_href ?? ""}
                            placeholder={def?.cta_href ?? ""}
                            onChange={(v) => updateOverride(slug, { cta_href: v || undefined })}
                          />
                        </FieldRow>
                        <FieldRow label="Image (override)" full>
                          <SimpleImagePicker
                            value={ov.image_url ?? def?.image_url ?? null}
                            onChange={(url) => updateOverride(slug, { image_url: url ?? undefined })}
                          />
                          {def?.image_url && !ov.image_url && (
                            <p style={{ margin: "4px 0 0", fontSize: 10, color: "var(--text-3)", fontStyle: "italic" }}>
                              Image par défaut globale
                            </p>
                          )}
                        </FieldRow>
                      </div>
                    )}
                  </div>
                </Pane>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldRow({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : undefined, display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 500, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, placeholder, onChange }: { value: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{ fontSize: 12, padding: "5px 7px", border: "1px solid var(--line-1)", borderRadius: 4, background: "white" }}
    />
  );
}

function TextArea({ value, placeholder, onChange, rows = 2 }: { value: string; placeholder?: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      style={{ fontSize: 12, padding: "5px 7px", border: "1px solid var(--line-1)", borderRadius: 4, resize: "vertical", background: "white", fontFamily: "inherit" }}
    />
  );
}
