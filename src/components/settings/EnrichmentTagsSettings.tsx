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
  /**
   * Vend-on à ce métier aujourd'hui ? TROISIÈME axe, indépendant des deux
   * autres — et le seul qui parle de commerce plutôt que de rendu.
   *
   * L'isolation en est l'exemple : ses libellés viennent de l'import ADEME, pas
   * de l'enrichissement, donc les passer en `allowed = false` n'écarterait
   * personne. Ce qu'on veut, c'est que leurs fiches sortent des files de
   * démarchage tant que le gabarit n'a pas de page pour ce service — un site
   * démo qui ampute le métier principal du prospect est pire que pas de démo.
   */
  demarchable: boolean;
  knownToTemplate: boolean;
  /**
   * Tag de la taxonomie dont celui-ci n'est qu'une variante de graphie, ou null.
   *
   * Indispensable pour que l'alerte serve à quelque chose : le CRM stocke aussi
   * les catégories Google Business (« Fournisseur de systèmes de climatisation »,
   * 281 fiches), hors template par nature. Sans ce tri, l'alerte comptait cent
   * étiquettes d'annuaire et le seul vrai problème passait inaperçu.
   */
  nearMiss: string | null;
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

  /** Le troisième axe. Rouvrir un métier ici fait revenir ses fiches dans les
      files au prochain affichage — aucune population n'est à reconstruire. */
  const toggleDemarchable = (tag: string, demarchable: boolean) => {
    setTags((prev) => prev.map((t) => (t.tag === tag ? { ...t, demarchable } : t)));
    setSaved(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.tag.toLowerCase().includes(q));
  }, [tags, search]);

  const blockedCount = useMemo(() => tags.filter((t) => !t.allowed).length, [tags]);
  const misDeCoteCount = useMemo(() => tags.filter((t) => !t.demarchable).length, [tags]);

  /**
   * Divergences de graphie portées par quelque chose : quelqu'un a nommé ce
   * service autrement que le template, et la page est masquée en production. Le
   * cas urgent, et le seul qui se répare par une fusion.
   */
  const divergences = useMemo(
    () => tags.filter((t) => t.nearMiss && porteurs(t) > 0),
    [tags],
  );

  /**
   * Tags autorisés que le template ignore. Ils ne cassent rien aujourd'hui mais
   * l'enrichissement va continuer à les poser, et ils ne correspondront à aucune
   * page. Distinct des divergences : ici il n'y a pas de graphie à corriger, il
   * faut décider — soit les interdire, soit les ajouter au template.
   */
  const autorisesSansPage = useMemo(
    () => tags.filter((t) => t.allowed && !t.knownToTemplate && !t.nearMiss),
    [tags],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authedFetch("/api/settings/enrichment-tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tags: tags.map((t) => ({
            tag: t.tag,
            allowed: t.allowed,
            demarchable: t.demarchable,
          })),
        }),
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
    // Une divergence portée par quelque chose passe devant tout, même bloquée :
    // le blocage arrête les futurs enrichissements, il ne répare pas les fiches
    // qui portent déjà la mauvaise graphie.
    if (t.nearMiss && porteurs(t) > 0) return "border-l-2 border-l-red-500 bg-red-500/[0.07]";
    if (t.allowed && !t.knownToTemplate) return "border-l-2 border-l-red-500 bg-red-500/[0.07]";
    if (!t.allowed) return "border-l-2 border-l-orange-500 bg-orange-500/[0.07]";
    // Mis de côté : ni cassé ni refusé — en attente d'une page de service.
    if (!t.demarchable) return "border-l-2 border-l-sky-500 bg-sky-500/[0.07]";
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
              {divergences.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                  <div>
                    <strong>
                      {divergences.reduce((n, t) => n + porteurs(t), 0)} porteur(s) d&apos;une
                      graphie que le template ne reconnaît pas.
                    </strong>{" "}
                    La page du service est masquée au lieu d&apos;être affichée. Interdire le tag
                    n&apos;y change rien — il faut le fusionner :{" "}
                    {divergences.map((t) => `« ${t.tag} » → ${t.nearMiss}`).join(", ")}.
                  </div>
                </div>
              )}

              {autorisesSansPage.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm">
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                  <div>
                    <strong>
                      {autorisesSansPage.length} tag(s) autorisé(s) ne correspondent à aucune
                      page du template.
                    </strong>{" "}
                    « Autorisé » ne veut pas dire « fonctionne » : l&apos;enrichissement va
                    continuer à les poser sans qu&apos;aucune page ne s&apos;affiche. À interdire,
                    ou à ajouter au template :{" "}
                    {autorisesSansPage.map((t) => t.tag).join(", ")}.
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
                  {divergences.length > 0 && (
                    <Badge variant="destructive">{divergences.length} à fusionner</Badge>
                  )}
                  {autorisesSansPage.length > 0 && (
                    <Badge variant="destructive">
                      {autorisesSansPage.length} sans page
                    </Badge>
                  )}
                  <Badge variant={blockedCount > 0 ? "destructive" : "outline"}>
                    {blockedCount > 0
                      ? `${blockedCount} tag(s) interdit(s)`
                      : "Tous les tags autorisés"}
                  </Badge>
                  {/* Compté à part de « interdit » : ce n'est pas le même
                      refus. Un tag interdit ne doit jamais être posé ; un
                      métier mis de côté est vrai, on ne sait juste pas encore
                      le servir. */}
                  {misDeCoteCount > 0 && (
                    <Badge variant="outline">
                      {misDeCoteCount} métier(s) mis de côté
                    </Badge>
                  )}
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
                  <span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> à corriger : graphie
                  divergente, ou autorisé sans page
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
                        {t.nearMiss ? (
                          <span className="ml-2 text-xs text-red-600 dark:text-red-400">
                            variante de « {t.nearMiss} » — à fusionner
                          </span>
                        ) : (
                          !t.knownToTemplate && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              hors template
                            </span>
                          )
                        )}
                      </Label>
                      <div className="flex flex-shrink-0 items-center gap-4">
                        {/* DEUX INTERRUPTEURS, ET L'ORDRE COMPTE : « posable »
                            puis « vendable ». Les empiler dans un seul
                            basculeur fondrait deux décisions sans rapport —
                            bloquer un tag mal orthographié n'a rien à voir avec
                            écarter un métier qu'on ne sait pas encore servir. */}
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Posable
                          </span>
                          <Switch
                            id={`tag-${t.tag}`}
                            checked={t.allowed}
                            onCheckedChange={(value) => toggle(t.tag, value)}
                          />
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className="text-[10px] uppercase tracking-wide text-muted-foreground"
                            title="Vend-on à ce métier aujourd'hui ? Fermé, ses fiches sortent des files de démarchage — sans être supprimées. Rouvrir les fait toutes revenir."
                          >
                            Vendable
                          </span>
                          <Switch
                            id={`vend-${t.tag}`}
                            checked={t.demarchable}
                            onCheckedChange={(value) => toggleDemarchable(t.tag, value)}
                          />
                        </div>
                      </div>
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
