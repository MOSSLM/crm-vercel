"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Save, CheckCircle2, Loader2, Search, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { authedFetch } from "@/utils/authedFetch";
import { SERVICE_TAGS_TAXONOMY } from "@/utils/serviceTags";
import { ServiceTagMergePanel } from "./ServiceTagMergePanel";

/**
 * Une ligne de l'écran. `allowed` et `knownToTemplate` sont deux axes
 * INDÉPENDANTS, et c'est tout l'intérêt de les afficher séparément :
 *  - `allowed` est une décision (l'enrichissement peut-il poser ce tag ?) ;
 *  - `knownToTemplate` est un fait (une page du template le reconnaît-elle ?).
 *
 * Un tag autorisé et inconnu du template est le pire cas — il passe tous les
 * contrôles et masque quand même la page du service. C'est ce trou qui a laissé
 * « rénovation » se poser pendant des campagnes alors que le template attend
 * `renovation-generale`.
 */
export interface ServiceTagRow {
  tag: string;
  allowed: boolean;
  knownToTemplate: boolean;
  usage: { entreprises: number; leadMagnets: number; media: number };
}

/** Nombre de porteurs « vivants » — ceux qui influencent un site rendu. */
const porteurs = (t: ServiceTagRow): number => t.usage.entreprises + t.usage.leadMagnets;

export function EnrichmentTagsSettings() {
  const [tags, setTags] = useState<ServiceTagRow[]>([]);
  const [taxonomy, setTaxonomy] = useState<string[]>([...SERVICE_TAGS_TAXONOMY]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    return authedFetch("/api/settings/enrichment-tags")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.tags)) setTags(data.tags);
        if (Array.isArray(data?.taxonomy) && data.taxonomy.length > 0) setTaxonomy(data.taxonomy);
      })
      .catch(() => toast.error("Impossible de charger les tags"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  /**
   * Les tags réellement nuisibles : inconnus du template ET portés par quelque
   * chose. Un tag inconnu que personne ne porte est inerte ; celui-ci masque une
   * page en production. C'est le seul décompte qui répond à « est-ce que tout va
   * bien ? », et il ne se déduit pas des autorisations.
   */
  const broken = useMemo(
    () => tags.filter((t) => !t.knownToTemplate && porteurs(t) > 0),
    [tags],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authedFetch("/api/settings/enrichment-tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: tags.map((t) => ({ tag: t.tag, allowed: t.allowed })) }),
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

  /**
   * Couleur de la ligne. Priorité au fait avant la décision : un tag autorisé que
   * le template ignore est un piège, alors qu'un tag bloqué est un choix assumé.
   */
  const rowTone = (t: ServiceTagRow): string => {
    if (!t.knownToTemplate && porteurs(t) > 0) {
      return "border-l-2 border-l-red-500 bg-red-500/[0.07]";
    }
    if (!t.allowed) return "border-l-2 border-l-orange-500 bg-orange-500/[0.07]";
    if (!t.knownToTemplate) return "border-l-2 border-l-orange-500/50 bg-orange-500/[0.04]";
    return "border-l-2 border-l-emerald-500 bg-emerald-500/[0.06]";
  };

  return (
    <div className="space-y-6">
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
            entreprise ne sont pas supprimés — utilisez la fusion ci-dessous pour les
            corriger.
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
              {broken.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                  <div>
                    <strong>
                      {broken.reduce((n, t) => n + porteurs(t), 0)} porteur(s) d&apos;un tag
                      qu&apos;aucune page ne reconnaît.
                    </strong>{" "}
                    « Autorisé » ne veut pas dire « fonctionne » : ces tags masquent la page du
                    service au lieu de l&apos;afficher. À fusionner vers la taxonomie.
                  </div>
                </div>
              )}

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
                <div className="flex flex-wrap items-center gap-2">
                  {broken.length > 0 && (
                    <Badge variant="destructive">{broken.length} hors template</Badge>
                  )}
                  <Badge variant={blockedCount > 0 ? "destructive" : "outline"}>
                    {blockedCount > 0
                      ? `${blockedCount} tag(s) interdit(s)`
                      : "Tous les tags autorisés"}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> autorisé et reconnu
                  par le template
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-orange-500" /> interdit à
                  l&apos;enrichissement
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> porté mais inconnu du
                  template
                </span>
              </div>

              <div className="divide-y overflow-hidden rounded-lg border">
                {filtered.length === 0 ? (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                    Aucun tag trouvé.
                  </div>
                ) : (
                  filtered.map((t) => (
                    <div
                      key={t.tag}
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 ${rowTone(t)}`}
                    >
                      <Label className="min-w-0 flex-1 cursor-pointer font-normal" htmlFor={`tag-${t.tag}`}>
                        <span className="truncate">{t.tag}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {t.usage.entreprises} entreprise(s) · {t.usage.leadMagnets} dossier(s)
                          {t.usage.media > 0 && ` · ${t.usage.media} média(s)`}
                        </span>
                        {!t.knownToTemplate && (
                          <span className="ml-2 text-xs text-red-600 dark:text-red-400">
                            aucune page ne le reconnaît
                          </span>
                        )}
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

      {!loading && (
        <ServiceTagMergePanel tags={tags} taxonomy={taxonomy} onMerged={() => void load()} />
      )}
    </div>
  );
}
