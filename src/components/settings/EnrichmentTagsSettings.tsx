"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Save, CheckCircle2, Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { authedFetch } from "@/utils/authedFetch";

interface TagSetting {
  tag: string;
  allowed: boolean;
}

export function EnrichmentTagsSettings() {
  const [tags, setTags] = useState<TagSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    authedFetch("/api/settings/enrichment-tags")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.tags)) setTags(data.tags);
      })
      .catch(() => toast.error("Impossible de charger les tags"))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (tag: string, allowed: boolean) => {
    setTags((prev) => prev.map((t) => (t.tag === tag ? { ...t, allowed } : t)));
    setSaved(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.tag.toLowerCase().includes(q));
  }, [tags, search]);

  const blockedCount = useMemo(() => tags.filter((t) => !t.allowed).length, [tags]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authedFetch("/api/settings/enrichment-tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
      if (!res.ok) throw new Error("save_failed");
      setSaved(true);
      toast.success("Tags d'enrichissement enregistrés !");
    } catch {
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Tags autorisés pour l&apos;enrichissement
        </CardTitle>
        <CardDescription>
          Choisissez les service tags que l&apos;edge function d&apos;enrichissement a le
          droit d&apos;utiliser. Un tag désactivé ne sera plus ajouté aux entreprises ni
          aux lead magnets lors de l&apos;enrichissement. Les tags déjà présents sur une
          entreprise ne sont pas supprimés.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un tag…"
                  className="pl-10"
                />
              </div>
              <Badge variant={blockedCount > 0 ? "destructive" : "outline"}>
                {blockedCount > 0
                  ? `${blockedCount} tag(s) interdit(s)`
                  : "Tous les tags autorisés"}
              </Badge>
            </div>

            <div className="divide-y rounded-lg border">
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Aucun tag trouvé.
                </div>
              ) : (
                filtered.map((t) => (
                  <div key={t.tag} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <Label className="cursor-pointer font-normal" htmlFor={`tag-${t.tag}`}>
                      {t.tag}
                    </Label>
                    <Switch
                      id={`tag-${t.tag}`}
                      checked={t.allowed}
                      onCheckedChange={(value) => toggle(t.tag, value)}
                    />
                  </div>
                ))
              )}
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saved ? "Enregistré" : "Enregistrer les modifications"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
