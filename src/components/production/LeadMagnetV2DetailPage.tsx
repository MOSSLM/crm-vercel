"use client";

import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe,
  MapPinned,
  Plus,
  SkipForward,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/components/ui/utils";
import {
  createLeadMagnetPage,
  createLeadMagnetReview,
  deleteLeadMagnetPage,
  deleteLeadMagnetReview,
  loadLeadMagnetBundle,
  listLeadMagnetCards,
  resolveLeadMagnetProjectId,
  type LeadMagnetPageRecord,
  type LeadMagnetProjectRecord,
  type LeadMagnetReviewRecord,
  updateLeadMagnetPage,
  updateLeadMagnetProject,
  updateLeadMagnetReview,
} from "@/utils/leadMagnetV2Api";

type Props = { projectId: string };
type CardStatus = "todo" | "review" | "validated";
type WorkflowCardId = "setup" | "branding" | "home" | "services" | "reviews" | "pages" | "cta" | "meta";

type WorkflowState = {
  statuses: Record<WorkflowCardId, CardStatus>;
  activeCardId: WorkflowCardId;
  noReviewReason: string;
};

type ProjectModel = LeadMagnetProjectRecord & {
  website_url?: string | null;
  site_url?: string | null;
  override_website?: string | null;
  google_business_url?: string | null;
  google_maps_url?: string | null;

  override_location?: string | null;
  opening_hours?: string | null;

  hero_title?: string | null;
  hero_subtitle?: string | null;
  hero_description?: string | null;
  cta_primary_text?: string | null;
  cta_primary_target?: string | null;
  cta_secondary_text?: string | null;

  home_slogan_template?: string | null;
  home_about_services_template?: string | null;
  home_why_choose_title_template?: string | null;

  stat_years_experience?: string | null;
  stat_satisfied_clients?: string | null;
  stat_installations_completed?: string | null;
  stat_rge_count?: string | null;

  service_page_headline_template?: string | null;
  service_page_subheadline_template?: string | null;
  service_page_trust_title_template?: string | null;

  variables?: Record<string, string> | string | null;
  service_tags_snapshot?: unknown;
};

type EditableProjectField = keyof ProjectModel;

type FocusedField =
  | { scope: "project"; field: EditableProjectField }
  | { scope: "page"; id: string; field: keyof LeadMagnetPageRecord }
  | null;

const cardIds: WorkflowCardId[] = ["setup", "branding", "home", "services", "reviews", "pages", "cta", "meta"];
const defaultState: WorkflowState = {
  statuses: Object.fromEntries(cardIds.map((id) => [id, "todo"])) as Record<WorkflowCardId, CardStatus>,
  activeCardId: "setup",
  noReviewReason: "",
};

const cardLabels: Record<WorkflowCardId, string> = {
  setup: "Setup entreprise",
  branding: "Logo & assets",
  home: "Home page",
  services: "Pages services",
  reviews: "Reviews",
  pages: "Pages / contenu",
  cta: "CTA / contact",
  meta: "Métadonnées",
};

const asString = (value: unknown) => (typeof value === "string" ? value : "");
const isTruthyText = (value: unknown) => asString(value).trim().length > 0;

function WorkflowPill({ status }: { status: CardStatus }) {
  const map: Record<CardStatus, { label: string; tone: string }> = {
    todo: { label: "À faire", tone: "bg-slate-100 text-slate-700" },
    review: { label: "À revoir", tone: "bg-amber-100 text-amber-800" },
    validated: { label: "Validée", tone: "bg-emerald-100 text-emerald-800" },
  };
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", map[status].tone)}>{map[status].label}</span>;
}

function parseVariables(value: unknown): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, asString(v)]),
    );
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, asString(v)]),
        );
      }
    } catch {}
  }
  return {};
}

function parseServiceTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => asString(item).trim()).filter(Boolean);
      }
    } catch {}
    return value
      .split(/[,\n]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeServiceLabel(value: string) {
  const raw = value.replace(/[_-]+/g, " ").trim().toLowerCase();
  const map: Record<string, string> = {
    climatisation: "climatisation",
    "pompe a chaleur": "pompe à chaleur",
    "pompe à chaleur": "pompe à chaleur",
    ventilation: "ventilation",
    vmc: "ventilation",
    plomberie: "plomberie",
    photovoltaique: "photovoltaïque",
    photovoltaïque: "photovoltaïque",
    chauffage: "chauffage",
    electricite: "électricité",
    électricité: "électricité",
  };
  return map[raw] ?? raw;
}

function joinWithEt(items: string[]) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} et ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

function buildServicesList(tags: string[]) {
  const normalized = Array.from(new Set(tags.map(normalizeServiceLabel).filter(Boolean)));
  return joinWithEt(normalized);
}

function renderTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

function appendTokenToText(current: string, token: string) {
  const base = current ?? "";
  if (!base.trim()) return token;
  if (base.endsWith(" ") || base.endsWith("\n")) return `${base}${token}`;
  return `${base} ${token}`;
}

function TokenBar({
  tokens,
  onInsert,
}: {
  tokens: Array<{ label: string; token: string }>;
  onInsert: (token: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tokens.map((item) => (
        <button
          key={item.token}
          type="button"
          className="rounded-full border bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
          onClick={() => onInsert(item.token)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function LeadMagnetV2DetailPage({ projectId }: Props) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectModel | null>(null);
  const [pages, setPages] = useState<LeadMagnetPageRecord[]>([]);
  const [reviews, setReviews] = useState<LeadMagnetReviewRecord[]>([]);
  const [opportunitySummary, setOpportunitySummary] = useState({
    companyName: "",
    city: "",
    opportunityName: "",
    pipeline: "",
    stage: "",
    tags: [] as string[],
  });
  const [workflow, setWorkflow] = useState<WorkflowState>(defaultState);
  const [loading, setLoading] = useState(true);
  const [navProjectIds, setNavProjectIds] = useState<string[]>([]);

  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [isAnimatingSwipe, setIsAnimatingSwipe] = useState(false);
  const [focusedField, setFocusedField] = useState<FocusedField>(null);
  const cardSurfaceRef = useRef<HTMLDivElement | null>(null);

  const dirtyProject = useRef(false);
  const dirtyPages = useRef(new Set<string>());
  const dirtyReviews = useRef(new Set<string>());

  const localStorageKey = `lead-magnet-workflow-${projectId}`;
  const resolvedProjectId = project?.id ?? null;

  const serviceTags = useMemo(() => parseServiceTags(project?.service_tags_snapshot), [project?.service_tags_snapshot]);
  const servicesList = useMemo(() => buildServicesList(serviceTags), [serviceTags]);
  const firstServiceLabel = useMemo(
    () => normalizeServiceLabel(serviceTags[0] ?? "climatisation"),
    [serviceTags],
  );

  const projectVariables = useMemo(() => parseVariables(project?.variables), [project?.variables]);

  const previewVars = useMemo(() => {
    const name = asString(project?.override_entreprise_name) || opportunitySummary.companyName;
    const city = asString(project?.override_city) || opportunitySummary.city;
    const location = asString(project?.override_location) || city;
    const phone = asString(project?.override_phone);
    const email = asString(project?.override_email);
    const address = asString(project?.override_address);

    return {
      ...projectVariables,
      name,
      city,
      location,
      phone,
      email,
      address,
      services_list: servicesList,
      service_label: firstServiceLabel,
    };
  }, [project, opportunitySummary, projectVariables, servicesList, firstServiceLabel]);

  const setupTokens = useMemo(
    () => [
      { label: "Name", token: "{{name}}" },
      { label: "Location", token: "{{location}}" },
      { label: "City", token: "{{city}}" },
      { label: "Phone", token: "{{phone}}" },
      { label: "Email", token: "{{email}}" },
      { label: "Address", token: "{{address}}" },
      { label: "Services list", token: "{{services_list}}" },
      { label: "Service label", token: "{{service_label}}" },
    ],
    [],
  );

  const projectSources = useMemo(() => {
    if (!project) return [] as Array<{ label: string; value: string; href?: string }>;
    const site = asString(project.website_url ?? project.site_url ?? project.override_website);
    const gmb = asString(project.google_business_url ?? project.google_maps_url);
    const phone = asString(project.override_phone);
    const address = asString(project.override_address);
    const email = asString(project.override_email);
    const links = [
      { label: "Site web", value: site, href: site },
      { label: "Google Business", value: gmb, href: gmb },
      { label: "Téléphone", value: phone },
      { label: "Adresse", value: address },
      { label: "Email", value: email },
    ];
    return links.filter((entry) => entry.value.trim().length > 0);
  }, [project]);

  const websiteUrl = asString(project?.website_url ?? project?.site_url ?? project?.override_website);
  const googleBusinessUrl = asString(project?.google_business_url ?? project?.google_maps_url);

  useEffect(() => {
    let cancelled = false;

    const hydrateProject = (bundle: any): ProjectModel => {
      const company = bundle?.company ?? {};
      const base = (bundle?.project ?? {}) as ProjectModel;
      const initialTags = parseServiceTags(base.service_tags_snapshot ?? company.service_tags);
      const initialServicesList = buildServicesList(initialTags);
      const variables = {
        ...parseVariables(base.variables),
        name: asString(base.override_entreprise_name) || asString(company.name),
        location: asString(base.override_location) || asString(base.override_city) || asString(company.ville),
        city: asString(base.override_city) || asString(company.ville),
        phone: asString(base.override_phone) || asString(company.telephone),
        email: asString(base.override_email),
        address: asString(base.override_address) || asString(company.adresse),
      };

      return {
        ...base,
        override_entreprise_name: asString(base.override_entreprise_name) || asString(company.name),
        override_city: asString(base.override_city) || asString(company.ville),
        override_location: asString(base.override_location) || asString(base.override_city) || asString(company.ville),
        override_phone: asString(base.override_phone) || asString(company.telephone),
        override_address: asString(base.override_address) || asString(company.adresse),
        service_tags_snapshot: initialTags,
        variables,
        home_slogan_template:
          asString(base.home_slogan_template) || "{{name}}, La qualité à votre service.",
        home_about_services_template:
          asString(base.home_about_services_template) || "Votre spécialiste en {{services_list}}",
        home_why_choose_title_template:
          asString(base.home_why_choose_title_template) ||
          "Pourquoi {{name}} est le meilleur choix pour votre projet ?",
        service_page_headline_template:
          asString(base.service_page_headline_template) || "{{service_label}} {{location}}",
        service_page_subheadline_template:
          asString(base.service_page_subheadline_template) ||
          "Spécialiste de la {{service_label}} à {{location}}. Nous installons, entretenons et dépannons vos systèmes pour un confort optimal toute l'année.",
        service_page_trust_title_template:
          asString(base.service_page_trust_title_template) ||
          "{{name}}, votre expert {{service_label}} de confiance.",
        cta_primary_text: asString(base.cta_primary_text) || "Demander un devis",
        cta_primary_target: asString(base.cta_primary_target) || "contact",
        cta_secondary_text: asString(base.cta_secondary_text) || "Être rappelé",
        meta_title_default: asString(base.meta_title_default) || "{{name}} | {{location}}",
        meta_description_default:
          asString(base.meta_description_default) ||
          `Entreprise ${initialServicesList || "{{services_list}}"} à {{location}}. Contactez {{name}} pour votre projet.`,
      };
    };

    const load = async () => {
      setLoading(true);
      try {
        const resolved = await resolveLeadMagnetProjectId(projectId);
        if (!resolved) {
          if (!cancelled) {
            setProject(null);
            setPages([]);
            setReviews([]);
          }
          return;
        }

        const bundle = await loadLeadMagnetBundle(resolved);
        if (cancelled) return;

        const hydrated = hydrateProject(bundle);

        setProject(hydrated);
        setPages(bundle.pages);
        setReviews(bundle.reviews);
        setOpportunitySummary({
          companyName: hydrated.override_entreprise_name ?? bundle.company?.name ?? "",
          city: hydrated.override_location ?? hydrated.override_city ?? bundle.company?.ville ?? "",
          opportunityName: bundle.opportunity?.name ?? "",
          pipeline: bundle.pipeline?.nom ?? "",
          stage: bundle.stage?.nom ?? "",
          tags: bundle.opportunity?.tags
            ? bundle.opportunity.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean)
            : [],
        });

        const localRaw = window.localStorage.getItem(localStorageKey);
        if (localRaw) {
          const parsed = JSON.parse(localRaw) as Partial<WorkflowState>;
          const sanitizedStatuses = Object.fromEntries(
            cardIds.map((id) => [id, parsed.statuses?.[id] ?? "todo"]),
          ) as Record<WorkflowCardId, CardStatus>;
          const sanitizedActive = cardIds.includes(parsed.activeCardId as WorkflowCardId)
            ? (parsed.activeCardId as WorkflowCardId)
            : "setup";
          setWorkflow({
            statuses: sanitizedStatuses,
            activeCardId: sanitizedActive,
            noReviewReason: asString(parsed.noReviewReason),
          });
        }

        const navCards = await listLeadMagnetCards();
        setNavProjectIds(navCards.map((item) => item.project.id));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Erreur de chargement");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, localStorageKey]);

  useEffect(() => {
    window.localStorage.setItem(localStorageKey, JSON.stringify(workflow));
  }, [workflow, localStorageKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        markCard("validated");
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        markCard("review");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const t = setInterval(async () => {
      if (!project) return;
      try {
        if (dirtyProject.current) {
          dirtyProject.current = false;
          await updateLeadMagnetProject(project.id, project);
        }

        if (dirtyPages.current.size > 0) {
          const ids = [...dirtyPages.current];
          dirtyPages.current.clear();
          await Promise.all(
            ids.map((id) => {
              const row = pages.find((entry) => entry.id === id);
              return row ? updateLeadMagnetPage(row.id, row) : Promise.resolve();
            }),
          );
        }

        if (dirtyReviews.current.size > 0) {
          const ids = [...dirtyReviews.current];
          dirtyReviews.current.clear();
          await Promise.all(
            ids.map((id) => {
              const row = reviews.find((entry) => entry.id === id);
              return row ? updateLeadMagnetReview(row.id, row) : Promise.resolve();
            }),
          );
        }
      } catch {
        toast.error("Autosave en échec. Réessayez.");
      }
    }, 1200);

    return () => clearInterval(t);
  }, [project, pages, reviews]);

  const completion = useMemo(() => {
    const hasSetup =
      [project?.override_entreprise_name, project?.override_location || project?.override_city, project?.override_phone, project?.override_address].filter(isTruthyText).length >= 3;

    const hasBranding = Boolean(project?.logo_url || project?.hero_image_url || project?.favicon_url);

    const hasHome =
      [
        project?.home_slogan_template,
        project?.home_about_services_template,
        project?.home_why_choose_title_template,
        project?.stat_years_experience,
        project?.stat_satisfied_clients,
        project?.stat_installations_completed,
        project?.stat_rge_count,
      ].filter(isTruthyText).length >= 6;

    const hasServices =
      serviceTags.length > 0 &&
      [project?.service_page_headline_template, project?.service_page_subheadline_template, project?.service_page_trust_title_template].filter(isTruthyText).length >= 3;

    const activeReviewCount = reviews.filter((row) => row.is_active ?? (row as any).actif ?? true).length;
    const hasReviews = activeReviewCount > 0 || workflow.noReviewReason.trim().length > 0;

    const hasPages = pages.length > 0 && pages.some((row) => row.is_active ?? (row as any).actif ?? true);

    const hasCta =
      [project?.cta_primary_text, project?.cta_primary_target, project?.override_phone, project?.override_email, project?.opening_hours].filter(isTruthyText).length >= 3;

    const hasMeta = [project?.meta_title_default, project?.meta_description_default].filter(isTruthyText).length >= 1;

    return {
      hasSetup,
      hasBranding,
      hasHome,
      hasServices,
      hasReviews,
      hasPages,
      hasCta,
      hasMeta,
      activeReviewCount,
    };
  }, [project, pages, reviews, workflow.noReviewReason, serviceTags.length]);

  const requiredFailures = [
    !completion.hasSetup,
    !completion.hasHome,
    !completion.hasServices,
    !completion.hasCta,
    !completion.hasReviews,
  ].filter(Boolean);

  const readyForPublish = requiredFailures.length === 0;

  const orderedDeck = useMemo(() => {
    const review = cardIds.filter((id) => workflow.statuses[id] === "review");
    const nonReview = cardIds.filter((id) => workflow.statuses[id] !== "review");
    return [...nonReview, ...review];
  }, [workflow.statuses]);

  const activeCardId = workflow.activeCardId;
  const activeCardIndex = Math.max(0, orderedDeck.indexOf(activeCardId));
  const activeNavIndex = resolvedProjectId ? navProjectIds.indexOf(resolvedProjectId) : -1;
  const previousProjectId = activeNavIndex > 0 ? navProjectIds[activeNavIndex - 1] : null;
  const nextProjectId = activeNavIndex >= 0 && activeNavIndex < navProjectIds.length - 1 ? navProjectIds[activeNavIndex + 1] : null;

  const goToCard = (id: WorkflowCardId) => setWorkflow((prev) => ({ ...prev, activeCardId: id }));

  const moveToNextCard = (fromId: WorkflowCardId) => {
    const i = orderedDeck.indexOf(fromId);
    const next = orderedDeck[Math.min(orderedDeck.length - 1, i + 1)] ?? fromId;
    setWorkflow((prev) => ({ ...prev, activeCardId: next }));
  };

  const markCard = (status: CardStatus) => {
    setWorkflow((prev) => ({
      ...prev,
      statuses: { ...prev.statuses, [prev.activeCardId]: status },
    }));
    moveToNextCard(activeCardId);
  };

  const startDrag = (x: number) => {
    if (isAnimatingSwipe) return;
    setIsDraggingCard(true);
    setDragStartX(x);
    setDragOffsetX(0);
  };

  const endDrag = () => {
    if (dragStartX === null) return;
    const width = cardSurfaceRef.current?.offsetWidth ?? 360;
    const threshold = Math.min(160, width * 0.25);
    const direction = dragOffsetX > threshold ? 1 : dragOffsetX < -threshold ? -1 : 0;

    if (direction !== 0) {
      setIsAnimatingSwipe(true);
      setDragOffsetX(direction * (width + 180));
      window.setTimeout(() => {
        markCard(direction > 0 ? "validated" : "review");
        setDragOffsetX(0);
        setIsAnimatingSwipe(false);
      }, 180);
    } else {
      setDragOffsetX(0);
    }

    setIsDraggingCard(false);
    setDragStartX(null);
  };

  const updateProjectField = (field: EditableProjectField, value: unknown) => {
    setProject((prev) => {
      if (!prev) return prev;
      const next: ProjectModel = { ...prev, [field]: value } as ProjectModel;

      const vars = {
        ...parseVariables(next.variables),
      };

      if (field === "override_entreprise_name") vars.name = asString(value);
      if (field === "override_location") vars.location = asString(value);
      if (field === "override_city") vars.city = asString(value);
      if (field === "override_phone") vars.phone = asString(value);
      if (field === "override_email") vars.email = asString(value);
      if (field === "override_address") vars.address = asString(value);
      if (field === "service_tags_snapshot") {
        vars.services_list = buildServicesList(parseServiceTags(value));
      }

      next.variables = vars;
      return next;
    });
    dirtyProject.current = true;
  };

  const updatePageField = (pageId: string, field: keyof LeadMagnetPageRecord, value: unknown) => {
    setPages((prev) => prev.map((row) => (row.id === pageId ? { ...row, [field]: value } : row)));
    dirtyPages.current.add(pageId);
  };

  const updateReviewField = (reviewId: string, field: keyof LeadMagnetReviewRecord, value: unknown) => {
    setReviews((prev) => prev.map((row) => (row.id === reviewId ? { ...row, [field]: value } : row)));
    dirtyReviews.current.add(reviewId);
  };

  const insertToken = (token: string) => {
    if (!focusedField) return;

    if (focusedField.scope === "project") {
      const current = asString(project?.[focusedField.field]);
      updateProjectField(focusedField.field, appendTokenToText(current, token));
      return;
    }

    if (focusedField.scope === "page") {
      const page = pages.find((entry) => entry.id === focusedField.id);
      if (!page) return;
      const current = asString(page[focusedField.field] as unknown);
      updatePageField(focusedField.id, focusedField.field, appendTokenToText(current, token));
    }
  };

  const saveAsReady = async (checked: boolean) => {
    if (!project) return;
    if (checked && !readyForPublish) {
      toast.error("Blocs requis manquants pour activer LM prêt.");
      return;
    }
    await updateLeadMagnetProject(project.id, { pret_pour_lm: checked, statut: checked ? "ready" : "draft" });
    setProject((prev) => (prev ? { ...prev, pret_pour_lm: checked, statut: checked ? "ready" : "draft" } : prev));
    toast.success(checked ? "Lead magnet marqué prêt ✅" : "Lead magnet repassé en préparation.");
  };

  const currentStatus = workflow.statuses[activeCardId];
  const validatedCount = cardIds.filter((id) => workflow.statuses[id] === "validated").length;

  const serviceTagsInput = serviceTags.join(", ");

  const homeSloganPreview = renderTemplate(asString(project?.home_slogan_template), previewVars);
  const homeAboutPreview = renderTemplate(asString(project?.home_about_services_template), previewVars);
  const homeWhyPreview = renderTemplate(asString(project?.home_why_choose_title_template), previewVars);
  const serviceHeadlinePreview = renderTemplate(asString(project?.service_page_headline_template), previewVars);
  const serviceSubheadlinePreview = renderTemplate(asString(project?.service_page_subheadline_template), previewVars);
  const serviceTrustPreview = renderTemplate(asString(project?.service_page_trust_title_template), previewVars);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  if (!project) return <div className="p-6 text-sm text-muted-foreground">Projet introuvable.</div>;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <section className="-mx-4 border-y bg-white md:-mx-6">
        <div className="space-y-0 px-4 py-2 md:px-6">
          <div className="flex items-center gap-2 overflow-x-auto">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => previousProjectId && router.push(`/production/lead-magnet/${previousProjectId}`)}
              disabled={!previousProjectId}
              aria-label="Entreprise précédente"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <p className="min-w-0 truncate text-sm font-semibold">
              {opportunitySummary.companyName || "Lead magnet"}
              <span className="text-muted-foreground">
                {" "}
                • {opportunitySummary.city || "Ville inconnue"} • {opportunitySummary.opportunityName || "Opportunité"}
              </span>
            </p>

            <Badge variant={project.pret_pour_lm ? "default" : "secondary"} className="shrink-0">
              {validatedCount}/{cardIds.length}
            </Badge>

            <div className="ml-auto flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => websiteUrl && window.open(websiteUrl, "_blank", "noopener,noreferrer")}
                disabled={!websiteUrl}
                aria-label="Ouvrir le site web"
              >
                <Globe className="h-4 w-4" />
              </Button>

              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => googleBusinessUrl && window.open(googleBusinessUrl, "_blank", "noopener,noreferrer")}
                disabled={!googleBusinessUrl}
                aria-label="Ouvrir la page Google Business"
              >
                <MapPinned className="h-4 w-4" />
              </Button>

              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => window.open(`/api/public/lead-magnets/${project.id}`, "_blank", "noopener,noreferrer")}
                aria-label="Ouvrir l'aperçu public"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>

              <label className="ml-2 inline-flex shrink-0 items-center gap-2 text-xs font-medium">
                LM prêt
                <Switch checked={Boolean(project.pret_pour_lm)} onCheckedChange={(checked) => void saveAsReady(checked)} />
              </label>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => nextProjectId && router.push(`/production/lead-magnet/${nextProjectId}`)}
              disabled={!nextProjectId}
              aria-label="Entreprise suivante"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="-mb-2 mt-2 h-0.5 w-full bg-slate-200">
            <div className="h-0.5 bg-emerald-500 transition-all" style={{ width: `${(validatedCount / cardIds.length) * 100}%` }} />
          </div>
        </div>
      </section>

      <div className="space-y-4">
        <section className="-mx-4 border-y bg-white px-4 py-2 md:-mx-6 md:px-6">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Deck workflow</div>
          <div className="overflow-x-auto">
            <div className="flex min-w-max gap-2 pb-1">
              {orderedDeck.map((id, index) => (
                <button
                  key={id}
                  className={cn(
                    "rounded-md border bg-white px-3 py-2 text-left text-sm whitespace-nowrap",
                    activeCardId === id && "border-primary bg-primary/5",
                  )}
                  onClick={() => goToCard(id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {index + 1}. {cardLabels[id]}
                    </span>
                    <WorkflowPill status={workflow.statuses[id]} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <div
          ref={cardSurfaceRef}
          className="relative"
          onMouseDown={(event) => startDrag(event.clientX)}
          onMouseMove={(event) => {
            if (dragStartX !== null) setDragOffsetX(event.clientX - dragStartX);
          }}
          onMouseUp={endDrag}
          onMouseLeave={() => dragStartX !== null && endDrag()}
          onTouchStart={(event) => startDrag(event.touches[0]?.clientX ?? 0)}
          onTouchMove={(event) => {
            if (dragStartX !== null) setDragOffsetX((event.touches[0]?.clientX ?? 0) - dragStartX);
          }}
          onTouchEnd={endDrag}
        >
          <Card
            className={cn("relative overflow-hidden border-2 border-slate-200", isDraggingCard && "cursor-grabbing", isAnimatingSwipe && "pointer-events-none")}
            style={{
              transform: `translateX(${dragOffsetX}px) rotate(${Math.max(-18, Math.min(18, dragOffsetX / 16))}deg)`,
              transition: isDraggingCard ? "none" : "transform 180ms cubic-bezier(.22,.61,.36,1)",
            }}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                <span>
                  {activeCardIndex + 1}/{cardIds.length} • {cardLabels[activeCardId]}
                </span>
                <WorkflowPill status={currentStatus} />
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4">
              {activeCardId === "setup" && (
                <div className="space-y-4">
                  <div className="grid gap-2 md:grid-cols-2">
                    {(projectSources.length > 0
                      ? projectSources
                      : [{ label: "Aucune source", value: "Ajoute des infos ci-dessous." }]
                    ).map((item) => (
                      <div key={item.label} className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className="break-all text-sm font-medium">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  <TokenBar tokens={setupTokens} onInsert={insertToken} />

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Nom entreprise</Label>
                      <Input
                        value={asString(project.override_entreprise_name)}
                        onChange={(event) => updateProjectField("override_entreprise_name", event.target.value)}
                        onFocus={() => setFocusedField({ scope: "project", field: "override_entreprise_name" })}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>Location SEO locale</Label>
                      <Input
                        value={asString(project.override_location)}
                        onChange={(event) => updateProjectField("override_location", event.target.value)}
                        onFocus={() => setFocusedField({ scope: "project", field: "override_location" })}
                        placeholder="ex: La Rochelle"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>Ville</Label>
                      <Input
                        value={asString(project.override_city)}
                        onChange={(event) => updateProjectField("override_city", event.target.value)}
                        onFocus={() => setFocusedField({ scope: "project", field: "override_city" })}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>Téléphone</Label>
                      <Input
                        value={asString(project.override_phone)}
                        onChange={(event) => updateProjectField("override_phone", event.target.value)}
                        onFocus={() => setFocusedField({ scope: "project", field: "override_phone" })}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>Email</Label>
                      <Input
                        value={asString(project.override_email)}
                        onChange={(event) => updateProjectField("override_email", event.target.value)}
                        onFocus={() => setFocusedField({ scope: "project", field: "override_email" })}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>Adresse</Label>
                      <Input
                        value={asString(project.override_address)}
                        onChange={(event) => updateProjectField("override_address", event.target.value)}
                        onFocus={() => setFocusedField({ scope: "project", field: "override_address" })}
                      />
                    </div>
                  </div>

                  <div className="rounded-md border p-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Variables réutilisables
                    </p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {Object.entries(previewVars)
                        .filter(([, value]) => isTruthyText(value))
                        .map(([key, value]) => (
                          <div key={key} className="rounded border bg-slate-50 px-3 py-2">
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{key}</p>
                            <p className="text-sm">{value}</p>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {activeCardId === "branding" && (
                <div className="grid gap-3 md:grid-cols-3">
                  {(["logo_url", "hero_image_url", "favicon_url"] as const).map((field) => (
                    <div
                      key={field}
                      className="space-y-2 rounded-md border p-3"
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event: DragEvent<HTMLDivElement>) => {
                        const file = event.dataTransfer.files[0];
                        if (!file) return;
                        updateProjectField(field, URL.createObjectURL(file));
                      }}
                    >
                      <Label>{field}</Label>
                      <Input
                        value={asString(project[field])}
                        onChange={(event) => updateProjectField(field, event.target.value)}
                      />
                      {asString(project[field]) ? (
                        <img src={asString(project[field])} alt={field} className="h-16 w-16 rounded border object-cover" />
                      ) : (
                        <p className="text-xs text-muted-foreground">Drag & drop image</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeCardId === "home" && (
                <div className="space-y-4">
                  <TokenBar tokens={setupTokens} onInsert={insertToken} />

                  <div className="space-y-1">
                    <Label>Slogan home</Label>
                    <Input
                      value={asString(project.home_slogan_template)}
                      onChange={(event) => updateProjectField("home_slogan_template", event.target.value)}
                      onFocus={() => setFocusedField({ scope: "project", field: "home_slogan_template" })}
                      placeholder="{{name}}, La qualité à votre service."
                    />
                    <p className="text-xs text-muted-foreground">Aperçu : {homeSloganPreview || "—"}</p>
                  </div>

                  <div className="space-y-1">
                    <Label>Qui sommes-nous ?</Label>
                    <Textarea
                      value={asString(project.home_about_services_template)}
                      onChange={(event) => updateProjectField("home_about_services_template", event.target.value)}
                      onFocus={() => setFocusedField({ scope: "project", field: "home_about_services_template" })}
                      placeholder="Votre spécialiste en {{services_list}}"
                    />
                    <p className="text-xs text-muted-foreground">Aperçu : {homeAboutPreview || "—"}</p>
                  </div>

                  <div className="space-y-1">
                    <Label>Titre “Pourquoi ...”</Label>
                    <Input
                      value={asString(project.home_why_choose_title_template)}
                      onChange={(event) => updateProjectField("home_why_choose_title_template", event.target.value)}
                      onFocus={() => setFocusedField({ scope: "project", field: "home_why_choose_title_template" })}
                      placeholder="Pourquoi {{name}} est le meilleur choix pour votre projet ?"
                    />
                    <p className="text-xs text-muted-foreground">Aperçu : {homeWhyPreview || "—"}</p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Années d'expérience</Label>
                      <Input
                        value={asString(project.stat_years_experience)}
                        onChange={(event) => updateProjectField("stat_years_experience", event.target.value)}
                        onFocus={() => setFocusedField({ scope: "project", field: "stat_years_experience" })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Clients satisfaits</Label>
                      <Input
                        value={asString(project.stat_satisfied_clients)}
                        onChange={(event) => updateProjectField("stat_satisfied_clients", event.target.value)}
                        onFocus={() => setFocusedField({ scope: "project", field: "stat_satisfied_clients" })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Installations réalisées</Label>
                      <Input
                        value={asString(project.stat_installations_completed)}
                        onChange={(event) => updateProjectField("stat_installations_completed", event.target.value)}
                        onFocus={() => setFocusedField({ scope: "project", field: "stat_installations_completed" })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Nombre de qualifications RGE</Label>
                      <Input
                        value={asString(project.stat_rge_count)}
                        onChange={(event) => updateProjectField("stat_rge_count", event.target.value)}
                        onFocus={() => setFocusedField({ scope: "project", field: "stat_rge_count" })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeCardId === "services" && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label>Services entreprise (service_tags)</Label>
                    <Textarea
                      value={serviceTagsInput}
                      onChange={(event) =>
                        updateProjectField(
                          "service_tags_snapshot",
                          event.target.value
                            .split(/[,\n]/g)
                            .map((item) => item.trim())
                            .filter(Boolean),
                        )
                      }
                      placeholder="climatisation, plomberie, pompe à chaleur"
                    />
                    <p className="text-xs text-muted-foreground">
                      Détectés : {servicesList || "aucun"}
                    </p>
                  </div>

                  <TokenBar tokens={setupTokens} onInsert={insertToken} />

                  <div className="space-y-1">
                    <Label>Slogan page service</Label>
                    <Input
                      value={asString(project.service_page_headline_template)}
                      onChange={(event) => updateProjectField("service_page_headline_template", event.target.value)}
                      onFocus={() => setFocusedField({ scope: "project", field: "service_page_headline_template" })}
                      placeholder="{{service_label}} {{location}}"
                    />
                    <p className="text-xs text-muted-foreground">Aperçu : {serviceHeadlinePreview || "—"}</p>
                  </div>

                  <div className="space-y-1">
                    <Label>Sous-slogan page service</Label>
                    <Textarea
                      value={asString(project.service_page_subheadline_template)}
                      onChange={(event) => updateProjectField("service_page_subheadline_template", event.target.value)}
                      onFocus={() => setFocusedField({ scope: "project", field: "service_page_subheadline_template" })}
                      placeholder="Spécialiste de la {{service_label}} à {{location}} ..."
                    />
                    <p className="text-xs text-muted-foreground">Aperçu : {serviceSubheadlinePreview || "—"}</p>
                  </div>

                  <div className="space-y-1">
                    <Label>Petit titre plus bas</Label>
                    <Input
                      value={asString(project.service_page_trust_title_template)}
                      onChange={(event) => updateProjectField("service_page_trust_title_template", event.target.value)}
                      onFocus={() => setFocusedField({ scope: "project", field: "service_page_trust_title_template" })}
                      placeholder="{{name}}, votre expert {{service_label}} de confiance."
                    />
                    <p className="text-xs text-muted-foreground">Aperçu : {serviceTrustPreview || "—"}</p>
                  </div>
                </div>
              )}

              {activeCardId === "reviews" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{completion.activeReviewCount} review(s) active(s)</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const created = await createLeadMagnetReview({
                          project_id: project.id,
                          author_name: "Nouveau client",
                          review_text: "",
                          rating: 5,
                          is_manual: true,
                          is_active: true,
                          display_order: reviews.length + 1,
                          source: "manual",
                        });
                        setReviews((prev) => [...prev, created]);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Ajouter
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <Label>Raison d'absence de reviews (optionnel)</Label>
                    <Textarea
                      value={workflow.noReviewReason}
                      onChange={(event) => setWorkflow((prev) => ({ ...prev, noReviewReason: event.target.value }))}
                    />
                  </div>

                  {reviews.map((review, i) => (
                    <div key={review.id} className="space-y-2 rounded-md border p-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>#{i + 1}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await deleteLeadMagnetReview(review.id);
                            setReviews((prev) => prev.filter((x) => x.id !== review.id));
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <Input
                          value={asString(review.author_name)}
                          onChange={(event) => updateReviewField(review.id, "author_name", event.target.value)}
                          placeholder="Auteur"
                        />
                        <Input
                          type="number"
                          min={1}
                          max={5}
                          value={String(review.rating ?? 5)}
                          onChange={(event) => updateReviewField(review.id, "rating", Number(event.target.value))}
                        />
                      </div>
                      <Textarea
                        value={asString(review.review_text)}
                        onChange={(event) => updateReviewField(review.id, "review_text", event.target.value)}
                        placeholder="Texte review"
                      />
                      <div className="flex gap-4 text-sm">
                        <label className="inline-flex items-center gap-2">
                          <Switch
                            checked={Boolean(review.is_active ?? true)}
                            onCheckedChange={(checked) => updateReviewField(review.id, "is_active", checked)}
                          />
                          Active
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <Switch
                            checked={Boolean(review.is_manual ?? true)}
                            onCheckedChange={(checked) => updateReviewField(review.id, "is_manual", checked)}
                          />
                          Manuelle
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeCardId === "pages" && (
                <div className="space-y-3">
                  <div className="flex justify-between gap-2">
                    <TokenBar tokens={setupTokens} onInsert={insertToken} />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const created = await createLeadMagnetPage({
                          project_id: project.id,
                          page_name: `Page ${pages.length + 1}`,
                          page_key: `page_${pages.length + 1}`,
                          slug: `page-${pages.length + 1}`,
                          is_active: true,
                          display_order: pages.length + 1,
                          body_json: {},
                        });
                        setPages((prev) => [...prev, created]);
                      }}
                    >
                      <Plus className="mr-2 h-4 w-4" /> Ajouter une page
                    </Button>
                  </div>

                  {pages.map((page) => (
                    <div key={page.id} className="space-y-2 rounded-md border p-3">
                      <div className="grid gap-2 md:grid-cols-4">
                        <Input
                          value={asString(page.page_name)}
                          onChange={(event) => updatePageField(page.id, "page_name", event.target.value)}
                          placeholder="Titre"
                          onFocus={() => setFocusedField({ scope: "page", id: page.id, field: "page_name" })}
                        />
                        <Input
                          value={asString(page.page_key)}
                          onChange={(event) => updatePageField(page.id, "page_key", event.target.value)}
                          placeholder="page_key"
                          onFocus={() => setFocusedField({ scope: "page", id: page.id, field: "page_key" })}
                        />
                        <Input
                          value={asString(page.slug)}
                          onChange={(event) => updatePageField(page.id, "slug", event.target.value)}
                          placeholder="Slug"
                          onFocus={() => setFocusedField({ scope: "page", id: page.id, field: "slug" })}
                        />
                        <Input
                          value={asString(page.service_key)}
                          onChange={(event) => updatePageField(page.id, "service_key", event.target.value)}
                          placeholder="service_key"
                          onFocus={() => setFocusedField({ scope: "page", id: page.id, field: "service_key" })}
                        />
                      </div>

                      <Input
                        value={asString(page.headline)}
                        onChange={(event) => updatePageField(page.id, "headline", event.target.value)}
                        placeholder="Headline"
                        onFocus={() => setFocusedField({ scope: "page", id: page.id, field: "headline" })}
                      />

                      <Textarea
                        value={asString(page.subheadline)}
                        onChange={(event) => updatePageField(page.id, "subheadline", event.target.value)}
                        placeholder="Subheadline"
                        onFocus={() => setFocusedField({ scope: "page", id: page.id, field: "subheadline" })}
                      />

                      <div className="grid gap-2 md:grid-cols-2">
                        <Input
                          value={asString(page.meta_title)}
                          onChange={(event) => updatePageField(page.id, "meta_title", event.target.value)}
                          placeholder="Meta title"
                          onFocus={() => setFocusedField({ scope: "page", id: page.id, field: "meta_title" })}
                        />
                        <Input
                          value={asString(page.meta_description)}
                          onChange={(event) => updatePageField(page.id, "meta_description", event.target.value)}
                          placeholder="Meta description"
                          onFocus={() => setFocusedField({ scope: "page", id: page.id, field: "meta_description" })}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="inline-flex items-center gap-2 text-sm">
                          <Switch
                            checked={Boolean(page.is_active ?? true)}
                            onCheckedChange={(checked) => updatePageField(page.id, "is_active", checked)}
                          />
                          Active
                        </label>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await deleteLeadMagnetPage(page.id);
                            setPages((prev) => prev.filter((x) => x.id !== page.id));
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeCardId === "cta" && (
                <div className="space-y-4">
                  <TokenBar tokens={setupTokens} onInsert={insertToken} />

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>CTA principal</Label>
                      <Input
                        value={asString(project.cta_primary_text)}
                        onChange={(event) => updateProjectField("cta_primary_text", event.target.value)}
                        onFocus={() => setFocusedField({ scope: "project", field: "cta_primary_text" })}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>Destination CTA principal</Label>
                      <Input
                        value={asString(project.cta_primary_target)}
                        onChange={(event) => updateProjectField("cta_primary_target", event.target.value)}
                        onFocus={() => setFocusedField({ scope: "project", field: "cta_primary_target" })}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>CTA secondaire</Label>
                      <Input
                        value={asString(project.cta_secondary_text)}
                        onChange={(event) => updateProjectField("cta_secondary_text", event.target.value)}
                        onFocus={() => setFocusedField({ scope: "project", field: "cta_secondary_text" })}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>Email</Label>
                      <Input
                        value={asString(project.override_email)}
                        onChange={(event) => updateProjectField("override_email", event.target.value)}
                        onFocus={() => setFocusedField({ scope: "project", field: "override_email" })}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>Téléphone</Label>
                      <Input
                        value={asString(project.override_phone)}
                        onChange={(event) => updateProjectField("override_phone", event.target.value)}
                        onFocus={() => setFocusedField({ scope: "project", field: "override_phone" })}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>Horaires d'ouverture</Label>
                      <Textarea
                        value={asString(project.opening_hours)}
                        onChange={(event) => updateProjectField("opening_hours", event.target.value)}
                        onFocus={() => setFocusedField({ scope: "project", field: "opening_hours" })}
                        placeholder="Lun-Ven 8h-18h"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeCardId === "meta" && (
                <div className="space-y-3">
                  <TokenBar tokens={setupTokens} onInsert={insertToken} />

                  <div className="space-y-1">
                    <Label>Meta title</Label>
                    <Input
                      value={asString(project.meta_title_default)}
                      onChange={(event) => updateProjectField("meta_title_default", event.target.value)}
                      onFocus={() => setFocusedField({ scope: "project", field: "meta_title_default" })}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>Meta description</Label>
                    <Textarea
                      value={asString(project.meta_description_default)}
                      onChange={(event) => updateProjectField("meta_description_default", event.target.value)}
                      onFocus={() => setFocusedField({ scope: "project", field: "meta_description_default" })}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                <div className="text-xs text-muted-foreground">
                  Swipe droite ou <kbd>→</kbd> pour valider • Swipe gauche ou <kbd>←</kbd> pour revoir.
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => markCard("review")}>
                    <ArrowLeft className="mr-1 h-4 w-4" /> Revoir
                  </Button>
                  <Button variant="outline" onClick={() => moveToNextCard(activeCardId)}>
                    <SkipForward className="mr-1 h-4 w-4" /> Passer
                  </Button>
                  <Button onClick={() => markCard("validated")}>
                    <ArrowRight className="mr-1 h-4 w-4" /> Valider
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
