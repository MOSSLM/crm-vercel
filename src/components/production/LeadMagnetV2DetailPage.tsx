"use client";

import { type DragEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, GripVertical, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createLeadMagnetPage,
  createLeadMagnetReview,
  deleteLeadMagnetPage,
  deleteLeadMagnetReview,
  loadLeadMagnetBundle,
  type LeadMagnetPageRecord,
  type LeadMagnetProjectRecord,
  type LeadMagnetReviewRecord,
  updateLeadMagnetPage,
  updateLeadMagnetProject,
  updateLeadMagnetReview,
} from "@/utils/leadMagnetV2Api";
import { toast } from "sonner";

const parseJsonInput = (value: string) => {
  if (!value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const firstString = (value: unknown) => (typeof value === "string" ? value : "");

type Props = {
  projectId: string;
};

export function LeadMagnetV2DetailPage({ projectId }: Props) {
  const router = useRouter();
  const [project, setProject] = useState<LeadMagnetProjectRecord | null>(null);
  const [pages, setPages] = useState<LeadMagnetPageRecord[]>([]);
  const [reviews, setReviews] = useState<LeadMagnetReviewRecord[]>([]);
  const [opportunitySummary, setOpportunitySummary] = useState({ companyName: "", city: "", opportunityName: "", pipeline: "", stage: "", tags: [] as string[], flags: [] as string[] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const bundle = await loadLeadMagnetBundle(projectId);
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
          flags: bundle.opportunity?.flags ?? [],
        });
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
  }, [projectId]);

  const isReady = Boolean(project?.pret_pour_lm);

  const saveProject = async (updates: Partial<LeadMagnetProjectRecord>) => {
    if (!project) return;
    try {
      await updateLeadMagnetProject(project.id, updates);
      setProject((prev) => (prev ? { ...prev, ...updates } : prev));
      toast.success("Projet sauvegardé");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur projet");
    }
  };

  const updatePageField = (pageId: string, key: keyof LeadMagnetPageRecord, value: unknown) => {
    setPages((prev) => prev.map((page) => (page.id === pageId ? { ...page, [key]: value } : page)));
  };

  const updateReviewField = (reviewId: string, key: keyof LeadMagnetReviewRecord, value: unknown) => {
    setReviews((prev) => prev.map((review) => (review.id === reviewId ? { ...review, [key]: value } : review)));
  };

  const moveReview = async (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= reviews.length) return;

    const reordered = [...reviews];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, moved);

    setReviews(reordered.map((row, i) => ({ ...row, display_order: i + 1 })));
    await Promise.all(reordered.map((row, i) => updateLeadMagnetReview(row.id, { display_order: i + 1 })));
  };

  const dropAssetFile = async (
    event: DragEvent<HTMLDivElement>,
    field: "logo_url" | "favicon_url" | "hero_image_url"
  ) => {
    event.preventDefault();
    if (!project) return;

    const firstFile = event.dataTransfer.files[0];
    if (!firstFile) return;

    const localPreview = URL.createObjectURL(firstFile);
    setProject((prev) => (prev ? { ...prev, [field]: localPreview } : prev));
    toast.info("Preview locale générée. Ajoutez une URL finale persistante si nécessaire.");
  };

  const totalActiveReviews = useMemo(
    () => reviews.filter((review) => (review.is_active ?? review.actif ?? true) === true).length,
    [reviews]
  );

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  if (!project) return <div className="p-6 text-sm text-muted-foreground">Projet introuvable.</div>;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Button variant="ghost" onClick={() => router.push("/production/lead-magnet")}> 
        <ArrowLeft className="mr-2 h-4 w-4" /> Retour à la liste
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{opportunitySummary.companyName || "Lead Magnet"}</CardTitle>
          <CardDescription>
            {opportunitySummary.city || "Ville inconnue"} • {opportunitySummary.opportunityName || "Opportunité"}
          </CardDescription>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Pipeline: {opportunitySummary.pipeline || "n/a"}</Badge>
            <Badge variant="outline">Stage: {opportunitySummary.stage || "n/a"}</Badge>
            <Badge variant={isReady ? "default" : "secondary"}>Prêt pour LM: {isReady ? "Oui" : "Non"}</Badge>
            <Badge variant="secondary">Statut: {firstString(project.statut ?? project.status ?? "draft")}</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Switch checked={isReady} onCheckedChange={(checked) => void saveProject({ pret_pour_lm: checked })} />
            <span>Basculer “prêt pour LM”</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {opportunitySummary.tags.map((tag) => <Badge key={`tag-${tag}`} variant="outline">{tag}</Badge>)}
            {opportunitySummary.flags.map((flag) => <Badge key={`flag-${flag}`} variant="secondary">{flag}</Badge>)}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Projet</CardTitle>
          <CardDescription>Édition de <code>lead_magnet_projects</code>.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {[
            ["override_entreprise_name", "Nom entreprise"],
            ["override_city", "Ville"],
            ["override_phone", "Téléphone"],
            ["override_email", "Email"],
            ["override_address", "Adresse"],
            ["meta_title_default", "Meta title défaut"],
            ["meta_description_default", "Meta description défaut"],
          ].map(([field, label]) => (
            <div key={field} className="space-y-1">
              <Label>{label}</Label>
              <Input
                value={firstString(project[field])}
                onChange={(event) => setProject((prev) => (prev ? { ...prev, [field]: event.target.value } : prev))}
                onBlur={() => void saveProject({ [field]: project[field] } as Partial<LeadMagnetProjectRecord>)}
              />
            </div>
          ))}

          {([
            ["logo_url", "Logo"],
            ["favicon_url", "Favicon"],
            ["hero_image_url", "Hero image"],
          ] as const).map(([field, label]) => (
            <div key={field} className="space-y-2 rounded-lg border p-3" onDragOver={(event) => event.preventDefault()} onDrop={(event) => void dropAssetFile(event, field)}>
              <Label>{label} (drag & drop + URL)</Label>
              <Input
                value={firstString(project[field])}
                placeholder="https://..."
                onChange={(event) => setProject((prev) => (prev ? { ...prev, [field]: event.target.value } : prev))}
                onBlur={() => void saveProject({ [field]: project[field] } as Partial<LeadMagnetProjectRecord>)}
              />
              {firstString(project[field]) ? (
                <div className="flex items-center gap-2">
                  <img src={firstString(project[field])} alt={label} className="h-14 w-14 rounded-md border object-cover" />
                  <Button variant="outline" size="sm" onClick={() => void saveProject({ [field]: null } as Partial<LeadMagnetProjectRecord>)}>
                    Supprimer
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Déposez une image ici pour prévisualiser immédiatement.</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Pages</CardTitle>
            <CardDescription>CRUD complet sur <code>lead_magnet_pages</code>.</CardDescription>
          </div>
          <Button size="sm" onClick={async () => {
            const created = await createLeadMagnetPage({ project_id: project.id, page_name: "Nouvelle page", page_key: `page_${pages.length + 1}`, slug: `page-${pages.length + 1}`, is_active: true, display_order: pages.length + 1, body_json: {} });
            setPages((prev) => [...prev, created]);
          }}><Plus className="mr-2 h-4 w-4" /> Ajouter</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {pages.map((page) => (
            <div key={page.id} className="space-y-2 rounded-lg border p-3">
              <div className="grid gap-2 md:grid-cols-3">
                {([
                  ["page_key", "page_key"],
                  ["page_name", "page_name"],
                  ["slug", "slug"],
                  ["service_key", "service_key"],
                  ["headline", "headline"],
                  ["subheadline", "subheadline"],
                  ["meta_title", "meta_title"],
                  ["meta_description", "meta_description"],
                ] as const).map(([field, label]) => (
                  <div key={`${page.id}-${field}`} className="space-y-1">
                    <Label>{label}</Label>
                    <Input value={firstString(page[field])} onChange={(event) => updatePageField(page.id, field, event.target.value)} />
                  </div>
                ))}
                <div className="space-y-2">
                  <Label>Actif</Label>
                  <Switch checked={Boolean(page.is_active ?? page.actif ?? true)} onCheckedChange={(checked) => updatePageField(page.id, "is_active", checked)} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>body_json</Label>
                <Textarea
                  className="min-h-36 font-mono text-xs"
                  value={JSON.stringify(page.body_json ?? {}, null, 2)}
                  onChange={(event) => {
                    const parsed = parseJsonInput(event.target.value);
                    if (parsed !== null) {
                      updatePageField(page.id, "body_json", parsed);
                    }
                  }}
                />
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={() => void updateLeadMagnetPage(page.id, page)}>Sauvegarder</Button>
                <Button size="sm" variant="destructive" onClick={async () => {
                  await deleteLeadMagnetPage(page.id);
                  setPages((prev) => prev.filter((entry) => entry.id !== page.id));
                }}>
                  <Trash2 className="mr-2 h-4 w-4" /> Supprimer
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Reviews</CardTitle>
            <CardDescription>{totalActiveReviews} review(s) actives.</CardDescription>
          </div>
          <Button size="sm" onClick={async () => {
            const created = await createLeadMagnetReview({ project_id: project.id, author_name: "Nouveau client", review_text: "", rating: 5, is_manual: true, is_active: true, display_order: reviews.length + 1, source: "manual" });
            setReviews((prev) => [...prev, created]);
          }}><Plus className="mr-2 h-4 w-4" /> Ajouter</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {reviews.map((review, index) => (
            <div key={review.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-2 text-xs text-muted-foreground"><GripVertical className="h-4 w-4" /> Ordre: {review.display_order ?? review.ordre ?? index + 1}</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void moveReview(index, -1)}>↑</Button>
                  <Button size="sm" variant="outline" onClick={() => void moveReview(index, 1)}>↓</Button>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Auteur</Label>
                  <Input value={firstString(review.author_name)} onChange={(event) => updateReviewField(review.id, "author_name", event.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Rating</Label>
                  <Input type="number" min={1} max={5} value={String(review.rating ?? 5)} onChange={(event) => updateReviewField(review.id, "rating", Number(event.target.value))} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Texte</Label>
                <Textarea value={firstString(review.review_text)} onChange={(event) => updateReviewField(review.id, "review_text", event.target.value)} />
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={Boolean(review.is_manual ?? true)} onCheckedChange={(checked) => updateReviewField(review.id, "is_manual", checked)} /> Manuelle
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={Boolean(review.is_active ?? review.actif ?? true)} onCheckedChange={(checked) => updateReviewField(review.id, "is_active", checked)} /> Active
                </label>
                <Badge variant="outline">Source: {review.source ?? (review.is_manual ? "manual" : "google")}</Badge>
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={() => void updateLeadMagnetReview(review.id, review)}>Sauvegarder</Button>
                <Button size="sm" variant="destructive" onClick={async () => {
                  await deleteLeadMagnetReview(review.id);
                  setReviews((prev) => prev.filter((entry) => entry.id !== review.id));
                }}>
                  <Trash2 className="mr-2 h-4 w-4" /> Supprimer
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Separator />
      <p className="text-xs text-muted-foreground">Legacy <code>public.lead_magnets</code> non utilisée en écriture.</p>
    </div>
  );
}
