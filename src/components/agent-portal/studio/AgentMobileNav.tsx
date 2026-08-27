"use client";

import { usePathname } from "next/navigation";
import { DESTINATIONS_AGENT, destinationActive } from "@/components/layout/mobile";
import { MobileTabBar, type EntreeOnglet } from "@/components/layout/MobileTabBar";

/**
 * La barre du bas, côté agent. Même mécanique que celle de l'admin, et même
 * règle : seulement les écrans vérifiés au pouce, une ligne, aucun débordement.
 *
 * Elle est plus COURTE que la liste des sections de l'espace agent, et c'est
 * voulu : le métier d'un commercial tient en deux écrans — sa file du jour et
 * ses tâches. Le reste (ses chiffres, ses réglages, son argumentaire) se lit,
 * il ne se travaille pas au feu rouge, et la recherche du haut y mène.
 */
export function AgentMobileNav() {
  const chemin = usePathname() ?? "";

  const entrees: EntreeOnglet[] = DESTINATIONS_AGENT.map((d) => ({
    cle: d.cle,
    titre: d.titre,
    href: d.href,
    icone: d.icone,
  }));

  return <MobileTabBar entrees={entrees} actif={destinationActive(chemin, DESTINATIONS_AGENT)} />;
}

export default AgentMobileNav;
