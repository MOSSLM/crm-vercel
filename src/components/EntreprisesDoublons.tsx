"use client";

import React from "react";
import { authedFetch } from "@/utils/authedFetch";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { AlertTriangle, Loader2, Merge, FlaskConical, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

/**
 * Le dédoublonnage : voir les grappes, simuler, puis fusionner.
 *
 * L'ESSAI À BLANC EST OBLIGATOIRE, ET C'EST LE POINT DE TOUT L'ÉCRAN. Le bouton
 * qui écrit reste désactivé tant qu'on n'a pas simulé la MÊME fusion — même
 * gagnante, mêmes perdantes. Ce n'est pas de la prudence décorative : la
 * méthode `siren` ne trouve pas des doublons mais les ÉTABLISSEMENTS d'une même
 * entreprise (deux adresses réelles, deux SIRET, un seul SIREN), et les
 * fusionner effacerait un établissement qui existe. Seul un humain qui lit le
 * rapport peut faire la différence.
 *
 * CE QUI EST IRRÉVERSIBLE ET CE QUI NE L'EST PAS. La fusion n'efface rien : les
 * perdantes sont archivées avec `merged_into_id`, et leur état d'avant est
 * copié dans `archive_fusion_entreprises`. Mais elle repointe des dizaines de
 * lignes filles dans 46 tables, et défaire ça à la main n'est pas raisonnable.
 * D'où le verrou.
 */

const METHODES: { valeur: string; label: string; aide: string }[] = [
  { valeur: "telephone", label: "Téléphone", aide: "Même numéro normalisé (9 derniers chiffres)" },
  { valeur: "domaine", label: "Domaine", aide: "Même nom de domaine, hors hébergeurs génériques" },
  { valeur: "nom_ville", label: "Nom + ville", aide: "Nom normalisé identique dans le même code postal" },
  { valeur: "siren", label: "SIREN", aide: "⚠ Souvent des établissements distincts, pas des doublons" },
  { valeur: "geo", label: "Adresse", aide: "Mêmes coordonnées à 4 décimales — une galerie commerciale s'y regroupe" },
];

type Membre = {
  id: number;
  name: string | null;
  ville: string | null;
  code_postal: string | null;
  adresse: string | null;
  siret: string | null;
  telephone: string | null;
  site: string | null;
  sources: string[] | null;
  cohorte_demarchage: string | null;
  owner_id: string | null;
  premiere_touche_le: string | null;
  created_at: string;
};

type Grappe = {
  methode: string;
  cle: string;
  apercu: string | null;
  membres: Membre[];
  retrecit_cohorte: boolean;
  deja_demarchee: boolean;
};

type Conflit = { table: string; raison: string; consequence: string };
type Ecartee = { colonne: string; valeur: unknown; retenu: unknown; perdante: number };
type Changee = { colonne: string; avant: unknown; apres: unknown; regle: string };

type Rapport = {
  dry_run: boolean;
  gagnante: number;
  perdantes: number[];
  total_conflits: number;
  total_repointe: number;
  tables_filles_examinees: number;
  conflits: Conflit[];
  valeurs_ecartees: Ecartee[];
  colonnes_changees: Changee[];
  archive_id: number | null;
};

const PAGE = 25;

/** L'identité d'une simulation : la même gagnante et les mêmes perdantes. */
const signature = (gagnante: number, perdantes: number[]) =>
  `${gagnante}<-${[...perdantes].sort((a, b) => a - b).join(",")}`;

const bref = (v: unknown): string => {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.length > 3 ? `${v.slice(0, 3).join(", ")}… (${v.length})` : v.join(", ");
  const s = String(v);
  return s.length > 70 ? `${s.slice(0, 70)}…` : s;
};

export function EntreprisesDoublons() {
  const [methode, setMethode] = React.useState("telephone");
  const [offset, setOffset] = React.useState(0);
  const [grappes, setGrappes] = React.useState<Grappe[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [erreur, setErreur] = React.useState<string | null>(null);

  /** La gagnante choisie, par clé de grappe. */
  const [gagnantes, setGagnantes] = React.useState<Record<string, number>>({});
  /** Le rapport d'essai à blanc affiché, par clé de grappe. */
  const [rapports, setRapports] = React.useState<Record<string, Rapport>>({});
  /** La signature simulée, par clé de grappe — c'est elle qui déverrouille. */
  const [simulees, setSimulees] = React.useState<Record<string, string>>({});
  const [travail, setTravail] = React.useState<string | null>(null);

  React.useEffect(() => {
    setOffset(0);
  }, [methode]);

  const charger = React.useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      const res = await authedFetch(
        `/api/entreprises/doublons?methode=${methode}&limite=${PAGE}&offset=${offset}`,
      );
      const body = (await res.json().catch(() => ({}))) as {
        items?: Grappe[];
        total?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || `Erreur ${res.status}`);
      setGrappes(body.items ?? []);
      setTotal(body.total ?? 0);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Lecture impossible");
      setGrappes([]);
    } finally {
      setLoading(false);
    }
  }, [methode, offset]);

  React.useEffect(() => {
    void charger();
  }, [charger]);

  const fusionner = async (g: Grappe, dryRun: boolean) => {
    const gagnante = gagnantes[g.cle];
    if (!gagnante) {
      toast.error("Choisis d'abord la fiche à garder");
      return;
    }
    const perdantes = g.membres.map((m) => m.id).filter((id) => id !== gagnante);
    if (perdantes.length === 0) return;

    setTravail(g.cle);
    try {
      const res = await authedFetch("/api/entreprises/doublons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gagnante, perdantes, dry_run: dryRun, raison: "doublon" }),
      });
      const body = (await res.json().catch(() => ({}))) as { rapport?: Rapport; error?: string };
      if (!res.ok) throw new Error(body.error || `Erreur ${res.status}`);

      if (dryRun) {
        setRapports((r) => ({ ...r, [g.cle]: body.rapport as Rapport }));
        setSimulees((s) => ({ ...s, [g.cle]: signature(gagnante, perdantes) }));
        toast.info("Simulation faite — lis le rapport avant de fusionner.");
      } else {
        toast.success(`Fusionnées dans #${gagnante}.`);
        // La grappe disparaît de la liste : elle n'existe plus.
        setRapports((r) => {
          const n = { ...r };
          delete n[g.cle];
          return n;
        });
        await charger();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fusion impossible", { duration: 9000 });
    } finally {
      setTravail(null);
    }
  };

  const fin = Math.min(offset + PAGE, total);

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex flex-wrap gap-2">
            {METHODES.map((m) => (
              <button
                key={m.valeur}
                type="button"
                title={m.aide}
                onClick={() => setMethode(m.valeur)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  methode === m.valeur
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {METHODES.find((m) => m.valeur === methode)?.aide}
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {loading
            ? "Lecture…"
            : total === 0
              ? "Aucune grappe"
              : `${(offset + 1).toLocaleString("fr-FR")}–${fin.toLocaleString("fr-FR")} sur ${total.toLocaleString("fr-FR")} grappes`}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={offset === 0 || loading} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={loading || offset + PAGE >= total} onClick={() => setOffset((o) => o + PAGE)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {erreur && <div className="p-4 text-sm text-destructive border border-destructive/30 rounded">{erreur}</div>}

      {loading && grappes.length === 0 ? (
        <div className="p-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {grappes.map((g) => {
            const gagnante = gagnantes[g.cle];
            const perdantes = g.membres.map((m) => m.id).filter((id) => id !== gagnante);
            const simulationAJour =
              gagnante != null && simulees[g.cle] === signature(gagnante, perdantes);
            const rapport = rapports[g.cle];
            const occupe = travail === g.cle;

            return (
              <Card key={g.cle}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{g.apercu || g.cle}</div>
                      <div className="text-xs text-muted-foreground font-mono">{g.cle}</div>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {g.retrecit_cohorte && (
                        <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          fait rétrécir une cohorte
                        </Badge>
                      )}
                      {g.deja_demarchee && (
                        <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">
                          déjà démarchée
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    {g.membres.map((m) => (
                      <label
                        key={m.id}
                        className={`flex items-start gap-3 p-2 rounded border cursor-pointer text-xs transition-colors ${
                          gagnante === m.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`gagnante-${g.cle}`}
                          checked={gagnante === m.id}
                          onChange={() => setGagnantes((s) => ({ ...s, [g.cle]: m.id }))}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">
                            {m.name || `#${m.id}`}{" "}
                            <span className="text-muted-foreground font-mono">#{m.id}</span>
                          </div>
                          <div className="text-muted-foreground">
                            {[m.adresse, m.siret && `SIRET ${m.siret}`, m.telephone, m.site]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {m.cohorte_demarchage && (
                              <Badge className="text-[10px] bg-amber-100 text-amber-800 hover:bg-amber-100">
                                {m.cohorte_demarchage}
                              </Badge>
                            )}
                            {m.premiere_touche_le && (
                              <Badge variant="outline" className="text-[10px]">déjà contactée</Badge>
                            )}
                            {(m.sources ?? []).map((s) => (
                              <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                            ))}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {rapport && (
                    <div className="text-xs border rounded p-3 space-y-2 bg-muted/30">
                      <div className="font-medium">
                        Simulation : {rapport.total_repointe} ligne(s) repointée(s) sur{" "}
                        {rapport.tables_filles_examinees} tables · {rapport.total_conflits} conflit(s)
                      </div>

                      {rapport.conflits.length > 0 && (
                        <div>
                          <div className="text-amber-600 font-medium">Conflits — ces lignes resteront sur la fiche archivée</div>
                          <ul className="list-disc pl-5 text-muted-foreground">
                            {[...new Set(rapport.conflits.map((c) => c.table))].map((t) => (
                              <li key={t}>
                                {t} ({rapport.conflits.filter((c) => c.table === t).length})
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {rapport.colonnes_changees.length > 0 && (
                        <div>
                          <div className="font-medium">Ce que la fiche gardée gagne</div>
                          <ul className="list-disc pl-5 text-muted-foreground">
                            {rapport.colonnes_changees.map((c) => (
                              <li key={c.colonne}>
                                <span className="font-mono">{c.colonne}</span> ({c.regle}) → {bref(c.apres)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {rapport.valeurs_ecartees.length > 0 && (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground">
                            {rapport.valeurs_ecartees.length} valeur(s) écartée(s)
                          </summary>
                          <ul className="list-disc pl-5 text-muted-foreground mt-1">
                            {rapport.valeurs_ecartees.map((v, i) => (
                              <li key={`${v.colonne}-${i}`}>
                                <span className="font-mono">{v.colonne}</span> : on garde{" "}
                                <b>{bref(v.retenu)}</b>, on jette {bref(v.valeur)}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={!gagnante || occupe} onClick={() => fusionner(g, true)}>
                      {occupe ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                      Simuler
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={!simulationAJour || occupe}
                      title={
                        simulationAJour
                          ? "Fusionner pour de vrai"
                          : "Simule d'abord cette fusion exacte"
                      }
                      onClick={() => fusionner(g, false)}
                    >
                      <Merge className="h-4 w-4" />
                      Fusionner
                    </Button>
                    {!simulationAJour && gagnante != null && (
                      <span className="text-xs text-muted-foreground">
                        La fusion se déverrouille après la simulation.
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
