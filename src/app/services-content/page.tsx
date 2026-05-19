"use client";

import React from "react";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Save, ChevronDown, ChevronRight } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SimpleImagePicker } from "@/components/services-content/SimpleImagePicker";

interface ServiceTagDefault {
  id: string;
  service_tag: string;
  slug: string;
  display_label: string | null;
  icon: string | null;
  display_order: number;
  headline_template: string | null;
  subheadline_template: string | null;
  description_template: string | null;
  trust_title_template: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_href: string | null;
}

type EditableFields = Omit<ServiceTagDefault, "id">;

export default function ServicesContentPage() {
  const [items, setItems] = React.useState<ServiceTagDefault[]>([]);
  const [inUseTags, setInUseTags] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [drafts, setDrafts] = React.useState<Record<string, EditableFields>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);

  const fetchAll = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/service-tag-defaults");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { items: ServiceTagDefault[]; in_use_tags: string[] };
      setItems(data.items);
      setInUseTags(data.in_use_tags);
      // Refresh drafts with server state.
      const next: Record<string, EditableFields> = {};
      for (const it of data.items) {
        const { id: _id, ...rest } = it;
        void _id;
        next[it.id] = rest;
      }
      setDrafts(next);
    } catch (err) {
      console.error(err);
      toast.error("Impossible de charger les contenus");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void fetchAll(); }, [fetchAll]);

  const tagsWithoutDefault = React.useMemo(() => {
    const set = new Set(items.map((i) => i.service_tag));
    return inUseTags.filter((t) => !set.has(t));
  }, [inUseTags, items]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateDraft(id: string, patch: Partial<EditableFields>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function createDefault(tag: string) {
    try {
      const res = await fetch("/api/service-tag-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_tag: tag, display_label: tag }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as ServiceTagDefault;
      toast.success(`Défaut créé pour « ${tag} »`);
      setExpanded((prev) => new Set(prev).add(data.id));
      await fetchAll();
    } catch (err) {
      console.error(err);
      toast.error("Création échouée");
    }
  }

  async function saveItem(id: string) {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    try {
      const res = await fetch(`/api/service-tag-defaults/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Enregistré");
      await fetchAll();
    } catch (err) {
      console.error(err);
      toast.error("Échec de l'enregistrement");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteItem(id: string, tag: string) {
    if (!confirm(`Supprimer le contenu par défaut pour « ${tag} » ?`)) return;
    try {
      const res = await fetch(`/api/service-tag-defaults/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Supprimé");
      await fetchAll();
    } catch (err) {
      console.error(err);
      toast.error("Suppression échouée");
    }
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Contenu services</h1>
          <p className="text-sm text-gray-500 mt-1">
            Définissez le contenu par défaut affiché par les sections adaptatives pour chaque
            <em> service_tag</em>. Les sections marquées en catégorie <code>services</code> ou
            <code>stats</code> utilisent ces défauts, filtrés par les tags de l&apos;entreprise
            active. Utilisez <code>{"{{entreprise.nom}}"}</code>, <code>{"{{entreprise.ville}}"}</code>… dans les templates.
          </p>
        </div>

        {tagsWithoutDefault.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <h2 className="font-medium text-sm mb-3">Tags sans contenu par défaut ({tagsWithoutDefault.length})</h2>
              <div className="flex flex-wrap gap-2">
                {tagsWithoutDefault.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => createDefault(tag)}
                    className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 hover:bg-blue-100 text-sm border"
                  >
                    <Plus className="h-3 w-3" />
                    {tag}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-sm text-gray-500 py-12">
              Aucun contenu par défaut configuré.
              {inUseTags.length > 0 && " Cliquez sur un tag ci-dessus pour démarrer."}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((it) => {
              const draft = drafts[it.id] ?? it;
              const isOpen = expanded.has(it.id);
              return (
                <Card key={it.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleExpanded(it.id)}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{it.display_label || it.service_tag}</span>
                          <Badge variant="outline" className="text-xs">{it.service_tag}</Badge>
                          <code className="text-xs text-gray-500">/{it.slug}</code>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveItem(it.id)}
                        disabled={savingId === it.id}
                      >
                        {savingId === it.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Save className="h-3 w-3 mr-1" />
                        )}
                        Enregistrer
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteItem(it.id, it.service_tag)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>

                    {isOpen && (
                      <div className="mt-4 pt-4 border-t grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Libellé affiché">
                          <Input
                            value={draft.display_label ?? ""}
                            onChange={(e) => updateDraft(it.id, { display_label: e.target.value || null })}
                          />
                        </Field>
                        <Field label="Slug (URL)">
                          <Input
                            value={draft.slug}
                            onChange={(e) => updateDraft(it.id, { slug: e.target.value })}
                          />
                        </Field>
                        <Field label="Icône (Lucide ou emoji)">
                          <Input
                            value={draft.icon ?? ""}
                            onChange={(e) => updateDraft(it.id, { icon: e.target.value || null })}
                          />
                        </Field>
                        <Field label="Ordre d'affichage">
                          <Input
                            type="number"
                            value={draft.display_order}
                            onChange={(e) => updateDraft(it.id, { display_order: Number(e.target.value) || 0 })}
                          />
                        </Field>
                        <Field label="Headline (template)" full>
                          <Textarea
                            rows={2}
                            value={draft.headline_template ?? ""}
                            onChange={(e) => updateDraft(it.id, { headline_template: e.target.value || null })}
                            placeholder="ex: {{display_label}} à {{entreprise.ville}}"
                          />
                        </Field>
                        <Field label="Sous-headline (template)" full>
                          <Textarea
                            rows={2}
                            value={draft.subheadline_template ?? ""}
                            onChange={(e) => updateDraft(it.id, { subheadline_template: e.target.value || null })}
                          />
                        </Field>
                        <Field label="Description (template)" full>
                          <Textarea
                            rows={3}
                            value={draft.description_template ?? ""}
                            onChange={(e) => updateDraft(it.id, { description_template: e.target.value || null })}
                          />
                        </Field>
                        <Field label="Titre confiance (template)" full>
                          <Input
                            value={draft.trust_title_template ?? ""}
                            onChange={(e) => updateDraft(it.id, { trust_title_template: e.target.value || null })}
                            placeholder="ex: {{entreprise.nom}}, votre expert {{display_label}} de confiance."
                          />
                        </Field>
                        <Field label="CTA — label">
                          <Input
                            value={draft.cta_label ?? ""}
                            onChange={(e) => updateDraft(it.id, { cta_label: e.target.value || null })}
                          />
                        </Field>
                        <Field label="CTA — lien">
                          <Input
                            value={draft.cta_href ?? ""}
                            onChange={(e) => updateDraft(it.id, { cta_href: e.target.value || null })}
                            placeholder="/services/{{slug}} ou #contact"
                          />
                        </Field>
                        <Field label="Image par défaut" full>
                          <SimpleImagePicker
                            value={draft.image_url}
                            onChange={(url) => updateDraft(it.id, { image_url: url })}
                          />
                        </Field>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "md:col-span-2 space-y-1" : "space-y-1"}>
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}
