export const crmEnterpriseTabs = [
  { label: "Toutes les entreprises", href: "/companies" },
  // « Explorateur » est la vue complète (filtres, répartitions, actions de
  // masse) ; « Recherche rapide » est l'ancien écran, volontairement minimal,
  // qui ne fait qu'une recherche libre sur les 60 000 fiches.
  { label: "Explorateur", href: "/entreprises/explorateur" },
  { label: "Recherche rapide", href: "/entreprises/explorer" },
  { label: "Qualifiés", href: "/qualified" },
  { label: "Duplicats", href: "/duplicates" },
  { label: "Fusionner", href: "/entreprises/doublons" },
  { label: "Réseaux", href: "/networks" },
  { label: "Blacklist", href: "/blacklist" },
  { label: "Concurrents", href: "/concurrents" },
];

export const actionSearchTabs = [
  { label: "Nouvelle recherche", href: "/search/new" },
  { label: "Enrichissement", href: "/production/enrichissement" },
];

export const productionProjectTabs = [
  { label: "Projets clients", href: "/production/projets-clients" },
  { label: "Projets internes", href: "/production/projets-internes" },
];
