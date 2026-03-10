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
