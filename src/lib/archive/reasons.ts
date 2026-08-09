/**
 * Vocabulaire des motifs d'archivage — partagé entre l'UI et les routes API.
 *
 * Module volontairement isomorphe : aucune dépendance Supabase ni navigateur,
 * pour qu'un composant client et une route serveur importent exactement la même
 * liste. La contrainte `check (archive_reason in (…))` de
 * `sql/20260809_archivage_motive_et_concurrents.sql` doit rester identique à
 * `ARCHIVE_REASON_VALUES` ; c'est ce que vérifie `__tests__/reasons.test.ts`.
 */

export const ARCHIVE_REASONS = [
  { value: 'refait_par_concurrent', label: 'A refait son site avec un concurrent', needsConcurrent: true },
  { value: 'refait_en_interne', label: 'A refait son site lui-même' },
  { value: 'site_deja_bon', label: 'Site déjà bon — rien à vendre' },
  { value: 'pas_de_budget', label: 'Pas de budget' },
  { value: 'pas_interesse', label: 'Pas intéressé' },
  { value: 'injoignable', label: 'Injoignable' },
  { value: 'ferme', label: 'Établissement fermé / radié' },
  { value: 'hors_cible', label: 'Hors cible' },
  { value: 'doublon', label: 'Doublon' },
  { value: 'deja_client', label: 'Devenu client' },
  { value: 'autre', label: 'Autre' },
] as const satisfies readonly { value: string; label: string; needsConcurrent?: boolean }[];

export type ArchiveReason = (typeof ARCHIVE_REASONS)[number]['value'];

/** Les valeurs seules — la forme qu'attend `z.enum(...)`. */
export const ARCHIVE_REASON_VALUES = ARCHIVE_REASONS.map((r) => r.value) as unknown as [
  ArchiveReason,
  ...ArchiveReason[],
];

export const ARCHIVE_REASON_LABEL = Object.fromEntries(
  ARCHIVE_REASONS.map((r) => [r.value, r.label]),
) as Record<ArchiveReason, string>;

/** Libellé affichable, avec repli sur la valeur brute si la base a dérivé. */
export const archiveReasonLabel = (reason: string | null | undefined): string =>
  (reason && ARCHIVE_REASON_LABEL[reason as ArchiveReason]) || reason || '';

/** Seul « refait par un concurrent » exige de dire lequel. */
export const reasonNeedsConcurrent = (reason: string | null | undefined): boolean =>
  ARCHIVE_REASONS.some((r) => r.value === reason && 'needsConcurrent' in r && r.needsConcurrent);

/**
 * `canonicalizeDomain` ne valide rien : « pas une url » ressort tel quel. Sans
 * ce garde-fou, le registre des concurrents se remplirait de saisies libres.
 * On exige donc au moins un point, aucun espace, et des labels DNS plausibles.
 */
export const isPlausibleDomain = (domain: string): boolean =>
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain);

export const STATUTS_CONCURRENT = [
  { value: 'a_qualifier', label: 'À qualifier' },
  { value: 'a_demarcher', label: 'À démarcher' },
  { value: 'contacte', label: 'Contacté' },
  { value: 'partenaire', label: 'Partenaire' },
  { value: 'ecarte', label: 'Écarté' },
] as const;

export type StatutConcurrent = (typeof STATUTS_CONCURRENT)[number]['value'];

export const STATUT_CONCURRENT_VALUES = STATUTS_CONCURRENT.map((s) => s.value) as unknown as [
  StatutConcurrent,
  ...StatutConcurrent[],
];

export const STATUT_CONCURRENT_LABEL = Object.fromEntries(
  STATUTS_CONCURRENT.map((s) => [s.value, s.label]),
) as Record<StatutConcurrent, string>;
