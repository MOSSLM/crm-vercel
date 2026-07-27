/**
 * Résolution des trois variables de ville, partagée par les deux résolveurs :
 *  - src/lib/site-builder/resolve-variables.ts (publish + rendu du site public)
 *  - /api/site-builder/variables               (aperçu de l'éditeur)
 *
 * Les deux avaient divergé — l'aperçu laissait `override_city` écraser
 * `entreprise.ville` alors que le rendu public ne le faisait pas — d'où une
 * ville différente entre l'aperçu et le site publié. Un seul helper, une seule
 * sémantique :
 *
 *  - `entreprise.ville`     : la VRAIE ville de l'entreprise (`entreprises.ville`),
 *                             celle de l'adresse postale. Jamais écrasée.
 *  - `entreprise.ville_seo` : la VILLE SEO, la grande ville la plus proche mise
 *                             en avant partout sur le site. Remplie par
 *                             l'enrichissement dans `override_city`.
 *  - `entreprise.location`  : alias historique de la ville SEO, conservé pour les
 *                             designs déjà publiés qui utilisent
 *                             `{{ entreprise.location }}`.
 *
 * `ville_seo` retombe sur `override_location` (colonne remplie par les anciennes
 * versions de l'edge function) puis sur la vraie ville : elle n'est donc jamais
 * vide, même sur un projet jamais réenrichi — aucun site publié n'affiche de trou.
 */

export interface CityInputs {
  /** `entreprises.ville` — la vraie ville. */
  ville: string | null | undefined;
  /** `lead_magnet_projects.override_city` — la ville SEO. */
  overrideCity: string | null | undefined;
  /** `lead_magnet_projects.override_location` — miroir historique de la ville SEO. */
  overrideLocation: string | null | undefined;
}

export interface ResolvedCities {
  ville: string;
  villeSeo: string;
  location: string;
}

const clean = (v: string | null | undefined): string => (typeof v === "string" ? v.trim() : "");

/** Calcule ville / ville SEO / location selon la règle unique décrite ci-dessus. */
export function resolveCities({ ville, overrideCity, overrideLocation }: CityInputs): ResolvedCities {
  const realVille = clean(ville);
  const seo = clean(overrideCity) || clean(overrideLocation) || realVille;
  return {
    ville: realVille,
    villeSeo: seo,
    location: clean(overrideLocation) || seo,
  };
}

/** Écrit les trois variables dans la map plate `{{ … }}`. Mutation en place. */
export function applyCityVariables(vars: Record<string, string>, inputs: CityInputs): ResolvedCities {
  const cities = resolveCities(inputs);
  vars["entreprise.ville"] = cities.ville;
  vars["entreprise.ville_seo"] = cities.villeSeo;
  vars["entreprise.location"] = cities.location;
  return cities;
}
