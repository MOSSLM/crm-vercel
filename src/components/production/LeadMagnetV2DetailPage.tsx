"use client";

import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  GripVertical,
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
type WorkflowCardId = "sources" | "branding" | "texts" | "diff" | "reviews" | "pages" | "cta" | "meta";

type WorkflowState = {
  statuses: Record<WorkflowCardId, CardStatus>;
  activeCardId: WorkflowCardId;
  noReviewReason: string;
};

const cardIds: WorkflowCardId[] = ["sources", "branding", "texts", "diff", "reviews", "pages", "cta", "meta"];
const defaultState: WorkflowState = {
  statuses: Object.fromEntries(cardIds.map((id) => [id, "todo"])) as Record<WorkflowCardId, CardStatus>,
  activeCardId: "sources",
  noReviewReason: "",
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

export function LeadMagnetV2DetailPage({ projectId }: Props) {
  const router = useRouter();
  const [project, setProject] = useState<LeadMagnetProjectRecord | null>(null);
  const [pages, setPages] = useState<LeadMagnetPageRecord[]>([]);
  const [reviews, setReviews] = useState<LeadMagnetReviewRecord[]>([]);
  const [opportunitySummary, setOpportunitySummary] = useState({ companyName: "", city: "", opportunityName: "", pipeline: "", stage: "", tags: [] as string[] });
  const [workflow, setWorkflow] = useState<WorkflowState>(defaultState);
  const [loading, setLoading] = useState(true);
  const [navProjectIds, setNavProjectIds] = useState<string[]>([]);

  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [isAnimatingSwipe, setIsAnimatingSwipe] = useState(false);
  const cardSurfaceRef = useRef<HTMLDivElement | null>(null);

  const dirtyProject = useRef(false);
  const dirtyPages = useRef(new Set<string>());
  const dirtyReviews = useRef(new Set<string>());

  const localStorageKey = `lead-magnet-workflow-${projectId}`;
  const resolvedProjectId = project?.id ?? null;

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
    const load = async () => {
      setLoading(true);
      try {
        const resolvedProjectId = await resolveLeadMagnetProjectId(projectId);
        if (!resolvedProjectId) {
          if (!cancelled) {
            setProject(null);
            setPages([]);
            setReviews([]);
          }
          return;
        }

        const bundle = await loadLeadMagnetBundle(resolvedProjectId);
        if (cancelled) return;
        setProject(bundle.project);
        setPages(bundle.pages);
        setReviews(bundle.reviews);
        setOpportunitySummary({
          companyName: bundle.project?.override_entreprise_name ?? bundle.company?.name ?? "",
          city: bundle.project?.override_city ?? bundle.company?.ville ?? "",
          opportunityName: bundle.opportunity?.name ?? "",
          pipeline: bundle.pipeline?.nom ?? "",
          stage: bundle.stage?.nom ?? "",
          tags: bundle.opportunity?.tags ? bundle.opportunity.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
        });

        const localRaw = window.localStorage.getItem(localStorageKey);
        if (localRaw) {
          const parsed = JSON.parse(localRaw) as WorkflowState;
          setWorkflow((prev) => ({ ...prev, ...parsed }));
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
          await Promise.all(ids.map((id) => {
            const row = pages.find((entry) => entry.id === id);
            return row ? updateLeadMagnetPage(row.id, row) : Promise.resolve();
          }));
        }

        if (dirtyReviews.current.size > 0) {
          const ids = [...dirtyReviews.current];
          dirtyReviews.current.clear();
          await Promise.all(ids.map((id) => {
            const row = reviews.find((entry) => entry.id === id);
            return row ? updateLeadMagnetReview(row.id, row) : Promise.resolve();
          }));
        }
      } catch {
        toast.error("Autosave en échec. Réessayez.");
      }
    }, 1200);

    return () => clearInterval(t);
  }, [project, pages, reviews]);

  const completion = useMemo(() => {
    const hasSources = projectSources.length > 0;
    const hasBranding = Boolean(project?.logo_url || project?.hero_image_url || project?.favicon_url);
    const hasTexts = [project?.hero_title, project?.hero_subtitle, project?.hero_description].filter(isTruthyText).length >= 2;
    const hasDiff = [project?.differentiator_1, project?.differentiator_2, project?.differentiator_3, project?.key_stat_1, project?.key_stat_2].filter(isTruthyText).length >= 3;
    const activeReviewCount = reviews.filter((row) => row.is_active ?? row.actif ?? true).length;
    const hasReviews = activeReviewCount > 0 || workflow.noReviewReason.trim().length > 0;
    const hasPages = pages.length > 0 && pages.some((row) => row.is_active ?? row.actif ?? true);
    const hasCta = [project?.cta_primary_text, project?.cta_primary_target, project?.override_phone, project?.override_email].filter(isTruthyText).length >= 2;
    const hasMeta = [project?.meta_title_default, project?.meta_description_default].filter(isTruthyText).length >= 1;

    return { hasSources, hasBranding, hasTexts, hasDiff, hasReviews, hasPages, hasCta, hasMeta, activeReviewCount };
  }, [project, pages, reviews, projectSources.length, workflow.noReviewReason]);

  const requiredFailures = [!completion.hasSources, !completion.hasBranding, !completion.hasTexts, !completion.hasCta, !completion.hasReviews].filter(Boolean);

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
    setWorkflow((prev) => {
      const updated = { ...prev, statuses: { ...prev.statuses, [prev.activeCardId]: status } };
      return updated;
    });
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

  const updateProjectField = (field: string, value: unknown) => {
    setProject((prev) => (prev ? { ...prev, [field]: value } : prev));
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

  const saveAsReady = async (checked: boolean) => {
    if (!project) return;
    if (checked && !readyForPublish) {
      toast.error("Blocs requis manquants pour activer LM prêt.");
      return;
    }
    await updateLeadMagnetProject(project.id, { pret_pour_lm: checked, statut: checked ? "ready" : "in_progress" });
    setProject((prev) => (prev ? { ...prev, pret_pour_lm: checked, statut: checked ? "ready" : "in_progress" } : prev));
    toast.success(checked ? "Lead magnet marqué prêt ✅" : "Lead magnet repassé en préparation.");
  };

  const currentStatus = workflow.statuses[activeCardId];
  const validatedCount = cardIds.filter((id) => workflow.statuses[id] === "validated").length;

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  if (!project) return <div className="p-6 text-sm text-muted-foreground">Projet introuvable.</div>;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <section className="-mx-4 border-y bg-white md:-mx-6">
        <div className="space-y-0 px-4 py-2 md:px-6">
          <div className="flex items-center gap-2 overflow-x-auto">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => previousProjectId && router.push(`/production/lead-magnet/${previousProjectId}`)} disabled={!previousProjectId} aria-label="Entreprise précédente">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <p className="min-w-0 truncate text-sm font-semibold">{opportunitySummary.companyName || "Lead magnet"}<span className="text-muted-foreground"> • {opportunitySummary.city || "Ville inconnue"}</span></p>
            <Badge variant={project.pret_pour_lm ? "default" : "secondary"} className="shrink-0">{validatedCount}/{cardIds.length}</Badge>
            <div className="ml-auto flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => websiteUrl && window.open(websiteUrl, "_blank", "noopener,noreferrer")} disabled={!websiteUrl} aria-label="Ouvrir le site web">
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => googleBusinessUrl && window.open(googleBusinessUrl, "_blank", "noopener,noreferrer")} disabled={!googleBusinessUrl} aria-label="Ouvrir la page Google Business">
                <ExternalLink className="h-4 w-4" />
              </Button>
              <label className="ml-2 inline-flex shrink-0 items-center gap-2 text-xs font-medium">
                LM prêt
                <Switch checked={Boolean(project.pret_pour_lm)} onCheckedChange={(checked) => void saveAsReady(checked)} />
              </label>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => nextProjectId && router.push(`/production/lead-magnet/${nextProjectId}`)} disabled={!nextProjectId} aria-label="Entreprise suivante">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="-mb-2 mt-2 h-0.5 w-full bg-slate-200">
            <div className="h-0.5 bg-emerald-500 transition-all" style={{ width: `${(validatedCount / cardIds.length) * 100}%` }} />
          </div>
        </div>
      </section>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Deck workflow</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto pb-4">
            <div className="flex min-w-max gap-2">
            {orderedDeck.map((id, index) => (
              <button key={id} className={cn("rounded-md border px-3 py-2 text-left text-sm whitespace-nowrap", activeCardId === id && "border-primary bg-primary/5")} onClick={() => goToCard(id)}>
                <div className="flex items-center justify-between gap-2">
                  <span>{index + 1}. {id === "diff" ? "Différenciateurs & stats" : id === "cta" ? "CTA / conversion" : id === "meta" ? "Métadonnées" : id === "texts" ? "Textes principaux" : id === "sources" ? "Sources & accès" : id === "branding" ? "Logo & assets" : id === "reviews" ? "Reviews" : "Pages / contenu"}</span>
                  <WorkflowPill status={workflow.statuses[id]} />
                </div>
              </button>
            ))}
            </div>
          </CardContent>
        </Card>

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
                <span>{activeCardIndex + 1}/{cardIds.length} • {activeCardId === "diff" ? "Différenciateurs & stats" : activeCardId === "cta" ? "CTA / conversion" : activeCardId === "meta" ? "Métadonnées utiles" : activeCardId === "texts" ? "Textes principaux" : activeCardId === "sources" ? "Sources & accès" : activeCardId === "branding" ? "Logo & assets" : activeCardId === "reviews" ? "Reviews" : "Pages / contenu"}</span>
                <WorkflowPill status={currentStatus} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
            {activeCardId === "sources" && (
              <div className="space-y-3">
                <div className="grid gap-2 md:grid-cols-2">
                {(projectSources.length > 0 ? projectSources : [{ label: "Aucune source", value: "Ajoutez des infos dans le projet." }]).map((item) => (
                  <div key={item.label} className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-sm font-medium break-all">{item.value}</p>
                  </div>
                ))}
                </div>
              </div>
            )}

            {activeCardId === "branding" && (
              <div className="grid gap-3 md:grid-cols-3">
                {(["logo_url", "hero_image_url", "favicon_url"] as const).map((field) => (
                  <div key={field} className="space-y-2 rounded-md border p-3" onDragOver={(event) => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => {
                    const file = event.dataTransfer.files[0];
                    if (!file) return;
                    updateProjectField(field, URL.createObjectURL(file));
                  }}>
                    <Label>{field}</Label>
                    <Input value={asString(project[field])} onChange={(event) => updateProjectField(field, event.target.value)} placeholder="https://..." />
                    {asString(project[field]) ? <img src={asString(project[field])} alt={field} className="h-16 w-16 rounded border object-cover" /> : <p className="text-xs text-muted-foreground">Drag & drop image</p>}
                  </div>
                ))}
              </div>
            )}

            {activeCardId === "texts" && (
              <div className="space-y-3">
                <div className="space-y-1"><Label>Slogan</Label><Input value={asString(project.hero_title)} onChange={(event) => updateProjectField("hero_title", event.target.value)} /></div>
                <div className="space-y-1"><Label>Sous-slogan</Label><Input value={asString(project.hero_subtitle)} onChange={(event) => updateProjectField("hero_subtitle", event.target.value)} /></div>
                <div className="space-y-1"><Label>Paragraphe de présentation</Label><Textarea value={asString(project.hero_description)} onChange={(event) => updateProjectField("hero_description", event.target.value)} /></div>
              </div>
            )}

            {activeCardId === "diff" && (
              <div className="grid gap-3 md:grid-cols-2">
                {["differentiator_1", "differentiator_2", "differentiator_3", "key_stat_1", "key_stat_2"].map((field) => (
                  <div className="space-y-1" key={field}><Label>{field}</Label><Input value={asString(project[field])} onChange={(event) => updateProjectField(field, event.target.value)} /></div>
                ))}
              </div>
            )}

            {activeCardId === "reviews" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{completion.activeReviewCount} review(s) active(s)</p>
                  <Button size="sm" variant="outline" onClick={async () => {
                    const created = await createLeadMagnetReview({ project_id: project.id, author_name: "Nouveau client", review_text: "", rating: 5, is_manual: true, is_active: true, display_order: reviews.length + 1, source: "manual" });
                    setReviews((prev) => [...prev, created]);
                  }}><Plus className="mr-2 h-4 w-4" /> Ajouter</Button>
                </div>

                <div className="space-y-1">
                  <Label>Raison d'absence de reviews (optionnel)</Label>
                  <Textarea value={workflow.noReviewReason} onChange={(event) => setWorkflow((prev) => ({ ...prev, noReviewReason: event.target.value }))} />
                </div>

                {reviews.map((review, i) => (
                  <div key={review.id} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><GripVertical className="h-3.5 w-3.5" />#{i + 1}</span><Button size="sm" variant="ghost" onClick={async () => { await deleteLeadMagnetReview(review.id); setReviews((prev) => prev.filter((x) => x.id !== review.id)); }}><Trash2 className="h-4 w-4" /></Button></div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <Input value={asString(review.author_name)} onChange={(event) => updateReviewField(review.id, "author_name", event.target.value)} placeholder="Auteur" />
                      <Input type="number" min={1} max={5} value={String(review.rating ?? 5)} onChange={(event) => updateReviewField(review.id, "rating", Number(event.target.value))} />
                    </div>
                    <Textarea value={asString(review.review_text)} onChange={(event) => updateReviewField(review.id, "review_text", event.target.value)} placeholder="Texte review" />
                    <div className="flex gap-4 text-sm">
                      <label className="inline-flex items-center gap-2"><Switch checked={Boolean(review.is_active ?? true)} onCheckedChange={(checked) => updateReviewField(review.id, "is_active", checked)} /> Active</label>
                      <label className="inline-flex items-center gap-2"><Switch checked={Boolean(review.is_manual ?? true)} onCheckedChange={(checked) => updateReviewField(review.id, "is_manual", checked)} /> Manuelle</label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeCardId === "pages" && (
              <div className="space-y-3">
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={async () => {
                    const created = await createLeadMagnetPage({ project_id: project.id, page_name: `Page ${pages.length + 1}`, page_key: `page_${pages.length + 1}`, slug: `page-${pages.length + 1}`, is_active: true, display_order: pages.length + 1, body_json: {} });
                    setPages((prev) => [...prev, created]);
                  }}><Plus className="mr-2 h-4 w-4" /> Ajouter une page</Button>
                </div>

                {pages.map((page) => (
                  <div key={page.id} className="rounded-md border p-3 space-y-2">
                    <div className="grid gap-2 md:grid-cols-3">
                      <Input value={asString(page.page_name)} onChange={(event) => updatePageField(page.id, "page_name", event.target.value)} placeholder="Titre" />
                      <Input value={asString(page.slug)} onChange={(event) => updatePageField(page.id, "slug", event.target.value)} placeholder="Slug" />
                      <Input value={asString(page.headline)} onChange={(event) => updatePageField(page.id, "headline", event.target.value)} placeholder="Headline" />
                    </div>
                    <Textarea value={asString(page.subheadline)} onChange={(event) => updatePageField(page.id, "subheadline", event.target.value)} placeholder="Contenu rapide" />
                    <div className="flex items-center justify-between">
                      <label className="inline-flex items-center gap-2 text-sm"><Switch checked={Boolean(page.is_active ?? true)} onCheckedChange={(checked) => updatePageField(page.id, "is_active", checked)} /> Active</label>
                      <Button size="sm" variant="ghost" onClick={async () => { await deleteLeadMagnetPage(page.id); setPages((prev) => prev.filter((x) => x.id !== page.id)); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeCardId === "cta" && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1"><Label>CTA principal</Label><Input value={asString(project.cta_primary_text)} onChange={(event) => updateProjectField("cta_primary_text", event.target.value)} /></div>
                <div className="space-y-1"><Label>Destination CTA principal</Label><Input value={asString(project.cta_primary_target)} onChange={(event) => updateProjectField("cta_primary_target", event.target.value)} /></div>
                <div className="space-y-1"><Label>CTA secondaire</Label><Input value={asString(project.cta_secondary_text)} onChange={(event) => updateProjectField("cta_secondary_text", event.target.value)} /></div>
                <div className="space-y-1"><Label>Email</Label><Input value={asString(project.override_email)} onChange={(event) => updateProjectField("override_email", event.target.value)} /></div>
                <div className="space-y-1"><Label>Téléphone</Label><Input value={asString(project.override_phone)} onChange={(event) => updateProjectField("override_phone", event.target.value)} /></div>
              </div>
            )}

            {activeCardId === "meta" && (
              <div className="space-y-3">
                <div className="space-y-1"><Label>Meta title</Label><Input value={asString(project.meta_title_default)} onChange={(event) => updateProjectField("meta_title_default", event.target.value)} /></div>
                <div className="space-y-1"><Label>Meta description</Label><Textarea value={asString(project.meta_description_default)} onChange={(event) => updateProjectField("meta_description_default", event.target.value)} /></div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <div className="text-xs text-muted-foreground">Swipe droite ou <kbd>→</kbd> pour valider • Swipe gauche ou <kbd>←</kbd> pour revoir.</div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => markCard("review")}><ArrowLeft className="mr-1 h-4 w-4" /> Revoir</Button>
                <Button variant="outline" onClick={() => moveToNextCard(activeCardId)}><SkipForward className="mr-1 h-4 w-4" /> Passer</Button>
                <Button onClick={() => markCard("validated")}><ArrowRight className="mr-1 h-4 w-4" /> Valider</Button>
              </div>
            </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
