/**
 * Les longueurs recommandées des balises SEO, en un seul endroit.
 *
 * Elles vivaient dans le panneau SEO de l'éditeur Relume. Le second éditeur —
 * celui des designs Claude, sur lequel passent les démos — a besoin des mêmes :
 * deux tables recopiées auraient divergé au premier ajustement, et un opérateur
 * n'aurait aucun moyen de savoir laquelle des deux fait foi.
 *
 * Les bornes sont celles de l'affichage de Google : au-delà, la fin du titre ou
 * de la description est coupée, donc écrite pour rien.
 */
export type ChampSeo = "metaTitle" | "metaDescription" | "ogTitle" | "ogDescription" | "ogImage";

export const LONGUEURS_SEO: Record<ChampSeo, { min: number; max: number } | null> = {
  metaTitle: { min: 50, max: 60 },
  metaDescription: { min: 150, max: 160 },
  ogTitle: { min: 0, max: 60 },
  ogDescription: { min: 0, max: 110 },
  ogImage: null,
};

/** Le verdict d'une longueur, pour colorer un compteur sans le refaire deux fois. */
export function verdictLongueur(
  longueur: number,
  bornes: { min: number; max: number } | null,
): "vide" | "court" | "bon" | "long" {
  if (longueur === 0) return "vide";
  if (!bornes) return "bon";
  if (bornes.max && longueur > bornes.max) return "long";
  if (bornes.min && longueur < bornes.min) return "court";
  return "bon";
}
