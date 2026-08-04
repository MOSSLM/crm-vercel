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

/**
 * Taxonomie métier de référence.
 *
 * Ces tags sont proposables même quand aucune entreprise ne les porte encore :
 * sans eux, le premier prospect d'un métier devait être saisi à la main, et la
 * moindre faute de frappe créait un tag jumeau — « climatisaton » — qu'aucune
 * page, section ni image de la médiathèque ne reconnaît.
 *
 * Source unique : la fiche du pipeline, le site builder et les Paramètres
 * doivent proposer exactement la même liste, sinon on peut choisir dans l'un un
 * tag qu'on ne peut pas bloquer dans l'autre.
 */
export const SERVICE_TAGS_TAXONOMY = [
  'climatisation',
  'pompe à chaleur',
  'chauffage',
  'ventilation',
  'plomberie',
  'électricité',
  'photovoltaïque',
  'rénovation',
] as const;

/** Ligne de l'allowlist globale `enrichment_tag_settings`. */
export interface ServiceTagSetting {
  tag?: unknown;
  allowed?: unknown;
}

const compareTags = (a: string, b: string): number =>
  a.localeCompare(b, 'fr', { sensitivity: 'base' });

/**
 * Tous les service tags connus, dédoublonnés par clé canonique et triés.
 *
 * L'allowlist n'est PAS appliquée ici : les Paramètres doivent aussi lister les
 * tags bloqués, faute de quoi on ne pourrait jamais en réautoriser un.
 *
 * Le libellé retenu est le premier rencontré — d'où l'ordre : les tags réels
 * des entreprises (« Pompe à chaleur ») priment sur ceux de la taxonomie, écrits
 * en minuscules.
 */
export function collectServiceTags(opts: {
  used?: Iterable<string>;
  settings?: readonly ServiceTagSetting[];
}): string[] {
  const byKey = new Map<string, string>();

  const consider = (raw: unknown): void => {
    const tag = typeof raw === 'string' ? raw.trim() : '';
    if (!tag || !isAllowedServiceTag(tag)) return;
    const key = serviceTagKey(tag);
    if (!key || byKey.has(key)) return;
    byKey.set(key, tag);
  };

  for (const tag of opts.used ?? []) consider(tag);
  for (const row of opts.settings ?? []) consider(row.tag);
  for (const tag of SERVICE_TAGS_TAXONOMY) consider(tag);

  return Array.from(byKey.values()).sort(compareTags);
}

/**
 * Catalogue des tags qu'on a le droit de poser sur une entreprise : tout ce que
 * `collectServiceTags` connaît, moins ceux explicitement bloqués dans les
 * Paramètres. La comparaison passe par la clé canonique, sinon bloquer
 * « climatisation » laissait passer « Climatisation ».
 */
export function buildServiceTagCatalog(opts: {
  used?: Iterable<string>;
  settings?: readonly ServiceTagSetting[];
}): string[] {
  const blocked = new Set(
    (opts.settings ?? [])
      .filter((row) => row.allowed === false && typeof row.tag === 'string')
      .map((row) => serviceTagKey(row.tag as string))
  );
  return collectServiceTags(opts).filter((tag) => !blocked.has(serviceTagKey(tag)));
}

/**
 * `false` dès qu'une ligne de l'allowlist bloque ce tag, quelle que soit sa
 * graphie. Un tag sans ligne est autorisé.
 *
 * Le « dès qu'une » compte : tant que d'anciennes lignes de graphies
 * différentes cohabitent (« climatisation » et « Climatisation »), la lecture
 * doit être la même que celle de `buildServiceTagCatalog`, sinon les
 * Paramètres afficheraient « autorisé » un tag que la fiche ne propose pas.
 * L'enregistrement des Paramètres fait le ménage de ces doublons.
 */
export function isServiceTagAllowed(
  tag: string,
  settings: readonly ServiceTagSetting[] | null | undefined
): boolean {
  const key = serviceTagKey(tag);
  return !(settings ?? []).some(
    (s) => s.allowed === false && typeof s.tag === 'string' && serviceTagKey(s.tag) === key
  );
}
