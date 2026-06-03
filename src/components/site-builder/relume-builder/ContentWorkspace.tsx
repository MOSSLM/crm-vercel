"use client";

import React from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  Eye,
  EyeOff,
  Tag,
  FlaskConical,
  Plus,
  Trash2,
  Save,
  Check,
  Sparkles,
  X,
  Box,
  GripVertical,
  Link as LinkIcon,
  RotateCcw,
  MousePointer,
  FileText,
} from "lucide-react";
import { useRelumeBuilder } from "./RelumeBuilderProvider";
import { getSchemaForSection, getBlockDefaults } from "@/data/section-schemas";
import { splitSchemaFields } from "@/components/site-builder/editors/SchemaEditor";
import { ImagePickerField } from "@/components/site-builder/editors/ImagePickerField";
import { VariableTextarea } from "./VariableTextarea";
import { parseServiceTags } from "@/lib/site-builder/menu-overrides";
import type { SiteSectionInstance, SectionField, SectionBlockSchema, SectionImagePickerField } from "@/types";
import { authedFetch } from "@/utils/authedFetch";

/** Block type used for the repeatable item of a tag-adaptive section. */
const TAG_ITEM_TYPE = "tag_item";
/** Section-level service tag is stored on a meta key of instance.content. */
const SECTION_TAG_KEY = "__service_tag";

interface StatItem {
  label: string;
  value: string;
  display_order?: number;
}

function eq<T>(a: T, b: T): boolean {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

// ── Editor context — tags, siteId and variables for the field editors ──────
interface ContentEditorCtx {
  enterpriseTags: string[];
  /** enterpriseTags ∪ global catalog — every tag the editor may ASSIGN to a
   *  block/section/page, so a template can be built before any company is
   *  linked. Render-time filtering still keys off enterpriseTags only. */
  assignableTags: string[];
  activeTags: string[];
  siteId: string;
  variables: Record<string, string>;
}
const ContentTagsCtx = React.createContext<ContentEditorCtx>({
  enterpriseTags: [],
  assignableTags: [],
  activeTags: [],
  siteId: "",
  variables: {},
});
const useContentTags = () => React.useContext(ContentTagsCtx);

// ───────────────────────────────────────────────────────────────────────────

/**
 * Contenu workspace — schema-driven content editor. Each section of the
 * active page is a card whose fields come from the section schema; the right
 * inspector handles service tags. All tags come from the site's linked
 * enterprise (`service_tags`), not the system-wide list.
 */
export function ContentWorkspace({ enterpriseId, tagCatalog = [] }: { enterpriseId: number | undefined; tagCatalog?: string[] }) {
  const { state, dispatch } = useRelumeBuilder();

  // ── Enterprise service tags ───────────────────────────────────────────────
  const tagsRaw = state.variableContext.__service_tags;
  const enterpriseTags = React.useMemo(() => parseServiceTags({ __service_tags: tagsRaw ?? "" }), [tagsRaw]);

  // Every tag assignable while building (enterprise tags + global catalogue),
  // so a template can be prepared with all eventual services even with no
  // company linked. Filtering at render time still uses enterpriseTags only.
  const assignableTags = React.useMemo(
    () => Array.from(new Set([...enterpriseTags, ...tagCatalog])).sort((a, b) => a.localeCompare(b, "fr")),
    [enterpriseTags, tagCatalog],
  );

  // Simulation: a subset of the enterprise tags toggled for preview. null = all.
  const [simulatedTags, setSimulatedTags] = React.useState<string[] | null>(null);
  const activeTags = simulatedTags ?? enterpriseTags;

  // Keep the simulated set valid when the enterprise changes.
  const prevEnterpriseId = React.useRef<number | undefined>(enterpriseId);
  if (prevEnterpriseId.current !== enterpriseId) {
    prevEnterpriseId.current = enterpriseId;
    if (simulatedTags !== null) setSimulatedTags(null);
  }

  function applyTags(tags: string[]) {
    dispatch({
      type: "SET_VARIABLE_CONTEXT",
      payload: { ...state.variableContext, __service_tags: JSON.stringify(tags) },
    });
  }
  function toggleSimTag(tag: string) {
    const base = simulatedTags ?? enterpriseTags;
    const next = base.includes(tag) ? base.filter((t) => t !== tag) : [...base, tag];
    setSimulatedTags(next);
    applyTags(next);
  }
  function clearSimulation() {
    setSimulatedTags(null);
    applyTags(enterpriseTags);
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  const selectedId = state.selectedInstanceId;
  const [selectedBlockId, setSelectedBlockId] = React.useState<string | null>(null);
  function selectSection(id: string) {
    dispatch({ type: "SELECT_INSTANCE", payload: id });
    setSelectedBlockId(null);
  }
  function selectBlock(id: string, blockId: string) {
    dispatch({ type: "SELECT_INSTANCE", payload: id });
    setSelectedBlockId(blockId);
  }

  // ── Stats (enterprise key figures) ────────────────────────────────────────
  const [stats, setStats] = React.useState<StatItem[]>([]);
  const [statsSnapshot, setStatsSnapshot] = React.useState<StatItem[]>([]);
  const [savingStats, setSavingStats] = React.useState(false);

  React.useEffect(() => {
    if (!enterpriseId) { setStats([]); setStatsSnapshot([]); return; }
    let cancelled = false;
    authedFetch(`/api/entreprises/${enterpriseId}/stats`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { stats?: StatItem[] } | null) => {
        if (cancelled) return;
        const s = data?.stats ?? [];
        setStats(s); setStatsSnapshot(s);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enterpriseId]);

  const statsDirty = !eq(stats, statsSnapshot);

  async function saveStats() {
    if (!enterpriseId) return;
    setSavingStats(true);
    try {
      const res = await authedFetch(`/api/entreprises/${enterpriseId}/stats`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stats }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { stats: StatItem[] };
      setStats(data.stats); setStatsSnapshot(data.stats);
      toast.success("Chiffres clés enregistrés");
      dispatch({
        type: "SET_VARIABLE_CONTEXT",
        payload: { ...state.variableContext, __stats: JSON.stringify(data.stats) },
      });
    } catch {
      toast.error("Échec de l'enregistrement");
    } finally {
      setSavingStats(false);
    }
  }

  // ── Page / sections ───────────────────────────────────────────────────────
  const pageInstanceIds = state.instancesByPage[state.activePage] ?? [];
  const sections = pageInstanceIds.map((id) => state.instances[id]).filter(Boolean) as SiteSectionInstance[];
  const selectedInstance = selectedId ? state.instances[selectedId] ?? null : null;
  const selectedOnPage = selectedInstance && selectedInstance.page_slug === state.activePage ? selectedInstance : null;

  function sectionTag(inst: SiteSectionInstance): string | null {
    const t = inst.content?.[SECTION_TAG_KEY];
    return typeof t === "string" && t ? t : null;
  }
  function sectionVisible(inst: SiteSectionInstance): boolean {
    if (inst.is_hidden) return false;
    const t = sectionTag(inst);
    if (t && !activeTags.includes(t)) return false;
    return true;
  }

  // Variables offered in the insert-variable dropdown — drop the internal
  // "__"-prefixed JSON keys (__service_tags, __stats, __reviews…).
  const displayVariables = React.useMemo(
    () => Object.fromEntries(Object.entries(state.variableContext).filter(([k]) => !k.startsWith("__"))),
    [state.variableContext],
  );

  return (
    <ContentTagsCtx.Provider
      value={{ enterpriseTags, assignableTags, activeTags, siteId: state.siteId, variables: displayVariables }}
    >
      <div className="ct-grid">
        {/* ───────── Left pane ───────── */}
        <aside className="ct-left">
          <div className="pane-hd contextual">
            <div className="title-with-icon">
              <FileText size={12} style={{ color: "var(--text-3)" }} />
              <span>Contenu</span>
            </div>
            <div className="actions">
              <span className="pill">{sections.length} sections</span>
            </div>
          </div>

          <div className="pane-body">
            {/* Pages */}
            <div className="section">
              <div className="section-hd" aria-expanded="true">
                <ChevronDown size={11} className="chev" />
                <span>Page</span>
              </div>
              <div className="ct-page-select" style={{ paddingBottom: 12 }}>
                {state.sitemap.map((p, i) => {
                  const hidden = !!(p.service_tag && !activeTags.includes(p.service_tag));
                  return (
                    <button
                      key={p.id}
                      className="ct-page-row"
                      aria-selected={state.activePage === p.slug}
                      data-hidden={hidden ? "true" : "false"}
                      onClick={() => dispatch({ type: "SET_ACTIVE_PAGE", payload: p.slug })}
                    >
                      <span className="pgnum">{String(i + 1).padStart(2, "0")}</span>
                      <span className="pname">{p.title}</span>
                      <span className="pslug">{p.slug}</span>
                      <span className="pcount">{(state.instancesByPage[p.slug] ?? []).length}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sections of active page */}
            <div className="section">
              <div className="section-hd" aria-expanded="true">
                <ChevronDown size={11} className="chev" />
                <span>Sections</span>
              </div>
              <div className="ct-sec-list" style={{ paddingBottom: 12 }}>
                {sections.length === 0 && (
                  <p style={{ fontSize: 11, color: "var(--text-4)", fontStyle: "italic", padding: "4px 8px", margin: 0 }}>
                    Aucune section sur cette page.
                  </p>
                )}
                {sections.map((inst) => {
                  const def = inst.section_def;
                  const adaptive = !!def?.is_tag_adaptive;
                  const taggedCount =
                    (inst.blocks ?? []).filter((b) => !!b.service_tag).length + (sectionTag(inst) ? 1 : 0);
                  return (
                    <button
                      key={inst.id}
                      className="ct-sec-row"
                      aria-selected={selectedId === inst.id}
                      onClick={() => selectSection(inst.id)}
                    >
                      <span className="stype">{def?.type ?? "section"}</span>
                      <span className="sname">{def?.name ?? "Section"}</span>
                      {!sectionVisible(inst) && <EyeOff size={11} className="hide-ic" />}
                      {adaptive && (
                        <span className="adaptbadge" title="Section adaptative aux services">
                          <Tag size={9} />adapt
                        </span>
                      )}
                      {taggedCount > 0 && (
                        <span className="tagbadge" title={`${taggedCount} élément(s) tagué(s)`}>
                          <Tag size={9} />{taggedCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Services de l'entreprise (simulator) */}
            <div className="section">
              <div className="section-hd" aria-expanded="true">
                <ChevronDown size={11} className="chev" />
                <span>Services de l&apos;entreprise</span>
              </div>
              <div style={{ padding: "4px 12px 12px" }}>
                {assignableTags.length === 0 ? (
                  <p style={{ fontSize: 11, color: "var(--text-4)", lineHeight: 1.5, margin: 0 }}>
                    Aucun service tag disponible. Renseignez la colonne
                    {" "}<code style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>service_tags</code>{" "}
                    d&apos;une entreprise.
                  </p>
                ) : (
                  <>
                    <p style={{ fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.5, margin: "0 0 8px" }}>
                      Activez/désactivez un service pour prévisualiser le site avec lui. Les services
                      hors entreprise liée servent à préparer un template.
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {assignableTags.map((t) => (
                        <button
                          key={t}
                          className="ct-tag-chip"
                          aria-pressed={activeTags.includes(t)}
                          data-real={enterpriseTags.includes(t) ? "true" : "false"}
                          title={enterpriseTags.includes(t) ? "Service de l'entreprise liée" : "Service du catalogue (template)"}
                          onClick={() => toggleSimTag(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    {simulatedTags !== null && (
                      <button className="btn ghost xs" style={{ marginTop: 8 }} onClick={clearSimulation}>
                        <RotateCcw size={11} />Réinitialiser
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Chiffres clés */}
            <div className="section">
              <div className="section-hd" aria-expanded="true">
                <ChevronDown size={11} className="chev" />
                <span>Chiffres clés</span>
              </div>
              <div className="ct-stats">
                <div className="ct-stats-hd">
                  <h4>
                    <FlaskConical size={12} style={{ color: "var(--text-3)" }} />
                    Stats
                  </h4>
                  <button className="btn ghost xs" onClick={() => setStats((s) => [...s, { label: "", value: "" }])}>
                    <Plus size={11} />Ajouter
                  </button>
                </div>
                <p className="hint">
                  Stockés sur l&apos;entreprise, injectés automatiquement dans les sections « stats ».
                </p>
                {stats.length === 0 ? (
                  <p className="ct-stat-empty">Aucun chiffre clé.</p>
                ) : (
                  stats.map((s, i) => (
                    <div key={i} className="ct-stat-row">
                      <input
                        className="input val"
                        value={s.value}
                        onChange={(e) => setStats((arr) => arr.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                        placeholder="500"
                      />
                      <input
                        className="input"
                        value={s.label}
                        onChange={(e) => setStats((arr) => arr.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                        placeholder="clients satisfaits"
                      />
                      <button className="del" title="Supprimer" onClick={() => setStats((arr) => arr.filter((_, j) => j !== i))}>
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))
                )}
                <button
                  className={"btn " + (statsDirty ? "primary" : "subtle")}
                  style={{ width: "100%", justifyContent: "center", marginTop: 10, height: 28 }}
                  onClick={saveStats}
                  disabled={!statsDirty || savingStats || !enterpriseId}
                >
                  {statsDirty
                    ? (<><Save size={13} />Enregistrer</>)
                    : (<><Check size={13} style={{ color: "var(--ok)" }} />À jour</>)}
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* ───────── Center pane ───────── */}
        <div className="ct-mid">
          <SchemaCallout />
          <div className="ct-scroll">
            {sections.length === 0 && (
              <div style={{ padding: 60, textAlign: "center", color: "var(--text-4)" }}>
                Aucune section sur cette page. Ajoutez-en depuis le Wireframe.
              </div>
            )}
            {sections.map((inst) => (
              <SectionContentCard
                key={inst.id}
                instance={inst}
                selected={selectedId === inst.id}
                selectedBlockId={selectedId === inst.id ? selectedBlockId : null}
                hidden={!sectionVisible(inst)}
                onSelect={() => selectSection(inst.id)}
                onSelectBlock={(bid) => selectBlock(inst.id, bid)}
              />
            ))}
          </div>
        </div>

        {/* ───────── Right pane ───────── */}
        <aside className="ct-right">
          <ContentInspector instance={selectedOnPage} blockId={selectedBlockId} />
        </aside>
      </div>
    </ContentTagsCtx.Provider>
  );
}

// ─── Schema callout ────────────────────────────────────────────────────────

function SchemaCallout() {
  const [open, setOpen] = React.useState(true);
  if (!open) return null;
  return (
    <div className="ct-schema-callout">
      <Sparkles size={13} />
      <span>
        <b>Cet onglet édite le contenu déclaré par le schéma de chaque section.</b>{" "}
        Taguez une section ou un bloc par service pour qu&apos;ils s&apos;adaptent à l&apos;entreprise.
      </span>
      <button className="x" onClick={() => setOpen(false)} title="Masquer">
        <X size={12} />
      </button>
    </div>
  );
}

// ─── Section content card ──────────────────────────────────────────────────

function SectionContentCard({
  instance, selected, selectedBlockId, hidden, onSelect, onSelectBlock,
}: {
  instance: SiteSectionInstance;
  selected: boolean;
  selectedBlockId: string | null;
  hidden: boolean;
  onSelect: () => void;
  onSelectBlock: (blockId: string) => void;
}) {
  const { dispatch } = useRelumeBuilder();
  const { activeTags } = useContentTags();
  const def = instance.section_def;
  const schema = def ? getSchemaForSection(def) : null;
  const adaptive = !!def?.is_tag_adaptive;
  const contentFields = schema ? splitSchemaFields(schema).contentFields : [];
  const blockSchema = schema?.blocks?.[0] ?? null;
  const tag = (() => {
    const t = instance.content?.[SECTION_TAG_KEY];
    return typeof t === "string" && t ? t : null;
  })();

  // Adaptive sections: keep one tag_item block per active service tag.
  const tagsKey = activeTags.join("|");
  React.useEffect(() => {
    if (!adaptive || !blockSchema || activeTags.length === 0) return;
    dispatch({
      type: "SYNC_ADAPTIVE_BLOCKS",
      payload: {
        instanceId: instance.id,
        tags: activeTags,
        blockType: TAG_ITEM_TYPE,
        defaults: getBlockDefaults(blockSchema),
      },
    });
  }, [instance.id, adaptive, tagsKey, activeTags, blockSchema, dispatch]);

  const patchContent = (key: string, value: unknown) => {
    dispatch({ type: "UPDATE_INSTANCE_CONTENT", payload: { id: instance.id, content: { [key]: value } } });
  };

  return (
    <div
      className="ct-card"
      data-selected={selected ? "true" : "false"}
      data-hidden={hidden ? "true" : "false"}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      <div className="ct-card-hd">
        <span className="type">{def?.type ?? "section"}</span>
        <span className="name">{def?.name ?? "Section"}</span>
        {tag && (
          <span className="tagged" title={`Section affichée si l'entreprise a le tag ${tag}`}>
            <Tag size={10} />{tag}
          </span>
        )}
        <div className="actions" onClick={(e) => e.stopPropagation()}>
          <TagControl scope="section" tag={tag} onChange={(t) => patchContent(SECTION_TAG_KEY, t ?? "")} />
          <button
            className="btn ghost xs icon"
            title={instance.is_hidden ? "Réafficher" : "Masquer"}
            onClick={() => dispatch({ type: "TOGGLE_INSTANCE_VISIBILITY", payload: instance.id })}
          >
            {instance.is_hidden ? <EyeOff size={11} /> : <Eye size={11} />}
          </button>
        </div>
      </div>

      {hidden && (
        <div className="ct-hidden-banner">
          <EyeOff size={11} />
          {instance.is_hidden ? "Section masquée manuellement" : `Masquée — requiert le tag "${tag}"`}
        </div>
      )}

      <div className="ct-card-body" onClick={(e) => e.stopPropagation()}>
        {!schema && (
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-4)", fontStyle: "italic" }}>
            Aucun schéma déclaré pour le type <code style={{ fontFamily: "var(--font-mono)" }}>{def?.type}</code>.
          </p>
        )}
        {schema && contentFields.length === 0 && !blockSchema && (
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-4)", fontStyle: "italic" }}>
            Ce schéma n&apos;expose aucun champ de contenu.
          </p>
        )}
        {schema && contentFields.map((field, i) => {
          const id = "id" in field ? field.id : `__h${i}`;
          return (
            <SchemaFieldRow
              key={id}
              field={field}
              value={"id" in field ? instance.content?.[field.id] : undefined}
              onChange={(v) => "id" in field && patchContent(field.id, v)}
            />
          );
        })}
        {schema && blockSchema && (
          <BlocksField
            instance={instance}
            blockSchema={blockSchema}
            adaptive={adaptive}
            selectedBlockId={selectedBlockId}
            onSelectBlock={onSelectBlock}
          />
        )}
      </div>
    </div>
  );
}

// ─── Schema field row ──────────────────────────────────────────────────────

function SchemaFieldRow({
  field, value, onChange,
}: {
  field: SectionField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "header") {
    return (
      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em", paddingTop: 4 }}>
        {field.content}
      </div>
    );
  }
  if (field.type === "paragraph") {
    return <p style={{ margin: 0, fontSize: 11, color: "var(--text-4)", lineHeight: 1.5 }}>{field.content}</p>;
  }
  return (
    <div className="ct-field" style={{ gridTemplateColumns: "110px 1fr" }}>
      <div className="ct-field-lbl">
        <span className="name">{field.label}</span>
        <span className="kind">{field.type}</span>
      </div>
      <div className="ct-field-val">
        <FieldInput field={field} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

/** Light-themed input for a single schema field. */
function FieldInput({
  field, value, onChange,
}: {
  field: SectionField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const t = field.type;
  const { siteId, variables } = useContentTags();

  if (t === "text" || t === "url" || t === "textarea" || t === "richtext") {
    const rows = t === "richtext" ? 4 : t === "textarea" ? 3 : 2;
    return (
      <VariableTextarea
        value={(value as string) ?? ""}
        onChange={(v) => onChange(v)}
        variables={variables}
        variant="light"
        rows={rows}
        className="textarea"
        placeholder={"label" in field ? field.label : ""}
      />
    );
  }

  if (t === "image_picker" || t === "video_url") {
    return (
      <ImagePickerField
        setting={field as SectionImagePickerField}
        value={(value as string) ?? ""}
        onChange={(url) => onChange(url)}
        siteId={siteId || undefined}
        light
      />
    );
  }

  if (t === "select" || t === "radio") {
    return (
      <select className="select" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  if (t === "checkbox") {
    return (
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-2)" }}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }

  if (t === "range" || t === "number") {
    const num = typeof value === "number" ? value : Number(value ?? 0);
    return (
      <input
        className="input"
        type="number"
        value={Number.isFinite(num) ? num : ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      />
    );
  }

  if (t === "color") {
    return (
      <input
        type="color"
        value={(value as string) || "#000000"}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 44, height: 28, padding: 0, border: "1px solid var(--border-2)", borderRadius: 6 }}
      />
    );
  }

  if (t === "button" || t === "link") {
    const v = (value as { label?: string; href?: string }) ?? {};
    const primary = t === "button" && (field as { variant?: string }).variant !== "secondary";
    return (
      <div className="ct-btn-row">
        <span className={"lbl-pill" + (primary ? "" : " secondary")}>{primary ? "Primary" : "Link"}</span>
        <input
          className="input"
          value={v.label ?? ""}
          onChange={(e) => onChange({ ...v, label: e.target.value })}
          placeholder="Libellé"
        />
        <LinkIcon size={11} style={{ color: "var(--text-4)", justifySelf: "end" }} />
        <input
          className="input"
          value={v.href ?? ""}
          onChange={(e) => onChange({ ...v, href: e.target.value })}
          placeholder="/contact"
          style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
        />
      </div>
    );
  }

  if (t === "form_picker") {
    return (
      <div className="ct-img">
        <span className="thumb"><FileText size={14} /></span>
        <div className="info">
          <input
            className="input"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="ID du formulaire"
            style={{ height: 22, padding: "0 4px" }}
          />
          <div className="desc">formulaire lié</div>
        </div>
      </div>
    );
  }

  return (
    <input
      className="input"
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={"label" in field ? field.label : ""}
    />
  );
}

// ─── Blocks field ──────────────────────────────────────────────────────────

function BlocksField({
  instance, blockSchema, adaptive, selectedBlockId, onSelectBlock,
}: {
  instance: SiteSectionInstance;
  blockSchema: SectionBlockSchema;
  adaptive: boolean;
  selectedBlockId: string | null;
  onSelectBlock: (blockId: string) => void;
}) {
  const { dispatch } = useRelumeBuilder();
  const { activeTags } = useContentTags();
  const blocks = (instance.blocks ?? []).filter((b) => b.type === blockSchema.type);

  const textFields = blockSchema.settings.filter(
    (f) => f.type === "text" || f.type === "textarea" || f.type === "richtext",
  );
  const titleField = textFields[0];
  const subField = textFields[1];

  const updateBlock = (blockId: string, key: string, val: unknown) => {
    dispatch({ type: "UPDATE_BLOCK", payload: { instanceId: instance.id, blockId, settings: { [key]: val } } });
  };

  return (
    <div className="ct-field" style={{ gridTemplateColumns: "110px 1fr" }}>
      <div className="ct-field-lbl">
        <span className="name">{blockSchema.name}</span>
        <span className="kind">{adaptive ? "1 / service" : "blocs"}</span>
      </div>
      <div className="ct-field-val">
        <div className="ct-blocks">
          {blocks.length === 0 && (
            <p style={{ margin: 0, fontSize: 11, color: "var(--text-4)", fontStyle: "italic" }}>
              {adaptive ? "Aucun service actif." : "Aucun bloc."}
            </p>
          )}
          {blocks.map((block) => {
            const bTag = block.service_tag ?? null;
            const filtered = !!(bTag && !activeTags.includes(bTag));
            return (
              <div
                key={block.id}
                className="ct-block"
                data-filtered={filtered ? "true" : "false"}
                data-selected={selectedBlockId === block.id ? "true" : "false"}
                onClick={(e) => { e.stopPropagation(); onSelectBlock(block.id); }}
              >
                <GripVertical size={13} className="handle" />
                <div className="btxt">
                  {titleField && "id" in titleField && (
                    <input
                      className="input"
                      value={(block.settings[titleField.id] as string) ?? ""}
                      onChange={(e) => updateBlock(block.id, titleField.id, e.target.value)}
                      placeholder={titleField.label}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  {subField && "id" in subField && (
                    <input
                      className="input sub"
                      value={(block.settings[subField.id] as string) ?? ""}
                      onChange={(e) => updateBlock(block.id, subField.id, e.target.value)}
                      placeholder={subField.label}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  {!titleField && <span style={{ fontSize: 11, color: "var(--text-3)" }}>{block.type}</span>}
                </div>
                {adaptive ? (
                  <span className="ct-tag-picker" data-set="true" title="Service" style={{ cursor: "default" }}>
                    <Tag size={10} />{bTag ?? "—"}
                  </span>
                ) : (
                  <span onClick={(e) => e.stopPropagation()}>
                    <TagControl
                      scope="block"
                      tag={bTag}
                      onChange={(t) =>
                        dispatch({ type: "UPDATE_BLOCK_TAG", payload: { instanceId: instance.id, blockId: block.id, service_tag: t } })
                      }
                    />
                  </span>
                )}
                {!adaptive ? (
                  <button
                    className="btn ghost xs icon"
                    title="Supprimer le bloc"
                    onClick={(e) => { e.stopPropagation(); dispatch({ type: "REMOVE_BLOCK", payload: { instanceId: instance.id, blockId: block.id } }); }}
                  >
                    <Trash2 size={11} />
                  </button>
                ) : (
                  <span style={{ width: 22 }} />
                )}
              </div>
            );
          })}
          {!adaptive && (
            <button
              className="btn ghost xs"
              style={{ alignSelf: "flex-start", marginTop: 2 }}
              onClick={(e) => {
                e.stopPropagation();
                dispatch({
                  type: "ADD_BLOCK",
                  payload: { instanceId: instance.id, blockType: blockSchema.type, settings: getBlockDefaults(blockSchema) },
                });
              }}
            >
              <Plus size={11} />Ajouter un bloc
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Inline tag picker ─────────────────────────────────────────────────────

function TagControl({
  scope, tag, onChange,
}: {
  scope: "section" | "block";
  tag: string | null;
  onChange: (tag: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLSpanElement>(null);
  const { assignableTags } = useContentTags();

  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button className="ct-tag-picker" data-set={tag ? "true" : "false"} onClick={() => setOpen((v) => !v)}>
        <Tag size={10} />{tag ?? "tag"}
      </button>
      {open && (
        <div className="ct-tag-pop" style={{ top: "calc(100% + 4px)", right: 0 }}>
          <div className="ct-pop-hd">Filtrer {scope === "section" ? "la section" : "le bloc"} par service</div>
          {assignableTags.length === 0 && (
            <div style={{ fontSize: 11, color: "var(--text-4)", padding: "4px 6px" }}>
              Aucun service tag disponible.
            </div>
          )}
          {assignableTags.map((t) => (
            <button
              key={t}
              className="ct-pop-item"
              aria-pressed={tag === t}
              onClick={() => { onChange(t); setOpen(false); }}
            >
              <span className="dot" />{t}
            </button>
          ))}
          {tag && (
            <div className="ct-pop-clear">
              <button className="ct-pop-item" onClick={() => { onChange(null); setOpen(false); }}>
                <X size={11} />Retirer le tag
              </button>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

// ─── Right inspector ───────────────────────────────────────────────────────

function ContentInspector({
  instance, blockId,
}: {
  instance: SiteSectionInstance | null;
  blockId: string | null;
}) {
  const { dispatch } = useRelumeBuilder();
  const { enterpriseTags, assignableTags, activeTags } = useContentTags();

  if (!instance) {
    return (
      <div className="ct-insp">
        <div className="empty">
          <span className="ic"><MousePointer size={20} /></span>
          <p>Sélectionnez une section pour éditer son contenu.</p>
        </div>
      </div>
    );
  }

  const def = instance.section_def;
  const schema = def ? getSchemaForSection(def) : null;
  const blockSchema = schema?.blocks?.[0] ?? null;

  // ── Block-focused mode ──────────────────────────────────────────────────
  if (blockId && blockSchema) {
    const block = (instance.blocks ?? []).find((b) => b.id === blockId);
    const adaptive = !!def?.is_tag_adaptive;
    const bTag = block?.service_tag ?? null;
    const filtered = !!(bTag && !activeTags.includes(bTag));

    return (
      <>
        <div className="pane-hd contextual">
          <div className="title-with-icon">
            <Box size={12} style={{ color: "var(--magic)" }} />
            <span>Bloc · {blockSchema.name}</span>
          </div>
        </div>
        <div className="pane-body">
          <div className="ct-insp">
            <div className="visibility-row" data-state={filtered ? "hidden" : "visible"}>
              <span>
                {filtered ? <EyeOff size={13} style={{ marginRight: 6 }} /> : <Eye size={13} style={{ marginRight: 6 }} />}
                {filtered ? "Masqué" : "Visible"} pour les services actifs
              </span>
              {bTag && <span className="pill">{bTag}</span>}
            </div>

            {block && (
              <div className="insp-section">
                <div className="insp-section-hd">Contenu du bloc</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {blockSchema.settings.map((f) =>
                    "id" in f ? (
                      <div key={f.id}>
                        <div style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 3 }}>{f.label}</div>
                        <FieldInput
                          field={f}
                          value={block.settings[f.id]}
                          onChange={(v) => dispatch({ type: "UPDATE_BLOCK", payload: { instanceId: instance.id, blockId, settings: { [f.id]: v } } })}
                        />
                      </div>
                    ) : null,
                  )}
                </div>
              </div>
            )}

            <div className="insp-section">
              <div className="insp-section-hd">Service tag</div>
              {adaptive ? (
                <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5 }}>
                  Section adaptative : ce bloc correspond au service{" "}
                  <strong style={{ color: "var(--text)" }}>{bTag ?? "—"}</strong> et est généré
                  automatiquement.
                </p>
              ) : assignableTags.length === 0 ? (
                <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-4)" }}>
                  Aucun service tag disponible.
                </p>
              ) : (
                <>
                  <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5 }}>
                    Ce bloc ne s&apos;affiche que si l&apos;entreprise possède le service sélectionné.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {assignableTags.map((t) => (
                      <button
                        key={t}
                        className="ct-tag-chip"
                        aria-pressed={bTag === t}
                        data-real={enterpriseTags.includes(t) ? "true" : "false"}
                        title={enterpriseTags.includes(t) ? "Service de l'entreprise liée" : "Service du catalogue (template)"}
                        onClick={() =>
                          dispatch({ type: "UPDATE_BLOCK_TAG", payload: { instanceId: instance.id, blockId, service_tag: bTag === t ? null : t } })
                        }
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Section-focused mode ────────────────────────────────────────────────
  const sectionTagVal = (() => {
    const t = instance.content?.[SECTION_TAG_KEY];
    return typeof t === "string" && t ? t : null;
  })();
  const sectionFiltered = !!(sectionTagVal && !activeTags.includes(sectionTagVal));
  const visible = !instance.is_hidden && !sectionFiltered;
  const blockTagCount = (instance.blocks ?? []).filter((b) => !!b.service_tag).length;

  return (
    <>
      <div className="pane-hd contextual">
        <div className="title-with-icon">
          <Box size={12} style={{ color: "var(--accent)" }} />
          <span>{def?.name ?? "Section"}</span>
        </div>
        <div className="actions">
          <span className="pill">{def?.type ?? "section"}</span>
        </div>
      </div>

      <div className="pane-body">
        <div className="ct-insp">
          <div className="visibility-row" data-state={visible ? "visible" : "hidden"}>
            <span>
              {visible ? <Eye size={13} style={{ marginRight: 6 }} /> : <EyeOff size={13} style={{ marginRight: 6 }} />}
              {visible ? "Visible" : instance.is_hidden ? "Masquée manuellement" : "Masquée par tag"}
            </span>
            <button
              className="btn ghost xs"
              onClick={() => dispatch({ type: "TOGGLE_INSTANCE_VISIBILITY", payload: instance.id })}
            >
              {instance.is_hidden ? "Réafficher" : "Masquer"}
            </button>
          </div>

          <div className="insp-section">
            <div className="insp-section-hd">Tag de section</div>
            {assignableTags.length === 0 ? (
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-4)" }}>
                Aucun service tag disponible.
              </p>
            ) : (
              <>
                <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "var(--text-3)", lineHeight: 1.5 }}>
                  Toute la section sera masquée si l&apos;entreprise n&apos;a pas ce service.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {assignableTags.map((t) => (
                    <button
                      key={t}
                      className="ct-tag-chip"
                      aria-pressed={sectionTagVal === t}
                      data-real={enterpriseTags.includes(t) ? "true" : "false"}
                      title={enterpriseTags.includes(t) ? "Service de l'entreprise liée" : "Service du catalogue (template)"}
                      onClick={() =>
                        dispatch({
                          type: "UPDATE_INSTANCE_CONTENT",
                          payload: { id: instance.id, content: { [SECTION_TAG_KEY]: sectionTagVal === t ? "" : t } },
                        })
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="insp-section">
            <div className="insp-section-hd">Synthèse</div>
            <div style={{ display: "grid", gap: 4, fontSize: 11.5, color: "var(--text-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Tag de section</span>
                <span style={{ fontFamily: "var(--font-mono)", color: sectionTagVal ? "var(--info)" : "var(--text-4)" }}>
                  {sectionTagVal ?? "—"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Blocs tagués</span>
                <span style={{ fontFamily: "var(--font-mono)", color: blockTagCount ? "var(--info)" : "var(--text-4)" }}>
                  {blockTagCount}
                </span>
              </div>
              {def?.is_tag_adaptive && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Type</span>
                  <span style={{ fontFamily: "var(--font-mono)", color: "var(--magic)" }}>adaptative</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
