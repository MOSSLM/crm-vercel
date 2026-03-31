"use client";

import { DragEvent, useCallback, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Save, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createLeadMagnetPage,
  createLeadMagnetReview,
  deleteLeadMagnetPage,
  deleteLeadMagnetReview,
  LeadMagnetPageV2,
  LeadMagnetProjectV2,
  LeadMagnetReviewV2,
  loadLeadMagnetBundle,
  updateLeadMagnetPage,
  updateLeadMagnetProject,
  updateLeadMagnetReview,
} from "@/utils/leadMagnetV2Api";
import { toast } from "sonner";

type GenericMap = Record<string, unknown>;

const asText = (value: unknown): string => (typeof value === "string" ? value : "");
const asBool = (value: unknown): boolean => value === true;
const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const reorderWithPersist = async (
  items: LeadMagnetReviewV2[],
  fromIndex: number,
  toIndex: number,
  onPersist: (id: string, index: number) => Promise<void>
) => {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return items;
  next.splice(toIndex, 0, moved);
  await Promise.all(next.map((review, index) => onPersist(review.id, index + 1)));
  return next.map((review, index) => ({ ...review, ordre: index + 1 }));
};

export const LeadMagnetPage = () => {
  const [projectId, setProjectId] = useState("");
  const [project, setProject] = useState<LeadMagnetProjectV2 | null>(null);
  const [pages, setPages] = useState<LeadMagnetPageV2[]>([]);
  const [reviews, setReviews] = useState<LeadMagnetReviewV2[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingProject, setSavingProject] = useState(false);

  const publicEndpoint = useMemo(() => {
    if (!project?.id || typeof window === "undefined") return null;
    return `${window.location.origin}/api/public/lead-magnets/${encodeURIComponent(project.id)}`;
  }, [project?.id]);

  const loadProject = useCallback(async () => {
    if (!projectId.trim()) {
      toast.error("Saisissez un ID projet.");
      return;
    }

    setLoading(true);
    try {
      const bundle = await loadLeadMagnetBundle(projectId.trim());
      if (!bundle.project) {
        toast.error("Projet introuvable.");
        return;
      }
      setProject(bundle.project);
      setPages(bundle.pages);
      setReviews(bundle.reviews);
      toast.success("Projet LM V2 chargé.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur de chargement";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const updateProjectField = (key: string, value: unknown) => {
    setProject((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const saveProject = async () => {
    if (!project) return;
    setSavingProject(true);
    try {
      await updateLeadMagnetProject(project.id, {
        pret_pour_lm: asBool(project.pret_pour_lm),
        overrides: (project.overrides ?? {}) as Record<string, unknown>,
        assets: (project.assets ?? {}) as Record<string, unknown>,
      });
      toast.success("Projet sauvegardé.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur sauvegarde projet");
    } finally {
      setSavingProject(false);
    }
  };

  const savePage = async (page: LeadMagnetPageV2) => {
    try {
      const payload = { ...page };
      delete payload.id;
      await updateLeadMagnetPage(page.id, payload);
      toast.success("Page mise à jour.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur page");
    }
  };

  const addPage = async () => {
    if (!project?.id) return;
    try {
      const created = await createLeadMagnetPage({
        project_id: project.id,
        ordre: pages.length + 1,
        actif: true,
        slug: `page-${pages.length + 1}`,
        titre: "Nouvelle page",
      });
      setPages((prev) => [...prev, created]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'ajouter la page");
    }
  };

  const removePage = async (pageId: string) => {
    try {
      await deleteLeadMagnetPage(pageId);
      setPages((prev) => prev.filter((page) => page.id !== pageId));
      toast.success("Page supprimée.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  };

  const upsertReview = (reviewId: string, updates: Partial<LeadMagnetReviewV2>) => {
    setReviews((prev) => prev.map((review) => (review.id === reviewId ? { ...review, ...updates } : review)));
  };

  const saveReview = async (review: LeadMagnetReviewV2) => {
    try {
      const payload = { ...review };
      delete payload.id;
      await updateLeadMagnetReview(review.id, payload);
      toast.success("Avis mis à jour.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur avis");
    }
  };

  const addReview = async () => {
    if (!project?.id) return;
    try {
      const created = await createLeadMagnetReview({
        project_id: project.id,
        ordre: reviews.length + 1,
        actif: true,
        nom: "Nouveau client",
        texte: "Votre avis ici",
      });
      setReviews((prev) => [...prev, created]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d'ajouter l'avis");
    }
  };

  const removeReview = async (reviewId: string) => {
    try {
      await deleteLeadMagnetReview(reviewId);
      setReviews((prev) => prev.filter((review) => review.id !== reviewId));
      toast.success("Avis supprimé.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Suppression impossible");
    }
  };

  const moveReview = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= reviews.length) return;

    try {
      const next = await reorderWithPersist(reviews, index, target, (id, order) => updateLeadMagnetReview(id, { ordre: order }));
      setReviews(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de réordonner");
    }
  };

  const onAssetDrop = async (event: DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    if (!project) return;

    const droppedUrl = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    if (droppedUrl) {
      const nextAssets = {
        ...(project.assets ?? {}),
        dropped_images: [...(((project.assets as GenericMap)?.dropped_images as string[] | undefined) ?? []), droppedUrl],
      };
      updateProjectField("assets", nextAssets);
      return;
    }

    const [firstFile] = Array.from(event.dataTransfer.files);
    if (!firstFile) return;

    const content = await firstFile.text();
    const nextAssets = {
      ...(project.assets ?? {}),
      dropped_files: [...(((project.assets as GenericMap)?.dropped_files as string[] | undefined) ?? []), content.slice(0, 1000)],
    };
    updateProjectField("assets", nextAssets);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Lead Magnet V2</CardTitle>
          <CardDescription>Édition centralisée du projet, des pages et des reviews (source Supabase V2).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <Input
              placeholder="ID du projet lead_magnet_projects"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            />
            <Button onClick={loadProject} disabled={loading}>{loading ? "Chargement..." : "Charger"}</Button>
          </div>
          {publicEndpoint && <p className="text-xs text-muted-foreground">Endpoint plugin (read-only): {publicEndpoint}</p>}
        </CardContent>
      </Card>

      {project && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Projet LM</CardTitle>
              <CardDescription>Overrides, assets et état "prêt pour LM".</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={asBool(project.pret_pour_lm)}
                  onCheckedChange={(value) => updateProjectField("pret_pour_lm", value === true)}
                />
                <Label>Prêt pour LM</Label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Overrides (JSON)</Label>
                  <Textarea
                    className="min-h-40 font-mono"
                    value={JSON.stringify(project.overrides ?? {}, null, 2)}
                    onChange={(event) => {
                      try {
                        updateProjectField("overrides", JSON.parse(event.target.value || "{}"));
                      } catch {
                        // keep editing without breaking UI
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Assets (JSON) - glisser déposer une URL/image</Label>
                  <Textarea
                    className="min-h-40 font-mono"
                    value={JSON.stringify(project.assets ?? {}, null, 2)}
                    onDrop={onAssetDrop}
                    onDragOver={(event) => event.preventDefault()}
                    onChange={(event) => {
                      try {
                        updateProjectField("assets", JSON.parse(event.target.value || "{}"));
                      } catch {
                        // keep editing without breaking UI
                      }
                    }}
                  />
                </div>
              </div>

              <Button onClick={saveProject} disabled={savingProject}><Save className="mr-2 h-4 w-4" />Sauvegarder le projet</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Pages</CardTitle>
                <CardDescription>Édition des enregistrements lead_magnet_pages.</CardDescription>
              </div>
              <Button onClick={addPage}><Plus className="mr-2 h-4 w-4" />Ajouter une page</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {pages.map((page) => (
                <div key={page.id} className="rounded-md border p-4 space-y-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <Label>Slug</Label>
                      <Input value={asText(page.slug)} onChange={(event) => setPages((prev) => prev.map((item) => item.id === page.id ? { ...item, slug: event.target.value } : item))} />
                    </div>
                    <div>
                      <Label>Titre</Label>
                      <Input value={asText(page.titre)} onChange={(event) => setPages((prev) => prev.map((item) => item.id === page.id ? { ...item, titre: event.target.value } : item))} />
                    </div>
                    <div>
                      <Label>Ordre</Label>
                      <Input type="number" value={asNumber(page.ordre, 1)} onChange={(event) => setPages((prev) => prev.map((item) => item.id === page.id ? { ...item, ordre: Number(event.target.value) } : item))} />
                    </div>
                  </div>
                  <div>
                    <Label>Contenu / body (JSON ou texte)</Label>
                    <Textarea
                      className="min-h-32"
                      value={typeof page.body === "string" ? page.body : JSON.stringify(page.body ?? {}, null, 2)}
                      onChange={(event) => setPages((prev) => prev.map((item) => item.id === page.id ? { ...item, body: event.target.value } : item))}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox checked={asBool(page.actif)} onCheckedChange={(value) => setPages((prev) => prev.map((item) => item.id === page.id ? { ...item, actif: value === true } : item))} />
                      <Label>Active</Label>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => void savePage(page)}><Save className="mr-2 h-4 w-4" />Sauvegarder</Button>
                      <Button variant="destructive" onClick={() => void removePage(page.id)}><Trash2 className="mr-2 h-4 w-4" />Supprimer</Button>
                    </div>
                  </div>
                </div>
              ))}
              {pages.length === 0 && <p className="text-sm text-muted-foreground">Aucune page pour ce projet.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Reviews</CardTitle>
                <CardDescription>Ajout manuel, édition, suppression, ordre et état actif/inactif.</CardDescription>
              </div>
              <Button onClick={addReview}><Plus className="mr-2 h-4 w-4" />Ajouter un avis</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {reviews.map((review, index) => (
                <div key={review.id} className="rounded-md border p-4 space-y-3" draggable>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground"><GripVertical className="h-4 w-4" /> Ordre #{asNumber(review.ordre, index + 1)}</div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => void moveReview(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="outline" size="sm" onClick={() => void moveReview(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Nom</Label>
                      <Input value={asText(review.nom)} onChange={(event) => upsertReview(review.id, { nom: event.target.value })} />
                    </div>
                    <div>
                      <Label>Source / rôle</Label>
                      <Input value={asText(review.source)} onChange={(event) => upsertReview(review.id, { source: event.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label>Texte</Label>
                    <Textarea value={asText(review.texte)} onChange={(event) => upsertReview(review.id, { texte: event.target.value })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox checked={asBool(review.actif)} onCheckedChange={(value) => upsertReview(review.id, { actif: value === true })} />
                      <Label>Actif</Label>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => void saveReview(review)}><Save className="mr-2 h-4 w-4" />Sauvegarder</Button>
                      <Button variant="destructive" onClick={() => void removeReview(review.id)}><Trash2 className="mr-2 h-4 w-4" />Supprimer</Button>
                    </div>
                  </div>
                </div>
              ))}
              {reviews.length === 0 && <p className="text-sm text-muted-foreground">Aucun avis pour ce projet.</p>}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Legacy (lecture seule temporaire)</CardTitle>
          <CardDescription>La table legacy <code>lead_magnets</code> ne doit plus être utilisée en écriture.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Le CRM écrit uniquement dans lead_magnet_projects/pages/reviews. Le plugin reste strictement en lecture via l'API publique.</p>
          <div className="pt-2 text-xs text-muted-foreground flex items-center gap-2"><Upload className="h-4 w-4" />Drag & drop support activé sur le champ Assets du projet.</div>
        </CardContent>
      </Card>
    </div>
  );
};
