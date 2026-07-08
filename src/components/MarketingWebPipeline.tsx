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
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { authedFetch } from "@/utils/authedFetch";
import { createAudit } from "@/utils/auditApi";
import { getCompanyDisplayName } from "@/utils/displayHelpers";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnrichmentProgressModal, type EnrichmentLogEntry } from "@/components/EnrichmentProgressModal";

/* ── Types (mirror /api/marketing-pipeline/board) ─────────────────────────── */

interface BoardItem {
  id: string;
  name: string;
  entreprise_id: number | null;
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

interface BoardData {
  items: BoardItem[];
  templates: TemplateRef[];
  agents: AgentRef[];
  has_validated_column: boolean;
}

/* ── Column model ─────────────────────────────────────────────────────────── */

const COLUMNS: Array<{ key: number; label: string; color: string; hint: string }> = [
  { key: 1, label: "Opportunités", color: "#9ca3af", hint: "Enrichir puis valider" },
  { key: 2, label: "Prêts pour LM", color: "#3b82f6", hint: "Créer le site démo" },
  { key: 3, label: "Site créé", color: "#eab308", hint: "Vérifier & valider le site" },
  { key: 4, label: "Audit", color: "#f97316", hint: "Créer & valider l'audit" },
  { key: 5, label: "Attribution", color: "#22c55e", hint: "Attribuer un agent" },
];

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

const STAGE_LABELS: Record<string, string> = {
  a_faire: "À faire",
  en_cours: "En cours",
  a_verifier: "À vérifier",
  pret: "Prêt",
};

/* ── Component ────────────────────────────────────────────────────────────── */

export const MarketingWebPipeline: React.FC = () => {
  const supabase = React.useMemo(() => createClient(), []);

  const [board, setBoard] = React.useState<BoardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedColumn, setSelectedColumn] = React.useState(1);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = React.useState<string>("");
  const [agentId, setAgentId] = React.useState<string>("");
  const [working, setWorking] = React.useState<string | null>(null);

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

  const itemsByColumn = React.useMemo(() => {
    const map = new Map<number, BoardItem[]>();
    for (const c of COLUMNS) map.set(c.key, []);
    for (const it of board?.items ?? []) map.get(it.column)?.push(it);
    return map;
  }, [board]);

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

  /* ── Render ───────────────────────────────────────────────────────────── */

  const totalItems = board?.items.length ?? 0;
  const selectedCount = selectedIds.size;
  const busy = working !== null;

  return (
    <div className="studio-surface flex min-h-full flex-col">
      {/* Toolbar */}
      <div className="pipe-bar">
        <div className="pipeline-pick" style={{ padding: 0, border: 0, background: "transparent" }}>
          <Target className="ico-sm ic" />
          <span style={{ fontWeight: 600, fontSize: 13 }}>Pipeline Marketing &amp; Web</span>
          <span className="ct">{totalItems} opp.</span>
        </div>
        <span className="grow" style={{ flex: 1 }} />
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
              <button
                key={col.key}
                type="button"
                onClick={() => selectColumn(col.key)}
                className="kp-col"
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  boxShadow: isActive ? "0 0 0 2px var(--accent)" : undefined,
                  background: isActive ? "var(--surface)" : "var(--surface-2)",
                }}
              >
                <div className="kp-col-hd">
                  <span className="dot" style={{ background: col.color }} />
                  <span className="nm">{col.label}</span>
                  <span className="ct">{items.length}</span>
                </div>
                <div className="kp-col-bd" style={{ maxHeight: "30vh", overflowY: "auto", gap: 5 }}>
                  {items.slice(0, 12).map((it) => (
                    <div
                      key={it.id}
                      className="kp-card"
                      style={{
                        padding: "6px 8px",
                        gap: 3,
                        borderLeft:
                          col.key === 1 && it.enriched ? "3px solid var(--ok)" : undefined,
                        cursor: "pointer",
                      }}
                    >
                      <div className="top" style={{ gap: 4 }}>
                        <span className="nm" style={{ fontSize: 11 }}>
                          {displayName(it)}
                        </span>
                      </div>
                      <div className="meta-line" style={{ fontSize: 9.5 }}>
                        {col.key === 1 && (
                          <span style={{ color: it.enriched ? "var(--ok)" : "var(--text-4)" }}>
                            {it.enriched ? "enrichi" : "à enrichir"}
                          </span>
                        )}
                        {col.key === 3 && it.site && <span>{STAGE_LABELS[it.site.build_stage] ?? it.site.build_stage}</span>}
                        {col.key === 4 && <span>{it.audit ? (it.audit.statut === "ready" ? "prêt" : "brouillon") : "à créer"}</span>}
                        {col.key === 5 && <span>{it.agent ? it.agent.name : "non attribué"}</span>}
                        {col.key === 2 && <span>{it.ville ?? "—"}</span>}
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div style={{ textAlign: "center", padding: "16px 6px", color: "var(--text-4)", fontSize: 11 }}>
                      Vide
                    </div>
                  )}
                  {items.length > 12 && (
                    <div style={{ textAlign: "center", color: "var(--text-4)", fontSize: 10, padding: "2px 0" }}>
                      +{items.length - 12} autres
                    </div>
                  )}
                </div>
                <div style={{ padding: "6px 10px", borderTop: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-3)" }}>
                  {sum > 0 ? `${sum.toLocaleString()}€` : col.hint}
                </div>
              </button>
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
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: COLUMNS.find((c) => c.key === selectedColumn)?.color,
              display: "inline-block",
            }}
          />
          <span style={{ fontWeight: 600, fontSize: 13 }}>{COLUMNS.find((c) => c.key === selectedColumn)?.label}</span>
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
        ) : (
          <div className="opp-grid">
            {columnItems.map((item) => (
              <OppCard
                key={item.id}
                item={item}
                column={selectedColumn}
                selected={selectedIds.has(item.id)}
                onToggleSelect={() => toggleSelect(item.id)}
                disabled={busy}
                onEnrich={() => runEnrich([item])}
                onValidateEnrich={() => validateEnrichment([item])}
                onCreateSite={() => createSites([item])}
                onValidateSite={() => validateSites([item])}
                onCreateAudit={() => createAudits([item])}
                onValidateAudit={() => validateAudits([item])}
                onAssign={() => assignAgent([item])}
              />
            ))}
          </div>
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

/* ── Opportunity card (per column) ────────────────────────────────────────── */

interface OppCardProps {
  item: BoardItem;
  column: number;
  selected: boolean;
  disabled: boolean;
  onToggleSelect: () => void;
  onEnrich: () => void;
  onValidateEnrich: () => void;
  onCreateSite: () => void;
  onValidateSite: () => void;
  onCreateAudit: () => void;
  onValidateAudit: () => void;
  onAssign: () => void;
}

const OppCard: React.FC<OppCardProps> = ({
  item,
  column,
  selected,
  disabled,
  onToggleSelect,
  onEnrich,
  onValidateEnrich,
  onCreateSite,
  onValidateSite,
  onCreateAudit,
  onValidateAudit,
  onAssign,
}) => {
  const website = normalizeUrl(item.company_url);
  const vLabel = valueLabel(item);

  return (
    <div
      className="opp-card"
      data-priority={item.priorite ?? undefined}
      style={{
        outline: selected ? "2px solid var(--accent)" : undefined,
        outlineOffset: selected ? "-1px" : undefined,
      }}
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
        <CardFooter
          column={column}
          item={item}
          website={website}
          disabled={disabled}
          onEnrich={onEnrich}
          onValidateEnrich={onValidateEnrich}
          onCreateSite={onCreateSite}
          onValidateSite={onValidateSite}
          onCreateAudit={onCreateAudit}
          onValidateAudit={onValidateAudit}
          onAssign={onAssign}
        />
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
          <a
            href={normalizeUrl(item.enrichment.website_url)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 11, color: "var(--info)" }}
          >
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
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="pill info" style={{ fontSize: 10 }}>
          Prêt pour LM
        </span>
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

interface FooterProps {
  column: number;
  item: BoardItem;
  website?: string;
  disabled: boolean;
  onEnrich: () => void;
  onValidateEnrich: () => void;
  onCreateSite: () => void;
  onValidateSite: () => void;
  onCreateAudit: () => void;
  onValidateAudit: () => void;
  onAssign: () => void;
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

export default MarketingWebPipeline;
