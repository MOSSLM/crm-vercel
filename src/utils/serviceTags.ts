const EXCLUDED_SERVICE_TAGS = [
  'Artisanat',
  'Assurances',
  'Atelier de carrosserie automobile',
  'Atelier de mécanique automobile',
  'Atelier de réparation automobile',
  'Atelier de réparation de véhicules de loisirs',
  'BNI',
  'Casse automobile',
  'Centre de formation',
  'Chauffagiste',
  'Cheministe',
  "Compagnie d'énergie thermique"
] as const;

export const formatServiceTag = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Cl\u00e9 canonique de comparaison d'un service_tag.
 *
 * Deux vocabulaires cohabitent et ne se rencontrent que par cette cl\u00e9 :
 *  - le CRM stocke du fran\u00e7ais lisible \u2014 `entreprises.service_tags` contient
 *    "Climatisation", "Pompe \u00e0 chaleur", "Bornes IRVE" ;
 *  - un design Claude ne peut \u00e9crire que de l'ASCII dans un nom de fichier ou un
 *    attribut \u2014 `service-pompe-a-chaleur.html`, `data-service-tag="bornes-irve"`,
 *    `data-svc="photovoltaique"`, et les `service_tags` de la m\u00e9diath\u00e8que.
 *
 * `formatServiceTag` (accents + casse) ne suffit pas : "pompe a chaleur" n'est
 * toujours pas "pompe-a-chaleur". On effondre donc toute suite de caract\u00e8res non
 * alphanum\u00e9riques en un seul tiret. TOUTE comparaison de deux tags passe par
 * ici \u2014 sinon un c\u00f4t\u00e9 supprime des cartes que l'autre croit visibles.
 */
export const serviceTagKey = (value: string): string =>
  formatServiceTag(value ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Ensemble de cl\u00e9s canoniques, entr\u00e9es vides ignor\u00e9es. */
export const serviceTagKeySet = (tags: readonly string[] | null | undefined): Set<string> =>
  new Set((tags ?? []).map((t) => serviceTagKey(String(t))).filter(Boolean));

const EXCLUDED_SERVICE_TAGS_NORMALIZED = new Set(
  EXCLUDED_SERVICE_TAGS.map((tag) => formatServiceTag(tag))
);

const isAllowedServiceTag = (tag: string): boolean =>
  !EXCLUDED_SERVICE_TAGS_NORMALIZED.has(formatServiceTag(tag));

export const parseLegacyPremiersTags = (premiersTags?: string | null): string[] => {
  if (!premiersTags) return [];

  return premiersTags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter(isAllowedServiceTag);
};

export const normalizeServiceTags = (
  serviceTags?: unknown,
  legacyPremiersTags?: string | null
): string[] => {
  const fromServiceTags = Array.isArray(serviceTags)
    ? serviceTags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .filter(isAllowedServiceTag)
    : [];

  if (fromServiceTags.length > 0) return Array.from(new Set(fromServiceTags));

  return Array.from(new Set(parseLegacyPremiersTags(legacyPremiersTags)));
};
