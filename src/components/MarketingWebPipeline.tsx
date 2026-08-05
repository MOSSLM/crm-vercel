"use client";

import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Loader2, Globe, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { authedFetch } from "@/utils/authedFetch";
import { createAudit } from "@/utils/auditApi";
import { getCompanyDisplayName } from "@/utils/displayHelpers";
import { serviceTagKey } from "@/utils/serviceTags";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EnrichmentProgressModal, type EnrichmentLogEntry } from "@/components/EnrichmentProgressModal";
import { LogoField } from "./marketing-pipeline/LogoField";
import { PipelineMatrix, STAGES, AGENT_STAGES } from "./marketing-pipeline/PipelineMatrix";
import { NotesDialog } from "./marketing-pipeline/NotesDialog";
import type { MatrixHandlers, BulkHandlers, NoteSubject } from "./marketing-pipeline/types";

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
    template_id?: string | null;
    template_name?: string | null;
  } | null;
  audit: { id: string; statut: string; pdf_url: string | null } | null;
  agent: { id: string; name: string } | null;
  missing_for_site: string[];
  notes?: { open: number; total: number; open_subjects: NoteSubject[] } | null;
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

/**
 * Template retenu pour créer les sites démo, mémorisé par variante (admin /
 * agent). Sans ça, chaque retour sur la page repartait sur le premier template
 * de la liste : on croyait créer avec celui choisi la veille, et la démo
 * sortait d'un autre modèle.
 */
const templateStorageKey = (variant: MarketingPipelineVariant) => `mp:${variant}:templateId`;

function readStoredTemplateId(variant: MarketingPipelineVariant): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(templateStorageKey(variant)) ?? "";
  } catch {
    return "";
  }
}

function storeTemplateId(variant: MarketingPipelineVariant, id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(templateStorageKey(variant), id);
  } catch {
    /* stockage indisponible (mode privé) : la sélection reste valable pour la session */
  }
}

/* ── Component ────────────────────────────────────────────────────────────── */

/**
 * `admin` : board global, 5 étapes, attribution comprise.
 * `agent` : board restreint aux entreprises de l'agent connecté, 4 étapes
 *   (l'attribution a déjà eu lieu). Les actions d'étape passent par les routes
 *   `/api/agent/marketing-pipeline/*`, qui revérifient la propriété de
 *   l'entreprise et journalisent l'action — les écritures Supabase directes du
 *   mode admin seraient refusées par la RLS pour un freelance.
 */
export type MarketingPipelineVariant = "admin" | "agent";

export const MarketingWebPipeline: React.FC<{ variant?: MarketingPipelineVariant }> = ({
  variant = "admin",
}) => {
  const supabase = React.useMemo(() => createClient(), []);
  const isAgent = variant === "agent";
  const boardUrl = isAgent
    ? "/api/agent/marketing-pipeline/board"
    : "/api/marketing-pipeline/board";

  const [board, setBoard] = React.useState<BoardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [templateId, setTemplateId] = React.useState<string>("");
  const [working, setWorking] = React.useState<string | null>(null);
  const [editingItem, setEditingItem] = React.useState<BoardItem | null>(null);
  // Panneau des tickets (notes agent ↔ admin) de la ligne.
  const [notesItem, setNotesItem] = React.useState<BoardItem | null>(null);
  const [notesSubject, setNotesSubject] = React.useState<NoteSubject | undefined>(undefined);
  const [notesInbox, setNotesInbox] = React.useState(false);
  // When the edit modal is opened because a site can't be created yet, it shows
  // the missing required variables in red and gates the "create site" button.
  const [siteRequirement, setSiteRequirement] = React.useState(false);

  // Enrichment progress modal state.
  const [enrichLogs, setEnrichLogs] = React.useState<EnrichmentLogEntry[]>([]);
  const [enrichProgress, setEnrichProgress] = React.useState({ current: 0, total: 0, isComplete: false });
  const [showEnrichModal, setShowEnrichModal] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await authedFetch(boardUrl);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as BoardData;
      setBoard(data);
      // Le template choisi survit au rechargement de la page (et à un
      // rafraîchissement du board) : il n'a aucune raison de retomber sur le
      // premier de la liste entre deux créations de site. On revalide toujours
      // l'id contre la liste reçue — un template supprimé ne doit pas rester
      // sélectionné en silence, sinon la création partirait sur un id mort.
      setTemplateId((prev) => {
        const known = (id: string) => data.templates.some((t) => t.id === id);
        if (prev && known(prev)) return prev;
        const stored = readStoredTemplateId(variant);
        if (stored && known(stored)) return stored;
        return data.templates[0]?.id ?? "";
      });
    } catch {
      toast.error("Erreur lors du chargement du pipeline marketing");
    } finally {
      setLoading(false);
    }
  }, [boardUrl, variant]);

  // Une seule source de vérité pour le template : tout passe par ici, donc la
  // valeur affichée dans le menu est exactement celle qu'utilise la création.
  const chooseTemplate = React.useCallback(
    (id: string) => {
      setTemplateId(id);
      storeTemplateId(variant, id);
    },
    [variant],
  );

  const templateName = React.useMemo(
    () => board?.templates.find((t) => t.id === templateId)?.name ?? null,
    [board, templateId],
  );

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
      // Rafraîchit tout de suite : la carte « Validation données » doit être là
      // dès la fin du run, sans attendre la fermeture de la modale.
      await afterAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enrichissement");
      setEnrichProgress((p) => ({ ...p, isComplete: true }));
      await afterAction();
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
      // Les deux variantes écrivent côté serveur (service client) : un UPDATE
      // depuis le navigateur peut être filtré par la RLS et « réussir » sans
      // toucher une seule ligne — la carte suivante ne s'ouvrait alors jamais.
      const url = isAgent
        ? "/api/agent/marketing-pipeline/validate-enrichment"
        : "/api/marketing-pipeline/validate-enrichment";
      const res = await authedFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_ids: projectIds }),
      });
      const data = (await res.json().catch(() => ({}))) as { validated?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Échec de la validation");
      toast.success(`${data.validated ?? projectIds.length} enrichissement(s) validé(s)`);
      await afterAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la validation");
    } finally {
      setWorking(null);
    }
  };

  // Actually clone the template into a demo, assuming requirements are met.
  const createSiteDirect = async (items: BoardItem[]) => {
    if (!templateId || !templateName) {
      toast.error("Choisis d'abord un template en haut de page");
      return;
    }
    const targets = items.filter((it) => it.entreprise_id != null && !it.site);
    if (targets.length === 0) {
      toast.error("Aucune entreprise éligible (déjà un site ou entreprise manquante)");
      return;
    }
    setWorking("create-site");
    try {
      if (isAgent) {
        const res = await authedFetch("/api/agent/marketing-pipeline/site", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            template_id: templateId,
            entreprise_ids: targets.map((it) => it.entreprise_id),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          created?: number;
          failed?: number;
          template_name?: string | null;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error || "Échec");
        // Le nom vient du serveur : c'est le template réellement cloné.
        const used = data.template_name || templateName;
        if ((data.created ?? 0) > 0) toast.success(`${data.created} site(s) démo créé(s) depuis « ${used} »`);
        if ((data.failed ?? 0) > 0) toast.error(`${data.failed} création(s) en échec`);
      } else {
        const results = await Promise.allSettled(
          targets.map(async (it) => {
            const res = await authedFetch(`/api/site-builder/claude/${templateId}/create-demo`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ companyId: it.entreprise_id }),
            });
            const data = (await res.json().catch(() => ({}))) as {
              templateName?: string | null;
              error?: string;
            };
            if (!res.ok) throw new Error(data.error || "Échec");
            return data;
          }),
        );
        const ok = results.filter((r) => r.status === "fulfilled").length;
        const ko = results.length - ok;
        // Le nom vient du serveur : c'est le template réellement cloné.
        const used =
          results.find((r): r is PromiseFulfilledResult<{ templateName?: string | null }> =>
            r.status === "fulfilled",
          )?.value.templateName || templateName;
        if (ok > 0) toast.success(`${ok} site(s) démo créé(s) depuis « ${used} »`);
        if (ko > 0) toast.error(`${ko} création(s) en échec`);
      }
      await afterAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la création du site");
    } finally {
      setWorking(null);
    }
  };

  /**
   * Refait le site existant à partir du template sélectionné en haut de page —
   * le même (rafraîchissement) ou un autre (changement de modèle).
   *
   * C'est le MÊME site qui est reconstruit : il garde son id, donc son URL
   * publiée, son audit et son avancement. Avant, l'action créait une démo de
   * plus et le board continuait d'afficher l'ancienne — changer de template
   * semblait sans effet. Les infos de la fiche (ville, stats, logo, avis) sont
   * reprises au passage, et un site déjà publié est republié pour que le rendu
   * public suive.
   */
  const regenerateSite = async (item: BoardItem) => {
    if (!templateId || !templateName) {
      toast.error("Choisis d'abord un template en haut de page");
      return;
    }
    if (!item.site) {
      toast.error("Aucun site à refaire pour cette entreprise");
      return;
    }
    const from = item.site.template_name;
    const swapping = !!from && from !== templateName;
    const question = swapping
      ? `Refaire le site de ${displayName(item)} avec « ${templateName} » à la place de « ${from} » ?\n\nLes retouches faites dans l'éditeur sur ce site seront perdues.`
      : `Refaire le site de ${displayName(item)} depuis « ${templateName} » et reprendre les infos à jour de la fiche ?\n\nLes retouches faites dans l'éditeur sur ce site seront perdues.`;
    if (typeof window !== "undefined" && !window.confirm(question)) return;

    setWorking("create-site");
    try {
      // Côté agent, la route dédiée revérifie que l'entreprise lui est attribuée.
      const url = isAgent
        ? "/api/agent/marketing-pipeline/site"
        : "/api/marketing-pipeline/regenerate-site";
      const res = await authedFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isAgent
            ? { action: "regenerate", site_id: item.site.id, template_id: templateId }
            : { site_id: item.site.id, template_id: templateId },
        ),
      });
      const data = (await res.json().catch(() => ({}))) as {
        template_name?: string | null;
        template_changed?: boolean;
        republished?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Échec");
      const used = data.template_name || templateName;
      toast.success(
        data.template_changed
          ? `Site refait avec « ${used} »${data.republished ? " et republié" : ""}`
          : `Site refait depuis « ${used} » — infos à jour${data.republished ? ", republié" : ""}`,
      );
      await afterAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la régénération du site");
    } finally {
      setWorking(null);
    }
  };

  // Gate: before creating, every target must have its required variables filled.
  // Otherwise open the edit modal on the first incomplete company (requirement
  // mode) instead of creating anything.
  const createSites = async (items: BoardItem[]) => {
    if (!templateId || !templateName) {
      toast.error("Choisis d'abord un template en haut de page");
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
      if (isAgent) {
        const res = await authedFetch("/api/agent/marketing-pipeline/site", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "validate", site_ids: siteIds }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Échec");
        const data = (await res.json()) as { validated: number };
        toast.success(`${data.validated} site(s) validé(s)`);
      } else {
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
      }
      await afterAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la validation du site");
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
      if (isAgent) {
        const res = await authedFetch("/api/agent/marketing-pipeline/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", opportunite_ids: targets.map((it) => it.id) }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Échec");
        const data = (await res.json()) as { created: number };
        if (data.created > 0) toast.success(`${data.created} audit(s) créé(s)`);
      } else {
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
      }
      await afterAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la création de l'audit");
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
      if (isAgent) {
        const res = await authedFetch("/api/agent/marketing-pipeline/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "validate",
            opportunite_ids: items.filter((it) => it.audit).map((it) => it.id),
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Échec");
        const data = (await res.json()) as { validated: number };
        toast.success(`${data.validated} audit(s) validé(s)`);
      } else {
        const { error } = await supabase
          .from("audits")
          .update({ statut: "ready", updated_at: new Date().toISOString() })
          .in("id", auditIds);
        if (error) throw error;
        toast.success(`${auditIds.length} audit(s) validé(s)`);
      }
      await afterAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la validation");
    } finally {
      setWorking(null);
    }
  };

  const assignAgentTo = async (items: BoardItem[], agentIdArg: string) => {
    if (!agentIdArg) {
      toast.error("Choisis un agent");
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
            body: JSON.stringify({ entreprise_id: it.entreprise_id, agent_id: agentIdArg }),
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Échec");
        }),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const ko = results.length - ok;
      const agentName = board?.agents.find((a) => a.id === agentIdArg)?.name ?? "agent";
      if (ok > 0) toast.success(`${ok} entreprise(s) attribuée(s) à ${agentName}`);
      if (ko > 0) toast.error(`${ko} attribution(s) en échec`);
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
    onRegenerateSite: (item) => regenerateSite(item),
    onValidateSite: (item) => validateSites([item]),
    onCreateAudit: (item) => createAudits([item]),
    onValidateAudit: (item) => validateAudits([item]),
    // Pas d'attribution en mode agent : la colonne et son menu n'existent pas.
    onAssign: isAgent ? undefined : (item, aId) => assignAgentTo([item], aId),
    onMove: (item, pId) => movePipeline([item], pId),
    onDetails: (item) => {
      setSiteRequirement(false);
      setEditingItem(item);
    },
    onNotes: (item, subject) => {
      setNotesInbox(false);
      setNotesSubject(subject);
      setNotesItem(item);
    },
  };

  /* ── Actions de masse (barre de sélection) ────────────────────────────── */
  // Mêmes fonctions que les cartes : elles ont toujours travaillé sur des
  // tableaux, seule la sélection multiple avait disparu de l'écran.
  const bulkHandlers: BulkHandlers = {
    onEnrich: (items, overwrite) => runEnrich(items, overwrite),
    onValidateEnrich: (items) => validateEnrichment(items),
    onCreateSites: (items) => createSites(items),
    onValidateSites: (items) => validateSites(items),
    onCreateAudits: (items) => createAudits(items),
    onValidateAudits: (items) => validateAudits(items),
    onAssign: isAgent ? undefined : (items, aId) => assignAgentTo(items, aId),
    onMove: (items, pId) => movePipeline(items, pId),
  };

  return (
    <>
      <PipelineMatrix
        items={board?.items ?? []}
        agents={board?.agents ?? []}
        templates={board?.templates ?? []}
        pipelines={board?.pipelines ?? []}
        templateId={templateId}
        onTemplateChange={chooseTemplate}
        loading={loading}
        working={working}
        onRefresh={load}
        handlers={matrixHandlers}
        bulk={bulkHandlers}
        hasValidatedColumn={board?.has_validated_column ?? true}
        stages={isAgent ? AGENT_STAGES : STAGES}
        canAssign={!isAgent}
        agentMode={isAgent}
        onOpenTickets={() => {
          setNotesSubject(undefined);
          setNotesItem(null);
          setNotesInbox(true);
        }}
      />

      <NotesDialog
        item={notesItem}
        inbox={notesInbox}
        apiBase={isAgent ? "/api/agent/marketing-pipeline/notes" : "/api/marketing-pipeline/notes"}
        initialSubject={notesSubject}
        role={isAgent ? "agent" : "admin"}
        onClose={() => {
          setNotesItem(null);
          setNotesSubject(undefined);
          setNotesInbox(false);
        }}
        onChanged={load}
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
  /** Ville SEO — stockée sur `lead_magnet_projects.override_city`, remontée ici
   *  avec les champs entreprise parce qu'elle est obligatoire pour créer un site. */
  lm_override_city: string;
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
  lm_override_city: "",
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
type RequiredRule = { field: keyof EditForm; label: string; ok: (f: EditForm) => boolean };

const SITE_REQUIRED: RequiredRule[] = [
  { field: "name", label: "Nom", ok: (f) => f.name.trim().length > 0 },
  { field: "ville", label: "Ville", ok: (f) => f.ville.trim().length > 0 },
  { field: "code_postal", label: "Code postal", ok: (f) => f.code_postal.trim().length > 0 },
  { field: "telephone", label: "Téléphone", ok: (f) => f.telephone.trim().length > 0 },
  { field: "service_tags", label: "Service tags", ok: (f) => toArr(f.service_tags).length > 0 },
  // Avis Google : paire FACULTATIVE. Une entreprise sans fiche Google, ou avec
  // zéro avis, n'a rien à saisir ici et ne doit pas rester bloquée pour autant.
  // Seule la cohérence est exigée : des avis annoncés sans note afficheraient un
  // bloc noté vide. Pas de règle sur `nombre_avis`, jamais.
  // Doit rester aligné sur `missingForSite` côté API — le test
  // `missing-for-site.test.ts` compare les deux listes.
  {
    field: "note_moyenne",
    label: "Note moyenne",
    ok: (f) => (Number(f.nombre_avis) > 0 ? Number(f.note_moyenne) > 0 : true),
  },
];

/** Une stat vide au sens du rendu : "", "0", "-" et "—" n'affichent rien. */
const filledStat = (v: string): boolean => {
  const t = v.trim();
  return t !== "" && t !== "0" && t !== "-" && t !== "—";
};

// Ville SEO, logo et chiffres clés vivent sur `lead_magnet_projects` : ils ne
// sont exigés que s'il y a un projet lead magnet, sinon la fiche d'une
// entreprise sans projet serait impossible à valider (ces champs n'ont nulle
// part où être enregistrés). Tout ce que le site affiche est obligatoire — un
// site généré sans logo ni chiffres clés sort avec des blocs vides.
const SITE_REQUIRED_WITH_PROJECT: RequiredRule[] = [
  ...SITE_REQUIRED,
  { field: "lm_override_city", label: "Ville SEO", ok: (f) => f.lm_override_city.trim().length > 0 },
  { field: "lm_logo_url", label: "Logo", ok: (f) => f.lm_logo_url.trim().length > 0 },
  { field: "lm_stat_years", label: "Années d'expérience", ok: (f) => filledStat(f.lm_stat_years) },
  { field: "lm_stat_clients", label: "Clients satisfaits", ok: (f) => filledStat(f.lm_stat_clients) },
  { field: "lm_stat_installations", label: "Installations", ok: (f) => filledStat(f.lm_stat_installations) },
  // Pas de règle sur `lm_stat_rge` : une entreprise sans qualification RGE est
  // parfaitement valide, le bloc « chiffres clés » se limite alors à trois
  // colonnes. Doit rester aligné sur `missingForSite` côté API.
];

const siteRequiredFor = (hasProject: boolean): RequiredRule[] =>
  hasProject ? SITE_REQUIRED_WITH_PROJECT : SITE_REQUIRED;

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
  const [tagCatalog, setTagCatalog] = React.useState<string[]>([]);
  const deletedReviewIds = React.useRef<string[]>([]);
  const variablesRef = React.useRef<Record<string, unknown>>({});

  // Catalogue des service tags autorisés : taxonomie métier, tags déjà posés
  // sur les entreprises et les dossiers lead magnet, allowlist des Paramètres
  // appliquée. Rechargé à CHAQUE ouverture de fiche — un tag saisi à la main
  // ailleurs (ou ici même, à la fiche précédente) doit se retrouver dans la
  // liste au lieu d'être retapé une seconde fois.
  const modalOpen = !!item;
  React.useEffect(() => {
    if (!modalOpen) return;
    let cancelled = false;
    authedFetch("/api/site-builder/service-tags")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { tags?: string[] } | null) => {
        if (!cancelled && Array.isArray(data?.tags)) setTagCatalog(data.tags);
      })
      .catch(() => {
        /* catalogue indisponible : la saisie libre reste possible */
      });
    return () => {
      cancelled = true;
    };
  }, [modalOpen]);

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
        lm_override_city: (p.override_city as string) ?? "",
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

  // Le dossier lead magnet est créé à l'enregistrement quand il manque : ses
  // champs sont donc toujours exigés, sinon une fiche « complète » sans ville
  // SEO ni chiffres clés resterait bloquée à l'étape suivante.
  const requiredRules = siteRequiredFor(true);
  const missingRequired = requiredRules.filter((r) => !r.ok(form)).map((r) => r.label);
  const invalidFields = new Set(requiredRules.filter((r) => !r.ok(form)).map((r) => r.field));
  const showInvalid = (field: keyof EditForm) => siteRequirement && invalidFields.has(field);

  const persist = async (): Promise<boolean> => {
    if (entrepriseId == null) return false;

    // lead_magnet_projects : overrides, logo, stats, zones (sortie edge function).
    // Envoyé même sans dossier existant — le serveur le crée alors, ce qui rend
    // l'enrichissement manuel possible de bout en bout.
    const project: Record<string, unknown> = (() => {
      const vars: Record<string, unknown> = { ...variablesRef.current };
      const zones = toArr(form.lm_zones);
      if (zones.length > 0) {
        vars.surrounding_cities = zones;
        vars.surrounding_cities_text = zones.join("; ");
      } else {
        delete vars.surrounding_cities;
        delete vars.surrounding_cities_text;
      }
      return {
        override_entreprise_name: form.lm_override_name || null,
        // Ville SEO. `override_location` en est le miroir historique : on le
        // synchronise pour que les designs qui utilisent encore
        // `{{ entreprise.location }}` restent alignés sur ce que la fiche affiche.
        override_city: form.lm_override_city || null,
        override_location: form.lm_override_city || null,
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
    })();

    // Avis : on conserve l'index d'origine pour display_order (lignes vides ignorées).
    const reviewRows = reviews
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.author_name.trim() || r.review_text.trim())
      .map(({ r, i }) => ({
        id: r.id ?? null,
        author_name: r.author_name.trim(),
        review_text: r.review_text.trim(),
        rating: r.rating === "" ? 5 : Number(r.rating),
        is_active: r.is_active,
        display_order: i * 10 + 100,
      }));

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
        // Sans dossier lead magnet, le serveur en crée un pour cette opportunité.
        opportunite_id: item?.id ?? null,
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
        reviews: { deleted_ids: deletedReviewIds.current, rows: reviewRows },
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
                <Field
                  label="Ville SEO"
                  required
                  invalid={showInvalid("lm_override_city")}
                  hint="Grande ville la plus proche — celle mise en avant partout sur le site. Si l'entreprise est déjà dans une grande ville, remets la même."
                >
                  <Input
                    value={form.lm_override_city}
                    onChange={set("lm_override_city")}
                    placeholder={form.ville}
                  />
                </Field>
                <Field label="Code postal" required invalid={showInvalid("code_postal")}><Input value={form.code_postal} onChange={set("code_postal")} /></Field>
                <Field label="Téléphone" required invalid={showInvalid("telephone")}><Input value={form.telephone} onChange={set("telephone")} /></Field>
                {/* L'astérisque de la note suit le nombre d'avis : sans avis il
                    n'y a rien à noter, et la marquer obligatoire réclamerait un
                    chiffre que l'entreprise n'a pas. */}
                <Field
                  label="Note moyenne"
                  required={Number(form.nombre_avis) > 0}
                  invalid={showInvalid("note_moyenne")}
                >
                  <Input type="number" step="0.1" value={form.note_moyenne} onChange={set("note_moyenne")} placeholder="4.8" />
                </Field>
                <Field label="Nombre d'avis">
                  <Input type="number" value={form.nombre_avis} onChange={set("nombre_avis")} placeholder="120" />
                </Field>
                <Field label="Email"><Input value={form.email} onChange={set("email")} /></Field>
                <Field label="Site web"><Input value={form.site_web} onChange={set("site_web")} /></Field>
                <Field label="LinkedIn"><Input value={form.linkedin_url} onChange={set("linkedin_url")} /></Field>
                <Field label="Adresse"><Input value={form.adresse} onChange={set("adresse")} /></Field>
                <div className="sm:col-span-2">
                  <Field
                    label="Service tags"
                    required
                    invalid={showInvalid("service_tags")}
                    hint="Choisis-les dans la liste des tags autorisés : ce sont eux qui commandent les pages et les visuels du site. Un métier absent de la liste se saisit dans le champ à côté."
                  >
                    <ServiceTagsField
                      value={form.service_tags}
                      catalog={tagCatalog}
                      onChange={(v) => setForm((f) => ({ ...f, service_tags: v }))}
                      placeholder="autre tag…"
                    />
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

            <>
                <div>
                  <h4 className="text-sm font-semibold mb-2">Lead magnet — overrides &amp; logo</h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    Ce que l&apos;enrichissement a produit et ce que le site utilise. Vide = la
                    valeur entreprise ci-dessus est utilisée.
                  </p>
                  {projectId == null && (
                    <p className="mb-2 text-xs text-muted-foreground">
                      Aucun dossier lead magnet pour cette entreprise : il sera créé à
                      l&apos;enregistrement, avec ce que vous saisissez ici.
                    </p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Nom affiché (override)"><Input value={form.lm_override_name} onChange={set("lm_override_name")} placeholder={form.name} /></Field>
                    <LogoField
                      label="Logo"
                      required
                      invalid={showInvalid("lm_logo_url")}
                      hint="Affiché en en-tête du site : sans lui, la démo sort sans identité."
                      value={form.lm_logo_url}
                      entrepriseId={item?.entreprise_id ?? null}
                      onChange={(url) => setForm((f) => ({ ...f, lm_logo_url: url }))}
                    />
                    <Field label="Téléphone (override)"><Input value={form.lm_override_phone} onChange={set("lm_override_phone")} placeholder={form.telephone} /></Field>
                    <Field label="Email (override)"><Input value={form.lm_override_email} onChange={set("lm_override_email")} placeholder={form.email} /></Field>
                    <Field label="Horaires"><Input value={form.horaires} onChange={set("horaires")} placeholder="Lun–Ven 8h–18h" /></Field>
                    <div className="sm:col-span-2">
                      <Field label="Adresse (override)"><Input value={form.lm_override_address} onChange={set("lm_override_address")} placeholder={form.adresse} /></Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="Zones desservies (villes autour, séparées par des virgules)"><Input value={form.lm_zones} onChange={set("lm_zones")} placeholder="Annecy, Seynod, Cran-Gevrier" /></Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="Service tags du lead magnet">
                        <ServiceTagsField
                          value={form.lm_service_tags_snapshot}
                          catalog={tagCatalog}
                          onChange={(v) => setForm((f) => ({ ...f, lm_service_tags_snapshot: v }))}
                          placeholder="autre tag…"
                        />
                      </Field>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold mb-2">Chiffres clés (stats)</h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    Le bloc « chiffres clés » du site affiche ce qui est renseigné : une valeur vide
                    ou à 0 laisse un trou dans la page, donc les trois premiers sont requis. Les
                    qualifications RGE restent facultatives — toutes les entreprises n&apos;en ont pas.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Field label="Années d'expérience" required invalid={showInvalid("lm_stat_years")}>
                      <Input type="number" value={form.lm_stat_years} onChange={set("lm_stat_years")} />
                    </Field>
                    <Field label="Clients satisfaits" required invalid={showInvalid("lm_stat_clients")}>
                      <Input type="number" value={form.lm_stat_clients} onChange={set("lm_stat_clients")} />
                    </Field>
                    <Field label="Installations" required invalid={showInvalid("lm_stat_installations")}>
                      <Input type="number" value={form.lm_stat_installations} onChange={set("lm_stat_installations")} />
                    </Field>
                    <Field label="Qualifications (RGE)" hint="facultatif — 0 ou vide n'empêche pas d'enregistrer">
                      <Input type="number" value={form.lm_stat_rge} onChange={set("lm_stat_rge")} />
                    </Field>
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

/**
 * Saisie des service tags : les tags autorisés se piochent dans une liste
 * déroulante (catalogue global `/api/site-builder/service-tags`, allowlist
 * `enrichment_tag_settings` déjà appliquée) plutôt que d'être retapés. Une
 * faute de frappe créait jusqu'ici un tag jumeau — « climatisation » vs
 * « climatisaton » — qu'aucune page, section ni image de la médiathèque ne
 * reconnaissait, et le site sortait amputé sans rien signaler.
 *
 * La saisie libre reste ouverte à côté : le catalogue est bâti sur les tags
 * DÉJÀ utilisés, il ne peut donc pas contenir celui d'un métier rencontré pour
 * la première fois.
 *
 * La valeur reste la chaîne « a, b, c » du formulaire — le reste de la modale
 * (et `toArr` à l'enregistrement) n'a pas à savoir d'où viennent les tags.
 */
const ServiceTagsField: React.FC<{
  value: string;
  catalog: string[];
  onChange: (next: string) => void;
  placeholder?: string;
}> = ({ value, catalog, onChange, placeholder }) => {
  const selected = React.useMemo(() => toArr(value), [value]);
  // Comparaison par clé canonique (accents, casse, tirets) : « Pompe à chaleur »
  // et « pompe-a-chaleur » sont le même tag, il ne faut pas l'ajouter deux fois.
  const selectedKeys = React.useMemo(
    () => new Set(selected.map((t) => serviceTagKey(t))),
    [selected],
  );
  const available = React.useMemo(
    () => catalog.filter((t) => !selectedKeys.has(serviceTagKey(t))),
    [catalog, selectedKeys],
  );
  const [draft, setDraft] = React.useState("");

  const add = (tag: string) => {
    const t = tag.trim();
    if (!t || selectedKeys.has(serviceTagKey(t))) return;
    onChange([...selected, t].join(", "));
  };
  const remove = (tag: string) => onChange(selected.filter((t) => t !== tag).join(", "));
  const addDraft = () => {
    add(draft);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((tag, i) => (
            <span
              key={`${tag}-${i}`}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
            >
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                aria-label={`Retirer ${tag}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <Select value="" onValueChange={add} disabled={available.length === 0}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue
                placeholder={
                  catalog.length === 0
                    ? "Catalogue indisponible"
                    : available.length === 0
                      ? "Tous les tags autorisés sont déjà là"
                      : "Ajouter un tag autorisé…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {available.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Input
          className="flex-1 min-w-0 h-8"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDraft();
            }
          }}
          placeholder={placeholder ?? "autre tag…"}
        />
        <button type="button" className="btn ghost sm" onClick={addDraft} disabled={!draft.trim()}>
          <Plus className="ico-sm" />
        </button>
      </div>
    </div>
  );
};

const Field: React.FC<{
  label: string;
  required?: boolean;
  invalid?: boolean;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, required, invalid, hint, children }) => (
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
    {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
  </div>
);

export default MarketingWebPipeline;
