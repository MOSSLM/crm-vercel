/**
 * Le lien Google d'un prospect.
 *
 * L'enrichissement Maps stocke déjà l'URL de la fiche Google Business dans
 * `entreprises.google_url` (et son doublon historique `google_maps_url`).
 * Plusieurs écrans l'ignoraient et reconstruisaient une **recherche** Google à
 * partir du nom et de la ville : « Google » ouvrait alors une page de résultats
 * où il fallait retrouver l'entreprise à l'œil, et où le premier résultat est
 * régulièrement un concurrent qui paie pour la requête. En plein appel, c'est
 * quelques secondes perdues et un doute sur qui on a en ligne.
 *
 * On ouvre donc la fiche quand on l'a, et on ne retombe sur la recherche que
 * pour les prospects pas encore enrichis — pour eux, c'est ça ou rien.
 */

export interface ProspectGoogle {
  name?: string | null;
  ville?: string | null;
  google_url?: string | null;
  google_maps_url?: string | null;
}

/** La requête de repli : le nom, plus la ville pour lever les homonymes. */
function rechercheGoogle(prospect: ProspectGoogle): string {
  const termes = [prospect.name ?? "", prospect.ville ?? ""].join(" ").trim();
  return `https://www.google.com/search?q=${encodeURIComponent(termes)}`;
}

/**
 * La fiche Google du prospect, ou une recherche à son nom à défaut.
 * Ne retourne jamais `null` : le bouton doit toujours mener quelque part.
 */
export function lienGoogle(prospect: ProspectGoogle): string {
  const fiche = prospect.google_url?.trim() || prospect.google_maps_url?.trim();
  return fiche || rechercheGoogle(prospect);
}

/**
 * Vrai quand le lien mène à la vraie fiche et non à une recherche — de quoi
 * distinguer les deux à l'écran plutôt que de laisser croire à une fiche.
 */
export function aUneFicheGoogle(prospect: ProspectGoogle): boolean {
  return Boolean(prospect.google_url?.trim() || prospect.google_maps_url?.trim());
}

/**
 * Le lien Maps. Même fiche que `lienGoogle` quand on l'a — sur Maps comme sur
 * Google, la fiche d'établissement est la même page — sinon une recherche
 * cartographique.
 */
export function lienMaps(prospect: ProspectGoogle): string {
  const fiche = prospect.google_maps_url?.trim() || prospect.google_url?.trim();
  if (fiche) return fiche;
  const termes = [prospect.name ?? "", prospect.ville ?? ""].join(" ").trim();
  return `https://www.google.com/maps/search/${encodeURIComponent(termes)}`;
}
