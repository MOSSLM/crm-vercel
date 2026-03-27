"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/utils/supabase/client";

type Template = {
  id: string;
  nom: string;
  nom_template_framer: string | null;
  niche_tags: string[];
  created_at: string;
};

type ChecklistCountRow = { template_id: string | null };

export function ProductionTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ nom: "", nomFramer: "", nicheTagsJson: '["cvc"]' });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: templateRows }, { data: checklistRows }] = await Promise.all([
      supabase
        .from("production_templates")
        .select("id,nom,nom_template_framer,niche_tags,created_at")
        .order("created_at", { ascending: false }),
      supabase.from("production_template_checklist_items").select("template_id"),
    ]);

    const nextTemplates = ((templateRows ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id ?? ""),
      nom: String(row.nom ?? ""),
      nom_template_framer: row.nom_template_framer ? String(row.nom_template_framer) : null,
      niche_tags: Array.isArray(row.niche_tags) ? row.niche_tags.filter((v): v is string => typeof v === "string") : [],
      created_at: String(row.created_at ?? new Date().toISOString()),
    }));

    const nextCounts: Record<string, number> = {};
    for (const row of (checklistRows ?? []) as ChecklistCountRow[]) {
      if (!row.template_id) continue;
      nextCounts[row.template_id] = (nextCounts[row.template_id] ?? 0) + 1;
    }

    setTemplates(nextTemplates);
    setCounts(nextCounts);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totalChecklistItems = useMemo(
    () => Object.values(counts).reduce((sum, value) => sum + value, 0),
    [counts]
  );

  const createTemplate = async () => {
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

    const { data } = await supabase
      .from("production_templates")
      .insert({
        nom: form.nom.trim(),
        nom_template_framer: form.nomFramer.trim() || null,
        niche_tags: parsedTags,
      })
      .select("id")
      .single();

    if (data?.id) {
      setOpen(false);
      setForm({ nom: "", nomFramer: "", nicheTagsJson: '["cvc"]' });
      await load();
      router.push(`/production/templates/${data.id}`);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Production templates</CardTitle>
            <CardDescription>
              Créez vos templates (nom interne + nom Framer + niche tags JSON), puis gérez la checklist par template.
            </CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Nouveau template
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Créer un template</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Nom du template</Label>
                  <Input value={form.nom} onChange={(e) => setForm((p) => ({ ...p, nom: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Nom template Framer</Label>
                  <Input value={form.nomFramer} onChange={(e) => setForm((p) => ({ ...p, nomFramer: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Niche tags (JSON array)</Label>
                  <Textarea rows={3} value={form.nicheTagsJson} onChange={(e) => setForm((p) => ({ ...p, nicheTagsJson: e.target.value }))} />
                </div>
                <Button className="w-full" onClick={createTemplate}>Créer</Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {templates.length} template(s) • {totalChecklistItems} todo(s) de checklist au total.
        </CardContent>
      </Card>

      {loading ? (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">Chargement…</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card
              key={template.id}
              className="cursor-pointer transition hover:border-primary"
              onClick={() => router.push(`/production/templates/${template.id}`)}
            >
              <CardHeader>
                <CardTitle className="text-base">{template.nom}</CardTitle>
                <CardDescription>{template.nom_template_framer || "Nom Framer non défini"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {template.niche_tags.length === 0 ? (
                    <Badge variant="outline">Aucun tag niche</Badge>
                  ) : template.niche_tags.map((tag) => (
                    <Badge variant="secondary" key={`${template.id}-${tag}`}>{tag}</Badge>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {counts[template.id] ?? 0} item(s) de checklist.
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
