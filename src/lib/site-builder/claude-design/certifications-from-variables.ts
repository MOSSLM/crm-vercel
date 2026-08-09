/**
 * Pont entre la variable `__certifications` et le tweak d'affichage.
 *
 * Les deux surfaces de rendu — l'aperçu de l'éditeur et le rendu serveur du site
 * publié — reçoivent les mêmes `variables`. Elles doivent donc décoder
 * `__certifications` de la même façon, sinon un logo apparaîtrait à l'aperçu et
 * pas en ligne, ou l'inverse. D'où ce module partagé plutôt qu'un `JSON.parse`
 * recopié des deux côtés.
 *
 * LE DÉFAUT EST LE VIDE, et c'est délibéré. Un JSON absent, malformé, ou d'une
 * forme inattendue rend une liste vide — donc **pas de bloc de certifications**.
 * Le repli d'un tweak qui porte une allégation doit être le silence : afficher
 * un logo par accident de parsing serait précisément l'erreur qu'on cherche à
 * rendre impossible.
 */

import type { LogoCertification } from "./hydrate-certifications";

export { hydrateCertifications, porteDesCertifications } from "./hydrate-certifications";
export type { LogoCertification } from "./hydrate-certifications";
export { filterRgeBadges } from "./filter-rge-badges";
import type { EtatRgeBadges } from "./filter-rge-badges";
export { stripRgeRegions, porteDesVariantesRge } from "./strip-rge-regions";
import type { EtatRgeRegions } from "./strip-rge-regions";
import { libelleCourt } from "@/lib/donnees-publiques/rge-logos";

const estLogo = (v: unknown): v is LogoCertification => {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.cle === "string" &&
    typeof o.src === "string" &&
    typeof o.alt === "string" &&
    o.src.startsWith("/rge/")
  );
};

/**
 * Ce que le filtre de badges texte doit savoir, décodé des mêmes variables.
 *
 * `verifie` vient d'un drapeau DÉDIÉ, jamais d'une déduction sur la liste de
 * logos : une liste vide ne distingue pas « l'ADEME confirme zéro » de « on n'a
 * jamais demandé », et ces deux cas appellent des comportements opposés — retirer
 * les badges, ou n'y pas toucher. Le repli est le second : sans drapeau, on
 * considère qu'on ne sait pas.
 */
export const etatBadgesDepuisVariables = (
  variables: Record<string, string> | undefined | null,
): EtatRgeBadges => ({
  verifie: variables?.["__rge_verifie"] === "1",
  // Les clés détenues sortent des logos déjà résolus : une qualification sans
  // logo (certificat d'audit nominatif) ne porte aucune marque, donc aucun badge
  // de template ne peut la nommer.
  clesDetenues: logosDepuisVariables(variables?.["__certifications"]).map((l) => l.cle),
});

/**
 * Ce que le choix de rédaction doit savoir, décodé des mêmes variables.
 *
 * Même exigence que `etatBadgesDepuisVariables` : `verifie` vient du drapeau
 * dédié, jamais d'une liste vide. Une liste de logos vide ne distingue pas
 * « l'ADEME confirme zéro » de « on n'a jamais demandé », et ces deux cas
 * appellent des rédactions opposées — dont l'une ne doit jamais être choisie par
 * accident.
 */
export const etatRegionsDepuisVariables = (
  variables: Record<string, string> | undefined | null,
): EtatRgeRegions => ({
  verifie: variables?.["__rge_verifie"] === "1",
  // Noms COURTS et distincts : « QualiPAC », pas « QualiPAC module Chauffage et
  // ECS » — trois noms ADEME complets déborderaient d'un badge de pied de page.
  noms: logosDepuisVariables(variables?.["__certifications"]).map((l) => libelleCourt(l.cle)),
});

/** Décode `__certifications`. Toute anomalie rend `[]`, donc aucun bloc. */
export const logosDepuisVariables = (json: string | undefined | null): LogoCertification[] => {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(estLogo).map((l) => ({
      cle: l.cle,
      src: l.src,
      srcSet: typeof l.srcSet === "string" && l.srcSet ? l.srcSet : `${l.src} 1x`,
      width: Number.isFinite(l.width) ? l.width : 360,
      height: Number.isFinite(l.height) ? l.height : 180,
      alt: l.alt,
    }));
  } catch {
    return [];
  }
};
