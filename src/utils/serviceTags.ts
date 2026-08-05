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
 *
 * Cette liste est calée sur les `data-service-tag` du template de site, clé
 * canonique par clé canonique. C'est ce qui la rend vérifiable : un tag hors
 * taxonomie ne correspond à AUCUNE page, donc `isServiceTagKnownToTemplate`
 * peut signaler les entreprises cassées. Elle a divergé deux fois —
 * « rénovation » côté CRM contre `renovation-generale` côté template, et
 * `bornes-irve` que le CRM ignorait — et dans les deux cas l'enrichissement
 * posait un tag qui masquait silencieusement la page qu'il devait montrer.
 * Toute entrée ajoutée ici doit exister dans le template, et inversement.
 */
export const SERVICE_TAGS_TAXONOMY = [
  'climatisation',
  'pompe à chaleur',
  'chauffage',
  'ventilation',
  'plomberie',
  'électricité',
  'photovoltaïque',
  'rénovation générale',
  'bornes IRVE',
] as const;

/** Clés canoniques de la taxonomie — l'ensemble des tags qu'une page reconnaît. */
const TAXONOMY_KEYS = new Set(SERVICE_TAGS_TAXONOMY.map((t) => serviceTagKey(t)));

/**
 * `true` si aucune page du template ne reconnaît ce tag.
 *
 * Un tel tag est *silencieusement* nuisible : il ne provoque aucune erreur, il
 * masque juste la page du service concerné. « Autorisé » ne veut donc pas dire
 * « fonctionne » — d'où ce troisième état, distinct de l'allowlist.
 */
export const isServiceTagKnownToTemplate = (tag: string): boolean =>
  TAXONOMY_KEYS.has(serviceTagKey(tag));

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
 * Réécrit une liste de tags en remplaçant `sources` par `target`.
 *
 * C'est une FUSION, pas un renommage : une entreprise peut très bien porter à
 * la fois « rénovation » et « Rénovation générale » (l'enrichissement a posé le
 * premier, un humain le second). Un simple remplacement produirait alors deux
 * entrées identiques dans le tableau, que la fiche afficherait en doublon. On
 * dédoublonne donc par clé canonique.
 *
 * L'ordre d'origine est conservé et `target` prend la place de la PREMIÈRE
 * source rencontrée : sur un template qui lit `service_tags` de haut en bas
 * (« du plus mis en avant au moins »), réordonner changerait silencieusement la
 * hiérarchie des services affichés sur le site.
 *
 * Comparaison par `serviceTagKey` de bout en bout, sinon fusionner
 * « rénovation » laisserait passer « Rénovation ».
 */
export function applyServiceTagMerge(
  tags: readonly string[],
  sources: Iterable<string>,
  target: string,
): { tags: string[]; changed: boolean } {
  const targetKey = serviceTagKey(target);
  // Cible illisible : on ne touche à rien plutôt que d'effondrer les tags
  // réécrits sur une clé vide.
  if (!targetKey) return { tags: [...tags], changed: false };

  const rewriteKeys = new Set(
    Array.from(sources)
      .map((s) => serviceTagKey(s))
      .filter(Boolean),
  );
  /**
   * La cible est TOUJOURS réécrite vers sa graphie de référence, même si elle ne
   * fait pas partie des sources.
   *
   * Deux raisons. D'abord ça rend le cas « même clé, graphie différente »
   * possible : unifier `pompe-a-chaleur` et « POMPE À CHALEUR » sur « Pompe à
   * chaleur » est une demande légitime, et la traiter comme un no-op au motif que
   * la clé canonique ne bouge pas serait absurde. Ensuite ça évite qu'une fusion
   * laisse derrière elle le désordre de graphies que `collectServiceTags` doit
   * ensuite arbitrer au petit bonheur (« le premier libellé rencontré »).
   */
  rewriteKeys.add(targetKey);

  const out: string[] = [];
  const seen = new Set<string>();

  for (const raw of tags) {
    const tag = typeof raw === 'string' ? raw.trim() : '';
    const key = serviceTagKey(tag);
    if (!key) continue; // entrée vide : nettoyée au passage
    const hit = rewriteKeys.has(key);
    const finalKey = hit ? targetKey : key;
    if (seen.has(finalKey)) continue; // doublon absorbé
    seen.add(finalKey);
    out.push(hit ? target : tag);
  }

  // `changed` se déduit du résultat, pas des branches parcourues : c'est ce
  // décompte qui est annoncé à l'écran avant application, il ne doit pas pouvoir
  // signaler une modification qui n'en est pas une.
  const changed = out.length !== tags.length || out.some((t, i) => t !== tags[i]);
  return { tags: out, changed };
}

/**
 * Réécrit les `service_tag` isolés enfouis dans une structure JSON.
 *
 * Le CRM stocke des tags à DEUX formes. Les entreprises, la médiathèque et les
 * snapshots portent un tableau de tags — c'est `applyServiceTagMerge`. Mais le
 * côté auteur porte un tag SCALAIRE, dans un champ `service_tag`, enfoui dans du
 * JSONB : `sites.sitemap` (une page qui 404 si l'entreprise n'a pas le tag),
 * `site_section_instances.content` (un bloc masqué), `section_project_pages.sections`.
 *
 * Ces champs-là décident de la visibilité EN SENS INVERSE : ils déclarent « je
 * suis réservé au tag X » et sont comparés aux tags de l'entreprise. Une fusion
 * qui ne les toucherait pas ne serait pas incomplète, elle serait NUISIBLE : en
 * renommant « rénovation » côté entreprise, elle ferait disparaître les pages et
 * blocs composés à la main pour « rénovation », qui matchaient jusque-là.
 *
 * La marche est volontairement bête — seules les valeurs chaîne sous une clé
 * nommée exactement `service_tag` sont réécrites — pour ne dépendre d'aucune
 * forme précise du document, qui varie selon le builder qui l'a écrit.
 */
export function rewriteNestedServiceTag(
  value: unknown,
  sources: Iterable<string>,
  target: string,
): { value: unknown; changed: boolean } {
  const targetKey = serviceTagKey(target);
  if (!targetKey) return { value, changed: false };

  const rewriteKeys = new Set(
    Array.from(sources)
      .map((s) => serviceTagKey(s))
      .filter(Boolean),
  );
  rewriteKeys.add(targetKey); // même normalisation de graphie que la fusion de tableaux

  let changed = false;

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== 'object') return node;

    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      if (key === 'service_tag' && typeof child === 'string') {
        const childKey = serviceTagKey(child);
        if (childKey && rewriteKeys.has(childKey) && child !== target) {
          out[key] = target;
          changed = true;
          continue;
        }
        out[key] = child;
        continue;
      }
      out[key] = walk(child);
    }
    return out;
  };

  const next = walk(value);
  return { value: changed ? next : value, changed };
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
