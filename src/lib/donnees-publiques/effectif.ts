/**
 * Tranches d'effectif salarié : codes INSEE.
 *
 * LE PIÈGE, vérifié sur des données réelles : `tranche_effectif_salarie` est un
 * CODE, pas un nombre. '12' ne veut pas dire « 12 salariés » mais « 20 à 49 ».
 * Afficher « effectif 12 » pour une entreprise de 30 personnes serait un
 * contresens — et c'est exactement ce que produit un `Number(code)` distrait.
 *
 * D'où ce module : le code brut est stocké tel quel en base, et le libellé est
 * calculé ici, au rendu. Aucun entier n'est jamais dérivé du code.
 */

export type TrancheEffectif = {
  code: string;
  label: string;
  /** Bornes réelles, pour trier ou filtrer sans passer par le libellé. */
  min: number;
  max: number | null;
};

/** Table officielle INSEE. 'NN' et '' signifient « non renseigné ». */
const TRANCHES: Record<string, TrancheEffectif> = {
  "00": { code: "00", label: "Aucun salarié", min: 0, max: 0 },
  "01": { code: "01", label: "1 à 2 salariés", min: 1, max: 2 },
  "02": { code: "02", label: "3 à 5 salariés", min: 3, max: 5 },
  "03": { code: "03", label: "6 à 9 salariés", min: 6, max: 9 },
  "11": { code: "11", label: "10 à 19 salariés", min: 10, max: 19 },
  "12": { code: "12", label: "20 à 49 salariés", min: 20, max: 49 },
  "21": { code: "21", label: "50 à 99 salariés", min: 50, max: 99 },
  "22": { code: "22", label: "100 à 199 salariés", min: 100, max: 199 },
  "31": { code: "31", label: "200 à 249 salariés", min: 200, max: 249 },
  "32": { code: "32", label: "250 à 499 salariés", min: 250, max: 499 },
  "41": { code: "41", label: "500 à 999 salariés", min: 500, max: 999 },
  "42": { code: "42", label: "1 000 à 1 999 salariés", min: 1000, max: 1999 },
  "51": { code: "51", label: "2 000 à 4 999 salariés", min: 2000, max: 4999 },
  "52": { code: "52", label: "5 000 à 9 999 salariés", min: 5000, max: 9999 },
  "53": { code: "53", label: "10 000 salariés et plus", min: 10000, max: null },
};

/**
 * Le libellé d'un code, ou `null` si le code est absent / 'NN'.
 *
 * `null` et non « Non renseigné » : c'est à l'affichage de décider s'il montre
 * une mention ou s'il masque la ligne. Le socle ne fabrique pas de texte pour
 * une donnée qu'il n'a pas — l'absence est la norme, pas l'exception (60 % de
 * couverture mesurée).
 */
export const trancheEffectifLabel = (code: string | null | undefined): string | null =>
  trancheEffectif(code)?.label ?? null;

/** La tranche complète (bornes incluses), ou `null`. */
export const trancheEffectif = (code: string | null | undefined): TrancheEffectif | null => {
  if (!code) return null;
  const key = code.trim().toUpperCase();
  if (key === "NN" || key === "") return null;
  return TRANCHES[key] ?? null;
};

/**
 * Le code est-il exploitable ? Sert à mesurer la couverture sans avoir à
 * comparer un libellé à une chaîne magique.
 */
export const hasEffectif = (code: string | null | undefined): boolean =>
  trancheEffectif(code) !== null;
