"use client";

export type PageType = 
  | 'dashboard'
  | 'results' 
  | 'new-search'
  | 'all-companies'
  | 'qualification'
  | 'qualified'
  | 'contacts'
  | 'opportunities'
  | 'pipeline'
  | 'objectives'
  | 'settings'
  | 'create';

export interface NavigationState {
  currentPage: PageType;
  selectedCompanyId: number | null;
  selectedQualifiedCompanyId: number | null;
  selectedEmployeeId: string | null;
}

export interface NavigationActions {
  setCurrentPage: (page: PageType) => void;
  setSelectedCompanyId: (id: number | null) => void;
  setSelectedQualifiedCompanyId: (id: number | null) => void;
  setSelectedEmployeeId: (id: string | null) => void;
  resetSelections: () => void;
  navigateBack: (page: PageType) => void;
}

export type NavigationContextType = NavigationState & NavigationActions;