"use client";

import React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { MAX_PSI_PAR_LOT } from "@/utils/constants";
import { SITE_DOMAIN } from "@/lib/site-domain";
import { Check, Loader2, Globe, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { authedFetch } from "@/utils/authedFetch";
import { createAudit } from "@/utils/auditApi";
import { getCompanyDisplayName } from "@/utils/displayHelpers";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { EnrichmentProgressModal, type EnrichmentLogEntry } from "@/components/EnrichmentProgressModal";
import { PipelineMatrix, STAGES, AGENT_STAGES } from "./marketing-pipeline/PipelineMatrix";
import { NotesDialog } from "./marketing-pipeline/NotesDialog";
import { CompleteDataDialog } from "./marketing-pipeline/CompleteDataDialog";
// Les exigences de complétude vivaient ici ; elles sont désormais partagées avec
// la grille de complétion en masse et avec le test qui les compare à
// `missingForSite` côté API.
import {
  SITE_REQUIRED_WITH_PROJECT,
  fromArr,
  numStr,
  ruleApplies,
  siteRequiredFor,
  toArr,
  type RequiredField,
} from "./marketing-pipeline/required-fields";
import {
  SELF_LABELLED_FIELDS,
  ServiceTagsField,
  requiredFieldControl,
} from "./marketing-pipeline/RequiredFieldControl";
import { AUTO_SEQUENCE } from "./marketing-pipeline/types";
import type {
  AgentRef,
  BoardData,
  BoardItem,
  BulkHandlers,
  MatrixHandlers,
  NoteSubject,
  PipelineRef,
  TemplateRef,
} from "./marketing-pipeline/types";
import { sequenceSuggeree } from "@/lib/prospects/canal";
import { ArchiveDialog, type ArchiveTarget } from "./archive/ArchiveDialog";

/* ── Types (mirror /api/marketing-pipeline/board) ─────────────────────────── */

/* Les types du board vivent dans `marketing-pipeline/types.ts`, partagés avec
 * la matrice. La copie qui vivait ici avait déjà dérivé : elle ignorait
 * `note_site`, `published_subdomain` et `og_image_url`, pourtant renvoyés par
 * l'API et affichés par la matrice. Deux définitions d'une même réponse finissent
 * toujours par se contredire. */

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
  // Le filtre « archivés » est côté serveur : basculer, c'est recharger.
  const [showArchived, setShowArchived] = React.useState(false);
  const boardUrl =
    (isAgent ? "/api/agent/marketing-pipeline/board" : "/api/marketing-pipeline/board") +
    (showArchived ? "?archived=1" : "");

  const [board, setBoard] = React.useState<BoardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [templateId, setTemplateId] = React.useState<string>("");
  const [working, setWorking] = React.useState<string | null>(null);
  const [editingItem, setEditingItem] = React.useState<BoardItem | null>(null);
  /** Lignes ouvertes dans la grille de complétion en masse (`null` = fermée). */
  const [completing, setCompleting] = React.useState<BoardItem[] | null>(null);
  // Panneau des tickets (notes agent ↔ admin) de la ligne.
  const [notesItem, setNotesItem] = React.useState<BoardItem | null>(null);
  const [notesSubject, setNotesSubject] = React.useState<NoteSubject | undefined>(undefined);
  const [notesInbox, setNotesInbox] = React.useState(false);
  /** Lignes visées par le dialogue d'archivage (`null` = fermé). */
  const [archiveTarget, setArchiveTarget] = React.useState<ArchiveTarget | null>(null);
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
  type RegenResult = {
    template_name?: string | null;
    template_changed?: boolean;
    republished?: boolean;
    error?: string;
  };

  /**
   * L'appel réseau seul, sans confirmation ni notification.
   *
   * Extrait pour que le bouton d'une ligne et l'action de masse refassent un
   * site de la MÊME façon : deux implémentations divergeraient, et la
   * divergence se verrait sur les sites publiés.
   */
  const regenerateOne = async (siteId: string): Promise<RegenResult> => {
    // Côté agent, la route dédiée revérifie que l'entreprise lui est attribuée.
    const url = isAgent
      ? "/api/agent/marketing-pipeline/site"
      : "/api/marketing-pipeline/regenerate-site";
    const res = await authedFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isAgent
          ? { action: "regenerate", site_id: siteId, template_id: templateId }
          : { site_id: siteId, template_id: templateId },
      ),
    });
    const data = (await res.json().catch(() => ({}))) as RegenResult;
    if (!res.ok) throw new Error(data.error || "Échec");
    return data;
  };

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
      const data = await regenerateOne(item.site.id);
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

  /**
   * Refait PLUSIEURS sites existants depuis le template choisi en haut de page.
   *
   * « Créer les sites » ne sait traiter que les lignes sans site : rebasculer un
   * parc déjà construit sur un nouveau modèle se faisait donc une ligne à la
   * fois. Chaque site garde son id — donc son URL publiée, son audit et son
   * avancement.
   *
   * Déroulé par petits paquets et non d'un bloc : refaire un site enchaîne
   * plusieurs allers-retours en base, supprime puis réinsère ses pages, et
   * republie s'il l'était. Lâcher cent appels d'un coup saturerait la connexion
   * et ferait échouer des sites au hasard — un échec ici laisse un site à moitié
   * refait, ce qu'on ne veut pas subir en masse.
   */
  const REGEN_PAR_PAQUET = 4;

  const regenerateSites = async (items: BoardItem[]) => {
    if (!templateId || !templateName) {
      toast.error("Choisis d'abord un template en haut de page");
      return;
    }
    const targets = items.filter((it) => it.site);
    if (targets.length === 0) {
      toast.error("Aucun site à refaire dans la sélection");
      return;
    }
    // Ceux qui changent réellement de modèle, par opposition à un simple
    // rafraîchissement : la question posée n'est pas la même.
    const swapping = targets.filter(
      (it) => !!it.site?.template_name && it.site.template_name !== templateName,
    ).length;
    const question =
      `Refaire ${targets.length} site(s) depuis « ${templateName} » ?\n\n` +
      (swapping > 0
        ? `${swapping} d'entre eux changent de modèle, les autres sont rafraîchis avec les infos à jour des fiches.\n\n`
        : "Les infos des fiches seront reprises à jour.\n\n") +
      "Les retouches faites dans l'éditeur sur ces sites seront perdues.";
    if (typeof window !== "undefined" && !window.confirm(question)) return;

    setWorking("create-site");
    // Un lot de cent sites prend plusieurs minutes. Sans compteur, l'écran a
    // l'air figé et on relance — ce qui referait tout une seconde fois.
    const suivi = toast.loading(`Refonte de ${targets.length} site(s)…`);
    try {
      let ok = 0;
      const echecs: string[] = [];
      for (let i = 0; i < targets.length; i += REGEN_PAR_PAQUET) {
        const paquet = targets.slice(i, i + REGEN_PAR_PAQUET);
        const res = await Promise.allSettled(paquet.map((it) => regenerateOne(it.site!.id)));
        res.forEach((r, j) => {
          if (r.status === "fulfilled") ok++;
          else echecs.push(displayName(paquet[j]));
        });
        toast.loading(`${ok + echecs.length}/${targets.length} traité(s)…`, { id: suivi });
      }
      toast.dismiss(suivi);
      if (ok > 0) toast.success(`${ok} site(s) refait(s) depuis « ${templateName} »`);
      // Nommer les entreprises en échec : sur un lot de cent, « 3 échecs » ne
      // dit pas lesquelles reprendre.
      if (echecs.length > 0) {
        const noms = echecs.slice(0, 5).join(", ");
        toast.error(
          `${echecs.length} échec(s) : ${noms}${echecs.length > 5 ? `… et ${echecs.length - 5} autre(s)` : ""}`,
        );
      }
      await afterAction();
    } catch (e) {
      toast.dismiss(suivi);
      toast.error(e instanceof Error ? e.message : "Erreur lors de la régénération des sites");
    } finally {
      setWorking(null);
    }
  };

  /**
   * Retire au sort les photos des sites sélectionnés.
   *
   * Même tirage que le panneau « Images » de l'éditeur, mais sur tout un lot :
   * ouvrir chaque site pour cliquer le même bouton est ce qui faisait renoncer,
   * et un parc entier restait avec les photos du modèle.
   *
   * Deux conditions, vérifiées par la route et pas ici : le site doit être un
   * design Claude (lui seul a des zones à remplir) et son entreprise doit porter
   * des services — ce sont eux qui choisissent les photos. D'où des refus nommés
   * un par un avec leur cause : « aucun service tag » se corrige sur la fiche,
   * « aucune image ne porte ses services » dans la médiathèque. Relancer le
   * tirage, lui, n'y changerait rien.
   */
  // Chaque tirage lit la médiathèque puis réécrit toutes les pages du site :
  // un lot de cent lancé d'un coup se ferait limiter.
  const IMAGES_PAR_PAQUET = 3;

  const tirerImages = async (items: BoardItem[]) => {
    const targets = items.filter((it) => it.site?.is_claude_design && it.entreprise_id != null);
    if (targets.length === 0) {
      toast.error("Aucun design Claude dans la sélection — seules ces maquettes ont des zones photo");
      return;
    }

    setWorking("create-site");
    const suivi = toast.loading(`Tirage des photos de ${targets.length} site(s)…`);
    try {
      let ok = 0;
      /** Emplacements réellement remplis, toutes pages confondues. */
      let emplacements = 0;
      /** Sites dont la médiathèque n'a pas couvert toutes les cartes. */
      let courts = 0;
      /**
       * Sites déjà en ligne : la page publique sert l'instantané de leur
       * dernière publication, où les nouvelles photos ne sont pas.
       */
      let enLigne = 0;
      /** Vignettes déjà fabriquées, donc devenues fausses par ce tirage. */
      let vignettesObsoletes = 0;
      const echecs: string[] = [];

      for (let i = 0; i < targets.length; i += IMAGES_PAR_PAQUET) {
        const paquet = targets.slice(i, i + IMAGES_PAR_PAQUET);
        const res = await Promise.allSettled(
          paquet.map(async (it) => {
            const r = await authedFetch(`/api/site-builder/designs/${it.site!.id}/auto-images`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ entrepriseId: it.entreprise_id }),
            });
            const body = (await r.json().catch(() => ({}))) as {
              error?: string;
              written?: number;
              hiddenSlots?: number;
            };
            if (!r.ok) throw new Error(body.error || `Erreur ${r.status}`);
            return body;
          }),
        );
        res.forEach((r, j) => {
          if (r.status === "rejected") {
            echecs.push(
              `${displayName(paquet[j])} (${r.reason instanceof Error ? r.reason.message : "échec"})`,
            );
            return;
          }
          ok++;
          emplacements += r.value.written ?? 0;
          if ((r.value.hiddenSlots ?? 0) > 0) courts++;
          // Un site en ligne demande une republication, qui refait la vignette
          // au passage : le compter des deux côtés ferait dire deux fois la
          // même chose, en proposant deux corrections dont une inutile.
          if (paquet[j].site?.is_published) enLigne++;
          else if (paquet[j].site?.og_image_url) vignettesObsoletes++;
        });
        toast.loading(`${ok + echecs.length}/${targets.length} site(s) traité(s)…`, { id: suivi });
      }

      toast.dismiss(suivi);
      if (ok > 0) toast.success(`${ok} site(s) — ${emplacements} emplacement(s) remplis`);
      // Une carte en moins n'est pas un échec : la bande préfère se raccourcir
      // plutôt que montrer deux fois la même photo. Mais ça se répare en
      // important, pas en relançant — donc on le dit.
      if (courts > 0) {
        toast.info(
          `${courts} site(s) à court de photos : des cartes ont été retirées plutôt que dupliquées. Importe des images pour leurs services.`,
        );
      }
      if (echecs.length > 0) {
        const noms = echecs.slice(0, 3).join(" · ");
        toast.error(
          `${echecs.length} échec(s) : ${noms}${echecs.length > 3 ? `… et ${echecs.length - 3} autre(s)` : ""}`,
        );
      }
      // Le tirage écrit sur le site de travail ; la page publique, elle, sert
      // l'instantané figé à la dernière publication. Sans republication, le
      // prospect ouvre son lien et voit les anciennes photos.
      if (enLigne > 0) {
        toast.info(
          `${enLigne} site(s) en ligne servent encore les anciennes photos — « Publier les sites » pour les republier.`,
        );
      }
      // La vignette est une capture : celles déjà fabriquées montrent les
      // anciennes photos, et c'est cette image-là qui part dans les messages.
      if (vignettesObsoletes > 0) {
        toast.info(
          `${vignettesObsoletes} vignette(s) de partage montrent encore les anciennes photos — reprépare-les avant d'envoyer les liens.`,
        );
      }
    } catch (e) {
      toast.dismiss(suivi);
      toast.error(e instanceof Error ? e.message : "Erreur lors du tirage des images");
    } finally {
      setWorking(null);
    }
  };

  /**
   * Analyse en masse le site ACTUEL des entreprises sélectionnées.
   *
   * Même déroulé par paquets que la refonte, et pour la même raison : chaque
   * analyse sort sur le réseau vers un site tiers, parfois lent, parfois mort.
   * Cent appels lâchés d'un coup font expirer les derniers au hasard.
   *
   * Les échecs sont NOMMÉS. « 7 échecs » sur un lot de cent ne dit pas
   * lesquelles reprendre, et le rattrapage se fait alors à l'aveugle.
   */
  const ANALYSE_PAR_PAQUET = 4;

  const analyserSites = async (items: BoardItem[]) => {
    const targets = items.filter((it) => it.entreprise_id != null);
    if (targets.length === 0) {
      toast.error("Aucune entreprise dans la sélection");
      return;
    }

    setWorking("create-site");
    const suivi = toast.loading(`Analyse de ${targets.length} site(s)…`);
    try {
      let ok = 0;
      let sansSite = 0;
      const echecs: string[] = [];
      for (let i = 0; i < targets.length; i += ANALYSE_PAR_PAQUET) {
        const paquet = targets.slice(i, i + ANALYSE_PAR_PAQUET);
        const res = await Promise.allSettled(
          paquet.map(async (it) => {
            const r = await authedFetch(`/api/audit-site/${it.entreprise_id}`, { method: "POST" });
            const body = (await r.json().catch(() => ({}))) as { error?: string; statut?: string };
            if (!r.ok) throw new Error(body.error || `Erreur ${r.status}`);
            return body.statut;
          }),
        );
        res.forEach((r, j) => {
          if (r.status !== "fulfilled") {
            echecs.push(displayName(paquet[j]));
            return;
          }
          ok++;
          // « Pas de site » n'est pas un échec : c'est un résultat, et l'un des
          // plus vendables du parc. Il mérite son propre compte.
          if (r.value === "injoignable") sansSite++;
        });
        toast.loading(`${ok + echecs.length}/${targets.length} analysé(s)…`, { id: suivi });
      }
      toast.dismiss(suivi);
      if (ok > 0) {
        toast.success(
          `${ok} site(s) analysé(s)` +
            (sansSite > 0 ? ` — dont ${sansSite} sans site ou injoignable(s)` : ""),
        );
      }
      if (echecs.length > 0) {
        const noms = echecs.slice(0, 5).join(", ");
        toast.error(
          `${echecs.length} échec(s) : ${noms}${echecs.length > 5 ? `… et ${echecs.length - 5} autre(s)` : ""}`,
        );
      }
      await afterAction();
    } catch (e) {
      toast.dismiss(suivi);
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'analyse des sites");
    } finally {
      setWorking(null);
    }
  };

  /**
   * Fait mesurer la sélection par Google PageSpeed.
   *
   * TROIS DIFFÉRENCES AVEC « Analyser les sites », et chacune vient du coût.
   * L'analyse maison prend une seconde et ne coûte rien ; celle-ci fait tourner
   * un vrai Chrome chez Google pendant une quarantaine de secondes et consomme
   * un quota journalier.
   *
   * 1. **Séquentiel, pas par paquets.** Chaque mesure retient une fonction
   *    serverless pendant quarante secondes ; quatre en parallèle en retiennent
   *    quatre. Et Google limite de son côté — les paralléliser ferait surtout
   *    récolter des 429.
   * 2. **Plafonné.** Au-delà, on n'outille plus un démarchage, on balaye un
   *    parc : quarante secondes par site, ça se compte en heures et ça vide le
   *    quota pour des entreprises qu'on n'appellera pas cette semaine.
   * 3. **Ce qui est laissé de côté est DIT.** Une sélection tronquée en silence
   *    se remarque devant un prospect dont l'audit n'a pas les constats Google.
   *
   * Seules les entreprises déjà analysées sont éligibles : la route répond 409
   * sinon, l'analyse maison étant ce qui détermine l'URL réellement atteinte
   * après redirections.
   */
  const mesurerPsiSites = async (items: BoardItem[]) => {
    // Pas de filtre sur « déjà analysée » ici : le bouton compte déjà les
    // éligibles, et la route répond 409 avec sa raison. Refaire le test à deux
    // endroits, c'est deux endroits à tenir d'accord — autant laisser le
    // serveur, seul à savoir, le dire dans le message d'échec.
    const eligibles = items.filter((it) => it.entreprise_id != null);
    if (eligibles.length === 0) {
      toast.error("Aucune entreprise dans la sélection");
      return;
    }

    const targets = eligibles.slice(0, MAX_PSI_PAR_LOT);
    const ecartes = eligibles.length - targets.length;

    setWorking("create-site");
    const minutes = Math.ceil((targets.length * 40) / 60);
    const suivi = toast.loading(
      `Mesure Google de ${targets.length} site(s) — environ ${minutes} min…`,
    );
    try {
      let ok = 0;
      const echecs: string[] = [];

      for (const [i, it] of targets.entries()) {
        try {
          const r = await authedFetch(`/api/audit-site/${it.entreprise_id}/pagespeed`, {
            method: "POST",
          });
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          if (!r.ok) throw new Error(body.error || `Erreur ${r.status}`);
          ok++;
        } catch (e) {
          // Le nom ET la cause : « quota dépassé » et « 409 » se corrigent
          // différemment, et un échec anonyme oblige à tout refaire pour savoir.
          echecs.push(`${displayName(it)} (${e instanceof Error ? e.message : "échec"})`);
        }
        toast.loading(`${i + 1}/${targets.length} mesuré(s) par Google…`, { id: suivi });
      }

      toast.dismiss(suivi);
      if (ok > 0) toast.success(`${ok} site(s) mesuré(s) par Google`);
      if (echecs.length > 0) {
        const noms = echecs.slice(0, 3).join(" · ");
        toast.error(
          `${echecs.length} échec(s) : ${noms}${echecs.length > 3 ? `… et ${echecs.length - 3} autre(s)` : ""}`,
        );
      }
      if (ecartes > 0) {
        toast.info(
          `${ecartes} entreprise(s) non mesurée(s) : ${MAX_PSI_PAR_LOT} par lot au maximum. Relancez sur le reste.`,
        );
      }
      await afterAction();
    } catch (e) {
      toast.dismiss(suivi);
      toast.error(e instanceof Error ? e.message : "Erreur lors de la mesure Google");
    } finally {
      setWorking(null);
    }
  };

  /**
   * Met en ligne les sites sélectionnés, chacun sur son sous-domaine.
   *
   * C'est l'adresse envoyée au prospect qui change : tant qu'un site n'est pas
   * déployé, son lien de partage porte l'identifiant technique
   * (`3f2b…-….samadigitalstudio.fr`) — celui-là, personne ne l'ouvre. Publié, il
   * devient `entreprise.samadigitalstudio.fr` : le prospect y lit son propre nom
   * avant même de cliquer.
   *
   * Le sous-domaine est déduit côté serveur de l'URL — ou du nom — de
   * l'entreprise, et rendu unique s'il est déjà pris ; un site déjà publié garde
   * le sien. Rien à saisir, donc — c'est ce qui rend le lot possible.
   *
   * SÉQUENTIEL, contrairement aux autres actions de masse. Deux publications
   * menées en parallèle lisent la même liste de sous-domaines déjà attribués et
   * peuvent en déduire le même : la base refuse le doublon, et c'est une
   * publication perdue pour une raison que l'opérateur ne peut pas corriger. La
   * route de déploiement en lot du site-builder passe en file pour cette raison
   * exacte ; on fait pareil.
   */
  const publierSites = async (items: BoardItem[]) => {
    const targets = items.filter((it) => it.site);
    if (targets.length === 0) {
      toast.error("Aucun site dans la sélection");
      return;
    }
    const republies = targets.filter((it) => it.site!.is_published).length;
    // Un site jamais regardé publié sous le nom de l'entreprise, c'est une page
    // à moitié faite en ligne à son adresse : ça se dit avant, pas après.
    const nonValides = targets.filter(
      (it) => !it.site!.is_published && it.site!.build_stage !== "pret",
    ).length;
    const question =
      `Mettre ${targets.length} site(s) en ligne ?\n\n` +
      `Chacun sera publié sur un sous-domaine tiré du nom de son entreprise.\n` +
      (republies > 0
        ? `${republies} sont déjà publiés : ils gardent leur adresse et reprennent ce qui a changé depuis.\n`
        : "") +
      (nonValides > 0 ? `\n⚠ ${nonValides} ne sont pas encore validés.` : "");
    if (typeof window !== "undefined" && !window.confirm(question)) return;

    setWorking("create-site");
    const suivi = toast.loading(`Publication de ${targets.length} site(s)…`);
    try {
      let ok = 0;
      /** Adresses obtenues, pour montrer à quoi ressemble le résultat. */
      const adresses: string[] = [];
      const echecs: string[] = [];

      for (const [i, it] of targets.entries()) {
        try {
          const r = await authedFetch(`/api/site-builder/sites/${it.site!.id}/deploy`, {
            method: "POST",
          });
          const body = (await r.json().catch(() => ({}))) as { error?: string; subdomain?: string };
          if (!r.ok) throw new Error(body.error || `Erreur ${r.status}`);
          ok++;
          if (body.subdomain) adresses.push(body.subdomain);
        } catch (e) {
          // Avec la cause : « sous-domaine déjà utilisé » se règle en renommant,
          // « site introuvable » pas du tout.
          echecs.push(`${displayName(it)} (${e instanceof Error ? e.message : "échec"})`);
        }
        toast.loading(`${i + 1}/${targets.length} publié(s)…`, { id: suivi });
      }

      toast.dismiss(suivi);
      if (ok > 0) {
        // Une adresse en exemple : c'est elle le résultat visible de l'action,
        // et la voir vaut mieux que la deviner.
        const exemple = adresses[0] ? ` — ex. ${adresses[0]}.${SITE_DOMAIN}` : "";
        toast.success(`${ok} site(s) en ligne${exemple}`);
      }
      if (echecs.length > 0) {
        const noms = echecs.slice(0, 3).join(" · ");
        toast.error(
          `${echecs.length} échec(s) : ${noms}${echecs.length > 3 ? `… et ${echecs.length - 3} autre(s)` : ""}`,
        );
      }
      // Publier remet la carte de partage à zéro : elle montrerait le site
      // d'AVANT la mise en ligne, y compris sous l'ancienne adresse.
      if (ok > 0) {
        toast.info("Vignettes de partage à refaire — « Préparer les vignettes » avant d'envoyer les liens.");
      }
      await afterAction();
    } catch (e) {
      toast.dismiss(suivi);
      toast.error(e instanceof Error ? e.message : "Erreur lors de la publication des sites");
    } finally {
      setWorking(null);
    }
  };

  /**
   * Fabrique à l'avance les vignettes de partage de la sélection.
   *
   * À lancer AVANT une campagne automatique. Deux captures par site, une
   * vingtaine de secondes chacune : on avance par petits paquets pour ne pas se
   * faire limiter par le service, et on nomme les échecs pour pouvoir les
   * reprendre.
   */
  const VIGNETTE_PAR_PAQUET = 3;

  const preparerVignettes = async (items: BoardItem[]) => {
    const targets = items.filter((it) => it.site);
    if (targets.length === 0) {
      toast.error("Aucun site dans la sélection");
      return;
    }

    setWorking("create-site");
    const suivi = toast.loading(`Préparation de ${targets.length} vignette(s)…`);
    try {
      let ok = 0;
      const echecs: string[] = [];
      for (let i = 0; i < targets.length; i += VIGNETTE_PAR_PAQUET) {
        const paquet = targets.slice(i, i + VIGNETTE_PAR_PAQUET);
        const res = await Promise.allSettled(
          paquet.map(async (it) => {
            const r = await authedFetch(`/api/og/demo/${it.site!.id}/prepare`, { method: "POST" });
            const body = (await r.json().catch(() => ({}))) as { error?: string };
            if (!r.ok) throw new Error(body.error || `Erreur ${r.status}`);
          }),
        );
        res.forEach((r, j) => {
          if (r.status === "fulfilled") ok++;
          else echecs.push(displayName(paquet[j]));
        });
        toast.loading(`${ok + echecs.length}/${targets.length} préparée(s)…`, { id: suivi });
      }
      toast.dismiss(suivi);
      if (ok > 0) toast.success(`${ok} vignette(s) prête(s) — les liens peuvent partir.`);
      if (echecs.length > 0) {
        const noms = echecs.slice(0, 5).join(", ");
        toast.error(
          `${echecs.length} échec(s) : ${noms}${echecs.length > 5 ? `… et ${echecs.length - 5} autre(s)` : ""}`,
        );
      }
    } catch (e) {
      toast.dismiss(suivi);
      toast.error(e instanceof Error ? e.message : "Erreur lors de la préparation des vignettes");
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

  /**
   * Inscrit un lot dans une séquence.
   *
   * `automationId === AUTO_SEQUENCE` = « celle que son canal appelle » : chaque
   * ligne part vers la séquence dont elle remplit le public déclaré. C'est ce
   * qui permet de traiter un lot mélangé sans le trier à la main d'abord — et
   * la répartition est annoncée avant de partir, parce que lancer 250
   * inscriptions à l'aveugle n'est pas rattrapable.
   */
  const enrollInSequence = async (items: BoardItem[], automationId: string) => {
    const sequences = board?.sequences ?? [];
    const activables = sequences.filter((s) => s.status === "on" || s.status === "draft");

    // Ligne → séquence, résolu AVANT d'envoyer quoi que ce soit.
    const parSequence = new Map<string, BoardItem[]>();
    const sansSequence: BoardItem[] = [];
    for (const it of items) {
      if (it.sequence) continue; // déjà en séquence : on ne double pas
      const cible =
        automationId === AUTO_SEQUENCE
          ? sequenceSuggeree(new Set(it.canaux ?? []), activables)?.id
          : automationId;
      if (!cible) {
        sansSequence.push(it);
        continue;
      }
      const list = parSequence.get(cible);
      if (list) list.push(it);
      else parSequence.set(cible, [it]);
    }

    const total = [...parSequence.values()].reduce((n, l) => n + l.length, 0);
    if (total === 0) {
      toast.error(
        sansSequence.length > 0
          ? "Aucune séquence ne correspond au canal de ces lignes"
          : "Ces lignes sont déjà en séquence",
      );
      return;
    }

    setWorking("enroll");
    try {
      const results = await Promise.allSettled(
        [...parSequence.entries()].map(async ([seqId, lot]) => {
          const res = await authedFetch("/api/sales-pipeline/enroll", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ automation_id: seqId, opportunite_ids: lot.map((it) => it.id) }),
          });
          if (!res.ok) {
            const payload = (await res.json().catch(() => ({}))) as { error?: string };
            throw new Error(payload.error || "Échec");
          }
          return lot.length;
        }),
      );

      const ok = results
        .filter((r): r is PromiseFulfilledResult<number> => r.status === "fulfilled")
        .reduce((n, r) => n + r.value, 0);
      const ko = total - ok;
      if (ok > 0) {
        const detail = [...parSequence.entries()]
          .map(([id, lot]) => `${lot.length} → ${activables.find((s) => s.id === id)?.name ?? "séquence"}`)
          .join(" · ");
        toast.success(`${ok} inscription(s) — ${detail}`);
      }
      if (ko > 0) toast.error(`${ko} inscription(s) en échec`);
      // Une ligne sans séquence correspondante n'est pas une erreur : c'est un
      // renseignement. La taire ferait croire que tout est parti.
      if (sansSequence.length > 0) {
        toast.warning(`${sansSequence.length} ligne(s) sans séquence pour leur canal — non inscrites`);
      }
      await afterAction();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'inscription");
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

  /* ── Archivage ────────────────────────────────────────────────────────── */

  /**
   * Ouvre le dialogue sur un lot de lignes. Le motif est demandé une seule
   * fois pour tout le lot : archiver quarante pistes mortes une par une,
   * personne ne le ferait.
   */
  const openArchive = (items: BoardItem[], kind: "entreprise" | "opportunite") => {
    if (items.length === 0) return;
    const entrepriseIds =
      kind === "entreprise"
        ? [...new Set(items.map((it) => it.entreprise_id).filter((v): v is number => v != null))]
        : [];
    if (kind === "entreprise" && entrepriseIds.length === 0) {
      toast.error("Ces lignes ne sont rattachées à aucune entreprise.");
      return;
    }
    setArchiveTarget({
      kind,
      entrepriseIds,
      opportunityIds: kind === "opportunite" ? items.map((it) => it.id) : [],
      label: items.length === 1 ? displayName(items[0]) : `${items.length} fiches`,
    });
  };

  const openUnarchive = (item: BoardItem) => {
    setArchiveTarget({
      // On désarchive au niveau de l'entreprise quand on la connaît : c'est
      // elle qui porte `hidden_in_qualification`, et ses opportunités suivent.
      kind: item.entreprise_id != null ? "entreprise" : "opportunite",
      entrepriseIds: item.entreprise_id != null ? [item.entreprise_id] : [],
      opportunityIds: item.entreprise_id != null ? [] : [item.id],
      label: displayName(item),
      currentReason: item.archive_reason ?? "autre",
      currentNote: item.archive_note ?? null,
    });
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
    onEnroll: isAgent ? undefined : (item, sId) => enrollInSequence([item], sId),
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
    onArchive: (item, kind) => openArchive([item], kind),
    onUnarchive: openUnarchive,
  };

  /* ── Actions de masse (barre de sélection) ────────────────────────────── */
  // Mêmes fonctions que les cartes : elles ont toujours travaillé sur des
  // tableaux, seule la sélection multiple avait disparu de l'écran.
  const bulkHandlers: BulkHandlers = {
    onEnrich: (items, overwrite) => runEnrich(items, overwrite),
    onComplete: (items) => setCompleting(items),
    onValidateEnrich: (items) => validateEnrichment(items),
    onCreateSites: (items) => createSites(items),
    onRegenerateSites: (items) => regenerateSites(items),
    onTirerImages: (items) => tirerImages(items),
    onAnalyserSites: (items) => analyserSites(items),
    onMesurerPsi: (items) => mesurerPsiSites(items),
    onPreparerVignettes: (items) => preparerVignettes(items),
    onValidateSites: (items) => validateSites(items),
    onPublierSites: (items) => publierSites(items),
    onCreateAudits: (items) => createAudits(items),
    onValidateAudits: (items) => validateAudits(items),
    onAssign: isAgent ? undefined : (items, aId) => assignAgentTo(items, aId),
    onEnroll: isAgent ? undefined : (items, sId) => enrollInSequence(items, sId),
    onMove: (items, pId) => movePipeline(items, pId),
    onArchive: openArchive,
  };

  return (
    <>
      <PipelineMatrix
        items={board?.items ?? []}
        agents={board?.agents ?? []}
        sequences={board?.sequences ?? []}
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
        showArchived={showArchived}
        onToggleArchived={
          board?.has_archivage === false ? undefined : () => setShowArchived((v) => !v)
        }
      />

      <ArchiveDialog
        target={archiveTarget}
        apiBase={isAgent ? "/api/agent/archive" : "/api/archive"}
        onClose={() => setArchiveTarget(null)}
        onDone={load}
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

      <CompleteDataDialog
        items={completing}
        onClose={() => setCompleting(null)}
        onSaved={() => void load()}
        onOpenDetails={(it) => {
          // La grille couvre les champs requis ; le reste de la fiche (avis,
          // horaires, zones) reste l'affaire de la modale. On ferme la grille
          // pour ne pas empiler deux dialogues.
          setCompleting(null);
          setSiteRequirement(false);
          setEditingItem(it);
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
  /**
   * Chiffres CONFIRMÉS par le client. Remplis, ils s'affichent à la place des
   * estimations ci-dessus, et aucun réenrichissement ne peut les écraser.
   */
  lm_stat_years_official: string;
  lm_stat_clients_official: string;
  lm_stat_installations_official: string;
  lm_stat_rge_official: string;
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
  lm_stat_years_official: "",
  lm_stat_clients_official: "",
  lm_stat_installations_official: "",
  lm_stat_rge_official: "",
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

/**
 * Mise en page propre à la fiche — pas des règles, donc pas dans
 * `required-fields.ts`.
 *
 * `WIDE_FIELDS` : la grille de la modale a deux colonnes ; la saisie des tags,
 * avec ses pastilles, son menu et son champ libre, ne tient pas dans une.
 *
 * `HINT_ONLY_WHEN_HOISTED` : les chiffres clés sont regroupés sous un paragraphe
 * qui explique déjà le bloc. Leur aide ne sert qu'une fois remontés en tête, où
 * ils en sont coupés.
 */
const WIDE_FIELDS: ReadonlySet<RequiredField> = new Set<RequiredField>(["service_tags"]);
const HINT_ONLY_WHEN_HOISTED: ReadonlySet<RequiredField> = new Set<RequiredField>([
  "lm_stat_years",
  "lm_stat_clients",
  "lm_stat_installations",
]);

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
  /**
   * Champs requis vides À L'OUVERTURE de la fiche. Ce sont eux que le bloc
   * « À compléter » remonte en tête.
   *
   * Figé au chargement, et pas recalculé à chaque frappe : un champ qui
   * regagnerait sa place dès la première lettre saisie ferait sauter la moitié du
   * formulaire sous le curseur. Le surlignage rouge, lui, suit la saisie en
   * direct — c'est le repère qui doit être vivant, pas la mise en page.
   */
  const [missingAtOpen, setMissingAtOpen] = React.useState<RequiredField[]>([]);
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
    setMissingAtOpen([]);
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
              // `*` et non une liste : les `stat_*_official` viennent d'une migration
              // appliquée à la main, et une colonne absente d'un select explicite fait
              // échouer la requête entière — la fiche s'ouvrirait vide. Une seule ligne
              // est lue.
              .select("*")
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
      const loaded: EditForm = {
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
        lm_stat_years_official: numStr(p.stat_years_experience_official),
        lm_stat_clients_official: numStr(p.stat_satisfied_clients_official),
        lm_stat_installations_official: numStr(p.stat_installations_completed_official),
        lm_stat_rge_official: numStr(p.stat_rge_count_official),
        enr_website_url: (e.website_url as string) ?? "",
        enr_emails: fromArr(e.emails),
        enr_phones: fromArr(e.phones),
        enr_services: fromArr(e.services_list),
        enr_contact_page: (e.contact_page_url as string) ?? "",
        enr_summary: (e.site_summary as string) ?? "",
      };
      setForm(loaded);
      // Le dossier lead magnet est créé à l'enregistrement quand il manque : on
      // évalue donc toujours la liste complète, celle de `siteRequiredFor(true)`.
      setMissingAtOpen(SITE_REQUIRED_WITH_PROJECT.filter((r) => !r.ok(loaded)).map((r) => r.field));
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
  // Plus conditionné à `siteRequirement` : un champ requis vide se signale quelle
  // que soit la porte par laquelle on est entré. Ouverte depuis « Fiche », la
  // modale n'affichait AUCUN rouge — c'est pourtant là qu'on vient compléter, et
  // il fallait dérouler tout le formulaire pour deviner ce qui manquait.
  const showInvalid = (field: RequiredField) => invalidFields.has(field);

  /**
   * Rendu d'un champ requis, défini une seule fois pour ses deux emplacements
   * possibles : le bloc « À compléter » en tête, ou sa section d'origine.
   * Dupliquer le JSX ferait dériver l'un des deux au premier changement.
   *
   * La saisie elle-même vient de `requiredFieldControl`, partagé avec la grille
   * de complétion en masse ; ce qui reste ici est l'habillage propre à la
   * fiche : libellé, astérisque, aide, largeur dans la grille à deux colonnes.
   *
   * `inHoistedBlock` ne change pas le champ, seulement son aide : remonté en
   * tête, il perd le paragraphe qui l'expliquait dans sa section.
   */
  const renderRequiredField = (field: RequiredField, inHoistedBlock: boolean): React.ReactNode => {
    const rule = SITE_REQUIRED_WITH_PROJECT.find((r) => r.field === field);
    if (!rule) return null;
    const invalid = showInvalid(field);
    // Les chiffres clés vivent déjà sous un paragraphe qui explique le bloc :
    // leur aide ne sert qu'une fois remontés en tête, coupés de ce paragraphe.
    const hint = HINT_ONLY_WHEN_HOISTED.has(field) && !inHoistedBlock ? undefined : rule.hint;
    const control = requiredFieldControl({
      field,
      values: form,
      onChange: (patch) => setForm((f) => ({ ...f, ...patch })),
      entrepriseId: item?.entreprise_id ?? null,
      tagCatalog,
      invalid,
      // L'astérisque de la note suit le nombre d'avis : sans avis il n'y a rien
      // à noter, et la marquer obligatoire réclamerait un chiffre que
      // l'entreprise n'a pas.
      required: ruleApplies(rule, form),
      hint,
    });
    if (control === null) return null;
    if (SELF_LABELLED_FIELDS.has(field)) return control;

    const wrapped = (
      <Field label={rule.label} required={ruleApplies(rule, form)} invalid={invalid} hint={hint}>
        {control}
      </Field>
    );
    return WIDE_FIELDS.has(field) ? <div className="sm:col-span-2">{wrapped}</div> : wrapped;
  };

  // Une règle ajoutée à `SITE_REQUIRED_WITH_PROJECT` sans son contrôle laisserait
  // une case vide dans le bloc, sous un bandeau qui la réclame. Le filtre la
  // laisse alors simplement à sa place : signalée, pas remontée.
  const toHoist = missingAtOpen.filter((field) => renderRequiredField(field, true) !== null);
  const hoisted = new Set<RequiredField>(toHoist);

  /** Le champ reste-t-il à sa place d'origine ? (non s'il a été remonté en tête) */
  const inPlace = (field: RequiredField): React.ReactNode =>
    hoisted.has(field) ? null : renderRequiredField(field, false);

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
        stat_years_experience_official: form.lm_stat_years_official || null,
        stat_satisfied_clients_official: form.lm_stat_clients_official || null,
        stat_installations_completed_official: form.lm_stat_installations_official || null,
        stat_rge_count_official: form.lm_stat_rge_official || null,
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
            {missingRequired.length > 0 ? (
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
                <strong>
                  {missingRequired.length} champ{missingRequired.length > 1 ? "s" : ""} requis
                  manquant{missingRequired.length > 1 ? "s" : ""} pour créer le site :
                </strong>
                <div style={{ marginTop: 4 }}>{missingRequired.join(" · ")}</div>
              </div>
            ) : (
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

            {/* Les champs qui manquaient à l'ouverture, remontés en tête. Ils
                étaient jusqu'ici dispersés dans quatre sections, sur toute la
                hauteur d'une modale qui défile : repérer les deux ou trois à
                remplir demandait de tout dérouler. Ils restent ici pendant toute
                la session d'édition (cf. `missingAtOpen`) et ne réapparaissent à
                leur place d'origine qu'à la réouverture de la fiche. */}
            {toHoist.length > 0 && (
              <div
                style={{
                  // La bordure suit la saisie : rouge tant qu'il reste un champ à
                  // remplir, verte dès que la fiche est complète.
                  border: `1px solid var(${missingRequired.length > 0 ? "--danger" : "--ok"})`,
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <h4
                  className="text-sm font-semibold mb-1"
                  style={{ color: `var(${missingRequired.length > 0 ? "--danger" : "--ok"})` }}
                >
                  À compléter
                </h4>
                <p className="text-[11px] leading-snug text-muted-foreground mb-3">
                  Les champs requis qui étaient vides à l&apos;ouverture de la fiche. Ils sont
                  retirés de leur section d&apos;origine tant qu&apos;elle reste ouverte, pour ne
                  pas y figurer deux fois.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {toHoist.map((field) => (
                    <React.Fragment key={field}>{renderRequiredField(field, true)}</React.Fragment>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold mb-2">Entreprise</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {inPlace("name")}
                {inPlace("ville")}
                {inPlace("lm_override_city")}
                {inPlace("code_postal")}
                {inPlace("telephone")}
                {inPlace("note_moyenne")}
                <Field label="Nombre d'avis">
                  <Input type="number" value={form.nombre_avis} onChange={set("nombre_avis")} placeholder="120" />
                </Field>
                <Field label="Email"><Input value={form.email} onChange={set("email")} /></Field>
                <Field label="Site web"><Input value={form.site_web} onChange={set("site_web")} /></Field>
                <Field label="LinkedIn"><Input value={form.linkedin_url} onChange={set("linkedin_url")} /></Field>
                <Field
                  label="Adresse"
                  hint="L'enrichissement en tire la ville et le code postal quand ils manquent."
                >
                  <Input value={form.adresse} onChange={set("adresse")} />
                </Field>
                {inPlace("service_tags")}
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
                    {inPlace("lm_logo_url")}
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
                  <h4 className="text-sm font-semibold mb-2">Chiffres clés estimés</h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    Ce que la démo affiche par défaut. Quand le site du client ne publie rien
                    d&apos;exploitable, l&apos;enrichissement estime ces chiffres à partir du nombre
                    d&apos;avis Google, pour donner un ordre de grandeur crédible. Les trois premiers
                    sont requis — une valeur vide laisse un trou dans la page. Les qualifications RGE
                    restent facultatives, toutes les entreprises n&apos;en ont pas.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {inPlace("lm_stat_years")}
                    {inPlace("lm_stat_clients")}
                    {inPlace("lm_stat_installations")}
                    <Field label="Qualifications (RGE)" hint="facultatif — 0 ou vide n'empêche pas d'enregistrer">
                      <Input type="number" value={form.lm_stat_rge} onChange={set("lm_stat_rge")} />
                    </Field>
                  </div>
                </div>

                {/* Chiffres officiels : ils remplacent les estimations à l'affichage et
                    résistent aux réenrichissements, contrairement aux champs ci-dessus. */}
                <div>
                  <h4 className="text-sm font-semibold mb-2">Chiffres officiels du client</h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    À remplir quand le client a confirmé ses vrais chiffres. Ils prennent alors la
                    place des estimations sur le site, et <strong>aucun réenrichissement ne les
                    écrase</strong>. Laissés vides, l&apos;estimation reste affichée.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Field
                      label="Années d'expérience"
                      hint={form.lm_stat_years ? `estimé : ${form.lm_stat_years}` : undefined}
                    >
                      <Input
                        type="number"
                        value={form.lm_stat_years_official}
                        onChange={set("lm_stat_years_official")}
                      />
                    </Field>
                    <Field
                      label="Clients satisfaits"
                      hint={form.lm_stat_clients ? `estimé : ${form.lm_stat_clients}` : undefined}
                    >
                      <Input
                        type="number"
                        value={form.lm_stat_clients_official}
                        onChange={set("lm_stat_clients_official")}
                      />
                    </Field>
                    <Field
                      label="Installations"
                      hint={form.lm_stat_installations ? `estimé : ${form.lm_stat_installations}` : undefined}
                    >
                      <Input
                        type="number"
                        value={form.lm_stat_installations_official}
                        onChange={set("lm_stat_installations_official")}
                      />
                    </Field>
                    <Field
                      label="Qualifications (RGE)"
                      hint={form.lm_stat_rge ? `estimé : ${form.lm_stat_rge}` : undefined}
                    >
                      <Input
                        type="number"
                        value={form.lm_stat_rge_official}
                        onChange={set("lm_stat_rge_official")}
                      />
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
