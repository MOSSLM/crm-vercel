"use client";

import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Sparkles,
  Check,
  CheckCircle,
  Eye,
  Pencil,
  FileText,
  UserPlus,
  RefreshCw,
  Loader2,
  Globe,
  Building2,
  Target,
  CheckSquare,
  Square,
  LayoutGrid,
  Rows3,
  Maximize2,
  Minimize2,
  SlidersHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { authedFetch } from "@/utils/authedFetch";
import { createAudit } from "@/utils/auditApi";
import {
  updateLeadMagnetProject,
  createLeadMagnetReview,
  updateLeadMagnetReview,
  deleteLeadMagnetReview,
} from "@/utils/leadMagnetV2Api";
import { getCompanyDisplayName } from "@/utils/displayHelpers";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EnrichmentProgressModal, type EnrichmentLogEntry } from "@/components/EnrichmentProgressModal";

/* ── Types (mirror /api/marketing-pipeline/board) ─────────────────────────── */

interface BoardItem {
  id: string;
  name: string;
  entreprise_id: number | null;
  pipeline_id: string | null;
  company_name: string | null;
  company_url: string | null;
  logo_url: string | null;
  ville: string | null;
  priorite: string | null;
  montant: number | null;
  type: string | null;
  mrr: number | null;
  recurrence_months: number | null;
  tags: string | null;
  enriched: boolean;
  enrichment: { status: string | null; website_url: string | null } | null;
  project: { id: string; pret_pour_lm: boolean; enrichment_validated: boolean; statut: string | null } | null;
  site: {
    id: string;
    name: string | null;
    build_stage: string;
    is_published: boolean;
    url: string | null;
    is_claude_design: boolean;
  } | null;
  audit: { id: string; statut: string; pdf_url: string | null } | null;
  agent: { id: string; name: string } | null;
  missing_for_site: string[];
  column: number;
}

interface TemplateRef {
  id: string;
  name: string;
  is_claude_design: boolean;
}
interface AgentRef {
  id: string;
  name: string;
}
interface PipelineRef {
  id: string;
  nom: string;
  is_default: boolean;
}

interface BoardData {
  items: BoardItem[];
  templates: TemplateRef[];
  agents: AgentRef[];
  pipelines: PipelineRef[];
  has_validated_column: boolean;
}

type TopView = "compact" | "cards";
type BottomView = "cards" | "rows";

/* ── Column model ─────────────────────────────────────────────────────────── */

const COLUMNS: Array<{ key: number; label: string; color: string; hint: string }> = [
  { key: 1, label: "Opportunités", color: "#9ca3af", hint: "Enrichir puis valider" },
  { key: 2, label: "Prêts pour LM", color: "#3b82f6", hint: "Créer le site démo" },
  { key: 3, label: "Site créé", color: "#eab308", hint: "Vérifier & valider le site" },
  { key: 4, label: "Audit", color: "#f97316", hint: "Créer & valider l'audit" },
  { key: 5, label: "Attribution", color: "#22c55e", hint: "Attribuer un agent" },
];

const STAGE_LABELS: Record<string, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  a_verifier: "À vérifier",
  pret: "Prêt",
};

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function valueLabel(item: BoardItem): string | null {
  if (item.type === "mrr" && item.mrr) return `${item.mrr.toLocaleString()}€/mois`;
  if (item.montant) return `${item.montant.toLocaleString()}€`;
  return null;
}

function displayName(item: BoardItem): string {
  return getCompanyDisplayName(item.company_name || item.name, item.company_url) || item.name;
}

function normalizeUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const t = url.trim();
  if (!t) return undefined;
  return /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
}

function siteEditHref(site: NonNullable<BoardItem["site"]>): string {
  return site.is_claude_design ? `/site-builder/claude/${site.id}` : `/site-builder/${site.id}`;
}

function statusText(column: number, item: BoardItem): { label: string; cls: string } {
  if (column === 1) return { label: item.enriched ? "Enrichi" : "Non enrichi", cls: item.enriched ? "ok" : "" };
  if (column === 2) return { label: "Prêt pour LM", cls: "info" };
  if (column === 3 && item.site)
    return { label: STAGE_LABELS[item.site.build_stage] ?? item.site.build_stage, cls: "warn" };
  if (column === 4)
    return item.audit
      ? { label: item.audit.statut === "ready" ? "Audit prêt" : "Brouillon", cls: item.audit.statut === "ready" ? "ok" : "warn" }
      : { label: "Aucun audit", cls: "" };
  if (column === 5) return item.agent ? { label: item.agent.name, cls: "ok" } : { label: "Non attribué", cls: "" };
  return { label: "", cls: "" };
}

/* ── Component ────────────────────────────────────────────────────────────── */

export const MarketingWebPipeline: React.FC = () => {
  const supabase = React.useMemo(() => createClient(), []);

  const [board, setBoard] = React.useState<BoardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedColumn, setSelectedColumn] = React.useState(1);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = React.useState<string>("");
  const [agentId, setAgentId] = React.useState<string>("");
  const [pipelineFilter, setPipelineFilter] = React.useState<string>("all");
  const [topView, setTopView] = React.useState<TopView>("compact");
  const [bottomView, setBottomView] = React.useState<BottomView>("cards");
  const [working, setWorking] = React.useState<string | null>(null);
  const [editingItem, setEditingItem] = React.useState<BoardItem | null>(null);
  // When the edit modal is opened because a site can't be created yet, it shows
  // the missing required variables in red and gates the "create site" button.
  const [siteRequirement, setSiteRequirement] = React.useState(false);

  // Enrichment progress modal state.
  const [enrichLogs, setEnrichLogs] = React.useState<EnrichmentLogEntry[]>([]);
  const [enrichProgress, setEnrichProgress] = React.useState({ current: 0, total: 0, isComplete: false });
  const [showEnrichModal, setShowEnrichModal] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await authedFetch("/api/marketing-pipeline/board");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as BoardData;
      setBoard(data);
      setTemplateId((prev) => prev || data.templates[0]?.id || "");
    } catch {
      toast.error("Erreur lors du chargement du pipeline marketing");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const filteredItems = React.useMemo(() => {
    const items = board?.items ?? [];
    if (pipelineFilter === "all") return items;
    return items.filter((it) => it.pipeline_id === pipelineFilter);
  }, [board, pipelineFilter]);

  const itemsByColumn = React.useMemo(() => {
    const map = new Map<number, BoardItem[]>();
    for (const c of COLUMNS) map.set(c.key, []);
    for (const it of filteredItems) map.get(it.column)?.push(it);
    return map;
  }, [filteredItems]);

  const columnItems = itemsByColumn.get(selectedColumn) ?? [];

  const selectColumn = (key: number) => {
    setSelectedColumn(key);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelectedInColumn = columnItems.length > 0 && columnItems.every((it) => selectedIds.has(it.id));
  const toggleSelectAll = () => {
    if (allSelectedInColumn) setSelectedIds(new Set());
    else setSelectedIds(new Set(columnItems.map((it) => it.id)));
  };

  const selectedItems = React.useCallback(
    () => columnItems.filter((it) => selectedIds.has(it.id)),
    [columnItems, selectedIds],
  );

  const afterAction = async () => {
    setSelectedIds(new Set());
    await load();
  };

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const runEnrich = async (items: BoardItem[]) => {
    const withProject = items.filter((it) => it.project?.id);
    if (withProject.length === 0) {
      toast.error("Aucune opportunité sélectionnée n'a de projet lead magnet à enrichir");
      return;
    }
    const skipped = items.length - withProject.length;
    if (skipped > 0) toast.warning(`${skipped} opportunité(s) ignorée(s) — pas de projet lead magnet`);

    const projectIds = withProject.map((it) => it.project!.id);
    const initialLogs: EnrichmentLogEntry[] = withProject.map((it) => ({
      opportunite_id: it.id,
      company_name: displayName(it),
      project_id: it.project!.id,
      status: "pending",
    }));

    setEnrichLogs(initialLogs);
    setEnrichProgress({ current: 0, total: withProject.length, isComplete: false });
    setShowEnrichModal(true);
    setWorking("enrich");

    try {
      // The enrichment edge function only runs when pret_pour_lm is true.
      const { error: flagErr } = await supabase
        .from("lead_magnet_projects")
        .update({ pret_pour_lm: true })
        .in("id", projectIds);
      if (flagErr) throw flagErr;

      let done = 0;
      const results = await Promise.allSettled(
        projectIds.map(async (id) => {
          const response = await authedFetch("/api/lead-magnet/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project_id: id }),
          });
          const data = await response.json().catch(() => ({}));
          done += 1;
          setEnrichProgress((p) => ({ ...p, current: done }));
          if (!response.ok) {
            const message =
              typeof (data as { error?: unknown })?.error === "string"
                ? (data as { error: string }).error
                : `HTTP ${response.status}`;
            throw new Error(message);
          }
          return data;
        }),
      );

      const processed: EnrichmentLogEntry[] = initialLogs.map((log, i) => {
        const r = results[i];
        if (!r || r.status === "rejected") {
          const msg = r && r.status === "rejected" && r.reason instanceof Error ? r.reason.message : "Erreur inconnue";
          return { ...log, status: "error", message: msg };
        }
        const data = r.value as Record<string, unknown> | null;
        const fnResults = Array.isArray((data as { results?: unknown })?.results)
          ? (data as { results: Record<string, unknown>[] }).results
          : [];
        const first = fnResults[0] ?? {};
        const st = typeof first.status === "string" ? first.status : "";
        const err = typeof first.error === "string" ? first.error : "";
        if (st === "no_website") return { ...log, status: "no_website", message: "Site web introuvable" };
        if (st === "failed") return { ...log, status: "error", message: err || "failed" };
        if (st === "skipped") return { ...log, status: "skipped", message: err || "skipped" };
        return { ...log, status: "success", message: "Enrichi avec succès" };
      });

      setEnrichLogs(processed);
      setEnrichProgress({ current: withProject.length, total: withProject.length, isComplete: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enrichissement");
      setEnrichProgress((p) => ({ ...p, isComplete: true }));
    } finally {
      setWorking(null);
    }
  };

  const validateEnrichment = async (items: BoardItem[]) => {
    const projectIds = items.map((it) => it.project?.id).filter((v): v is string => !!v);
    if (projectIds.length === 0) {
      toast.error("Aucun projet lead magnet à valider");
      return;
    }
    setWorking("validate-enrich");
    try {
      const patch = board?.has_validated_column ? { enrichment_validated: true } : { pret_pour_lm: true };
      const { error } = await supabase.from("lead_magnet_projects").update(patch).in("id", projectIds);
      if (error) throw error;
      toast.success(`${projectIds.length} enrichissement(s) validé(s)`);
      await afterAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la validation");
    } finally {
      setWorking(null);
    }
  };

  // Actually clone the template into a demo, assuming requirements are met.
  const createSiteDirect = async (items: BoardItem[]) => {
    if (!templateId) {
      toast.error("Choisis d'abord un template");
      return;
    }
    const targets = items.filter((it) => it.entreprise_id != null && !it.site);
    if (targets.length === 0) {
      toast.error("Aucune entreprise éligible (déjà un site ou entreprise manquante)");
      return;
    }
    setWorking("create-site");
    try {
      const results = await Promise.allSettled(
        targets.map(async (it) => {
          const res = await authedFetch(`/api/site-builder/claude/${templateId}/create-demo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ companyId: it.entreprise_id }),
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Échec");
        }),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const ko = results.length - ok;
      if (ok > 0) toast.success(`${ok} site(s) démo créé(s)`);
      if (ko > 0) toast.error(`${ko} création(s) en échec`);
      await afterAction();
    } finally {
      setWorking(null);
    }
  };

  // Gate: before creating, every target must have its required variables filled.
  // Otherwise open the edit modal on the first incomplete company (requirement
  // mode) instead of creating anything.
  const createSites = async (items: BoardItem[]) => {
    if (!templateId) {
      toast.error("Choisis d'abord un template");
      return;
    }
    const targets = items.filter((it) => it.entreprise_id != null && !it.site);
    if (targets.length === 0) {
      toast.error("Aucune entreprise éligible (déjà un site ou entreprise manquante)");
      return;
    }
    const incomplete = targets.filter((it) => (it.missing_for_site?.length ?? 0) > 0);
    if (incomplete.length > 0) {
      setEditingItem(incomplete[0]);
      setSiteRequirement(true);
      toast.error(
        incomplete.length === 1
          ? `Variables requises manquantes : ${incomplete[0].missing_for_site.join(", ")}`
          : `${incomplete.length} entreprise(s) incomplète(s) — complète les variables requises avant de créer le site`,
      );
      return;
    }
    await createSiteDirect(targets);
  };

  const validateSites = async (items: BoardItem[]) => {
    const siteIds = items.map((it) => it.site?.id).filter((v): v is string => !!v);
    if (siteIds.length === 0) {
      toast.error("Aucun site à valider");
      return;
    }
    setWorking("validate-site");
    try {
      const results = await Promise.allSettled(
        siteIds.map(async (id) => {
          const res = await authedFetch(`/api/site-builder/sites/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ build_stage: "pret" }),
          });
          if (!res.ok) throw new Error();
        }),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      if (ok > 0) toast.success(`${ok} site(s) validé(s)`);
      await afterAction();
    } finally {
      setWorking(null);
    }
  };

  const createAudits = async (items: BoardItem[]) => {
    const targets = items.filter((it) => !it.audit);
    if (targets.length === 0) {
      toast.error("Toutes les opportunités sélectionnées ont déjà un audit");
      return;
    }
    setWorking("create-audit");
    try {
      let ok = 0;
      for (const it of targets) {
        try {
          await createAudit({
            opportunite_id: it.id,
            entreprise_nom: it.company_name ?? it.name,
            entreprise_ville: it.ville ?? undefined,
            entreprise_logo_url: it.logo_url ?? undefined,
            demo_site_url: it.site?.url ?? undefined,
          });
          ok += 1;
        } catch {
          /* keep going */
        }
      }
      if (ok > 0) toast.success(`${ok} audit(s) créé(s)`);
      if (ok < targets.length) toast.error(`${targets.length - ok} audit(s) en échec`);
      await afterAction();
    } finally {
      setWorking(null);
    }
  };

  const validateAudits = async (items: BoardItem[]) => {
    const auditIds = items.map((it) => it.audit?.id).filter((v): v is string => !!v);
    if (auditIds.length === 0) {
      toast.error("Aucun audit à valider");
      return;
    }
    setWorking("validate-audit");
    try {
      const { error } = await supabase
        .from("audits")
        .update({ statut: "ready", updated_at: new Date().toISOString() })
        .in("id", auditIds);
      if (error) throw error;
      toast.success(`${auditIds.length} audit(s) validé(s)`);
      await afterAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la validation");
    } finally {
      setWorking(null);
    }
  };

  const assignAgent = async (items: BoardItem[]) => {
    if (!agentId) {
      toast.error("Choisis d'abord un agent");
      return;
    }
    const targets = items.filter((it) => it.entreprise_id != null);
    if (targets.length === 0) {
      toast.error("Aucune entreprise à attribuer");
      return;
    }
    setWorking("assign");
    try {
      const results = await Promise.allSettled(
        targets.map(async (it) => {
          const res = await authedFetch("/api/admin/assign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entreprise_id: it.entreprise_id, agent_id: agentId }),
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Échec");
        }),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const ko = results.length - ok;
      const agentName = board?.agents.find((a) => a.id === agentId)?.name ?? "agent";
      if (ok > 0) toast.success(`${ok} opportunité(s) attribuée(s) à ${agentName}`);
      if (ko > 0) toast.error(`${ko} attribution(s) en échec`);
      await afterAction();
    } finally {
      setWorking(null);
    }
  };

  /* ── Per-item bound render helpers (shared by top cards + bottom) ──────── */

  const busy = working !== null;

  const cardHandlers = (item: BoardItem) => ({
    onEnrich: () => runEnrich([item]),
    onValidateEnrich: () => validateEnrichment([item]),
    onCreateSite: () => createSites([item]),
    onValidateSite: () => validateSites([item]),
    onCreateAudit: () => createAudits([item]),
    onValidateAudit: () => validateAudits([item]),
    onAssign: () => assignAgent([item]),
    onDetails: () => setEditingItem(item),
  });

  const renderCard = (item: BoardItem, column: number) => (
    <OppCard
      key={item.id}
      item={item}
      column={column}
      selected={selectedIds.has(item.id)}
      onToggleSelect={() => toggleSelect(item.id)}
      disabled={busy}
      {...cardHandlers(item)}
    />
  );

  /* ── Render ───────────────────────────────────────────────────────────── */

  const totalItems = filteredItems.length;
  const selectedCount = selectedIds.size;
  const activeColumn = COLUMNS.find((c) => c.key === selectedColumn);

  return (
    <div className="studio-surface flex min-h-full flex-col">
      {/* Toolbar */}
      <div className="pipe-bar">
        <div className="pipeline-pick" style={{ padding: 0, border: 0, background: "transparent" }}>
          <Target className="ico-sm ic" />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Pipeline Marketing &amp; Web</span>
          <span className="ct">{totalItems} opp.</span>
        </div>

        <div className="select-w" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span className="lb" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Pipeline :
          </span>
          <Select value={pipelineFilter} onValueChange={setPipelineFilter}>
            <SelectTrigger className="h-7 min-w-[150px] text-[11.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les pipelines</SelectItem>
              {(board?.pipelines ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <span className="grow" style={{ flex: 1 }} />

        <div className="seg" aria-label="Affichage du pipeline">
          <button type="button" className="s" aria-pressed={topView === "compact"} onClick={() => setTopView("compact")} title="Pipeline compact">
            <Minimize2 className="ico-sm" />
            Compact
          </button>
          <button type="button" className="s" aria-pressed={topView === "cards"} onClick={() => setTopView("cards")} title="Grandes cartes">
            <Maximize2 className="ico-sm" />
            Cartes
          </button>
        </div>

        <button type="button" className="btn ghost sm" onClick={load} disabled={loading}>
          <RefreshCw className={`ico-sm ${loading ? "animate-spin" : ""}`} />
          Rafraîchir
        </button>
      </div>

      {/* ── TOP: pipeline overview ─────────────────────────────────────── */}
      <div className="px-4 pb-2 pt-1">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${COLUMNS.length}, minmax(0, 1fr))`,
            gap: 10,
          }}
        >
          {COLUMNS.map((col) => {
            const items = itemsByColumn.get(col.key) ?? [];
            const isActive = selectedColumn === col.key;
            const sum = items.reduce((s, it) => s + (it.montant ?? 0), 0);
            return (
              <div
                key={col.key}
                className="kp-col"
                style={{
                  boxShadow: isActive ? "0 0 0 2px var(--accent)" : undefined,
                  background: isActive ? "var(--surface)" : "var(--surface-2)",
                }}
              >
                <button
                  type="button"
                  onClick={() => selectColumn(col.key)}
                  className="kp-col-hd"
                  style={{ width: "100%", cursor: "pointer", background: "transparent", textAlign: "left" }}
                >
                  <span className="dot" style={{ background: col.color }} />
                  <span className="nm">{col.label}</span>
                  <span className="ct">{items.length}</span>
                </button>
                <div
                  className="kp-col-bd"
                  style={{
                    maxHeight: topView === "cards" ? "58vh" : "34vh",
                    overflowY: "auto",
                    gap: topView === "cards" ? 8 : 5,
                  }}
                >
                  {topView === "cards"
                    ? items.map((it) => renderCard(it, col.key))
                    : items.map((it) => (
                        <div
                          key={it.id}
                          className="kp-card"
                          onClick={() => selectColumn(col.key)}
                          style={{
                            padding: "6px 8px",
                            gap: 3,
                            borderLeft: col.key === 1 && it.enriched ? "3px solid var(--ok)" : undefined,
                            cursor: "pointer",
                          }}
                        >
                          <div className="top" style={{ gap: 4 }}>
                            <span className="nm" style={{ fontSize: 11 }}>
                              {displayName(it)}
                            </span>
                          </div>
                          <div className="meta-line" style={{ fontSize: 9.5 }}>
                            <span style={{ color: statusText(col.key, it).cls === "ok" ? "var(--ok)" : "var(--text-4)" }}>
                              {statusText(col.key, it).label}
                            </span>
                          </div>
                        </div>
                      ))}
                  {items.length === 0 && (
                    <div style={{ textAlign: "center", padding: "16px 6px", color: "var(--text-4)", fontSize: 11 }}>
                      Vide
                    </div>
                  )}
                </div>
                <div style={{ padding: "6px 10px", borderTop: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
                  {sum > 0 ? `${sum.toLocaleString()}€` : col.hint}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Separator + action bar for selected column ─────────────────── */}
      <div
        className="pipe-bar"
        style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", marginTop: 4, background: "var(--surface-2)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            className="dot"
            style={{ width: 9, height: 9, borderRadius: "50%", background: activeColumn?.color, display: "inline-block" }}
          />
          <span style={{ fontWeight: 600, fontSize: 13 }}>{activeColumn?.label}</span>
          <span className="ct" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-3)" }}>
            {columnItems.length} · {selectedCount} sélectionnée(s)
          </span>
        </div>

        <span className="grow" style={{ flex: 1 }} />

        {columnItems.length > 0 && (
          <button type="button" className="btn ghost sm" onClick={toggleSelectAll} disabled={busy}>
            {allSelectedInColumn ? <CheckSquare className="ico-sm" /> : <Square className="ico-sm" />}
            {allSelectedInColumn ? "Tout désélectionner" : "Tout sélectionner"}
          </button>
        )}

        <ColumnActionBar
          column={selectedColumn}
          board={board}
          selectedCount={selectedCount}
          working={working}
          templateId={templateId}
          setTemplateId={setTemplateId}
          agentId={agentId}
          setAgentId={setAgentId}
          onEnrich={() => runEnrich(selectedItems())}
          onValidateEnrich={() => validateEnrichment(selectedItems())}
          onCreateSites={() => createSites(selectedItems())}
          onValidateSites={() => validateSites(selectedItems())}
          onCreateAudits={() => createAudits(selectedItems())}
          onValidateAudits={() => validateAudits(selectedItems())}
          onAssign={() => assignAgent(selectedItems())}
        />

        <div className="seg" aria-label="Affichage de la liste">
          <button type="button" className="s icon" aria-pressed={bottomView === "cards"} onClick={() => setBottomView("cards")} title="Cartes">
            <LayoutGrid className="ico-sm" />
          </button>
          <button type="button" className="s icon" aria-pressed={bottomView === "rows"} onClick={() => setBottomView("rows")} title="Tableau">
            <Rows3 className="ico-sm" />
          </button>
        </div>
      </div>

      {/* ── BOTTOM: list for the selected column ───────────────────────── */}
      <div className="px-4 py-4">
        {loading ? (
          <div className="opp-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ height: 150, borderRadius: 12, background: "var(--surface-2)" }} className="animate-pulse" />
            ))}
          </div>
        ) : columnItems.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 12px", color: "var(--text-4)" }}>
            <Building2 className="ico-xl" style={{ margin: "0 auto 10px", opacity: 0.5 }} />
            <p style={{ fontSize: 13 }}>Aucune opportunité dans cette étape.</p>
          </div>
        ) : bottomView === "cards" ? (
          <div className="opp-grid">{columnItems.map((item) => renderCard(item, selectedColumn))}</div>
        ) : (
          <OppTable
            items={columnItems}
            column={selectedColumn}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            allSelected={allSelectedInColumn}
            onToggleAll={toggleSelectAll}
            disabled={busy}
            handlersFor={cardHandlers}
          />
        )}
      </div>

      <EnrichmentProgressModal
        open={showEnrichModal}
        logs={enrichLogs}
        current={enrichProgress.current}
        total={enrichProgress.total}
        isComplete={enrichProgress.isComplete}
        onClose={async () => {
          setShowEnrichModal(false);
          await afterAction();
        }}
      />

      <OpportunityEditModal
        item={editingItem}
        siteRequirement={siteRequirement}
        onClose={() => {
          setEditingItem(null);
          setSiteRequirement(false);
        }}
        onSaved={async () => {
          setEditingItem(null);
          setSiteRequirement(false);
          await load();
        }}
        onSaveAndCreate={async (it) => {
          setEditingItem(null);
          setSiteRequirement(false);
          await load();
          await createSiteDirect([it]);
        }}
      />
    </div>
  );
};

/* ── Action bar (per column) ──────────────────────────────────────────────── */

interface ActionBarProps {
  column: number;
  board: BoardData | null;
  selectedCount: number;
  working: string | null;
  templateId: string;
  setTemplateId: (v: string) => void;
  agentId: string;
  setAgentId: (v: string) => void;
  onEnrich: () => void;
  onValidateEnrich: () => void;
  onCreateSites: () => void;
  onValidateSites: () => void;
  onCreateAudits: () => void;
  onValidateAudits: () => void;
  onAssign: () => void;
}

const ColumnActionBar: React.FC<ActionBarProps> = ({
  column,
  board,
  selectedCount,
  working,
  templateId,
  setTemplateId,
  agentId,
  setAgentId,
  onEnrich,
  onValidateEnrich,
  onCreateSites,
  onValidateSites,
  onCreateAudits,
  onValidateAudits,
  onAssign,
}) => {
  const none = selectedCount === 0;
  const spin = (key: string) => working === key;

  if (column === 1) {
    return (
      <>
        <button type="button" className="btn ghost sm" onClick={onEnrich} disabled={none || working !== null}>
          {spin("enrich") ? <Loader2 className="ico-sm animate-spin" /> : <Sparkles className="ico-sm" />}
          Enrichir ({selectedCount})
        </button>
        <button type="button" className="btn accent sm" onClick={onValidateEnrich} disabled={none || working !== null}>
          {spin("validate-enrich") ? <Loader2 className="ico-sm animate-spin" /> : <Check className="ico-sm" />}
          Valider ({selectedCount})
        </button>
      </>
    );
  }
  if (column === 2) {
    return (
      <>
        <div className="select-w" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span className="lb" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
            Template :
          </span>
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger className="h-7 min-w-[140px] text-[11.5px]">
              <SelectValue placeholder="Choisir" />
            </SelectTrigger>
            <SelectContent>
              {(board?.templates ?? []).length === 0 ? (
                <SelectItem value="none" disabled>
                  Aucun template
                </SelectItem>
              ) : (
                board!.templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
        <button type="button" className="btn accent sm" onClick={onCreateSites} disabled={none || working !== null}>
          {spin("create-site") ? <Loader2 className="ico-sm animate-spin" /> : <Globe className="ico-sm" />}
          Créer les sites ({selectedCount})
        </button>
      </>
    );
  }
  if (column === 3) {
    return (
      <button type="button" className="btn accent sm" onClick={onValidateSites} disabled={none || working !== null}>
        {spin("validate-site") ? <Loader2 className="ico-sm animate-spin" /> : <CheckCircle className="ico-sm" />}
        Valider les sites ({selectedCount})
      </button>
    );
  }
  if (column === 4) {
    return (
      <>
        <button type="button" className="btn ghost sm" onClick={onCreateAudits} disabled={none || working !== null}>
          {spin("create-audit") ? <Loader2 className="ico-sm animate-spin" /> : <FileText className="ico-sm" />}
          Créer les audits ({selectedCount})
        </button>
        <button type="button" className="btn accent sm" onClick={onValidateAudits} disabled={none || working !== null}>
          {spin("validate-audit") ? <Loader2 className="ico-sm animate-spin" /> : <CheckCircle className="ico-sm" />}
          Valider les audits ({selectedCount})
        </button>
      </>
    );
  }
  // column === 5
  return (
    <>
      <div className="select-w" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span className="lb" style={{ fontSize: 11.5, color: "var(--text-3)" }}>
          Agent :
        </span>
        <Select value={agentId} onValueChange={setAgentId}>
          <SelectTrigger className="h-7 min-w-[140px] text-[11.5px]">
            <SelectValue placeholder="Choisir" />
          </SelectTrigger>
          <SelectContent>
            {(board?.agents ?? []).length === 0 ? (
              <SelectItem value="none" disabled>
                Aucun agent
              </SelectItem>
            ) : (
              board!.agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
      <button type="button" className="btn accent sm" onClick={onAssign} disabled={none || working !== null}>
        {spin("assign") ? <Loader2 className="ico-sm animate-spin" /> : <UserPlus className="ico-sm" />}
        Attribuer ({selectedCount})
      </button>
    </>
  );
};

/* ── Card action handlers shape ───────────────────────────────────────────── */

interface ItemHandlers {
  onEnrich: () => void;
  onValidateEnrich: () => void;
  onCreateSite: () => void;
  onValidateSite: () => void;
  onCreateAudit: () => void;
  onValidateAudit: () => void;
  onAssign: () => void;
  onDetails: () => void;
}

/* ── Opportunity card (per column) ────────────────────────────────────────── */

interface OppCardProps extends ItemHandlers {
  item: BoardItem;
  column: number;
  selected: boolean;
  disabled: boolean;
  onToggleSelect: () => void;
}

const OppCard: React.FC<OppCardProps> = ({
  item,
  column,
  selected,
  disabled,
  onToggleSelect,
  ...handlers
}) => {
  const website = normalizeUrl(item.company_url);
  const vLabel = valueLabel(item);

  return (
    <div
      className="opp-card"
      data-priority={item.priorite ?? undefined}
      style={{ outline: selected ? "2px solid var(--accent)" : undefined, outlineOffset: selected ? "-1px" : undefined }}
    >
      <div className="hd">
        <div className="top-line">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="mt-0.5 h-4 w-4 flex-shrink-0" />
          {item.logo_url ? (
            <img src={item.logo_url} alt="" className="h-6 w-6 rounded object-cover flex-shrink-0" />
          ) : null}
          <span className="nm">{displayName(item)}</span>
          {vLabel && <span className="vl">{vLabel}</span>}
        </div>
        <div className="meta">
          {item.priorite && (
            <span className={`pill ${item.priorite === "haute" ? "danger" : item.priorite === "moyenne" ? "warn" : ""}`}>
              {item.priorite}
            </span>
          )}
          {item.ville && <span>{item.ville}</span>}
        </div>
      </div>

      <div className="bd">
        <CardBody column={column} item={item} website={website} />
      </div>

      <div className="ft">
        <button type="button" className="btn ghost sm icon" onClick={handlers.onDetails} disabled={disabled} title="Voir / modifier les infos">
          <SlidersHorizontal className="ico-sm" />
        </button>
        <CardFooter column={column} item={item} disabled={disabled} {...handlers} />
      </div>
    </div>
  );
};

const CardBody: React.FC<{ column: number; item: BoardItem; website?: string }> = ({ column, item, website }) => {
  if (column === 1) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className={`pill ${item.enriched ? "ok" : ""}`} style={{ fontSize: 10 }}>
          {item.enriched ? "Enrichi" : "Non enrichi"}
        </span>
        {item.enrichment?.website_url ? (
          <a href={normalizeUrl(item.enrichment.website_url)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--info)" }}>
            {item.enrichment.website_url}
          </a>
        ) : website ? (
          <a href={website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--text-3)" }}>
            {item.company_url}
          </a>
        ) : (
          <span style={{ fontSize: 11, color: "var(--text-4)" }}>Aucun site connu</span>
        )}
      </div>
    );
  }
  if (column === 2) {
    const missing = item.missing_for_site ?? [];
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="pill info" style={{ fontSize: 10 }}>
          Prêt pour LM
        </span>
        {missing.length > 0 ? (
          <span className="pill danger" style={{ fontSize: 10 }} title={`Manquant : ${missing.join(", ")}`}>
            Incomplet · {missing.length}
          </span>
        ) : (
          <span className="pill ok" style={{ fontSize: 10 }}>
            Variables OK
          </span>
        )}
        {item.tags && <span style={{ fontSize: 11, color: "var(--text-3)" }}>{item.tags.split(",")[0]}</span>}
      </div>
    );
  }
  if (column === 3 && item.site) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <span className="pill warn" style={{ fontSize: 10, alignSelf: "flex-start" }}>
          {STAGE_LABELS[item.site.build_stage] ?? item.site.build_stage}
        </span>
        {item.site.url ? (
          <a href={item.site.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "var(--info)" }}>
            {item.site.url.replace(/^https?:\/\//, "")} ↗
          </a>
        ) : (
          <span style={{ fontSize: 11, color: "var(--text-4)" }}>Non déployé</span>
        )}
      </div>
    );
  }
  if (column === 4) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {item.audit ? (
          <span className={`pill ${item.audit.statut === "ready" ? "ok" : "warn"}`} style={{ fontSize: 10 }}>
            {item.audit.statut === "ready" ? "Audit prêt" : "Audit brouillon"}
          </span>
        ) : (
          <span className="pill" style={{ fontSize: 10 }}>
            Aucun audit
          </span>
        )}
      </div>
    );
  }
  if (column === 5) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {item.agent ? (
          <span className="pill ok" style={{ fontSize: 10 }}>
            {item.agent.name}
          </span>
        ) : (
          <span className="pill" style={{ fontSize: 10 }}>
            Non attribué
          </span>
        )}
        {item.audit?.statut === "ready" && <span style={{ fontSize: 11, color: "var(--text-3)" }}>Audit prêt</span>}
      </div>
    );
  }
  return null;
};

interface FooterProps extends ItemHandlers {
  column: number;
  item: BoardItem;
  disabled: boolean;
}

const CardFooter: React.FC<FooterProps> = ({
  column,
  item,
  disabled,
  onEnrich,
  onValidateEnrich,
  onCreateSite,
  onValidateSite,
  onCreateAudit,
  onValidateAudit,
  onAssign,
}) => {
  if (column === 1) {
    return (
      <>
        <button type="button" className="btn ghost sm" onClick={onEnrich} disabled={disabled || !item.project}>
          <Sparkles className="ico-sm" />
          Enrichir
        </button>
        <button type="button" className="btn subtle sm" onClick={onValidateEnrich} disabled={disabled || !item.project}>
          <Check className="ico-sm" />
          Valider
        </button>
      </>
    );
  }
  if (column === 2) {
    return (
      <button type="button" className="btn accent sm" onClick={onCreateSite} disabled={disabled || item.entreprise_id == null}>
        <Globe className="ico-sm" />
        Créer le site
      </button>
    );
  }
  if (column === 3 && item.site) {
    return (
      <>
        {item.site.url ? (
          <a className="btn ghost sm" href={item.site.url} target="_blank" rel="noopener noreferrer">
            <Eye className="ico-sm" />
            Afficher
          </a>
        ) : (
          <Link className="btn ghost sm" href={siteEditHref(item.site)} target="_blank">
            <Eye className="ico-sm" />
            Afficher
          </Link>
        )}
        <Link className="btn ghost sm" href={siteEditHref(item.site)}>
          <Pencil className="ico-sm" />
          Éditer
        </Link>
        <button type="button" className="btn accent sm icon" onClick={onValidateSite} disabled={disabled} title="Valider le site">
          <Check className="ico-sm" />
        </button>
      </>
    );
  }
  if (column === 4) {
    if (!item.audit) {
      return (
        <button type="button" className="btn accent sm" onClick={onCreateAudit} disabled={disabled}>
          <FileText className="ico-sm" />
          Créer l'audit
        </button>
      );
    }
    return (
      <>
        {item.audit.pdf_url ? (
          <a className="btn ghost sm" href={item.audit.pdf_url} target="_blank" rel="noopener noreferrer">
            <Eye className="ico-sm" />
            Afficher
          </a>
        ) : (
          <Link className="btn ghost sm" href={`/audits/${item.id}`} target="_blank">
            <Eye className="ico-sm" />
            Afficher
          </Link>
        )}
        <Link className="btn ghost sm" href={`/audits/${item.id}`}>
          <Pencil className="ico-sm" />
          Éditer
        </Link>
        <button
          type="button"
          className="btn accent sm icon"
          onClick={onValidateAudit}
          disabled={disabled || item.audit.statut === "ready"}
          title="Valider l'audit"
        >
          <Check className="ico-sm" />
        </button>
      </>
    );
  }
  if (column === 5) {
    return (
      <button type="button" className="btn accent sm" onClick={onAssign} disabled={disabled || item.entreprise_id == null}>
        <UserPlus className="ico-sm" />
        {item.agent ? "Réattribuer" : "Attribuer"}
      </button>
    );
  }
  return null;
};

/* ── Table (rows) view ────────────────────────────────────────────────────── */

interface OppTableProps {
  items: BoardItem[];
  column: number;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  allSelected: boolean;
  onToggleAll: () => void;
  disabled: boolean;
  handlersFor: (item: BoardItem) => ItemHandlers;
}

const OppTable: React.FC<OppTableProps> = ({
  items,
  column,
  selectedIds,
  onToggleSelect,
  allSelected,
  onToggleAll,
  disabled,
  handlersFor,
}) => {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--surface)" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: "var(--surface-2)", color: "var(--text-3)", textAlign: "left" }}>
              <th style={{ padding: "8px 10px", width: 34 }}>
                <Checkbox checked={allSelected} onCheckedChange={onToggleAll} className="h-4 w-4" />
              </th>
              <th style={{ padding: "8px 10px" }}>Opportunité</th>
              <th style={{ padding: "8px 10px" }}>Ville</th>
              <th style={{ padding: "8px 10px" }}>Priorité</th>
              <th style={{ padding: "8px 10px" }}>Statut</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const selected = selectedIds.has(item.id);
              const st = statusText(column, item);
              const handlers = handlersFor(item);
              return (
                <tr key={item.id} style={{ borderTop: "1px solid var(--border)", background: selected ? "var(--accent-tint)" : undefined }}>
                  <td style={{ padding: "8px 10px" }}>
                    <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(item.id)} className="h-4 w-4" />
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {item.logo_url ? <img src={item.logo_url} alt="" className="h-5 w-5 rounded object-cover" /> : null}
                      <span style={{ fontWeight: 500 }}>{displayName(item)}</span>
                    </div>
                  </td>
                  <td style={{ padding: "8px 10px", color: "var(--text-3)" }}>{item.ville ?? "—"}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {item.priorite ? (
                      <span className={`pill ${item.priorite === "haute" ? "danger" : item.priorite === "moyenne" ? "warn" : ""}`} style={{ fontSize: 10 }}>
                        {item.priorite}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <span className={`pill ${st.cls}`} style={{ fontSize: 10 }}>
                      {st.label}
                    </span>
                  </td>
                  <td style={{ padding: "6px 10px" }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button type="button" className="btn ghost sm icon" onClick={handlers.onDetails} disabled={disabled} title="Voir / modifier les infos">
                        <SlidersHorizontal className="ico-sm" />
                      </button>
                      <CardFooter column={column} item={item} disabled={disabled} {...handlers} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ── Manual edit modal (company + enrichment) ─────────────────────────────── */

interface EditForm {
  // entreprises
  name: string;
  ville: string;
  code_postal: string;
  adresse: string;
  telephone: string;
  email: string;
  site_web: string;
  linkedin_url: string;
  service_tags: string;
  note_moyenne: string;
  nombre_avis: string;
  horaires: string;
  // lead_magnet_projects — overrides & enrichissement (sortie de l'edge function)
  lm_override_name: string;
  lm_override_city: string;
  lm_override_location: string;
  lm_override_phone: string;
  lm_override_email: string;
  lm_override_address: string;
  lm_logo_url: string;
  lm_service_tags_snapshot: string;
  lm_zones: string;
  lm_stat_years: string;
  lm_stat_clients: string;
  lm_stat_installations: string;
  lm_stat_rge: string;
  // automated_enrichment
  enr_website_url: string;
  enr_emails: string;
  enr_phones: string;
  enr_services: string;
  enr_contact_page: string;
  enr_summary: string;
}

const EMPTY_FORM: EditForm = {
  name: "",
  ville: "",
  code_postal: "",
  adresse: "",
  telephone: "",
  email: "",
  site_web: "",
  linkedin_url: "",
  service_tags: "",
  note_moyenne: "",
  nombre_avis: "",
  horaires: "",
  lm_override_name: "",
  lm_override_city: "",
  lm_override_location: "",
  lm_override_phone: "",
  lm_override_email: "",
  lm_override_address: "",
  lm_logo_url: "",
  lm_service_tags_snapshot: "",
  lm_zones: "",
  lm_stat_years: "",
  lm_stat_clients: "",
  lm_stat_installations: "",
  lm_stat_rge: "",
  enr_website_url: "",
  enr_emails: "",
  enr_phones: "",
  enr_services: "",
  enr_contact_page: "",
  enr_summary: "",
};

interface ReviewRow {
  id?: string;
  author_name: string;
  review_text: string;
  rating: string;
  is_active: boolean;
}

/** "villes autour" jsonb → texte éditable (", ") : gère l'array ou le texte "; ". */
function zonesFromVariables(variables: unknown): string {
  if (!variables || typeof variables !== "object") return "";
  const v = variables as Record<string, unknown>;
  if (Array.isArray(v.surrounding_cities)) {
    return v.surrounding_cities.filter((x): x is string => typeof x === "string").join(", ");
  }
  if (typeof v.surrounding_cities_text === "string") {
    return v.surrounding_cities_text.split(/\s*;\s*/).filter(Boolean).join(", ");
  }
  return "";
}

const toArr = (s: string): string[] => s.split(",").map((x) => x.trim()).filter(Boolean);
const fromArr = (a?: unknown): string => (Array.isArray(a) ? a.filter((x) => typeof x === "string").join(", ") : "");
const numStr = (v: unknown): string => (v == null || v === "" ? "" : String(v));

// Variables required before a demo site can be created (must match the board's
// missingForSite). Keyed by form field so the modal can outline them in red.
const SITE_REQUIRED: Array<{ field: keyof EditForm; label: string; ok: (f: EditForm) => boolean }> = [
  { field: "name", label: "Nom", ok: (f) => f.name.trim().length > 0 },
  { field: "ville", label: "Ville", ok: (f) => f.ville.trim().length > 0 },
  { field: "code_postal", label: "Code postal", ok: (f) => f.code_postal.trim().length > 0 },
  { field: "telephone", label: "Téléphone", ok: (f) => f.telephone.trim().length > 0 },
  { field: "service_tags", label: "Service tags", ok: (f) => toArr(f.service_tags).length > 0 },
  { field: "note_moyenne", label: "Note moyenne", ok: (f) => Number(f.note_moyenne) > 0 },
  { field: "nombre_avis", label: "Nombre d'avis", ok: (f) => Number(f.nombre_avis) > 0 },
];

const OpportunityEditModal: React.FC<{
  item: BoardItem | null;
  siteRequirement: boolean;
  onClose: () => void;
  onSaved: () => void;
  onSaveAndCreate: (item: BoardItem) => void;
}> = ({ item, siteRequirement, onClose, onSaved, onSaveAndCreate }) => {
  const supabase = React.useMemo(() => createClient(), []);
  const [form, setForm] = React.useState<EditForm>(EMPTY_FORM);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [enrichmentId, setEnrichmentId] = React.useState<string | null>(null);
  const [reviews, setReviews] = React.useState<ReviewRow[]>([]);
  const deletedReviewIds = React.useRef<string[]>([]);
  const variablesRef = React.useRef<Record<string, unknown>>({});

  const entrepriseId = item?.entreprise_id ?? null;
  const projectId = item?.project?.id ?? null;

  React.useEffect(() => {
    let cancelled = false;
    if (!item || entrepriseId == null) return;
    setLoading(true);
    setForm(EMPTY_FORM);
    setEnrichmentId(null);
    setReviews([]);
    deletedReviewIds.current = [];
    variablesRef.current = {};
    (async () => {
      const [compRes, enrRes, projRes, revRes] = await Promise.all([
        supabase
          .from("entreprises")
          .select(
            "id, name, ville, code_postal, adresse, telephone, email, site_web_canonique, canonical_url, linkedin_url, service_tags, note_moyenne, nombre_avis, horaires, logo_url",
          )
          .eq("id", entrepriseId)
          .maybeSingle(),
        supabase
          .from("automated_enrichment")
          .select("id, website_url, emails, phones, services_list, contact_page_url, site_summary")
          .eq("entreprise_id", entrepriseId)
          .order("updated_at", { ascending: false })
          .limit(1),
        projectId
          ? supabase
              .from("lead_magnet_projects")
              .select(
                "override_entreprise_name, override_city, override_location, override_phone, override_email, override_address, logo_url, service_tags_snapshot, stat_years_experience, stat_satisfied_clients, stat_installations_completed, stat_rge_count, variables",
              )
              .eq("id", projectId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        projectId
          ? supabase
              .from("lead_magnet_reviews")
              .select("id, author_name, review_text, rating, is_active, display_order")
              .eq("lead_magnet_project_id", projectId)
              .order("display_order", { ascending: true })
          : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      const c = (compRes.data ?? {}) as Record<string, unknown>;
      const enrRows = (enrRes.data ?? []) as Array<Record<string, unknown>>;
      const e = enrRows[0] ?? {};
      const p = (projRes.data ?? {}) as Record<string, unknown>;
      variablesRef.current = (p.variables as Record<string, unknown>) ?? {};
      const revRows = (revRes.data ?? []) as Array<Record<string, unknown>>;
      setEnrichmentId((e.id as string) ?? null);
      setReviews(
        revRows.map((r) => ({
          id: r.id as string,
          author_name: (r.author_name as string) ?? "",
          review_text: (r.review_text as string) ?? "",
          rating: numStr(r.rating) || "5",
          is_active: r.is_active !== false,
        })),
      );
      setForm({
        name: (c.name as string) ?? "",
        ville: (c.ville as string) ?? "",
        code_postal: (c.code_postal as string) ?? "",
        adresse: (c.adresse as string) ?? "",
        telephone: (c.telephone as string) ?? "",
        email: (c.email as string) ?? "",
        site_web: ((c.site_web_canonique as string) || (c.canonical_url as string)) ?? "",
        linkedin_url: (c.linkedin_url as string) ?? "",
        service_tags: fromArr(c.service_tags),
        note_moyenne: numStr(c.note_moyenne),
        nombre_avis: numStr(c.nombre_avis),
        horaires: (c.horaires as string) ?? "",
        lm_override_name: (p.override_entreprise_name as string) ?? "",
        lm_override_city: (p.override_city as string) ?? "",
        lm_override_location: (p.override_location as string) ?? "",
        lm_override_phone: (p.override_phone as string) ?? "",
        lm_override_email: (p.override_email as string) ?? "",
        lm_override_address: (p.override_address as string) ?? "",
        lm_logo_url: ((p.logo_url as string) || (c.logo_url as string)) ?? "",
        lm_service_tags_snapshot: fromArr(p.service_tags_snapshot),
        lm_zones: zonesFromVariables(p.variables),
        lm_stat_years: numStr(p.stat_years_experience),
        lm_stat_clients: numStr(p.stat_satisfied_clients),
        lm_stat_installations: numStr(p.stat_installations_completed),
        lm_stat_rge: numStr(p.stat_rge_count),
        enr_website_url: (e.website_url as string) ?? "",
        enr_emails: fromArr(e.emails),
        enr_phones: fromArr(e.phones),
        enr_services: fromArr(e.services_list),
        enr_contact_page: (e.contact_page_url as string) ?? "",
        enr_summary: (e.site_summary as string) ?? "",
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [item, entrepriseId, projectId, supabase]);

  const set = (k: keyof EditForm) => (ev: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: ev.target.value }));

  const setReview = (idx: number, patch: Partial<ReviewRow>) =>
    setReviews((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const addReview = () =>
    setReviews((rs) => [...rs, { author_name: "", review_text: "", rating: "5", is_active: true }]);
  const removeReview = (idx: number) =>
    setReviews((rs) => {
      const r = rs[idx];
      if (r?.id) deletedReviewIds.current.push(r.id);
      return rs.filter((_, i) => i !== idx);
    });

  const missingRequired = SITE_REQUIRED.filter((r) => !r.ok(form)).map((r) => r.label);
  const invalidFields = new Set(SITE_REQUIRED.filter((r) => !r.ok(form)).map((r) => r.field));
  const showInvalid = (field: keyof EditForm) => siteRequirement && invalidFields.has(field);

  const persist = async (): Promise<boolean> => {
    if (entrepriseId == null) return false;
    const { error: compErr } = await supabase
      .from("entreprises")
      .update({
        name: form.name || null,
        ville: form.ville || null,
        code_postal: form.code_postal || null,
        adresse: form.adresse || null,
        telephone: form.telephone || null,
        email: form.email || null,
        site_web_canonique: form.site_web || null,
        linkedin_url: form.linkedin_url || null,
        service_tags: toArr(form.service_tags),
        note_moyenne: form.note_moyenne === "" ? null : Number(form.note_moyenne),
        nombre_avis: form.nombre_avis === "" ? null : Number(form.nombre_avis),
        horaires: form.horaires || null,
        manually_enriched: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entrepriseId);
    if (compErr) throw compErr;

    const enrPayload = {
      website_url: form.enr_website_url || null,
      emails: toArr(form.enr_emails),
      phones: toArr(form.enr_phones),
      services_list: toArr(form.enr_services),
      contact_page_url: form.enr_contact_page || null,
      site_summary: form.enr_summary || null,
      updated_at: new Date().toISOString(),
    };
    const hasEnrData =
      form.enr_website_url || form.enr_emails || form.enr_phones || form.enr_services || form.enr_contact_page || form.enr_summary;
    if (enrichmentId) {
      const { error } = await supabase.from("automated_enrichment").update(enrPayload).eq("id", enrichmentId);
      if (error) throw error;
    } else if (hasEnrData) {
      const { error } = await supabase.from("automated_enrichment").insert({ entreprise_id: entrepriseId, ...enrPayload });
      if (error) throw error;
    }

    // lead_magnet_projects : overrides, logo, stats, zones (sortie edge function)
    if (projectId) {
      const vars: Record<string, unknown> = { ...variablesRef.current };
      const zones = toArr(form.lm_zones);
      if (zones.length > 0) {
        vars.surrounding_cities = zones;
        vars.surrounding_cities_text = zones.join("; ");
      } else {
        delete vars.surrounding_cities;
        delete vars.surrounding_cities_text;
      }
      await updateLeadMagnetProject(projectId, {
        override_entreprise_name: form.lm_override_name || null,
        override_city: form.lm_override_city || null,
        override_location: form.lm_override_location || null,
        override_phone: form.lm_override_phone || null,
        override_email: form.lm_override_email || null,
        override_address: form.lm_override_address || null,
        logo_url: form.lm_logo_url || null,
        service_tags_snapshot: toArr(form.lm_service_tags_snapshot),
        stat_years_experience: form.lm_stat_years || null,
        stat_satisfied_clients: form.lm_stat_clients || null,
        stat_installations_completed: form.lm_stat_installations || null,
        stat_rge_count: form.lm_stat_rge || null,
        variables: vars,
      });

      // Avis : suppressions, puis créations / mises à jour
      for (const id of deletedReviewIds.current) {
        await deleteLeadMagnetReview(id);
      }
      deletedReviewIds.current = [];
      for (let i = 0; i < reviews.length; i++) {
        const r = reviews[i];
        const author = r.author_name.trim();
        const text = r.review_text.trim();
        if (!author && !text) continue; // ligne vide ignorée
        const rating = r.rating === "" ? 5 : Number(r.rating);
        const display_order = i * 10 + 100;
        if (r.id) {
          await updateLeadMagnetReview(r.id, {
            author_name: author,
            review_text: text,
            rating,
            is_active: r.is_active,
            display_order,
          });
        } else {
          await createLeadMagnetReview({
            lead_magnet_project_id: projectId,
            author_name: author,
            review_text: text,
            rating,
            is_active: r.is_active,
            is_manual: true,
            source: "manual",
            display_order,
          });
        }
      }
    }
    return true;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const ok = await persist();
      if (!ok) return;
      toast.success("Informations mises à jour");
      if (siteRequirement && missingRequired.length === 0 && item) {
        onSaveAndCreate(item);
      } else {
        onSaved();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? displayName(item) : ""} — Informations</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-1">
            {siteRequirement && missingRequired.length > 0 && (
              <div
                style={{
                  border: "1px solid var(--danger)",
                  background: "var(--danger-tint)",
                  color: "var(--danger)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 12.5,
                }}
              >
                <strong>Variables requises manquantes pour créer le site :</strong>
                <div style={{ marginTop: 4 }}>{missingRequired.join(" · ")}</div>
              </div>
            )}
            {siteRequirement && missingRequired.length === 0 && (
              <div
                style={{
                  border: "1px solid var(--ok)",
                  background: "var(--ok-tint)",
                  color: "var(--ok)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontSize: 12.5,
                }}
              >
                Toutes les variables requises sont renseignées — tu peux créer le site.
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold mb-2">Entreprise</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nom" required invalid={showInvalid("name")}><Input value={form.name} onChange={set("name")} /></Field>
                <Field label="Ville" required invalid={showInvalid("ville")}><Input value={form.ville} onChange={set("ville")} /></Field>
                <Field label="Code postal" required invalid={showInvalid("code_postal")}><Input value={form.code_postal} onChange={set("code_postal")} /></Field>
                <Field label="Téléphone" required invalid={showInvalid("telephone")}><Input value={form.telephone} onChange={set("telephone")} /></Field>
                <Field label="Note moyenne" required invalid={showInvalid("note_moyenne")}>
                  <Input type="number" step="0.1" value={form.note_moyenne} onChange={set("note_moyenne")} placeholder="4.8" />
                </Field>
                <Field label="Nombre d'avis" required invalid={showInvalid("nombre_avis")}>
                  <Input type="number" value={form.nombre_avis} onChange={set("nombre_avis")} placeholder="120" />
                </Field>
                <Field label="Email"><Input value={form.email} onChange={set("email")} /></Field>
                <Field label="Site web"><Input value={form.site_web} onChange={set("site_web")} /></Field>
                <Field label="LinkedIn"><Input value={form.linkedin_url} onChange={set("linkedin_url")} /></Field>
                <Field label="Adresse"><Input value={form.adresse} onChange={set("adresse")} /></Field>
                <div className="sm:col-span-2">
                  <Field label="Service tags (séparés par des virgules)" required invalid={showInvalid("service_tags")}>
                    <Input value={form.service_tags} onChange={set("service_tags")} placeholder="plomberie, chauffage, dépannage" />
                  </Field>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Enrichissement</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Site web (enrichi)"><Input value={form.enr_website_url} onChange={set("enr_website_url")} /></Field>
                <Field label="Page contact"><Input value={form.enr_contact_page} onChange={set("enr_contact_page")} /></Field>
                <Field label="Emails (virgules)"><Input value={form.enr_emails} onChange={set("enr_emails")} /></Field>
                <Field label="Téléphones (virgules)"><Input value={form.enr_phones} onChange={set("enr_phones")} /></Field>
                <div className="sm:col-span-2">
                  <Field label="Services (virgules)"><Input value={form.enr_services} onChange={set("enr_services")} /></Field>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Résumé du site">
                    <Textarea value={form.enr_summary} onChange={set("enr_summary")} rows={3} />
                  </Field>
                </div>
              </div>
            </div>

            {projectId ? (
              <>
                <div>
                  <h4 className="text-sm font-semibold mb-2">Lead magnet — overrides &amp; logo</h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    Ce que l&apos;enrichissement a produit et ce que le site utilise. Vide = la
                    valeur entreprise ci-dessus est utilisée.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Nom affiché (override)"><Input value={form.lm_override_name} onChange={set("lm_override_name")} placeholder={form.name} /></Field>
                    <Field label="Logo (URL)"><Input value={form.lm_logo_url} onChange={set("lm_logo_url")} /></Field>
                    <Field label="Téléphone (override)"><Input value={form.lm_override_phone} onChange={set("lm_override_phone")} placeholder={form.telephone} /></Field>
                    <Field label="Email (override)"><Input value={form.lm_override_email} onChange={set("lm_override_email")} placeholder={form.email} /></Field>
                    <Field label="Ville SEO (override)"><Input value={form.lm_override_city} onChange={set("lm_override_city")} placeholder={form.ville} /></Field>
                    <Field label="Zone principale (grande ville proche)"><Input value={form.lm_override_location} onChange={set("lm_override_location")} /></Field>
                    <Field label="Horaires"><Input value={form.horaires} onChange={set("horaires")} placeholder="Lun–Ven 8h–18h" /></Field>
                    <div className="sm:col-span-2">
                      <Field label="Adresse (override)"><Input value={form.lm_override_address} onChange={set("lm_override_address")} placeholder={form.adresse} /></Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="Zones desservies (villes autour, séparées par des virgules)"><Input value={form.lm_zones} onChange={set("lm_zones")} placeholder="Annecy, Seynod, Cran-Gevrier" /></Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="Service tags du lead magnet (virgules)"><Input value={form.lm_service_tags_snapshot} onChange={set("lm_service_tags_snapshot")} placeholder="climatisation, chauffage" /></Field>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Chiffres clés (stats)</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Field label="Années d'expérience"><Input type="number" value={form.lm_stat_years} onChange={set("lm_stat_years")} /></Field>
                    <Field label="Clients satisfaits"><Input type="number" value={form.lm_stat_clients} onChange={set("lm_stat_clients")} /></Field>
                    <Field label="Installations"><Input type="number" value={form.lm_stat_installations} onChange={set("lm_stat_installations")} /></Field>
                    <Field label="Qualifications (RGE)"><Input type="number" value={form.lm_stat_rge} onChange={set("lm_stat_rge")} /></Field>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold">Avis clients ({reviews.length})</h4>
                    <button type="button" className="btn ghost sm" onClick={addReview}>
                      <Plus className="ico-sm" /> Ajouter un avis
                    </button>
                  </div>
                  <div className="flex flex-col gap-3">
                    {reviews.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Aucun avis. Ils sont créés par l&apos;enrichissement (table lead_magnet_reviews), ou ajoute-les à la main.
                      </p>
                    )}
                    {reviews.map((r, i) => (
                      <div key={r.id ?? `new-${i}`} className="rounded-lg border p-3 flex flex-col gap-2">
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end">
                          <Field label="Nom"><Input value={r.author_name} onChange={(e) => setReview(i, { author_name: e.target.value })} placeholder="Marie L." /></Field>
                          <Field label="Note"><Input type="number" min="1" max="5" step="0.5" className="w-20" value={r.rating} onChange={(e) => setReview(i, { rating: e.target.value })} /></Field>
                          <label className="flex items-center gap-2 text-xs pb-2 whitespace-nowrap">
                            <Checkbox checked={r.is_active} onCheckedChange={(v) => setReview(i, { is_active: v === true })} />
                            Actif
                          </label>
                        </div>
                        <Field label="Avis"><Textarea value={r.review_text} onChange={(e) => setReview(i, { review_text: e.target.value })} rows={2} /></Field>
                        <div className="flex justify-end">
                          <button type="button" className="btn ghost sm" onClick={() => removeReview(i)}>
                            <Trash2 className="ico-sm" /> Supprimer
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Projet lead magnet non encore créé pour cette entreprise : les overrides,
                stats et avis apparaîtront une fois l&apos;enrichissement lancé.
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <button type="button" className="btn ghost sm" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          {siteRequirement ? (
            <button
              type="button"
              className="btn accent sm"
              onClick={handleSave}
              disabled={saving || loading || missingRequired.length > 0}
              title={missingRequired.length > 0 ? `Manquant : ${missingRequired.join(", ")}` : undefined}
            >
              {saving ? <Loader2 className="ico-sm animate-spin" /> : <Globe className="ico-sm" />}
              Enregistrer et créer le site
            </button>
          ) : (
            <button type="button" className="btn accent sm" onClick={handleSave} disabled={saving || loading}>
              {saving ? <Loader2 className="ico-sm animate-spin" /> : <Check className="ico-sm" />}
              Enregistrer
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Field: React.FC<{ label: string; required?: boolean; invalid?: boolean; children: React.ReactNode }> = ({
  label,
  required,
  invalid,
  children,
}) => (
  <div className="space-y-1" data-invalid={invalid ? "true" : undefined}>
    <Label className="text-xs" style={{ color: invalid ? "var(--danger)" : "var(--text-3)" }}>
      {label}
      {required && <span style={{ color: "var(--danger)", marginLeft: 3 }}>*</span>}
    </Label>
    <div
      style={
        invalid
          ? { borderRadius: 8, boxShadow: "0 0 0 1.5px var(--danger)", outline: "none" }
          : undefined
      }
    >
      {children}
    </div>
  </div>
);

export default MarketingWebPipeline;
