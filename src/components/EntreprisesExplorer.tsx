"use client";

import React from "react";
import Link from "next/link";
import { authedFetch } from "@/utils/authedFetch";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Search, ChevronLeft, ChevronRight, Loader2, Bookmark, X } from "lucide-react";
import { toast } from "sonner";
import { getCompanyDisplayName } from "../utils/displayHelpers";

/**
 * L'explorateur d'entreprises — chercher dans les 60 000 fiches, tout de suite.
 *
 * CE QUE CET ÉCRAN N'EST PAS. La vision décrit vingt et une familles de filtres
 * (finances, effectif, note Google, qualification IA…). La plupart lisent des
 * colonnes qui n'existent pas encore, ou qui existent mais sans qu'on sache
 * distinguer « on a vérifié, il n'y a rien » de « on n'a jamais regardé » — les
 * exposer en filtre aujourd'hui ferait mentir un résultat vide. Cet écran
 * n'expose QUE ce que `chercher_entreprises` sait vraiment trancher : la
 * recherche libre, la source, et cinq marquages sans ambiguïté (site, fiche
 * Google, SIRET, qualité signalée, vivante/fusionnée/archivée/masquée).
 *
 * POURQUOI IL EXISTE QUAND MÊME. Cette fonction tournait déjà en production,
 * sans qu'aucun écran ne l'appelle. Câbler ce qui existe coûte une page ;
 * inventer les dix-huit filtres restants coûterait des colonnes, des
 * migrations, et une décision produit par colonne. Cet écran est le premier
 * geste, pas le dernier.
 */

type Flag = "vivantes" | "sans_site" | "sans_google" | "sans_siret" | "qualite" | "fusionnee" | "archivee" | "masquee";

/**
 * Les drapeaux, en DEUX familles qui ne se combinent pas pareil — et l'écran
 * doit le montrer, sinon le compteur surprend.
 *
 * · ce qui MANQUE se cumule : « sans site » puis « sans fiche Google » veut
 *   dire les deux à la fois. Chaque case supplémentaire restreint.
 * · l'ÉTAT s'additionne : cocher « archivées » et « fusionnées », c'est vouloir
 *   voir les deux. Chaque case supplémentaire élargit.
 *
 * Sans cette séparation, tout était en OU côté SQL : cocher « sans site »
 * rendait 60 698 fiches au lieu de 34 699, et affichait des entreprises avec un
 * vrai site sous un filtre qui promettait le contraire.
 */
const MANQUES: { valeur: Flag; label: string; titre: string }[] = [
  {
    valeur: "sans_site",
    label: "Sans site",
    // Une page Facebook n'est pas un site : c'est le signe qu'il n'y en a pas,
    // et une page où lire des informations sur l'entreprise. 62 fiches Facebook,
    // 29 Google Sites, 9 Instagram — toutes des cibles, pas des rebuts.
    titre: "Aucune URL, ou une URL qui n'est pas un site à elle : page Facebook, Instagram, Google Sites, Wix…",
  },
  { valeur: "sans_google", label: "Sans fiche Google", titre: "Aucun identifiant de fiche Google Maps" },
  { valeur: "sans_siret", label: "Sans SIRET", titre: "SIRET non renseigné" },
  { valeur: "qualite", label: "Qualité signalée", titre: "Au moins un motif de qualité douteuse" },
];

const ETATS: { valeur: Flag; label: string; titre: string }[] = [
  { valeur: "vivantes", label: "Vivantes", titre: "Ni archivées, ni fusionnées" },
  { valeur: "archivee", label: "Archivées", titre: "Sorties du périmètre actif" },
  { valeur: "masquee", label: "Masquées", titre: "Écartées de la qualification" },
  { valeur: "fusionnee", label: "Fusionnées", titre: "Absorbées dans une autre fiche" },
];

const SOURCES: { valeur: string; label: string }[] = [
  { valeur: "ademe_rge", label: "ADEME" },
  { valeur: "api_gouv", label: "Fichier officiel" },
  { valeur: "google_maps", label: "Google Maps" },
  { valeur: "reseau_proeco", label: "ProÉco" },
];

type Item = {
  id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  telephone: string | null;
  email: string | null;
  site: string | null;
  siret: string | null;
  sources: string[] | null;
  qualifie: boolean;
  masquee: boolean;
  archivee: boolean;
  fusionnee_vers: number | null;
  motifs_qualite: string[] | null;
};

const PAGE = 50;

const LABEL_SOURCE: Record<string, string> = Object.fromEntries(SOURCES.map((s) => [s.valeur, s.label]));

/** Un segment : une recherche enregistrée sous un nom. */
type Segment = {
  id: string;
  nom: string;
  criteres: { q?: string | null; flags?: string[]; sources?: string[] };
};

export function EntreprisesExplorer() {
  const [q, setQ] = React.useState("");
  const [qDebounce, setQDebounce] = React.useState("");
  const [flags, setFlags] = React.useState<Set<Flag>>(new Set(["vivantes"]));
  const [sources, setSources] = React.useState<Set<string>>(new Set());
  const [offset, setOffset] = React.useState(0);

  const [items, setItems] = React.useState<Item[]>([]);
  const [total, setTotal] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [erreur, setErreur] = React.useState<string | null>(null);

  const [segments, setSegments] = React.useState<Segment[]>([]);
  // `null` = les segments ne sont pas lisibles (migration non jouée, panne). La
  // barre disparaît alors, plutôt que d'annoncer « aucun segment » sur une base
  // qui n'a pas encore de quoi en porter — une fonctionnalité absente ne doit
  // pas ressembler à une liste vide.
  const [segmentsLisibles, setSegmentsLisibles] = React.useState<boolean | null>(null);
  const [enregistrement, setEnregistrement] = React.useState(false);

  // Recherche au fil de la frappe, mais pas à chaque lettre : sur 60 000
  // lignes, chaque frappe non filtrée serait un aller-retour serveur pour rien.
  React.useEffect(() => {
    const t = setTimeout(() => setQDebounce(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  // Tout changement de critère revient à la première page — sinon on peut se
  // retrouver au-delà de la dernière ligne d'un résultat qui vient de rétrécir.
  React.useEffect(() => {
    setOffset(0);
  }, [qDebounce, flags, sources]);

  const chargement = React.useMemo(() => ({ qDebounce, flags: [...flags].sort().join(","), sources: [...sources].sort().join(","), offset }), [qDebounce, flags, sources, offset]);

  React.useEffect(() => {
    let vivant = true;
    setLoading(true);
    setErreur(null);

    const params = new URLSearchParams();
    if (chargement.qDebounce) params.set("q", chargement.qDebounce);
    if (chargement.flags) params.set("flags", chargement.flags);
    if (chargement.sources) params.set("sources", chargement.sources);
    params.set("limite", String(PAGE));
    params.set("offset", String(chargement.offset));

    authedFetch(`/api/entreprises/explorer?${params.toString()}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { items?: Item[]; total?: number; error?: string };
        if (!res.ok) throw new Error(body.error || `Erreur ${res.status}`);
        if (!vivant) return;
        setItems(body.items ?? []);
        setTotal(body.total ?? 0);
      })
      .catch((e) => {
        if (!vivant) return;
        setErreur(e instanceof Error ? e.message : "Recherche impossible");
        setItems([]);
        setTotal(null);
      })
      .finally(() => {
        if (vivant) setLoading(false);
      });

    return () => {
      vivant = false;
    };
  }, [chargement]);

  const chargerSegments = React.useCallback(async () => {
    try {
      const res = await authedFetch("/api/entreprises/segments");
      const body = (await res.json().catch(() => ({}))) as { segments?: Segment[]; error?: string };
      if (!res.ok) throw new Error(body.error || `Erreur ${res.status}`);
      setSegments(body.segments ?? []);
      setSegmentsLisibles(true);
    } catch {
      // Muet volontairement : ne pas savoir lire les segments n'empêche pas de
      // chercher, et un bandeau d'erreur sur une fonction d'appoint détournerait
      // de l'écran qui marche.
      setSegmentsLisibles(false);
    }
  }, []);

  React.useEffect(() => {
    void chargerSegments();
  }, [chargerSegments]);

  /** Rejoue un segment : ses critères remplacent les filtres courants. */
  const appliquerSegment = (s: Segment) => {
    setQ(s.criteres.q ?? "");
    setQDebounce(s.criteres.q ?? "");
    setFlags(new Set((s.criteres.flags ?? []) as Flag[]));
    setSources(new Set(s.criteres.sources ?? []));
    setOffset(0);
  };

  const enregistrerSegment = async () => {
    const nom = window.prompt("Nom du segment ?")?.trim();
    if (!nom) return;

    setEnregistrement(true);
    try {
      const res = await authedFetch("/api/entreprises/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom,
          criteres: { q: qDebounce || null, flags: [...flags], sources: [...sources] },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error || `Erreur ${res.status}`);
      await chargerSegments();
      toast.success(`Segment « ${nom} » enregistré.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enregistrement impossible");
    } finally {
      setEnregistrement(false);
    }
  };

  const supprimerSegment = async (s: Segment) => {
    // Pas de confirmation : supprimer un segment ne supprime AUCUNE entreprise.
    // C'est une requête qu'on jette, et la refaire coûte trois clics.
    try {
      const res = await authedFetch(`/api/entreprises/segments?id=${encodeURIComponent(s.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      setSegments((prev) => prev.filter((x) => x.id !== s.id));
    } catch {
      toast.error("Suppression impossible");
    }
  };

  const toggleFlag = (f: Flag) =>
    setFlags((s) => {
      const n = new Set(s);
      if (n.has(f)) n.delete(f);
      else n.add(f);
      return n;
    });

  const toggleSource = (s: string) =>
    setSources((prev) => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s);
      else n.add(s);
      return n;
    });

  const debut = total === 0 ? 0 : offset + 1;
  const fin = total === null ? offset + items.length : Math.min(offset + PAGE, total);

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nom, ville, code postal, SIRET, e-mail, domaine, téléphone…"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground w-24 shrink-0">Ce qui manque :</span>
            {MANQUES.map((f) => (
              <button
                key={f.valeur}
                type="button"
                title={f.titre}
                onClick={() => toggleFlag(f.valeur)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  flags.has(f.valeur)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
            <span className="text-xs text-muted-foreground">— chaque case restreint</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground w-24 shrink-0">État :</span>
            {ETATS.map((f) => (
              <button
                key={f.valeur}
                type="button"
                title={f.titre}
                onClick={() => toggleFlag(f.valeur)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  flags.has(f.valeur)
                    ? "bg-secondary text-secondary-foreground border-secondary"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
            <span className="text-xs text-muted-foreground">— chaque case élargit</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Provenance :</span>
            {SOURCES.map((s) => (
              <button
                key={s.valeur}
                type="button"
                onClick={() => toggleSource(s.valeur)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  sources.has(s.valeur)
                    ? "bg-secondary text-secondary-foreground border-secondary"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
            {sources.size === 0 && (
              <span className="text-xs text-muted-foreground">— toutes, si aucune n&apos;est cochée</span>
            )}
          </div>

          {/* Les segments. Un segment est une REQUÊTE enregistrée, pas une liste
              d'entreprises : le rejouer relance la recherche, donc une fiche
              enrichie entre-temps en sort d'elle-même. C'est exactement ce qui
              le distingue d'un lot de campagne, qui lui ne doit plus bouger. */}
          {segmentsLisibles && (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Segments :</span>

              {segments.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  aucun pour l&apos;instant — règle les filtres, puis enregistre
                </span>
              )}

              {segments.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1 text-xs rounded-full border border-border bg-background hover:bg-muted transition-colors"
                >
                  <button
                    type="button"
                    className="pl-2.5 py-1"
                    title="Rejouer cette recherche"
                    onClick={() => appliquerSegment(s)}
                  >
                    {s.nom}
                  </button>
                  <button
                    type="button"
                    className="pr-2 py-1 text-muted-foreground hover:text-destructive"
                    title="Oublier ce segment (aucune entreprise n'est supprimée)"
                    onClick={() => supprimerSegment(s)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}

              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 ml-auto"
                disabled={enregistrement}
                onClick={enregistrerSegment}
              >
                {enregistrement ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bookmark className="h-3.5 w-3.5" />}
                Enregistrer cette recherche
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {loading
            ? "Recherche…"
            : total === null
              ? "Recherche indisponible"
              : total === 0
                ? "Aucun résultat"
                : `${debut.toLocaleString("fr-FR")}–${fin.toLocaleString("fr-FR")} sur ${total.toLocaleString("fr-FR")}`}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0 || loading}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
          >
            <ChevronLeft className="h-4 w-4" />
            Précédent
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || total === null || offset + PAGE >= total}
            onClick={() => setOffset((o) => o + PAGE)}
          >
            Suivant
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {erreur ? (
            <div className="p-8 text-center text-sm text-destructive">{erreur}</div>
          ) : loading && items.length === 0 ? (
            <div className="p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Recherche…
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Aucune entreprise ne correspond à ces critères.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entreprise</TableHead>
                    <TableHead>Ville</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>SIRET</TableHead>
                    <TableHead>Provenance</TableHead>
                    <TableHead>État</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium max-w-[220px] truncate">
                        <Link href={`/companies/${it.id}`} className="hover:underline">
                          {getCompanyDisplayName(it.name, it.site) || `#${it.id}`}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {[it.ville, it.code_postal].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div className="flex flex-col gap-0.5">
                          {it.telephone && <span>{it.telephone}</span>}
                          {it.email && <span className="truncate max-w-[180px]">{it.email}</span>}
                          {!it.telephone && !it.email && <span>—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate">
                        {it.site ? (
                          <span className="text-muted-foreground">{it.site.replace(/^https?:\/\//, "")}</span>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            aucun
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">{it.siret || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(it.sources ?? [])
                            .filter((s) => LABEL_SOURCE[s])
                            .map((s) => (
                              <Badge key={s} variant="secondary" className="text-[10px]">
                                {LABEL_SOURCE[s]}
                              </Badge>
                            ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {it.qualifie && (
                            <Badge className="text-[10px] bg-green-100 text-green-800 hover:bg-green-100">
                              qualifiée
                            </Badge>
                          )}
                          {it.masquee && (
                            <Badge variant="outline" className="text-[10px]">
                              masquée
                            </Badge>
                          )}
                          {it.archivee && (
                            <Badge variant="outline" className="text-[10px]">
                              archivée
                            </Badge>
                          )}
                          {it.fusionnee_vers != null && (
                            <Badge variant="outline" className="text-[10px]">
                              fusionnée → #{it.fusionnee_vers}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
