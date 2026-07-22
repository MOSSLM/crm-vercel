"use client";

import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Loader2, Globe, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { authedFetch } from "@/utils/authedFetch";
import { createAudit } from "@/utils/auditApi";
import { getCompanyDisplayName } from "@/utils/displayHelpers";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EnrichmentProgressModal, type EnrichmentLogEntry } from "@/components/EnrichmentProgressModal";
import { PipelineMatrix } from "./marketing-pipeline/PipelineMatrix";
import type { MatrixHandlers } from "./marketing-pipeline/types";

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
  project: {
    id: string;
    pret_pour_lm: boolean;
    enrichment_validated: boolean;
    statut: string | null;
    enrichment_error: string | null;
    enrichment_attempts: number | null;
  } | null;
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

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function displayName(item: BoardItem): string {
  return getCompanyDisplayName(item.company_name || item.name, item.company_url) || item.name;
}

/* ── Component ────────────────────────────────────────────────────────────── */

export const MarketingWebPipeline: React.FC = () => {
  const supabase = React.useMemo(() => createClient(), []);

  const [board, setBoard] = React.useState<BoardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [templateId, setTemplateId] = React.useState<string>("");
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

  const afterAction = async () => {
    await load();
  };

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const runEnrich = async (items: BoardItem[], overwrite: boolean) => {
    if (items.length === 0) {
      toast.error("Aucune opportunité sélectionnée");
      return;
    }

    setWorking("enrich");

    // Server-side prep: ensure every opportunity has a lead-magnet project and
    // reset already-enriched ones so the edge function actually re-runs. This
    // removes the old "aucune opportunité … n'a de projet lead magnet" dead-end
    // and, when `overwrite`, wipes the previous enrichment first.
    let projectByOpp = new Map<string, string>();
    let prepErrors: Array<{ opportunity_id: string; error: string }> = [];
    try {
      const prepRes = await authedFetch("/api/marketing-pipeline/enrich-prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunity_ids: items.map((it) => it.id), overwrite }),
      });
      const prep = (await prepRes.json().catch(() => ({}))) as {
        prepared?: Array<{ opportunity_id: string; project_id: string }>;
        errors?: Array<{ opportunity_id: string; error: string }>;
        error?: string;
      };
      if (!prepRes.ok) throw new Error(prep.error || "Préparation de l'enrichissement échouée");
      projectByOpp = new Map((prep.prepared ?? []).map((p) => [p.opportunity_id, p.project_id]));
      prepErrors = prep.errors ?? [];
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la préparation de l'enrichissement");
      setWorking(null);
      return;
    }

    // Repli défensif : une opportunité qui a déjà un projet reste enrichissable
    // même si la préparation n'a pas pu la (ré)initialiser côté serveur.
    for (const it of items) {
      if (!projectByOpp.has(it.id) && it.project?.id) projectByOpp.set(it.id, it.project.id);
    }

    // On remonte la VRAIE raison pour les opportunités réellement bloquées.
    const blocked = prepErrors.filter((e) => !projectByOpp.has(e.opportunity_id));
    if (blocked.length > 0) {
      console.error("enrich-prepare a rejeté des opportunités :", blocked);
      const sample = blocked[0]?.error ? ` — ${blocked[0].error}` : "";
      toast.warning(`${blocked.length} opportunité(s) ignorée(s)${sample}`);
    }

    const withProject = items.filter((it) => projectByOpp.has(it.id));
    if (withProject.length === 0) {
      const reason = blocked[0]?.error ? ` : ${blocked[0].error}` : "";
      toast.error(`Aucune opportunité enrichissable${reason}`);
      setWorking(null);
      return;
    }

    const projectIds = withProject.map((it) => projectByOpp.get(it.id)!);
    const initialLogs: EnrichmentLogEntry[] = withProject.map((it) => ({
      opportunite_id: it.id,
      company_name: displayName(it),
      project_id: projectByOpp.get(it.id)!,
      status: "pending",
    }));

    setEnrichLogs(initialLogs);
    setEnrichProgress({ current: 0, total: withProject.length, isComplete: false });
    setShowEnrichModal(true);

    try {
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

  const assignAgentTo = async (item: BoardItem, agentIdArg: string) => {
    if (!agentIdArg) {
      toast.error("Choisis un agent");
      return;
    }
    if (item.entreprise_id == null) {
      toast.error("Aucune entreprise à attribuer");
      return;
    }
    setWorking("assign");
    try {
      const res = await authedFetch("/api/admin/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entreprise_id: item.entreprise_id, agent_id: agentIdArg }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Échec");
      const agentName = board?.agents.find((a) => a.id === agentIdArg)?.name ?? "agent";
      toast.success(`Attribué à ${agentName}`);
      await afterAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'attribution");
    } finally {
      setWorking(null);
    }
  };

  // Reassign the selected opportunities to another CRM pipeline (e.g. move dead
  // sites into "Entreprises sans site web"), landing them on its first stage.
  const movePipeline = async (items: BoardItem[], pipelineId: string) => {
    if (!pipelineId) {
      toast.error("Choisis un pipeline de destination");
      return;
    }
    if (items.length === 0) return;
    setWorking("move-pipeline");
    try {
      const res = await authedFetch("/api/marketing-pipeline/move-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunity_ids: items.map((it) => it.id), pipeline_id: pipelineId }),
      });
      const data = (await res.json().catch(() => ({}))) as { moved?: number; pipeline_nom?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Échec du déplacement");
      toast.success(`${data.moved ?? items.length} opportunité(s) déplacée(s) vers ${data.pipeline_nom ?? "le pipeline"}`);
      await afterAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors du déplacement");
    } finally {
      setWorking(null);
    }
  };

  /* ── Per-item handlers bound to the matrix cells ──────────────────────── */

  const matrixHandlers: MatrixHandlers = {
    onEnrich: (item) => runEnrich([item], false),
    onValidateEnrich: (item) => validateEnrichment([item]),
    onCreateSite: (item) => createSites([item]),
    onValidateSite: (item) => validateSites([item]),
    onCreateAudit: (item) => createAudits([item]),
    onValidateAudit: (item) => validateAudits([item]),
    onAssign: (item, aId) => assignAgentTo(item, aId),
    onMove: (item, pId) => movePipeline([item], pId),
    onDetails: (item) => {
      setSiteRequirement(false);
      setEditingItem(item);
    },
  };

  return (
    <>
      <PipelineMatrix
        items={board?.items ?? []}
        agents={board?.agents ?? []}
        templates={board?.templates ?? []}
        pipelines={board?.pipelines ?? []}
        templateId={templateId}
        onTemplateChange={setTemplateId}
        loading={loading}
        working={working}
        onRefresh={load}
        handlers={matrixHandlers}
      />

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
    </>
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

    // lead_magnet_projects : overrides, logo, stats, zones (sortie edge function)
    let project: Record<string, unknown> | null = null;
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
      project = {
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
      };
    }

    // Avis : on conserve l'index d'origine pour display_order (lignes vides ignorées).
    const reviewRows = projectId
      ? reviews
          .map((r, i) => ({ r, i }))
          .filter(({ r }) => r.author_name.trim() || r.review_text.trim())
          .map(({ r, i }) => ({
            id: r.id ?? null,
            author_name: r.author_name.trim(),
            review_text: r.review_text.trim(),
            rating: r.rating === "" ? 5 : Number(r.rating),
            is_active: r.is_active,
            display_order: i * 10 + 100,
          }))
      : [];

    const hasEnrData =
      form.enr_website_url || form.enr_emails || form.enr_phones || form.enr_services || form.enr_contact_page || form.enr_summary;

    // Écriture côté serveur (service client) : contourne le RLS du client
    // navigateur qui rejetait l'enregistrement des entreprises « pool ».
    const res = await authedFetch("/api/marketing-pipeline/company-details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entreprise_id: entrepriseId,
        project_id: projectId,
        enrichment_id: enrichmentId,
        company: {
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
        },
        enrichment: hasEnrData || enrichmentId
          ? {
              website_url: form.enr_website_url || null,
              emails: toArr(form.enr_emails),
              phones: toArr(form.enr_phones),
              services_list: toArr(form.enr_services),
              contact_page_url: form.enr_contact_page || null,
              site_summary: form.enr_summary || null,
            }
          : null,
        project,
        reviews: projectId ? { deleted_ids: deletedReviewIds.current, rows: reviewRows } : null,
      }),
    });

    if (!res.ok) {
      const msg = (await res.json().catch(() => ({}))).error;
      throw new Error(typeof msg === "string" && msg ? msg : "Erreur lors de l'enregistrement");
    }
    deletedReviewIds.current = [];
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
