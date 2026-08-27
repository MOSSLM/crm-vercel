"use client";

/**
 * La barre d'onglets du bas — une seule ligne, et rien qui déborde.
 *
 * ── CE QU'ELLE ÉTAIT, ET POURQUOI ÇA NE TENAIT PAS ───────────────────────
 * Quatre destinations plus une feuille « Plus » qui rouvrait le menu entier.
 * L'intention était bonne — ne rien cacher — mais l'effet était l'inverse de ce
 * qu'on veut d'un téléphone : trois taps suffisaient pour atterrir sur le Site
 * builder ou le câblage d'une automatisation, des écrans qui demandent deux
 * mains et 1 400 px. Le menu promettait un travail que l'appareil ne peut pas
 * faire, et on découvrait l'impasse une fois arrivé.
 *
 * ── CE QU'ELLE EST ───────────────────────────────────────────────────────
 * Une ligne, cinq places au plus, uniquement des écrans vérifiés au pouce
 * (`mobile.ts`, où chaque entrée porte sa défense). Pas de débordement, pas de
 * feuille, pas de second niveau : ce qui n'est pas là passe par la RECHERCHE du
 * haut, qui indexe tous les outils. Le menu propose, la recherche permet.
 *
 * ── AUCUNE ENTRÉE ALLUMÉE EST UN ÉTAT NORMAL ─────────────────────────────
 * On ouvre le Site builder par la recherche : la barre n'allume rien. C'est
 * juste — on n'est dans aucune de ses destinations — et c'est mieux que
 * d'allumer la plus proche, qui ferait croire qu'on est ailleurs.
 *
 * ── LES CLASSES DE GRILLE SONT ÉCRITES EN TOUTES LETTRES ─────────────────
 * Tailwind génère son CSS en lisant le source : une classe composée à
 * l'exécution (`grid-cols-${n}`) n'existe jamais dans la feuille, et la grille
 * retombe silencieusement sur une colonne. Le défaut ne se voit qu'en
 * production, une fois le CSS purgé.
 */

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { MAX_DESTINATIONS } from "./mobile";

export type EntreeOnglet = {
  /** Identifiant stable, comparé à `actif`. */
  cle: string;
  titre: string;
  href: string;
  icone: LucideIcon;
};

const COLONNES: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

const classeOnglet = (actif: boolean) =>
  `flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[11px] font-medium leading-tight transition-colors ${
    actif
      ? "bg-accent text-accent-foreground"
      : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
  }`;

export function MobileTabBar({
  entrees,
  actif,
}: {
  entrees: EntreeOnglet[];
  /** `null` quand la page courante n'est dans aucune destination — état normal. */
  actif: string | null;
}) {
  // On COUPE plutôt que de déborder. Si une destination doit entrer, une autre
  // doit sortir : c'est la contrainte qui garde la barre lisible, et elle se
  // règle dans `mobile.ts`, pas ici.
  const visibles = entrees.slice(0, MAX_DESTINATIONS);
  if (visibles.length === 0) return null;

  return (
    <nav
      aria-label="Navigation mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 px-1 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-1 backdrop-blur md:hidden"
    >
      <ul className={`grid gap-1 ${COLONNES[visibles.length] ?? COLONNES[5]}`}>
        {visibles.map((entree) => {
          const estActif = actif === entree.cle;
          return (
            <li key={entree.cle}>
              <Link
                href={entree.href}
                className={classeOnglet(estActif)}
                aria-current={estActif ? "page" : undefined}
              >
                <entree.icone className="h-4 w-4" />
                <span className="truncate">{entree.titre}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default MobileTabBar;
