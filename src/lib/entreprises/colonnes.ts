/**
 * Colonnes de `entreprises` lues par le CRM, partagées entre le navigateur
 * (`src/utils/api.tsx`) et les routes serveur (`/api/entreprises/*`).
 *
 * Elles vivaient dans `api.tsx`, donc dans un module « use client ». Les routes
 * qui servent désormais le périmètre et la recherche ont besoin de la même
 * liste : la dupliquer, c'était garantir qu'elle diverge à la première colonne
 * ajoutée, et qu'une fiche revienne du serveur amputée d'un champ que l'écran
 * attend.
 */

/**
 * Colonnes d'archivage, communes à `entreprises` et `opportunites`. Lues par les
 * vues (masquer et badger les fiches archivées) mais jamais écrites depuis le
 * navigateur : seule `/api/archive` les modifie.
 */
export const ARCHIVE_COLUMNS = [
  'archived_at',
  'archived_by',
  'archive_reason',
  'archive_note',
  'archive_concurrent_id',
] as const;

export const COMPANY_COLUMNS = [
  'id',
  'canonical_url',
  'name',
  'adresse',
  'lat',
  'lng',
  'premiers_tags',
  'service_tags',
  'sources',
  'raw_ids',
  'qualifie',
  'hidden_in_qualification',
  'created_at',
  'updated_at',
  'ca_estime_band',
  'nb_employes_band',
  'nb_employes_exact',
  'linkedin_url',
  'site_web_canonique',
  'manually_enriched',
  'enriched_at',
  'enriched_by',
  'reseau_id',
  'telephone',
  'email',
  'note_moyenne',
  'nombre_avis',
  'ville',
  'code_postal',
  'pays',
  'logo_url',
  ...ARCHIVE_COLUMNS,
] as const;

export const COMPANY_SELECT = COMPANY_COLUMNS.join(',');

/**
 * Projection réduite des sélecteurs et de la recherche (Cmd+K, formulaire de
 * contact, sélecteur de RDV). Une entreprise pèse ~2 ko sur les 33 colonnes ;
 * un menu déroulant n'a besoin que de quoi afficher une ligne et poser un lien.
 */
export const COMPANY_SEARCH_COLUMNS = [
  'id',
  'name',
  'canonical_url',
  'site_web_canonique',
  'ville',
  'code_postal',
  'telephone',
  'email',
  'qualifie',
  'logo_url',
] as const;

export const COMPANY_SEARCH_SELECT = COMPANY_SEARCH_COLUMNS.join(',');

/** Une ligne telle que la renvoie `/api/entreprises/recherche`. */
export type CompanySearchResult = {
  id: number;
  name: string | null;
  canonical_url: string | null;
  site_web_canonique: string | null;
  ville: string | null;
  code_postal: string | null;
  telephone: string | null;
  email: string | null;
  qualifie: boolean | null;
  logo_url: string | null;
};

/** Compteurs de stock renvoyés par la RPC `entreprises_compteurs()`. */
export type CompteursEntreprises = {
  a_qualifier: number;
  qualifiees: number;
  masquees: number;
  archivees: number;
  stock_total: number;
};

export const COMPTEURS_VIDES: CompteursEntreprises = {
  a_qualifier: 0,
  qualifiees: 0,
  masquees: 0,
  archivees: 0,
  stock_total: 0,
};
