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

const asRecord = (value: unknown): GenericMap =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as GenericMap) : {};

const reorderWithPersist = async (
  items: LeadMagnetReviewV2[],
  fromIndex: number,
  toIndex: number,
  onPersist: (id: string, index: number) => Promise<unknown>
): Promise<LeadMagnetReviewV2[]> => {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return items;

  next.splice(toIndex, 0, moved);

  await Promise.all(
    next.map((review, index) => onPersist(review.id, index + 1))
  );

  return next.map((review, index) => ({
    ...review,
    display_order: index + 1,
  }));
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
        setProject(null);
        setPages([]);
        setReviews([]);
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
        statut: asText(project.statut) || "draft",
        variables: asRecord(project.variables),
        logo_url: asText(project.logo_url) || null,
        favicon_url: asText(project.favicon_url) || null,
        hero_image_url: asText(project.hero_image_url) || null,
        meta_title_default: asText(project.meta_title_default) || null,
        meta_description_default: asText(project.meta_description_default) || null,
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
      const { id, ...payload } = page;
      await updateLeadMagnetPage(id, payload);
      toast.success("Page mise à jour.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur page");
    }
  };

  const addPage = async () => {
    if (!project?.id) return;

    try {
      const created = await createLeadMagnetPage({
        lead_magnet_project_id: project.id,
        display_order: pages.length + 1,
        is_active: true,
        slug: `page-${pages.length + 1}`,
        page_key: `page_${pages.length + 1}`,
        page_name: "Nouvelle page",
        headline: "",
        subheadline: "",
        meta_title: "",
        meta_description: "",
        body_json: {},
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
    setReviews((prev) =>
      prev.map((review) => (review.id === reviewId ? { ...review, ...updates } : review))
    );
  };

  const saveReview = async (review: LeadMagnetReviewV2) => {
    try {
      const { id, ...payload } = review;
      await updateLeadMagnetReview(id, payload);
      toast.success("Avis mis à jour.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur avis");
    }
  };

  const addReview = async () => {
    if (!project?.id) return;

    try {
      const created = await createLeadMagnetReview({
        lead_magnet_project_id: project.id,
        display_order: reviews.length + 1,
        is_active: true,
        is_manual: true,
        author_name: "Nouveau client",
        review_text: "Votre avis ici",
        source: "manual",
        rating: 5,
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
      const next = await reorderWithPersist(
        reviews,
        index,
        target,
        async (id, order) => {
          await updateLeadMagnetReview(id, { display_order: order });
        }
      );
      setReviews(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de réordonner");
    }
  };

  const onAssetDrop = async (event: DragEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    if (!project) return;

    const droppedUrl =
      event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");

    const currentVariables = asRecord(project.variables);
    const currentDroppedAssets = Array.isArray(currentVariables.dropped_assets)
      ? (currentVariables.dropped_assets as string[])
      : [];

    if (droppedUrl) {
      updateProjectField("variables", {
        ...currentVariables,
        dropped_assets: [...currentDroppedAssets, droppedUrl],
      });
      return;
    }

    const [firstFile] = Array.from(event.dataTransfer.files);
    if (!firstFile) return;

    const content = await firstFile.text();
    updateProjectField("variables", {
      ...currentVariables,
      dropped_assets: [...currentDroppedAssets, content.slice(0, 1000)],
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Lead Magnet V2</CardTitle>
          <CardDescription>
            Édition centralisée du projet, des pages et des reviews (source Supabase V2).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <Input
              placeholder="ID du projet lead_magnet_projects"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            />
            <Button onClick={loadProject} disabled={loading}>
              {loading ? "Chargement..." : "Charger"}
            </Button>
          </div>
          {publicEndpoint && (
            <p className="text-xs text-muted-foreground">
              Endpoint plugin (read-only): {publicEndpoint}
            </p>
          )}
        </CardContent>
      </Card>

      {project && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Projet LM</CardTitle>
              <CardDescription>
                Variables projet, branding et état "prêt pour LM".
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={asBool(project.pret_pour_lm)}
                  onCheckedChange={(value) => updateProjectField("pret_pour_lm", value === true)}
                />
                <Label>Prêt pour LM</Label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Logo URL</Label>
                  <Input
                    value={asText(project.logo_url)}
                    onChange={(event) => updateProjectField("logo_url", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Favicon URL</Label>
                  <Input
                    value={asText(project.favicon_url)}
                    onChange={(event) => updateProjectField("favicon_url", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Hero image URL</Label>
                  <Input
                    value={asText(project.hero_image_url)}
                    onChange={(event) => updateProjectField("hero_image_url", event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Meta title par défaut</Label>
                  <Input
                    value={asText(project.meta_title_default)}
                    onChange={(event) => updateProjectField("meta_title_default", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Meta description par défaut</Label>
                  <Textarea
                    value={asText(project.meta_description_default)}
                    onChange={(event) =>
                      updateProjectField("meta_description_default", event.target.value)
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Variables (JSON) — drag & drop URL/fichier accepté</Label>
                <Textarea
                  className="min-h-40 font-mono"
                  value={JSON.stringify(asRecord(project.variables), null, 2)}
                  onDrop={onAssetDrop}
                  onDragOver={(event) => event.preventDefault()}
                  onChange={(event) => {
                    try {
                      updateProjectField("variables", JSON.parse(event.target.value || "{}"));
                    } catch {
                      // keep editing without breaking UI
                    }
                  }}
                />
              </div>

              <Button onClick={saveProject} disabled={savingProject}>
                <Save className="mr-2 h-4 w-4" />
                Sauvegarder le projet
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Pages</CardTitle>
                <CardDescription>
                  Édition des enregistrements lead_magnet_pages.
                </CardDescription>
              </div>
              <Button onClick={addPage}>
                <Plus className="mr-2 h-4 w-4" />
                Ajouter une page
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {pages.map((page) => (
                <div key={page.id} className="space-y-3 rounded-md border p-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div>
                      <Label>Slug</Label>
                      <Input
                        value={asText(page.slug)}
                        onChange={(event) =>
                          setPages((prev) =>
                            prev.map((item) =>
                              item.id === page.id ? { ...item, slug: event.target.value } : item
                            )
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Nom page</Label>
                      <Input
                        value={asText(page.page_name)}
                        onChange={(event) =>
                          setPages((prev) =>
                            prev.map((item) =>
                              item.id === page.id ? { ...item, page_name: event.target.value } : item
                            )
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Page key</Label>
                      <Input
                        value={asText(page.page_key)}
                        onChange={(event) =>
                          setPages((prev) =>
                            prev.map((item) =>
                              item.id === page.id ? { ...item, page_key: event.target.value } : item
                            )
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Ordre</Label>
                      <Input
                        type="number"
                        value={asNumber(page.display_order, 1)}
                        onChange={(event) =>
                          setPages((prev) =>
                            prev.map((item) =>
                              item.id === page.id
                                ? { ...item, display_order: Number(event.target.value) }
                                : item
                            )
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Headline</Label>
                      <Input
                        value={asText(page.headline)}
                        onChange={(event) =>
                          setPages((prev) =>
                            prev.map((item) =>
                              item.id === page.id ? { ...item, headline: event.target.value } : item
                            )
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Subheadline</Label>
                      <Input
                        value={asText(page.subheadline)}
                        onChange={(event) =>
                          setPages((prev) =>
                            prev.map((item) =>
                              item.id === page.id
                                ? { ...item, subheadline: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Meta title</Label>
                      <Input
                        value={asText(page.meta_title)}
                        onChange={(event) =>
                          setPages((prev) =>
                            prev.map((item) =>
                              item.id === page.id ? { ...item, meta_title: event.target.value } : item
                            )
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Meta description</Label>
                      <Input
                        value={asText(page.meta_description)}
                        onChange={(event) =>
                          setPages((prev) =>
                            prev.map((item) =>
                              item.id === page.id
                                ? { ...item, meta_description: event.target.value }
                                : item
                            )
                          )
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Body JSON</Label>
                    <Textarea
                      className="min-h-32"
                      value={
                        typeof page.body_json === "string"
                          ? page.body_json
                          : JSON.stringify(page.body_json ?? {}, null, 2)
                      }
                      onChange={(event) =>
                        setPages((prev) =>
                          prev.map((item) =>
                            item.id === page.id ? { ...item, body_json: event.target.value } : item
                          )
                        )
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={asBool(page.is_active)}
                        onCheckedChange={(value) =>
                          setPages((prev) =>
                            prev.map((item) =>
                              item.id === page.id ? { ...item, is_active: value === true } : item
                            )
                          )
                        }
                      />
                      <Label>Active</Label>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => void savePage(page)}>
                        <Save className="mr-2 h-4 w-4" />
                        Sauvegarder
                      </Button>
                      <Button variant="destructive" onClick={() => void removePage(page.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Supprimer
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {pages.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucune page pour ce projet.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Reviews</CardTitle>
                <CardDescription>
                  Ajout manuel, édition, suppression, ordre et état actif/inactif.
                </CardDescription>
              </div>
              <Button onClick={addReview}>
                <Plus className="mr-2 h-4 w-4" />
                Ajouter un avis
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {reviews.map((review, index) => (
                <div key={review.id} className="space-y-3 rounded-md border p-4" draggable>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <GripVertical className="h-4 w-4" />
                      Ordre #{asNumber(review.display_order, index + 1)}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => void moveReview(index, -1)}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void moveReview(index, 1)}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <Label>Nom</Label>
                      <Input
                        value={asText(review.author_name)}
                        onChange={(event) =>
                          upsertReview(review.id, { author_name: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>Source / rôle</Label>
                      <Input
                        value={asText(review.source)}
                        onChange={(event) =>
                          upsertReview(review.id, { source: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>Note</Label>
                      <Input
                        type="number"
                        min={0}
                        max={5}
                        step={0.5}
                        value={asNumber(review.rating, 5)}
                        onChange={(event) =>
                          upsertReview(review.id, { rating: Number(event.target.value) })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Texte</Label>
                    <Textarea
                      value={asText(review.review_text)}
                      onChange={(event) =>
                        upsertReview(review.id, { review_text: event.target.value })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={asBool(review.is_active)}
                          onCheckedChange={(value) =>
                            upsertReview(review.id, { is_active: value === true })
                          }
                        />
                        <Label>Actif</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={asBool(review.is_manual)}
                          onCheckedChange={(value) =>
                            upsertReview(review.id, { is_manual: value === true })
                          }
                        />
                        <Label>Manuel</Label>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => void saveReview(review)}>
                        <Save className="mr-2 h-4 w-4" />
                        Sauvegarder
                      </Button>
                      <Button variant="destructive" onClick={() => void removeReview(review.id)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Supprimer
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {reviews.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucun avis pour ce projet.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Legacy (lecture seule temporaire)</CardTitle>
          <CardDescription>
            La table legacy <code>lead_magnets</code> ne doit plus être utilisée en écriture.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Le CRM écrit uniquement dans lead_magnet_projects / pages / reviews. Le plugin reste
            strictement en lecture via l'API publique.
          </p>
          <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
            <Upload className="h-4 w-4" />
            Drag & drop support activé sur le champ Variables du projet.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
