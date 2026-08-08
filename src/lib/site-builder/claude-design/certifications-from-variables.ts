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

export { hydrateCertifications } from "./hydrate-certifications";
export type { LogoCertification } from "./hydrate-certifications";

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
