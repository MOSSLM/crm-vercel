"use client";

import { usePathname } from "next/navigation";
import { DESTINATIONS_ADMIN, destinationActive } from "./mobile";
import { MobileTabBar, type EntreeOnglet } from "./MobileTabBar";

/**
 * La barre du bas, côté admin.
 *
 * Elle ne lit plus `TOP_CATEGORIES` — l'ancien modèle de menu, que plus aucune
 * surface de bureau n'utilise depuis le passage aux espaces (`spaces.ts`).
 * C'était le dernier endroit d'où il pilotait quelque chose, et il pilotait le
 * téléphone : la seule surface où se tromper coûte le plus cher.
 *
 * La liste et son ordre vivent dans `mobile.ts`, avec la raison de chaque
 * entrée. Ce fichier ne fait que la brancher sur le chemin courant.
 */
export function MobileBottomNav() {
  const chemin = usePathname() ?? "";

  const entrees: EntreeOnglet[] = DESTINATIONS_ADMIN.map((d) => ({
    cle: d.cle,
    titre: d.titre,
    href: d.href,
    icone: d.icone,
  }));

  return <MobileTabBar entrees={entrees} actif={destinationActive(chemin, DESTINATIONS_ADMIN)} />;
}

export default MobileBottomNav;
