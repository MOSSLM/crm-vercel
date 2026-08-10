export const CACHE_TTL_MS = 30 * 60 * 1000;
export const REQUEST_TIMEOUT_MS = 30_000;
export const CACHE_KEY = 'crm_data_cache_v1';
export const AUDIT_PREVIEW_DEBOUNCE_MS = 150;
export const PRINT_DELAY_MS = 1000;
export const LIST_QUERY_LIMIT = 500;

/**
 * Combien de sites au maximum on fait mesurer par Google en une fois.
 *
 * Quarante secondes par site : dix, c'est déjà sept minutes d'attente. Au-delà
 * on n'outille plus un démarchage, on balaye un parc — et on vide un quota
 * journalier pour des entreprises qu'on n'appellera pas cette semaine.
 *
 * Partagé entre le bouton, qui l'annonce dans son infobulle, et le traitement,
 * qui l'applique. Deux copies finiraient par se contredire, et c'est l'infobulle
 * qui mentirait.
 */
export const MAX_PSI_PAR_LOT = 10;
