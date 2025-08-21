import { PageType } from './types';

export interface PageConfig {
  id: PageType;
  title: string;
  getTitle?: (context?: any) => string;
  requiresAuth: boolean;
  showInSidebar: boolean;
}

export const pageConfigs: Record<PageType, PageConfig> = {
  dashboard: {
    id: 'dashboard',
    title: 'Dashboard',
    requiresAuth: true,
    showInSidebar: true
  },
  results: {
    id: 'results',
    title: 'Résultats',
    requiresAuth: true,
    showInSidebar: true
  },
  'new-search': {
    id: 'new-search',
    title: 'Nouvelle Recherche',
    requiresAuth: true,
    showInSidebar: true
  },
  'all-companies': {
    id: 'all-companies',
    title: 'Toutes les entreprises',
    getTitle: (selectedCompanyId?: number) => 
      selectedCompanyId ? 'Détail entreprise' : 'Toutes les entreprises',
    requiresAuth: true,
    showInSidebar: true
  },
  qualification: {
    id: 'qualification',
    title: 'Qualification',
    requiresAuth: true,
    showInSidebar: true
  },
  qualified: {
    id: 'qualified',
    title: 'Entreprises Qualifiées',
    getTitle: (selectedQualifiedCompanyId?: number) => 
      selectedQualifiedCompanyId ? 'Détail entreprise qualifiée' : 'Entreprises Qualifiées',
    requiresAuth: true,
    showInSidebar: true
  },
  contacts: {
    id: 'contacts',
    title: 'Contacts',
    getTitle: (selectedEmployeeId?: string) => 
      selectedEmployeeId ? 'Détail contact' : 'Contacts',
    requiresAuth: true,
    showInSidebar: true
  },
  opportunities: {
    id: 'opportunities',
    title: 'Opportunités',
    requiresAuth: true,
    showInSidebar: true
  },
  pipeline: {
    id: 'pipeline',
    title: 'Pipeline',
    requiresAuth: true,
    showInSidebar: true
  },
  objectives: {
    id: 'objectives',
    title: 'Objectifs & Progression',
    requiresAuth: true,
    showInSidebar: true
  },
  settings: {
    id: 'settings',
    title: 'Paramètres',
    requiresAuth: true,
    showInSidebar: true
  },
  create: {
    id: 'create',
    title: 'Créer',
    requiresAuth: true,
    showInSidebar: true
  }
};

export const getPageTitle = (
  pageId: PageType, 
  selectedCompanyId?: number | null,
  selectedQualifiedCompanyId?: number | null,
  selectedEmployeeId?: string | null
): string => {
  const config = pageConfigs[pageId];
  
  if (config.getTitle) {
    switch (pageId) {
      case 'all-companies':
        return config.getTitle(selectedCompanyId);
      case 'qualified':
        return config.getTitle(selectedQualifiedCompanyId);
      case 'contacts':
        return config.getTitle(selectedEmployeeId);
      default:
        return config.getTitle();
    }
  }
  
  return config.title;
};