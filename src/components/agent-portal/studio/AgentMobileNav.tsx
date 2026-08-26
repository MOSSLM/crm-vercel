"use client";

import { usePathname } from "next/navigation";
import { AGENT_SPACES, getAgentSpaceFromPath } from "@/components/agent-portal/agentSpaces";
import { MobileTabBar, type EntreeOnglet } from "@/components/layout/MobileTabBar";

/**
 * La barre du bas, côté agent. Même mécanique que celle de l'admin
 * (`MobileTabBar` : quatre destinations directes, tout le reste dans « Plus »),
 * avec l'ordre de la journée d'un commercial — il démarche, il appelle, puis il
 * regarde ses chiffres.
 *
 * Les sections « utilitaires » (Réglages) restent hors de la barre : elles ont
 * déjà leur bouton dédié dans le rail, et une barre d'onglets sert à travailler,
 * pas à se configurer. Elles restent atteignables par « Plus ».
 */

/** L'ordre de la journée. Ce qui n'y figure pas passe dans « Plus ». */
const ORDRE_MOBILE = ["prospection", "demarchage", "telephonie", "pilotage"] as const;

const rang = (cle: string) => {
  const i = (ORDRE_MOBILE as readonly string[]).indexOf(cle);
  return i === -1 ? ORDRE_MOBILE.length : i;
};

export function AgentMobileNav() {
  const pathname = usePathname() ?? "";
  const espaceActif = getAgentSpaceFromPath(pathname);

  const entrees: EntreeOnglet[] = AGENT_SPACES.filter((s) => !s.utility)
    .slice()
    .sort((a, b) => rang(a.id) - rang(b.id))
    .map((space) => ({ cle: space.id, titre: space.label, href: space.href, icone: space.icon }));

  return <MobileTabBar entrees={entrees} actif={espaceActif} titrePlus="Tout l'espace agent" />;
}

export default AgentMobileNav;
