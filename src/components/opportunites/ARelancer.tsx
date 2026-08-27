"use client";

/**
 * « À relancer » — la liste qui empêche une affaire de mourir en silence.
 *
 * ── POURQUOI ELLE EST EN HAUT DU TABLEAU DE BORD ─────────────────────────
 * Le reste du tableau de bord MESURE (CA signé, panier moyen, entonnoir) :
 * il dit comment ça s'est passé. Cette carte est la seule qui dise quoi faire
 * maintenant. Elle passe donc avant, parce qu'un chiffre qu'on regarde après
 * avoir perdu l'affaire ne sert à rien.
 *
 * ── ELLE NE MONTRE PAS LES AFFAIRES JAMAIS TOUCHÉES ──────────────────────
 * Sur 877 opportunités vivantes, seules 180 entreprises portent le moindre
 * échange. Si « jamais contacté » comptait comme une alerte, la liste
 * s'ouvrirait sur sept cents lignes toutes identiques et personne ne la
 * regarderait deux fois. Ces fiches-là ne sont pas en danger, elles sont à
 * démarcher — c'est la file de qualification qui s'en occupe, pas celle-ci.
 * Le classement est dans `lib/opportunites/suivi.ts`.
 *
 * ── TROIS ÉTATS, ET LEUR ORDRE EST CELUI DE LA JOURNÉE ───────────────────
 * En retard (on avait promis une date) → sans nouvelle depuis trop longtemps
 * pour l'étape → engagée mais sans prochaine action décidée. Une promesse non
 * tenue se rattrape ; une affaire qui n'a rien promis n'a encore rien cassé.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlarmClock, ArrowRight, CalendarClock, Loader2, MoonStar, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authedFetch } from "@/utils/authedFetch";
import {
  LIBELLE_ETAT,
  type EtatSuivi,
  type LigneSuivi,
} from "@/lib/opportunites/suivi";

type LigneClassee = LigneSuivi & { etat: EtatSuivi };

type Reponse = {
  opportunites: LigneClassee[];
  total_retenu: number;
  compteurs: Record<EtatSuivi, number>;
};

const TON_ETAT: Record<EtatSuivi, string> = {
  en_retard: "border-red-300 text-red-700 dark:border-red-900 dark:text-red-400",
  qui_pourrit: "border-amber-300 text-amber-700 dark:border-amber-900 dark:text-amber-400",
  sans_prochaine_action: "border-border text-muted-foreground",
  ok: "border-border text-muted-foreground",
};

/** La couleur de l'icône, déclarée à part plutôt que découpée dans `TON_ETAT` :
 *  extraire « la deuxième classe de la chaîne » marche jusqu'au jour où
 *  quelqu'un réordonne les classes, et ça casse alors sans rien signaler. */
const TON_ICONE: Record<EtatSuivi, string> = {
  en_retard: "text-red-600 dark:text-red-400",
  qui_pourrit: "text-amber-600 dark:text-amber-400",
  sans_prochaine_action: "text-muted-foreground",
  ok: "text-muted-foreground",
};

const ICONE_ETAT: Record<EtatSuivi, typeof AlarmClock> = {
  en_retard: AlarmClock,
  qui_pourrit: MoonStar,
  sans_prochaine_action: CalendarClock,
  ok: Target,
};

const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

/** Ce qui explique la ligne, en une phrase — jamais un code d'état nu. */
function raison(l: LigneClassee): string {
  if (l.etat === "en_retard") {
    const j = l.jours_de_retard ?? 0;
    const quoi = l.prochaine_action ? `« ${l.prochaine_action} »` : "Le suivi prévu";
    return `${quoi} — ${j} jour${j > 1 ? "s" : ""} de retard`;
  }
  if (l.etat === "qui_pourrit") {
    const j = l.jours_sans_echange ?? 0;
    return `Aucun échange depuis ${j} jour${j > 1 ? "s" : ""}`;
  }
  return "Aucune prochaine action décidée";
}

const NOMBRE_AFFICHE = 6;

export function ARelancer() {
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const r = await authedFetch(`/api/opportunites/suivi?limite=${NOMBRE_AFFICHE}`);
      if (!r.ok) throw new Error(`Suivi indisponible (${r.status})`);
      setDonnees((await r.json()) as Reponse);
    } catch (e: unknown) {
      setErreur(e instanceof Error ? e.message : "Suivi indisponible");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const compteurs = donnees?.compteurs;
  const total = donnees?.total_retenu ?? 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlarmClock className="h-5 w-5" />À relancer
              {total > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {total}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Les affaires engagées qui attendent quelque chose de nous.
            </CardDescription>
          </div>

          {compteurs && total > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(["en_retard", "qui_pourrit", "sans_prochaine_action"] as const)
                .filter((e) => compteurs[e] > 0)
                .map((e) => (
                  <Badge key={e} variant="outline" className={`text-xs font-normal ${TON_ETAT[e]}`}>
                    {compteurs[e]} {LIBELLE_ETAT[e].toLowerCase()}
                  </Badge>
                ))}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {chargement ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Lecture du pipeline…
          </div>
        ) : erreur ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{erreur}</p>
        ) : total === 0 ? (
          <div className="py-6 text-center">
            <Target className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              Rien à relancer : chaque affaire engagée porte une prochaine action à jour.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {donnees?.opportunites.map((l) => {
              const Icone = ICONE_ETAT[l.etat];
              const valeur = (l.montant ?? 0) + (l.mrr ?? 0) * 12;
              return (
                <Link
                  key={l.opportunite_id}
                  href={`/companies/${l.entreprise_id}`}
                  className="flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 transition-colors hover:bg-accent/40"
                >
                  <Icone className={`h-4 w-4 shrink-0 ${TON_ICONE[l.etat]}`} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate text-sm font-medium">
                        {l.entreprise_nom ?? "Entreprise sans nom"}
                      </span>
                      {l.etape_nom && (
                        <span className="text-xs text-muted-foreground">{l.etape_nom}</span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{raison(l)}</p>
                  </div>

                  {valeur > 0 && (
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {eur(valeur)}
                    </span>
                  )}
                </Link>
              );
            })}

            {total > NOMBRE_AFFICHE && (
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link href="/pipeline">
                  Voir les {total - NOMBRE_AFFICHE} autres dans le pipeline
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default ARelancer;
