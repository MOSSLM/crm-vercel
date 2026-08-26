"use client";

/**
 * La barre d'onglets du bas, sur téléphone.
 *
 * ── LE DÉFAUT QU'ELLE CORRIGE ────────────────────────────────────────────
 * Les deux barres du CRM déclaraient `grid-cols-5` et y versaient tout ce
 * qu'elles avaient : sept catégories côté admin, six côté agent. Sur un écran
 * de 360 px, sept colonnes font 51 px chacune — « Automatisations » et
 * « Messagerie » y deviennent trois lettres et des points de suspension, et les
 * cibles tactiles passent sous le seuil confortable.
 *
 * ── POURQUOI « 4 + PLUS » ET NON « AUTANT DE COLONNES QUE D'ENTRÉES » ────
 * Élargir la grille à sept colonnes ne ferait que répartir la même misère : le
 * problème n'est pas la grille, c'est qu'une barre d'onglets ne peut pas être un
 * menu complet. On garde donc quatre destinations tenables au pouce, et la
 * cinquième place ouvre la liste ENTIÈRE — les quatre premières comprises, pour
 * que « Plus » ne soit pas un endroit où certaines entrées se cachent, mais
 * l'endroit où toutes se trouvent.
 *
 * L'ordre des entrées est la seule chose qui décide de ce qui reste visible :
 * c'est à l'appelant de le fixer, il connaît son métier.
 */

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export type EntreeOnglet = {
  /** Identifiant stable, comparé à `actif`. */
  cle: string;
  titre: string;
  href: string;
  icone: LucideIcon;
};

/** Le nombre de destinations gardées en accès direct. La 5ᵉ place est « Plus ». */
const DIRECTES = 4;

/**
 * Les classes de grille sont ÉCRITES EN TOUTES LETTRES.
 * Tailwind génère son CSS en lisant le source : une classe composée à
 * l'exécution (`grid-cols-${n}`) n'existe jamais dans la feuille de style, et la
 * grille retombe silencieusement sur une seule colonne. Le défaut ne se voit
 * qu'en production, une fois le CSS purgé.
 */
const COLONNES: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

const classeOnglet = (actif: boolean) =>
  `flex min-h-14 flex-col items-center justify-center rounded-lg px-1 py-1 text-[11px] font-medium transition-colors ${
    actif
      ? "bg-accent text-accent-foreground"
      : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
  }`;

export function MobileTabBar({
  entrees,
  actif,
  titrePlus = "Tout le menu",
}: {
  entrees: EntreeOnglet[];
  actif: string | null;
  titrePlus?: string;
}) {
  const [ouvert, setOuvert] = useState(false);

  const directes = entrees.slice(0, DIRECTES);
  const deborde = entrees.length > DIRECTES;
  // « Plus » s'allume quand la destination courante n'est pas dans les quatre :
  // sans ça, la barre n'indique plus du tout où l'on est.
  const plusActif = deborde && !directes.some((e) => e.cle === actif);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 px-1 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] pt-1 backdrop-blur md:hidden">
      <ul className={`grid gap-1 ${deborde ? COLONNES[5] : (COLONNES[directes.length] ?? COLONNES[4])}`}>
        {directes.map((entree) => {
          const estActif = actif === entree.cle;
          return (
            <li key={entree.cle}>
              <Link
                href={entree.href}
                className={classeOnglet(estActif)}
                aria-current={estActif ? "page" : undefined}
              >
                <entree.icone className="mb-0.5 h-4 w-4" />
                <span className="truncate">{entree.titre}</span>
              </Link>
            </li>
          );
        })}

        {deborde && (
          <li>
            <Sheet open={ouvert} onOpenChange={setOuvert}>
              <SheetTrigger asChild>
                <button type="button" className={`w-full ${classeOnglet(plusActif)}`}>
                  <MoreHorizontal className="mb-0.5 h-4 w-4" />
                  <span className="truncate">Plus</span>
                </button>
              </SheetTrigger>

              <SheetContent side="bottom" className="pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                <SheetHeader className="text-left">
                  <SheetTitle className="text-base">{titrePlus}</SheetTitle>
                </SheetHeader>

                {/* Toutes les entrées, y compris les quatre déjà visibles. */}
                <ul className="mt-3 grid grid-cols-3 gap-2">
                  {entrees.map((entree) => {
                    const estActif = actif === entree.cle;
                    return (
                      <li key={entree.cle}>
                        <Link
                          href={entree.href}
                          onClick={() => setOuvert(false)}
                          className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3 text-center text-xs font-medium transition-colors ${
                            estActif
                              ? "border-transparent bg-accent text-accent-foreground"
                              : "hover:bg-accent/40"
                          }`}
                          aria-current={estActif ? "page" : undefined}
                        >
                          <entree.icone className="h-5 w-5" />
                          <span className="leading-tight">{entree.titre}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </SheetContent>
            </Sheet>
          </li>
        )}
      </ul>
    </nav>
  );
}

export default MobileTabBar;
