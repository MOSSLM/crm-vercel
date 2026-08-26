"use client";

import { usePathname } from "next/navigation";
import { TOP_CATEGORIES, getCategoryFromPath } from "./navigation";
import { MobileTabBar, type EntreeOnglet } from "./MobileTabBar";

/**
 * La barre du bas, côté admin.
 *
 * L'ORDRE DÉCIDE DE CE QUI RESTE VISIBLE, et il n'est pas celui du menu de
 * bureau. Sur téléphone on démarche, on regarde où en sont les affaires et on
 * répond ; on ne construit pas un site et on ne câble pas une automatisation.
 * Les quatre premières entrées sont donc celles-là, et `TOP_CATEGORIES` garde
 * son ordre à lui pour la barre latérale, où la contrainte de place n'existe
 * pas.
 *
 * Tout le reste est à un tap, dans « Plus » — voir `MobileTabBar`.
 */

/** Les quatre destinations du terrain, dans l'ordre où on y va. */
const ORDRE_MOBILE = ["actions", "crm", "messagerie", "dashboard"] as const;

const rang = (cle: string) => {
  const i = (ORDRE_MOBILE as readonly string[]).indexOf(cle);
  return i === -1 ? ORDRE_MOBILE.length : i;
};

export function MobileBottomNav() {
  const pathname = usePathname() ?? "";
  const categorieActive = getCategoryFromPath(pathname);

  const entrees: EntreeOnglet[] = [...TOP_CATEGORIES]
    .sort((a, b) => rang(a.key) - rang(b.key))
    .map((item) => ({ cle: item.key, titre: item.title, href: item.href, icone: item.icon }));

  return <MobileTabBar entrees={entrees} actif={categorieActive} titrePlus="Tout le CRM" />;
}

export default MobileBottomNav;
