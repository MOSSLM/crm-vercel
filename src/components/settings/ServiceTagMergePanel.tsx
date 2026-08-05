"use client";

import React, { useMemo, useState } from "react";
import { ArrowRight, Loader2, Merge, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authedFetch } from "@/utils/authedFetch";
import { serviceTagKey } from "@/utils/serviceTags";
import type { ServiceTagRow } from "./EnrichmentTagsSettings";

/** Rapport renvoyé par l'API, par table touchée. */
interface TableReport {
  scanned: number;
  changed: number;
  failed: number;
}

interface MergeResponse {
  dry_run: boolean;
  sources: string[];
  target: string;
  targetAllowed: boolean;
  targetKnownToTemplate: boolean;
  report: Record<ReportKey, TableReport>;
  legacy_premiers_tags_rows: number;
}

type ReportKey =
  | "entreprises"
  | "leadMagnets"
  | "media"
  | "sitemaps"
  | "sectionInstances"
  | "projectPages"
  | "settings";

/**
 * Libellés des tables. Séparés en deux groupes parce qu'ils jouent en sens
 * inverse : les premiers disent ce que l'entreprise PROPOSE, les seconds à quel
 * service une page ou un bloc est RÉSERVÉ.
 */
const PROPOSE_LABELS: Array<[ReportKey, string, string]> = [
  ["entreprises", "Entreprises", "fiches et catalogue"],
  ["leadMagnets", "Dossiers lead magnet", "décide de ce qu'affiche le site"],
  ["media", "Médiathèque", "choix des images"],
];

const RESERVE_LABELS: Array<[ReportKey, string, string]> = [
  ["sitemaps", "Pages de sitemap", "404 sans le tag"],
  ["sectionInstances", "Blocs de sections", "masqués sans le tag"],
  ["projectPages", "Pages de projet", "sections de projet"],
  ["settings", "Lignes d'autorisation", "nettoyage des tags disparus"],
];

export function ServiceTagMergePanel({
  tags,
  taxonomy,
  onMerged,
}: {
  tags: ServiceTagRow[];
  taxonomy: string[];
  onMerged: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<MergeResponse | null>(null);
  /** Passe à `true` après un refus 409, pour que l'utilisateur assume la cible. */
  const [force, setForce] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.tag.toLowerCase().includes(q));
  }, [tags, search]);

  const taxonomyKeys = useMemo(() => new Set(taxonomy.map(serviceTagKey)), [taxonomy]);
  /**
   * Tous les tags hors taxonomie — proposés comme cibles possibles, parce que
   * fusionner vers un tag maison est légitime. Ils ne servent PAS à l'alerte :
   * la liste contient les catégories Google Business des entreprises, hors
   * template par nature et sans rapport avec un problème à corriger.
   */
  const horsTaxonomie = useMemo(
    () => tags.filter((t) => !taxonomyKeys.has(serviceTagKey(t.tag))),
    [tags, taxonomyKeys],
  );
  /** Les vraies divergences de graphie : celles qui appellent une fusion. */
  const divergences = useMemo(
    () => tags.filter((t) => t.nearMiss && t.usage.entreprises + t.usage.leadMagnets > 0),
    [tags],
  );

  const targetRow = tags.find((t) => t.tag === target);
  // Une cible saisie hors liste reste possible via la taxonomie, d'où le repli.
  const targetBlocked = targetRow ? !targetRow.allowed : false;
  const targetUnknown = target ? !taxonomyKeys.has(serviceTagKey(target)) : false;

  const toggle = (tag: string) => {
    setPreview(null);
    setSelected((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const porteurs = useMemo(
    () =>
      selected.reduce(
        (acc, tag) => {
          const row = tags.find((t) => t.tag === tag);
          return {
            entreprises: acc.entreprises + (row?.usage.entreprises ?? 0),
            leadMagnets: acc.leadMagnets + (row?.usage.leadMagnets ?? 0),
          };
        },
        { entreprises: 0, leadMagnets: 0 },
      ),
    [selected, tags],
  );

  const run = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const res = await authedFetch("/api/settings/enrichment-tags/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: selected,
          target,
          dry_run: dryRun,
          allow_blocked_target: force,
          allow_unknown_target: force,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as MergeResponse & { error?: string };

      if (res.status === 409) {
        // L'API refuse une cible bloquée ou hors taxonomie tant qu'on ne l'a pas
        // assumée : la fusion aurait déplacé tout le parc sur un tag inutilisable.
        setForce(true);
        toast.error(
          data.error === "cible_bloquee"
            ? "Cette cible est interdite par les Paramètres. Confirmez pour l'utiliser quand même."
            : "Cette cible ne correspond à aucune page du template. Confirmez pour l'utiliser quand même.",
        );
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "merge_failed");

      if (dryRun) {
        setPreview(data);
        return;
      }

      const failed = Object.values(data.report).reduce((n, r) => n + r.failed, 0);
      const changed = Object.values(data.report).reduce((n, r) => n + r.changed, 0);
      if (failed > 0) {
        // Pas de transaction possible côté Supabase REST : on le dit, et comme
        // l'opération est idempotente, relancer reprend là où ça a échoué.
        toast.error(`${changed} modification(s) appliquée(s), ${failed} en échec — relancez pour reprendre.`);
      } else {
        toast.success(`${changed} modification(s) appliquée(s).`);
      }
      setPreview(null);
      setSelected([]);
      setTarget("");
      setForce(false);
      onMerged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la fusion");
    } finally {
      setBusy(false);
    }
  };

  const ready = selected.length > 0 && target.trim().length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Merge className="h-4 w-4" />
          Fusionner des service tags
        </CardTitle>
        <CardDescription>
          Toutes les entités portant un tag coché à gauche reçoivent le tag de droite à la
          place. Corrige l&apos;existant, ce que les autorisations ci-dessus ne font pas :
          elles ne filtrent que les enrichissements à venir. Tous les emplacements sont
          réécrits ensemble — fiches, dossiers lead magnet, médiathèque, mais aussi les
          pages et blocs réservés à un service, sinon la correction en casserait d&apos;autres.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {divergences.length > 0 && (
          <div className="space-y-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm">
            <div className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <div>
                <strong>
                  {divergences.length} graphie(s) divergente(s) à fusionner.
                </strong>{" "}
                Un clic remplit la sélection et la cible.
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pl-6">
              {divergences.map((t) => (
                <Button
                  key={t.tag}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelected([t.tag]);
                    setTarget(t.nearMiss as string);
                    setPreview(null);
                    setForce(false);
                  }}
                >
                  « {t.tag} » → {t.nearMiss}
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({t.usage.entreprises} ent.)
                  </span>
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
          {/* Colonne gauche : les tags à remplacer. */}
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">
              Tags à remplacer{selected.length > 0 ? ` (${selected.length})` : ""}
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un tag…"
                className="pl-10"
              />
            </div>
            <ScrollArea className="h-64 rounded-lg border">
              {filtered.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Aucun tag trouvé.
                </div>
              ) : (
                <div className="divide-y">
                  {filtered.map((t) => (
                    <label
                      key={t.tag}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selected.includes(t.tag)}
                        onCheckedChange={() => toggle(t.tag)}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{t.tag}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {t.usage.entreprises} ent. · {t.usage.leadMagnets} LM
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="flex justify-center pt-8 md:pt-24">
            <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </div>

          {/* Colonne droite : le tag de destination. */}
          <div className="space-y-2">
            <Label className="text-xs uppercase text-muted-foreground">Devient</Label>
            <Select
              value={target}
              onValueChange={(v) => {
                setTarget(v);
                setPreview(null);
                setForce(false);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choisir le tag de destination…" />
              </SelectTrigger>
              <SelectContent>
                {/* La taxonomie d'abord : ce sont les seuls tags qu'une page
                    reconnaît, donc les seules cibles saines. */}
                <SelectGroup>
                  <SelectLabel>Taxonomie du template</SelectLabel>
                  {taxonomy.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {horsTaxonomie.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>
                      Hors taxonomie — aucune page ne les reconnaît ({horsTaxonomie.length})
                    </SelectLabel>
                    {horsTaxonomie.map((t) => (
                      <SelectItem key={t.tag} value={t.tag}>
                        {t.tag}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>

            {targetBlocked && (
              <p className="text-xs text-orange-600 dark:text-orange-400">
                Ce tag est interdit dans les autorisations ci-dessus : l&apos;enrichissement
                ne le posera plus.
              </p>
            )}
            {targetUnknown && (
              <p className="text-xs text-red-600 dark:text-red-400">
                Ce tag ne correspond à aucune page du template — il masquerait la page du
                service.
              </p>
            )}

            {ready && (
              <div className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {porteurs.entreprises} entreprise(s) et {porteurs.leadMagnets} dossier(s) lead
                magnet portent les tags cochés.
              </div>
            )}
          </div>
        </div>

        {preview && (
          <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm">
            <div className="font-medium">
              Simulation — rien n&apos;a encore été modifié
            </div>
            {(
              [
                ["Ce que l'entreprise propose", PROPOSE_LABELS],
                ["Ce qui est réservé à un service", RESERVE_LABELS],
              ] as const
            ).map(([groupTitle, rows]) => (
              <div key={groupTitle} className="space-y-1">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  {groupTitle}
                </div>
                <ul className="space-y-1">
                  {rows.map(([key, label, hint]) => (
                    <li key={key} className="flex items-baseline justify-between gap-3">
                      <span>
                        {label} <span className="text-xs text-muted-foreground">({hint})</span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {preview.report[key].changed} / {preview.report[key].scanned}
                        {preview.report[key].failed > 0 && (
                          <span className="text-red-600 dark:text-red-400">
                            {" "}
                            · {preview.report[key].failed} illisible(s)
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {preview.legacy_premiers_tags_rows > 0 && (
              <p className="text-xs text-muted-foreground">
                {preview.legacy_premiers_tags_rows} entreprise(s) n&apos;ont que l&apos;ancienne
                colonne <code>premiers_tags</code> : la fusion ne les réécrit pas.
              </p>
            )}
          </div>
        )}

        {force && (
          <div className="flex items-start gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2.5 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
            <span>
              Cible à risque assumée. Relancez la simulation puis appliquez si c&apos;est bien
              ce que vous voulez.
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => run(true)} disabled={!ready || busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Simuler
          </Button>
          {/* Appliquer n'est proposé qu'après une simulation : l'opération réécrit
              tout le parc et rien ne l'annule. */}
          <Button onClick={() => run(false)} disabled={!ready || busy || !preview} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />}
            Appliquer la fusion
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
