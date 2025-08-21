export interface Employee {
  id: string;
  nom?: string;
  prenom?: string;
  email?: string;
  tel?: string;
  poste?: string;
  entreprise_id: number;
}

export interface QualifiedCompaniesPageProps {
  onContactClick?: (companyId: number) => void;
}

export const QUALIFIED_COMPANIES_CONSTANTS = {
  ITEMS_PER_PAGE: 12,
  MAX_VISIBLE_EMPLOYEES: 3,
  MAX_VISIBLE_TAGS: 3,
  MAX_VISIBLE_EMPLOYEES_LIST: 2
} as const;