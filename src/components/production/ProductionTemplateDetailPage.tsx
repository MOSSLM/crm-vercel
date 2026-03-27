"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/utils/supabase/client";

type Template = {
  id: string;
  nom: string;
  nom_template_framer: string | null;
  niche_tags: string[];
};

type ChecklistItem = {
  id: string;
  titre: string;
  description: string | null;
  position: number;
};

export function ProductionTemplateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const templateId = params.id;

  const [template, setTemplate] = useState<Template | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ nom: "", nomFramer: "", nicheTagsJson: "[]" });
  const [newTodo, setNewTodo] = useState({ titre: "", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: templateRow }, { data: checklistRows }] = await Promise.all([
      supabase
        .from("production_templates")
        .select("id,nom,nom_template_framer,niche_tags")
        .eq("id", templateId)
        .single(),
      supabase
        .from("production_template_checklist_items")
        .select("id,titre,description,position")
        .eq("template_id", templateId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    if (templateRow) {
      const nextTemplate: Template = {
        id: String(templateRow.id),
        nom: String(templateRow.nom ?? ""),
        nom_template_framer: templateRow.nom_template_framer ? String(templateRow.nom_template_framer) : null,
        niche_tags: Array.isArray(templateRow.niche_tags)
          ? templateRow.niche_tags.filter((v): v is string => typeof v === "string")
          : [],
      };
      setTemplate(nextTemplate);
      setForm({
        nom: nextTemplate.nom,
        nomFramer: nextTemplate.nom_template_framer ?? "",
        nicheTagsJson: JSON.stringify(nextTemplate.niche_tags),
      });
    }

    setItems(((checklistRows ?? []) as ChecklistItem[]));
    setLoading(false);
  }, [templateId]);

  useEffect(() => {
    void load();
  }, [load]);

  const completionPreview = useMemo(() => {
    if (items.length === 0) return 0;
    return Math.round((items.filter((item) => item.titre.trim().length > 0).length / items.length) * 100);
  }, [items]);

  const saveTemplate = async () => {
    if (!form.nom.trim()) return;
    let parsedTags: string[] = [];
    try {
      const candidate = JSON.parse(form.nicheTagsJson || "[]");
      if (Array.isArray(candidate)) {
        parsedTags = candidate.filter((entry): entry is string => typeof entry === "string");
      }
    } catch {
      parsedTags = [];
    }

    await supabase
      .from("production_templates")
      .update({
        nom: form.nom.trim(),
        nom_template_framer: form.nomFramer.trim() || null,
        niche_tags: parsedTags,
      })
      .eq("id", templateId);

    await load();
  };

  const addChecklistItem = async () => {
    if (!newTodo.titre.trim()) return;
    await supabase
      .from("production_template_checklist_items")
      .insert({
        template_id: templateId,
        titre: newTodo.titre.trim(),
        description: newTodo.description.trim() || null,
        position: (items.length + 1) * 100,
      });
    setNewTodo({ titre: "", description: "" });
    await load();
  };

  const updateChecklistItem = async (itemId: string, updates: Partial<ChecklistItem>) => {
    await supabase.from("production_template_checklist_items").update(updates).eq("id", itemId);
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, ...updates } : item)));
  };

  const deleteChecklistItem = async (itemId: string) => {
    await supabase.from("production_template_checklist_items").delete().eq("id", itemId);
    setItems((prev) => prev.filter((item) => item.id !== itemId));
  };

  if (loading) {
    return <div className="p-4 md:p-6 text-sm text-muted-foreground">Chargement…</div>;
  }

  if (!template) {
    return (
      <div className="p-4 md:p-6 space-y-3">
        <p className="text-sm text-muted-foreground">Template introuvable.</p>
        <Button variant="outline" onClick={() => router.push("/production/templates")}>Retour</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Button variant="ghost" onClick={() => router.push("/production/templates")}> 
        <ArrowLeft className="h-4 w-4 mr-2" /> Retour templates
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Template: {template.nom}</CardTitle>
          <CardDescription>Paramètres du template + checklist type qui sera copiée dans chaque production lead magnet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nom du template</Label>
              <Input value={form.nom} onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Nom template Framer</Label>
              <Input value={form.nomFramer} onChange={(e) => setForm((p) => ({ ...p, nomFramer: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Tags niche (JSON)</Label>
            <Textarea rows={3} value={form.nicheTagsJson} onChange={(e) => setForm((p) => ({ ...p, nicheTagsJson: e.target.value }))} />
          </div>
          <Button onClick={saveTemplate}>Enregistrer template</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Checklist du template</CardTitle>
          <CardDescription>{items.length} tâche(s) standard • score de complétude structure: {completionPreview}%</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-[1fr,1fr,auto] gap-2">
            <Input
              placeholder="Titre todo (ex: Modifier la meta description)"
              value={newTodo.titre}
              onChange={(e) => setNewTodo((p) => ({ ...p, titre: e.target.value }))}
            />
            <Input
              placeholder="Description optionnelle"
              value={newTodo.description}
              onChange={(e) => setNewTodo((p) => ({ ...p, description: e.target.value }))}
            />
            <Button onClick={addChecklistItem}><Plus className="h-4 w-4 mr-2" />Ajouter</Button>
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="grid md:grid-cols-[auto,1fr,1fr,auto] gap-2 items-center border rounded-md p-2">
                <Checkbox checked={false} disabled aria-label="Aperçu todo" />
                <Input
                  value={item.titre}
                  onChange={(e) => updateChecklistItem(item.id, { titre: e.target.value })}
                />
                <Input
                  value={item.description ?? ""}
                  placeholder="Description"
                  onChange={(e) => updateChecklistItem(item.id, { description: e.target.value || null })}
                />
                <Button variant="ghost" size="icon" onClick={() => deleteChecklistItem(item.id)}>
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
