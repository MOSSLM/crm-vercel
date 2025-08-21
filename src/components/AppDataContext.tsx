"use client";
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import { searchResultsApi, companiesApi, contactsApi, opportunitiesApi, pipelineStagesApi, notesApi, achievementsApi, statisticsApi } from '../utils/api';
import { getCompanyDisplayName, extractDomainNameOnly } from '../utils/displayHelpers';

// Interfaces adaptées aux schémas Supabase
export interface SearchResult {
  id: string;
  created_at: string;
  keyword: string;
  location: string;
  precision: string;
  source_google: boolean;
  source_maps: boolean;
  status: 'pending' | 'completed' | 'failed';
  nb_trouves: number;
  nb_qualifies: number;
  // Interface compatibility properties (computed from database fields)
  useMaps?: boolean;
  useGoogle?: boolean;
  totalCompanies?: number;
  qualifiedCompanies?: number;
  date?: string;
}

export interface CompanyRaw {
  id: number;
  recherche_id: string;
  source: 'google_search' | 'google_maps';
  position?: number;
  page?: number;
  title?: string;
  meta?: string;
  url?: string;
  keyword: string;
  location: string;
  name?: string;
  avis?: number;
  nombre_avis?: number;
  tags?: string;
  adresse?: string;
  lat?: number;
  lng?: number;
  telephone?: string;
  ferme_definitivement: boolean;
  raw_json?: any;
  inserted_at: string;
}

// Revenue and employee band enums
export type RevenueBand = 'unknown' | '0-100k' | '100k-500k' | '500k-1m' | '1m-5m' | '5m-10m' | '10m-50m' | '50m+';
export type EmployeeBand = 'unknown' | '1-10' | '11-50' | '51-200' | '201-500' | '501-1000' | '1000+';

// Enhanced Company interface with new fields
export interface Company {
  id: number;
  canonical_url?: string;
  name?: string;
  adresse?: string;
  lat?: number;
  lng?: number;
  premiers_tags?: string;
  sources: string[];
  raw_ids: number[];
  qualifie: boolean;
  created_at: string;
  updated_at: string;
  // New enrichment fields
  ca_estime_band?: RevenueBand;
  nb_employes_band?: EmployeeBand;
  nb_employes_exact?: number;
  linkedin_url?: string;
  site_web_canonique?: string;
  manually_enriched?: boolean;
  enriched_at?: string;
  enriched_by?: string;
  // Propriétés supplémentaires pour la page de détail (lecture seule)
  recherche_id?: string;
  place_id?: string;
  reference_url?: string;
  position?: number;
  note_moyenne?: number;
  nombre_avis?: number;
  ville?: string;
  code_postal?: string;
  pays?: string;
  latitude?: number;
  longitude?: number;
  // Contact info from raw data
  telephone?: string;
  email?: string;
  contact_name?: string;
  raw_contact_info?: CompanyRaw[];
}

// Contact interface matching real database schema
export interface Contact {
  id: string;
  entreprise_id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  tel?: string;
  role_title?: string;
  linkedin_url?: string;
  is_decision_maker?: boolean;
  preferred_channel?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  // Données étendues pour l'interface (computed/joined fields)
  companyName?: string;
  website?: string;
  address?: string;
  tags?: string[];
  source?: 'google_search' | 'google_maps';
  dateQualified?: string;
  rating?: number;
  // Legacy virtual fields for backward compatibility
  nom?: string;
  prenom?: string;
  poste?: string;
  linkedin?: string;
}

export interface ContactNote {
  id: number;
  contact_id: string;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface OpportunityNote {
  id: number;
  opportunite_id: string;
  theme: 'appel' | 'linkedin' | 'whatsapp' | 'email' | 'autre';
  contenu?: string;
  created_at: string;
}

export interface PipelineStage {
  id: number;
  nom: string;
  ordre: number;
  visible: boolean;
}

export interface Opportunity {
  id: string;
  contact_id?: string;
  entreprise_id?: number;
  montant?: number;
  priorite: 'haute' | 'moyenne' | 'basse';
  stage_id?: number;
  lead_magnet: boolean;
  note_base?: string;
  tags?: string;
  date_prochain_suivi?: string;
  created_at: string;
  updated_at: string;
  // New fields from database schema
  name?: string;
  type?: 'one_shot' | 'mrr';
  mrr?: number;
  recurrence_months?: number;
  // Données étendues pour l'interface
  companyName?: string;
  companyUrl?: string;
  contactId?: string;
  stage?: string;
  value?: number;
  priority?: 'low' | 'medium' | 'high';
  notes?: string;
  createdDate?: string;
  lastUpdate?: string;
  nextFollowUp?: string;
  opportunityNotes?: OpportunityNote[];
  pipelineHistory?: any[];
  leadMagnet?: boolean;
  leadMagnetCreatedDate?: string;
  // Contact information for display
  telephone?: string;
  email?: string;
  linkedin_url?: string;
  contact_name?: string;
}

export interface Achievement {
  id: number;
  date: string;
  type_evenement?: string;
  description?: string;
  opportunite_id?: string;
  entreprise_id?: number;
  // Propriétés étendues pour l'interface
  type?: 'signature' | 'deposit' | 'lead_magnet' | 'qualified' | 'meeting' | 'monthly_goal';
  title?: string;
  value?: number;
  companyName?: string;
}

// Interface pour la table objectifs Supabase
export interface SupabaseObjectives {
  periode: string;
  leads_trouves?: number;
  leads_qualifies?: number;
  appels?: number;
  rdv?: number;
  devis?: number;
  relances?: number;
  signatures?: number;
  acomptes?: number;
  leadmagnets?: number;
  relances_total?: number;
  ca?: number;
}

// Interface unifiée pour l'interface utilisateur
export interface Objectives {
  periode: string;
  leadsFound: number;
  leadsQualified: number;
  calls: number;
  meetings: number;
  quotes: number;
  signatures: number;
  deposits: number;
  leadMagnets: number;
  relances: number;
  revenue: number;
}

// Type alias pour compatibilité avec l'interface existante
export type MonthlyObjectives = Objectives;
export type WeeklyObjectives = Objectives;
export type AnnualObjectives = Objectives;

/* ----------------------------------------------------------------
   ✅ Bloc 1 — Clés valides + types sécurisés pour insert/update
----------------------------------------------------------------- */
export const VALID_OPPORTUNITY_COLUMNS = [
  "contact_id",
  "entreprise_id",
  "montant",
  "priorite",
  "stage_id",
  "lead_magnet",
  "note_base",
  "tags",
  "date_prochain_suivi",
  "name",
  "type",
  "mrr",
  "recurrence_months",
] as const;

type ValidOpportunityColumn = (typeof VALID_OPPORTUNITY_COLUMNS)[number];
type OpportunityWritable = Omit<Opportunity, "id" | "created_at" | "updated_at">;
type OpportunityInsert = Partial<Pick<Opportunity, ValidOpportunityColumn>>;

interface AppDataContextType {
  // Existing data
  searchResults: SearchResult[];
  companies: Company[];
  contacts: Contact[];
  opportunities: Opportunity[];
  pipelineStages: PipelineStage[];
  
  // Computed values
  totalCompanies: number;
  totalQualifiedCompanies: number;
  keywordStats: Record<string, number>;
  locationStats: Record<string, number>;
  
  // Objectives and gamification
  currentObjectives: MonthlyObjectives;
  weeklyObjectives: WeeklyObjectives;
  annualObjectives: AnnualObjectives;
  achievements: Achievement[];
  
  // New: Commercial metrics
  getTotalRelances: () => number;
  getTotalAppels: () => number;
  getTotalRdv: () => number;
  getTotalDevis: () => number;
  getTotalSignatures: () => number;
  getTotalAcomptes: () => number;
  
  // Loading states
  loading: boolean;
  
  // Methods
  addSearchResult: (result: Omit<SearchResult, 'id' | 'created_at'>) => Promise<void>;
  addCompany: (company: Omit<Company, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateCompany: (id: number, updates: Partial<Company>) => Promise<void>;
  deleteCompany: (id: number) => Promise<void>;
  qualifyCompany: (companyId: number) => Promise<void>;
  unqualifyCompany: (companyId: number) => Promise<void>;
  addContact: (contact: Omit<Contact, 'id'>) => Promise<void>;
  updateContact: (id: string, updates: Partial<Contact>) => Promise<void>;
  addOpportunity: (opportunity: Omit<Opportunity, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  updateOpportunity: (id: string, updates: Partial<Opportunity>) => Promise<void>;
  moveOpportunityToStage: (opportunityId: string, stageId: number) => Promise<void>;
  getOpportunitiesByStage: (stageId: number) => Opportunity[];
  addOpportunityNote: (opportunityId: string, note: Omit<OpportunityNote, 'id' | 'created_at'>) => Promise<void>;
  
  // Contact notes methods
  addContactNote: (contactId: string, note: string) => Promise<void>;
  getContactNotes: (contactId: string) => Promise<ContactNote[]>;
  updateContactNote: (noteId: number, note: string) => Promise<void>;
  deleteContactNote: (noteId: number) => Promise<void>;
  
  // Search detail methods
  getCompaniesBySearchId: (searchId: string) => Company[];
  getMapCompanies: (searchId: string) => Company[];
  getGoogleCompanies: (searchId: string) => Company[];
  
  // New methods for lead magnet and objectives
  toggleLeadMagnet: (opportunityId: string) => Promise<void>;
  updateObjectives: (objectives: Partial<Objectives>) => Promise<void>;
  updateWeeklyObjectives: (objectives: Partial<Objectives>) => Promise<void>;
  updateAnnualObjectives: (objectives: Partial<Objectives>) => Promise<void>;
  checkAndTriggerAchievements: () => void;
  
  // Data refresh
  refreshData: () => Promise<void>;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

const getCurrentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const getCurrentWeek = () => {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const pastDaysOfYear = (now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000);
  const weekNumber = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
};

const getCurrentYear = () => {
  return new Date().getFullYear().toString();
};

// Fonction pour convertir les objectifs Supabase vers l'interface utilisateur
const supabaseToUiObjectives = (supabaseData: SupabaseObjectives): Objectives => {
  return {
    periode: supabaseData.periode,
    leadsFound: supabaseData.leads_trouves || 0,
    leadsQualified: supabaseData.leads_qualifies || 0,
    calls: supabaseData.appels || 0,
    meetings: supabaseData.rdv || 0,
    quotes: supabaseData.devis || 0,
    signatures: supabaseData.signatures || 0,
    deposits: supabaseData.acomptes || 0,
    leadMagnets: supabaseData.leadmagnets || 0,
    relances: supabaseData.relances_total || 0,
    revenue: supabaseData.ca || 0
  };
};

// Fonction pour convertir les objectifs UI vers Supabase
const uiToSupabaseObjectives = (uiData: Partial<Objectives>): Partial<SupabaseObjectives> => {
  const result: Partial<SupabaseObjectives> = {};
  
  if (uiData.periode !== undefined) result.periode = uiData.periode;
  if (uiData.leadsFound !== undefined) result.leads_trouves = uiData.leadsFound;
  if (uiData.leadsQualified !== undefined) result.leads_qualifies = uiData.leadsQualified;
  if (uiData.calls !== undefined) result.appels = uiData.calls;
  if (uiData.meetings !== undefined) result.rdv = uiData.meetings;
  if (uiData.quotes !== undefined) result.devis = uiData.quotes;
  if (uiData.signatures !== undefined) result.signatures = uiData.signatures;
  if (uiData.deposits !== undefined) result.acomptes = uiData.deposits;
  if (uiData.leadMagnets !== undefined) result.leadmagnets = uiData.leadMagnets;
  if (uiData.relances !== undefined) result.relances_total = uiData.relances;
  if (uiData.revenue !== undefined) result.ca = uiData.revenue;
  
  return result;
};

const getDefaultObjectives = (periode: string): Objectives => ({
  periode,
  leadsFound: 50,
  leadsQualified: 20,
  calls: 100,
  meetings: 10,
  quotes: 8,
  signatures: 5,
  deposits: 3,
  leadMagnets: 15,
  relances: 60,
  revenue: 12500
});

const getDefaultWeeklyObjectives = (): Objectives => ({
  periode: getCurrentWeek(),
  leadsFound: 12,
  leadsQualified: 5,
  calls: 25,
  meetings: 2,
  quotes: 2,
  signatures: 1,
  deposits: 1,
  leadMagnets: 4,
  relances: 15,
  revenue: 3000
});

const getDefaultAnnualObjectives = (): Objectives => ({
  periode: getCurrentYear(),
  leadsFound: 600,
  leadsQualified: 240,
  calls: 1200,
  meetings: 120,
  quotes: 96,
  signatures: 60,
  deposits: 36,
  leadMagnets: 180,
  relances: 720,
  revenue: 150000
});

// Utility function to sync interface and database properties
const syncOpportunityProperties = (opportunity: Partial<Opportunity>, updates: Partial<Opportunity>) => {
  return {
    ...opportunity,
    ...updates,
    // Sync database fields with interface fields
    value: updates.montant !== undefined ? updates.montant : (updates.value !== undefined ? updates.value : opportunity.value),
    montant: updates.value !== undefined ? updates.value : (updates.montant !== undefined ? updates.montant : opportunity.montant),
    priority: updates.priorite || updates.priority || opportunity.priority,
    priorite: updates.priority === 'high' ? 'haute' : (updates.priority === 'low' ? 'basse' : (updates.priority === 'medium' ? 'moyenne' : (updates.priorite || opportunity.priorite))),
    notes: updates.note_base || updates.notes || opportunity.notes,
    note_base: updates.notes || updates.note_base || opportunity.note_base,
    leadMagnet: updates.lead_magnet !== undefined ? updates.lead_magnet : (updates.leadMagnet !== undefined ? updates.leadMagnet : opportunity.leadMagnet),
    lead_magnet: updates.leadMagnet !== undefined ? updates.leadMagnet : (updates.lead_magnet !== undefined ? updates.lead_magnet : opportunity.lead_magnet),
    updated_at: new Date().toISOString()
  };
};

// Debounce utility for preventing too frequent updates
const debounce = (func: Function, wait: number) => {
  let timeout: NodeJS.Timeout;
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const AppDataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated, loading: authLoading } = useAuth();
  
  // State
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [currentObjectives, setCurrentObjectives] = useState<Objectives>(getDefaultObjectives(getCurrentMonth()));
  const [weeklyObjectives, setWeeklyObjectives] = useState<Objectives>(getDefaultWeeklyObjectives());
  const [annualObjectives, setAnnualObjectives] = useState<Objectives>(getDefaultAnnualObjectives());
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(false);
  const [keywordStats, setKeywordStats] = useState<Record<string, number>>({});
  const [locationStats, setLocationStats] = useState<Record<string, number>>({});

  // Load data from API when authenticated
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      refreshData();
    }
  }, [isAuthenticated, authLoading]);

  const refreshData = async () => {
    setLoading(true);
    try {
      const [
        searchResultsData,
        companiesData,
        contactsData,
        opportunitiesData,
        pipelineStagesData,
        achievementsData,
        keywordStatsData,
        locationStatsData
      ] = await Promise.all([
        searchResultsApi.getAll(),
        companiesApi.getAll(),
        contactsApi.getAll(),
        opportunitiesApi.getAll(),
        pipelineStagesApi.getAll(),
        achievementsApi.getAll(),
        statisticsApi.getKeywordStats(),
        statisticsApi.getLocationStats()
      ]);

      // Map search results to include compatibility properties
      const mappedSearchResults = searchResultsData.map(result => ({
        ...result,
        // Compatibility properties for existing interface
        useMaps: result.source_maps,
        useGoogle: result.source_google,
        totalCompanies: result.nb_trouves,
        qualifiedCompanies: result.nb_qualifies,
        date: result.created_at
      }));

      setSearchResults(mappedSearchResults);
      setCompanies(companiesData);
      setContacts(contactsData);
      setOpportunities(opportunitiesData);
      setPipelineStages(pipelineStagesData);
      setAchievements(achievementsData);
      setKeywordStats(keywordStatsData);
      setLocationStats(locationStatsData);
      
      // Keep default objectives for backward compatibility
      // The new KPI system will handle objectives separately
      setCurrentObjectives(getDefaultObjectives(getCurrentMonth()));
      setWeeklyObjectives(getDefaultWeeklyObjectives());
      setAnnualObjectives(getDefaultAnnualObjectives());
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  // Computed values
  const totalCompanies = companies.length;
  const totalQualifiedCompanies = companies.filter(c => c.qualifie).length;

  // LOGIQUE CORRIGÉE POUR ACCUMULER LES ACTIONS (JAMAIS DE DÉCRÉMENTATION)
  
  // Fonction pour calculer les actions cumulées basées sur l'étape la plus avancée atteinte
  const calculateCumulativeActionsFromPipeline = (opportunity: Opportunity) => {
    const actions = {
      relances: 0,
      appels: 0,
      rdv: 0,
      devis: 0,
      signatures: 0,
      acomptes: 0
    };

    const currentStage = pipelineStages.find(s => s.id === opportunity.stage_id);
    if (!currentStage) return actions;

    const stageOrder = currentStage.ordre;

    // PRINCIPE : On regarde toutes les étapes passées ET l'étape actuelle pour accumuler les actions
    const passedStages = pipelineStages
      .filter(stage => stage.ordre <= stageOrder)
      .sort((a, b) => a.ordre - b.ordre);

    passedStages.forEach(stage => {
      const name = stage.nom.toLowerCase();

      // APPELS
      if (name.includes('cold') || name.includes('relance') || name.includes('rdv') || 
          name.includes('vente') || name.includes('devis') || name.includes('signature') || name.includes('acompte')) {
        actions.appels = Math.max(actions.appels, 1);
      }

      // RELANCES
      if (name.includes('relance')) {
        const relanceMatch = name.match(/relance\s*(\d+)/i);
        if (relanceMatch) {
          actions.relances = Math.max(actions.relances, parseInt(relanceMatch[1]));
        } else {
          actions.relances = Math.max(actions.relances, 1);
        }
      }

      // RDV
      if (name.includes('rdv') || name.includes('vente')) {
        const rdvMatch = name.match(/(?:rdv|vente).*?(\d+)/i);
        if (rdvMatch) {
          actions.rdv = Math.max(actions.rdv, parseInt(rdvMatch[1]));
        } else {
          actions.rdv = Math.max(actions.rdv, 1);
        }
      }

      // DEVIS
      if (name.includes('devis') || name.includes('signature') || name.includes('acompte')) {
        actions.devis = Math.max(actions.devis, 1);
      }

      // SIGNATURES
      if (name.includes('signature') || name.includes('acompte')) {
        actions.signatures = Math.max(actions.signatures, 1);
      }

      // ACOMPTES
      if (name.includes('acompte')) {
        actions.acomptes = Math.max(actions.acomptes, 1);
      }
    });

    return actions;
  };

  // Nouvelles fonctions de comptage qui accumulent les actions
  const getTotalRelances = (): number => {
    return opportunities.reduce((total, opp) => {
      const actions = calculateCumulativeActionsFromPipeline(opp);
      return total + actions.relances;
    }, 0);
  };

  const getTotalAppels = (): number => {
    return opportunities.reduce((total, opp) => {
      const actions = calculateCumulativeActionsFromPipeline(opp);
      return total + actions.appels;
    }, 0);
  };

  const getTotalRdv = (): number => {
    return opportunities.reduce((total, opp) => {
      const actions = calculateCumulativeActionsFromPipeline(opp);
      return total + actions.rdv;
    }, 0);
  };

  const getTotalDevis = (): number => {
    return opportunities.reduce((total, opp) => {
      const actions = calculateCumulativeActionsFromPipeline(opp);
      return total + actions.devis;
    }, 0);
  };

  const getTotalSignatures = (): number => {
    return opportunities.reduce((total, opp) => {
      const actions = calculateCumulativeActionsFromPipeline(opp);
      return total + actions.signatures;
    }, 0);
  };

  const getTotalAcomptes = (): number => {
    return opportunities.reduce((total, opp) => {
      const actions = calculateCumulativeActionsFromPipeline(opp);
      return total + actions.acomptes;
    }, 0);
  };

  // API Methods
  const addSearchResult = async (result: Omit<SearchResult, 'id' | 'created_at'>) => {
    try {
      const newResult = await searchResultsApi.create(result);
      // Add compatibility mapping
      const mappedResult = {
        ...newResult,
        useMaps: newResult.source_maps,
        useGoogle: newResult.source_google,
        totalCompanies: newResult.nb_trouves,
        qualifiedCompanies: newResult.nb_qualifies,
        date: newResult.created_at
      };
      setSearchResults(prev => [...prev, mappedResult]);
      toast.success('Recherche ajoutée avec succès');
    } catch (error) {
      console.error('Error adding search result:', error);
      toast.error('Erreur lors de l\'ajout de la recherche');
    }
  };

  const addCompany = async (company: Omit<Company, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const newCompany = await companiesApi.create(company);
      setCompanies(prev => [...prev, newCompany]);
      toast.success('Entreprise ajoutée avec succès');
    } catch (error) {
      console.error('Error adding company:', error);
      toast.error('Erreur lors de l\'ajout de l\'entreprise');
    }
  };

  const updateCompany = async (id: number, updates: Partial<Company>) => {
    try {
      const updatedCompany = await companiesApi.update(id, updates);
      setCompanies(prev => prev.map(company => 
        company.id === id ? { ...company, ...updatedCompany } : company
      ));
    } catch (error) {
      console.error('Error updating company:', error);
      toast.error('Erreur lors de la mise à jour de l\'entreprise');
    }
  };

  const deleteCompany = async (id: number) => {
    const company = companies.find(c => c.id === id);
    if (!company) return;

    try {
      await companiesApi.delete(id);
      
      // Remove company from local state
      setCompanies(prev => prev.filter(company => company.id !== id));
      
      // Remove associated contacts and opportunities
      setContacts(prev => prev.filter(contact => contact.entreprise_id !== id));
      setOpportunities(prev => prev.filter(opp => opp.entreprise_id !== id));
      
      const displayName = getCompanyDisplayName(company.name, company.canonical_url);
      toast.success(`${displayName} supprimée avec succès`);
    } catch (error) {
      console.error('Error deleting company:', error);
      toast.error('Erreur lors de la suppression de l\'entreprise');
    }
  };

  // Helper function to determine if phone number is mobile
  const isMobilePhone = (phone: string): boolean => {
    if (!phone) return false;
    const cleaned = phone.replace(/[^0-9+]/g, '');
    // Test for French mobile patterns: 06, 07, +336, +337, 336, 337
    return /^(06|07|\+336|\+337|336|337)/.test(cleaned);
  };

  // Helper function to generate opportunity name based on website presence
  const generateOpportunityName = (company: Company): string => {
    // Get company name, fallback to domain name only (without extension) if no company name
    let companyName = '';
    
    if (company.name && company.name.trim()) {
      companyName = company.name.trim();
    } else if (company.canonical_url) {
      // Extract just the domain name (without .com, .fr, etc.)
      companyName = extractDomainNameOnly(company.canonical_url);
    }
    
    // If still no name, use fallback
    if (!companyName) {
      companyName = 'Entreprise';
    }
    
    // Check if company has a website
    const hasWebsite = company.canonical_url && 
                       company.canonical_url.trim() !== '' && 
                       company.canonical_url !== 'N/A' &&
                       company.canonical_url !== 'null';
    
    if (hasWebsite) {
      return `${companyName} refonte de site web`;
    } else {
      return `${companyName} création de site web`;
    }
  };

  // Modified qualifyCompany - creates opportunity automatically with smart naming
  const qualifyCompany = async (companyId: number) => {
    const company = companies.find(c => c.id === companyId);
    if (!company || company.qualifie) return;

    try {
      // Only update company qualification - do not create contact
      await updateCompany(companyId, { qualifie: true });
      
      // Create achievement
      const achievement: Omit<Achievement, 'id'> = {
        date: new Date().toISOString(),
        type_evenement: 'qualified',
        description: `${getCompanyDisplayName(company.name, company.canonical_url)} a été qualifiée`,
        entreprise_id: company.id
      };
      
      try {
        const savedAchievement = await achievementsApi.create(achievement);
        setAchievements(prev => [...prev, savedAchievement]);
      } catch (achievementError) {
        console.error('Error creating achievement:', achievementError);
        // Continue even if achievement creation fails
      }

      // Create opportunity automatically
      const opportunityName = generateOpportunityName(company);
      const defaultStage = pipelineStages.find(stage => stage.ordre === 1) || pipelineStages[0];
      
      // Check if company has mobile phone number (French mobile patterns)
      const hasMobilePhone = company.telephone && isMobilePhone(company.telephone);
      
      const opportunity: Omit<Opportunity, 'id' | 'created_at' | 'updated_at'> = {
        entreprise_id: company.id,
        montant: 2500, // Default value of 2500 euros
        priorite: hasMobilePhone ? 'haute' : 'moyenne', // Higher priority if mobile phone available
        stage_id: defaultStage?.id,
        lead_magnet: false,
        note_base: `Opportunité créée automatiquement pour ${getCompanyDisplayName(company.name, company.canonical_url)}.${hasMobilePhone ? ' Numéro mobile disponible (' + company.telephone + ').' : ''}`,
        name: opportunityName,
        type: 'one_shot' // Default type
      };

      try {
        await addOpportunity(opportunity);
      } catch (opportunityError) {
        console.error('Error creating opportunity:', opportunityError);
        // Continue even if opportunity creation fails
      }
      
      const displayName = getCompanyDisplayName(company.name, company.canonical_url);
      toast.success(`${displayName} qualifiée avec succès ! Une opportunité "${opportunityName}" a été créée automatiquement.`);
    } catch (error) {
      console.error('Error qualifying company:', error);
      toast.error('Erreur lors de la qualification');
    }
  };

  const unqualifyCompany = async (companyId: number) => {
    const company = companies.find(c => c.id === companyId);
    if (!company || !company.qualifie) return;

    try {
      await updateCompany(companyId, { qualifie: false });

      // Remove associated contacts and opportunities
      const associatedContacts = contacts.filter(contact => contact.entreprise_id === companyId);
      const associatedOpportunities = opportunities.filter(opp => opp.entreprise_id === companyId);

      await Promise.all([
        ...associatedContacts.map(contact => contactsApi.delete(contact.id)),
        ...associatedOpportunities.map(opp => opportunitiesApi.delete(opp.id))
      ]);

      setContacts(prev => prev.filter(contact => contact.entreprise_id !== companyId));
      setOpportunities(prev => prev.filter(opp => opp.entreprise_id !== companyId));
      
      toast.success(`${company.name} déqualifiée`);
    } catch (error) {
      console.error('Error unqualifying company:', error);
      toast.error('Erreur lors de la déqualification');
    }
  };

  const addContact = async (contact: Omit<Contact, 'id'>) => {
    try {
      const newContact = await contactsApi.create(contact);
      setContacts(prev => [...prev, newContact]);
      toast.success('Contact ajouté avec succès');
    } catch (error) {
      console.error('Error adding contact:', error);
      toast.error('Erreur lors de l\'ajout du contact');
    }
  };

  const updateContact = async (id: string, updates: Partial<Contact>) => {
    try {
      const updatedContact = await contactsApi.update(id, updates);
      setContacts(prev => prev.map(contact => 
        contact.id === id ? { ...contact, ...updatedContact } : contact
      ));
    } catch (error) {
      console.error('Error updating contact:', error);
      toast.error('Erreur lors de la mise à jour du contact');
    }
  };

  // Contact notes methods
  const addContactNote = async (contactId: string, note: string) => {
    try {
      const newNote = await contactsApi.addNote(contactId, note);
      toast.success('Note ajoutée avec succès');
      return newNote;
    } catch (error) {
      console.error('Error adding contact note:', error);
      toast.error('Erreur lors de l\'ajout de la note');
      throw error;
    }
  };

  const getContactNotes = async (contactId: string): Promise<ContactNote[]> => {
    try {
      return await contactsApi.getNotes(contactId);
    } catch (error) {
      console.error('Error fetching contact notes:', error);
      return [];
    }
  };

  const updateContactNote = async (noteId: number, note: string) => {
    try {
      await contactsApi.updateNote(noteId, note);
      toast.success('Note mise à jour avec succès');
    } catch (error) {
      console.error('Error updating contact note:', error);
      toast.error('Erreur lors de la mise à jour de la note');
      throw error;
    }
  };

  const deleteContactNote = async (noteId: number) => {
    try {
      await contactsApi.deleteNote(noteId);
      toast.success('Note supprimée avec succès');
    } catch (error) {
      console.error('Error deleting contact note:', error);
      toast.error('Erreur lors de la suppression de la note');
      throw error;
    }
  };

  /* ------------------------------------------------------------
     ✅ Bloc 2 — addOpportunity typé (pas d’indexation string)
  ------------------------------------------------------------- */
  const addOpportunity = async (opportunity: Omit<Opportunity, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const filteredOpportunity: OpportunityInsert = {};
      for (const key of VALID_OPPORTUNITY_COLUMNS) {
        const value = (opportunity as OpportunityWritable)[key as keyof OpportunityWritable];
        if (value !== undefined) {
          (filteredOpportunity as any)[key] = value;
        }
      }

      console.log('addOpportunity called with:', opportunity);
      console.log('Opportunity name being passed:', opportunity.name);
      console.log('Filtered opportunity data:', filteredOpportunity);
      console.log('Filtered opportunity name:', (filteredOpportunity as any).name);

      const newOpportunity = await opportunitiesApi.create(filteredOpportunity);

      console.log('New opportunity returned from API:', newOpportunity);
      console.log('Returned opportunity name:', newOpportunity.name);

      setOpportunities(prev => [...prev, newOpportunity]);
      toast.success('Opportunité ajoutée avec succès');
    } catch (error) {
      console.error('Error adding opportunity:', error);
      toast.error('Erreur lors de l\'ajout de l\'opportunité');
    }
  };

  const updateOpportunity = async (id: string, updates: Partial<Opportunity>) => {
    const opportunity = opportunities.find(opp => opp.id === id);
    if (!opportunity) return;

    try {
      // Immediately update the UI with optimistic updates
      setOpportunities(prev => prev.map(opp => {
        if (opp.id === id) {
          return syncOpportunityProperties(opp, updates);
        }
        return opp;
      }));

      /* ------------------------------------------------------------
         ✅ Bloc 3 — filteredUpdates typé via clés valides
      ------------------------------------------------------------- */
      const filteredUpdates: OpportunityInsert = {};
      for (const key of VALID_OPPORTUNITY_COLUMNS) {
        const value = updates[key as keyof Partial<Opportunity>];
        if (value !== undefined) {
          (filteredUpdates as any)[key] = value;
        }
      }

      await opportunitiesApi.update(id, filteredUpdates);
    } catch (error) {
      console.error('Error updating opportunity:', error);
      toast.error('Erreur lors de la mise à jour de l\'opportunité');
      // Revert optimistic update on error
      setOpportunities(prev => prev.map(opp => 
        opp.id === id ? opportunity : opp
      ));
    }
  };

  const moveOpportunityToStage = async (opportunityId: string, stageId: number) => {
    await updateOpportunity(opportunityId, { stage_id: stageId });
  };

  const getOpportunitiesByStage = (stageId: number) => {
    return opportunities.filter(opp => opp.stage_id === stageId);
  };

  const addOpportunityNote = async (opportunityId: string, note: Omit<OpportunityNote, 'id' | 'created_at'>) => {
    try {
      const newNote = await notesApi.create({ ...note, opportunite_id: opportunityId });
      
      // Update the opportunity with the new note
      setOpportunities(prev => prev.map(opp => {
        if (opp.id === opportunityId) {
          return {
            ...opp,
            opportunityNotes: [...(opp.opportunityNotes || []), newNote]
          };
        }
        return opp;
      }));
      
      toast.success('Note ajoutée avec succès');
    } catch (error) {
      console.error('Error adding opportunity note:', error);
      toast.error('Erreur lors de l\'ajout de la note');
    }
  };

  const getCompaniesBySearchId = (searchId: string) => {
    return companies.filter(company => company.recherche_id === searchId);
  };

  const getMapCompanies = (searchId: string) => {
    return companies.filter(company => 
      company.recherche_id === searchId && company.sources.includes('google_maps')
    );
  };

  const getGoogleCompanies = (searchId: string) => {
    return companies.filter(company => 
      company.recherche_id === searchId && company.sources.includes('google_search')
    );
  };

  const toggleLeadMagnet = async (opportunityId: string) => {
    const opportunity = opportunities.find(opp => opp.id === opportunityId);
    if (!opportunity) return;

    const newLeadMagnetState = !opportunity.lead_magnet;
    await updateOpportunity(opportunityId, { lead_magnet: newLeadMagnetState });

    if (newLeadMagnetState) {
      // Create achievement for lead magnet
      const achievement: Omit<Achievement, 'id'> = {
        date: new Date().toISOString(),
        type_evenement: 'lead_magnet',
        description: `Lead magnet créé pour ${opportunity.companyName}`,
        opportunite_id: opportunityId
      };
      
      try {
        const savedAchievement = await achievementsApi.create(achievement);
        setAchievements(prev => [...prev, savedAchievement]);
      } catch (achievementError) {
        console.error('Error creating achievement:', achievementError);
      }
    }
  };

  const updateObjectives = async (objectives: Partial<Objectives>) => {
    const updatedObjectives = { ...currentObjectives, ...objectives };
    setCurrentObjectives(updatedObjectives);
    toast.success('Objectifs mis à jour');
  };

  const updateWeeklyObjectives = async (objectives: Partial<Objectives>) => {
    const updatedObjectives = { ...weeklyObjectives, ...objectives };
    setWeeklyObjectives(updatedObjectives);
    toast.success('Objectifs hebdomadaires mis à jour');
  };

  const updateAnnualObjectives = async (objectives: Partial<Objectives>) => {
    const updatedObjectives = { ...annualObjectives, ...objectives };
    setAnnualObjectives(updatedObjectives);
    toast.success('Objectifs annuels mis à jour');
  };

  const checkAndTriggerAchievements = () => {
    // This would check for various achievements and trigger them
    // Implementation would depend on specific business logic
  };

  const contextValue: AppDataContextType = {
    searchResults,
    companies,
    contacts,
    opportunities,
    pipelineStages,
    totalCompanies,
    totalQualifiedCompanies,
    keywordStats,
    locationStats,
    currentObjectives,
    weeklyObjectives,
    annualObjectives,
    achievements,
    getTotalRelances,
    getTotalAppels,
    getTotalRdv,
    getTotalDevis,
    getTotalSignatures,
    getTotalAcomptes,
    loading,
    addSearchResult,
    addCompany,
    updateCompany,
    deleteCompany,
    qualifyCompany,
    unqualifyCompany,
    addContact,
    updateContact,
    addContactNote,
    getContactNotes,
    updateContactNote,
    deleteContactNote,
    addOpportunity,
    updateOpportunity,
    moveOpportunityToStage,
    getOpportunitiesByStage,
    addOpportunityNote,
    getCompaniesBySearchId,
    getMapCompanies,
    getGoogleCompanies,
    toggleLeadMagnet,
    updateObjectives,
    updateWeeklyObjectives,
    updateAnnualObjectives,
    checkAndTriggerAchievements,
    refreshData
  };

  return (
    <AppDataContext.Provider value={contextValue}>
      {children}
    </AppDataContext.Provider>
  );
};

export const useAppData = () => {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
};
