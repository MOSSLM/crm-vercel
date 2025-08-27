"use client";
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from './AuthContext';
import {
  searchResultsApi,
  companiesApi,
  contactsApi,
  opportunitiesApi,
  pipelineStagesApi,
  notesApi,
  achievementsApi,
  statisticsApi,
} from '../utils/api';
import { getCompanyDisplayName, extractDomainNameOnly } from '../utils/displayHelpers';

import logger from '../utils/logger';
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
  // Compat UI
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
  raw_json?: unknown;
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
  // Enrichment
  ca_estime_band?: RevenueBand;
  nb_employes_band?: EmployeeBand;
  nb_employes_exact?: number;
  linkedin_url?: string;
  site_web_canonique?: string;
  manually_enriched?: boolean;
  enriched_at?: string;
  enriched_by?: string;
  // Lecture seule (détail)
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
  // Contact info
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
  // UI étendue
  companyName?: string;
  website?: string;
  address?: string;
  tags?: string[];
  source?: 'google_search' | 'google_maps';
  dateQualified?: string;
  rating?: number;
  // Legacy virtuel
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
  // New DB fields
  name?: string;
  type?: 'one_shot' | 'mrr';
  mrr?: number;
  recurrence_months?: number;
  // UI étendue
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
  pipelineHistory?: unknown[];
  leadMagnet?: boolean;
  leadMagnetCreatedDate?: string;
  // Contact info display
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
  // UI
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
  'contact_id',
  'entreprise_id',
  'montant',
  'priorite',
  'stage_id',
  'lead_magnet',
  'note_base',
  'tags',
  'date_prochain_suivi',
  'name',
  'type',
  'mrr',
  'recurrence_months',
] as const;

type ValidOpportunityColumn = (typeof VALID_OPPORTUNITY_COLUMNS)[number];
type OpportunityWritable = Omit<Opportunity, 'id' | 'created_at' | 'updated_at'>;
type OpportunityInsert = Partial<Pick<Opportunity, ValidOpportunityColumn>>;

/* --------------------------------------------------------------
   ✅ Helpers robustes pour le mapping priorité FR ⇄ EN
--------------------------------------------------------------- */
type FrPriority = 'haute' | 'moyenne' | 'basse';
type EnPriority = 'high' | 'medium' | 'low';

const frToEnPriority = (p?: FrPriority): EnPriority | undefined =>
  p === 'haute' ? 'high' : p === 'basse' ? 'low' : p === 'moyenne' ? 'medium' : undefined;

const enToFrPriority = (p?: EnPriority): FrPriority | undefined =>
  p === 'high' ? 'haute' : p === 'low' ? 'basse' : p === 'medium' ? 'moyenne' : undefined;

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
  addContactNote: (contactId: string, note: string) => Promise<ContactNote>; // 🔧 FIX: retourne bien la note
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

// Conversion Supabase -> UI
const supabaseToUiObjectives = (supabaseData: SupabaseObjectives): Objectives => ({
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
  revenue: supabaseData.ca || 0,
});

// UI -> Supabase
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
  revenue: 12500,
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
  revenue: 3000,
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
  revenue: 150000,
});

// Utility: sync des propriétés DB/UI (retourne un Opportunity complet)
const syncOpportunityProperties = (opportunity: Opportunity, updates: Partial<Opportunity>): Opportunity => {
  // Résolution priority (EN) et priorite (FR)
  const resolvedPriorityEN: Opportunity['priority'] =
    updates.priority ??
    frToEnPriority(updates.priorite as FrPriority | undefined) ??
    opportunity.priority ??
    frToEnPriority(opportunity.priorite as FrPriority | undefined);

  const resolvedPriorityFR: Opportunity['priorite'] =
    updates.priorite ??
    (enToFrPriority(updates.priority as EnPriority | undefined) as FrPriority | undefined) ??
    opportunity.priorite ??
    (enToFrPriority(opportunity.priority as EnPriority | undefined) as FrPriority | undefined) ??
    'moyenne';

  return {
    ...opportunity,
    ...updates,
    value:
      updates.montant !== undefined
        ? updates.montant
        : updates.value !== undefined
        ? updates.value
        : opportunity.value,
    montant:
      updates.value !== undefined
        ? updates.value
        : updates.montant !== undefined
        ? updates.montant
        : opportunity.montant,
    priority: resolvedPriorityEN,
    priorite: resolvedPriorityFR,
    notes: updates.note_base || updates.notes || opportunity.notes,
    note_base: updates.notes || updates.note_base || opportunity.note_base,
    leadMagnet:
      updates.lead_magnet !== undefined
        ? updates.lead_magnet
        : updates.leadMagnet !== undefined
        ? updates.leadMagnet
        : opportunity.leadMagnet,
    lead_magnet:
      updates.leadMagnet !== undefined
        ? updates.leadMagnet
        : updates.lead_magnet !== undefined
        ? updates.lead_magnet
        : opportunity.lead_magnet,
    updated_at: new Date().toISOString(),
  };
};

// Debounce compatible navigateur/Node
const debounce = (func: Function, wait: number) => {
  let timeout: ReturnType<typeof setTimeout>;
  return function executedFunction(...args: unknown[]) {
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
        locationStatsData,
      ] = await Promise.all([
        searchResultsApi.getAll(),
        companiesApi.getAll(),
        contactsApi.getAll(),
        opportunitiesApi.getAll(),
        pipelineStagesApi.getAll(),
        achievementsApi.getAll(),
        statisticsApi.getKeywordStats(),
        statisticsApi.getLocationStats(),
      ]);

      // Map search results to include compatibility properties
      const mappedSearchResults = searchResultsData.map((result: SearchResult) => ({
        ...result,
        useMaps: result.source_maps,
        useGoogle: result.source_google,
        totalCompanies: result.nb_trouves,
        qualifiedCompanies: result.nb_qualifies,
        date: result.created_at,
      }));

      setSearchResults(mappedSearchResults);
      setCompanies(companiesData);
      setContacts(contactsData);
      setOpportunities(opportunitiesData);
      setPipelineStages(pipelineStagesData);
      setAchievements(achievementsData);
      setKeywordStats(keywordStatsData);
      setLocationStats(locationStatsData);

      // Backward compatibility: objectifs par défaut
      setCurrentObjectives(getDefaultObjectives(getCurrentMonth()));
      setWeeklyObjectives(getDefaultWeeklyObjectives());
      setAnnualObjectives(getDefaultAnnualObjectives());
    } catch (error) {
      logger.error('Error loading data:', error);
      toast.error('Erreur lors du chargement des données');
    } finally {
      setLoading(false);
    }
  };

  // Computed values
  const totalCompanies = companies.length;
  const totalQualifiedCompanies = companies.filter((c) => c.qualifie).length;

  // LOGIQUE CORRIGÉE POUR ACCUMULER LES ACTIONS (JAMAIS DE DÉCRÉMENTATION)
  const calculateCumulativeActionsFromPipeline = (opportunity: Opportunity) => {
    const actions = {
      relances: 0,
      appels: 0,
      rdv: 0,
      devis: 0,
      signatures: 0,
      acomptes: 0,
    };

    const currentStage = pipelineStages.find((s) => s.id === opportunity.stage_id);
    if (!currentStage) return actions;

    const stageOrder = currentStage.ordre;

    const passedStages = pipelineStages
      .filter((stage) => stage.ordre <= stageOrder)
      .sort((a, b) => a.ordre - b.ordre);

    passedStages.forEach((stage) => {
      const name = stage.nom.toLowerCase();

      // APPELS
      if (
        name.includes('cold') ||
        name.includes('relance') ||
        name.includes('rdv') ||
        name.includes('vente') ||
        name.includes('devis') ||
        name.includes('signature') ||
        name.includes('acompte')
      ) {
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

  const getTotalRelances = (): number =>
    opportunities.reduce((total, opp) => total + calculateCumulativeActionsFromPipeline(opp).relances, 0);

  const getTotalAppels = (): number =>
    opportunities.reduce((total, opp) => total + calculateCumulativeActionsFromPipeline(opp).appels, 0);

  const getTotalRdv = (): number =>
    opportunities.reduce((total, opp) => total + calculateCumulativeActionsFromPipeline(opp).rdv, 0);

  const getTotalDevis = (): number =>
    opportunities.reduce((total, opp) => total + calculateCumulativeActionsFromPipeline(opp).devis, 0);

  const getTotalSignatures = (): number =>
    opportunities.reduce((total, opp) => total + calculateCumulativeActionsFromPipeline(opp).signatures, 0);

  const getTotalAcomptes = (): number =>
    opportunities.reduce((total, opp) => total + calculateCumulativeActionsFromPipeline(opp).acomptes, 0);

  // API Methods
  const addSearchResult = async (result: Omit<SearchResult, 'id' | 'created_at'>) => {
    try {
      const newResult = await searchResultsApi.create(result);
      const mappedResult = {
        ...newResult,
        useMaps: newResult.source_maps,
        useGoogle: newResult.source_google,
        totalCompanies: newResult.nb_trouves,
        qualifiedCompanies: newResult.nb_qualifies,
        date: newResult.created_at,
      };
      setSearchResults((prev) => [...prev, mappedResult]);
      toast.success('Recherche ajoutée avec succès');
    } catch (error) {
      logger.error('Error adding search result:', error);
      toast.error("Erreur lors de l'ajout de la recherche");
    }
  };

  const addCompany = async (company: Omit<Company, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const newCompany = await companiesApi.create(company);
      setCompanies((prev) => [...prev, newCompany]);
      toast.success('Entreprise ajoutée avec succès');
    } catch (error) {
      logger.error('Error adding company:', error);
      toast.error("Erreur lors de l'ajout de l'entreprise");
    }
  };

  const updateCompany = async (id: number, updates: Partial<Company>) => {
    try {
      const updatedCompany = await companiesApi.update(id, updates);
      setCompanies((prev) => prev.map((company) => (company.id === id ? { ...company, ...updatedCompany } : company)));
    } catch (error) {
      logger.error('Error updating company:', error);
      toast.error("Erreur lors de la mise à jour de l'entreprise");
    }
  };

  const deleteCompany = async (id: number) => {
    const company = companies.find((c) => c.id === id);
    if (!company) return;

    try {
      await companiesApi.delete(id);
      setCompanies((prev) => prev.filter((c) => c.id !== id));
      setContacts((prev) => prev.filter((contact) => contact.entreprise_id !== id));
      setOpportunities((prev) => prev.filter((opp) => opp.entreprise_id !== id));
      const displayName = getCompanyDisplayName(company.name, company.canonical_url);
      toast.success(`${displayName} supprimée avec succès`);
    } catch (error) {
      logger.error('Error deleting company:', error);
      toast.error("Erreur lors de la suppression de l'entreprise");
    }
  };

  // Helper phone
  const isMobilePhone = (phone: string): boolean => {
    if (!phone) return false;
    const cleaned = phone.replace(/[^0-9+]/g, '');
    return /^(06|07|\+336|\+337|336|337)/.test(cleaned);
  };

  // Helper name
  const generateOpportunityName = (company: Company): string => {
    let companyName = '';

    if (company.name && company.name.trim()) {
      companyName = company.name.trim();
    } else if (company.canonical_url) {
      companyName = extractDomainNameOnly(company.canonical_url);
    }

    if (!companyName) companyName = 'Entreprise';

    const hasWebsite =
      !!company.canonical_url &&
      company.canonical_url.trim() !== '' &&
      company.canonical_url !== 'N/A' &&
      company.canonical_url !== 'null';

    return hasWebsite ? `${companyName} refonte de site web` : `${companyName} création de site web`;
  };

  // Qualify = crée auto une opportunité
  const qualifyCompany = async (companyId: number) => {
    const company = companies.find((c) => c.id === companyId);
    if (!company || company.qualifie) return;

    try {
      await updateCompany(companyId, { qualifie: true });

      const achievement: Omit<Achievement, 'id'> = {
        date: new Date().toISOString(),
        type_evenement: 'qualified',
        description: `${getCompanyDisplayName(company.name, company.canonical_url)} a été qualifiée`,
        entreprise_id: company.id,
      };

      try {
        const savedAchievement = await achievementsApi.create(achievement);
        setAchievements((prev) => [...prev, savedAchievement]);
      } catch (achievementError) {
        logger.error('Error creating achievement:', achievementError);
      }

      const opportunityName = generateOpportunityName(company);
      const defaultStage = pipelineStages.find((stage) => stage.ordre === 1) || pipelineStages[0];

      const hasMobilePhone = !!company.telephone && isMobilePhone(company.telephone);

      const opportunity: Omit<Opportunity, 'id' | 'created_at' | 'updated_at'> = {
        entreprise_id: company.id,
        montant: 2500,
        priorite: hasMobilePhone ? 'haute' : 'moyenne',
        stage_id: defaultStage?.id,
        lead_magnet: false,
        note_base: `Opportunité créée automatiquement pour ${getCompanyDisplayName(
          company.name,
          company.canonical_url
        )}.${hasMobilePhone ? ' Numéro mobile disponible (' + company.telephone + ').' : ''}`,
        name: opportunityName,
        type: 'one_shot',
      };

      try {
        await addOpportunity(opportunity);
      } catch (opportunityError) {
        logger.error('Error creating opportunity:', opportunityError);
      }

      const displayName = getCompanyDisplayName(company.name, company.canonical_url);
      toast.success(
        `${displayName} qualifiée avec succès ! Une opportunité "${opportunityName}" a été créée automatiquement.`
      );
    } catch (error) {
      logger.error('Error qualifying company:', error);
      toast.error('Erreur lors de la qualification');
    }
  };

  const unqualifyCompany = async (companyId: number) => {
    const company = companies.find((c) => c.id === companyId);
    if (!company || !company.qualifie) return;

    try {
      await updateCompany(companyId, { qualifie: false });

      const associatedContacts = contacts.filter((contact) => contact.entreprise_id === companyId);
      const associatedOpportunities = opportunities.filter((opp) => opp.entreprise_id === companyId);

      await Promise.all([
        ...associatedContacts.map((contact) => contactsApi.delete(contact.id)),
        ...associatedOpportunities.map((opp) => opportunitiesApi.delete(opp.id)),
      ]);

      setContacts((prev) => prev.filter((contact) => contact.entreprise_id !== companyId));
      setOpportunities((prev) => prev.filter((opp) => opp.entreprise_id !== companyId));

      toast.success(`${company.name} déqualifiée`);
    } catch (error) {
      logger.error('Error unqualifying company:', error);
      toast.error('Erreur lors de la déqualification');
    }
  };

  const addContact = async (contact: Omit<Contact, 'id'>) => {
    try {
      const newContact = await contactsApi.create(contact);
      setContacts((prev) => [...prev, newContact]);
      toast.success('Contact ajouté avec succès');
    } catch (error) {
      logger.error('Error adding contact:', error);
      toast.error("Erreur lors de l'ajout du contact");
    }
  };

  const updateContact = async (id: string, updates: Partial<Contact>) => {
    try {
      const updatedContact = await contactsApi.update(id, updates);
      setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...updatedContact } : c)));
    } catch (error) {
      logger.error('Error updating contact:', error);
      toast.error('Erreur lors de la mise à jour du contact');
    }
  };

  // Notes Contact
  const addContactNote = async (contactId: string, note: string): Promise<ContactNote> => {
    try {
      const newNote = await contactsApi.addNote(contactId, note);
      toast.success('Note ajoutée avec succès');
      return newNote;
    } catch (error) {
      logger.error('Error adding contact note:', error);
      toast.error("Erreur lors de l'ajout de la note");
      throw error;
    }
  };

  const getContactNotes = async (contactId: string): Promise<ContactNote[]> => {
    try {
      return await contactsApi.getNotes(contactId);
    } catch (error) {
      logger.error('Error fetching contact notes:', error);
      return [];
    }
  };

  const updateContactNote = async (noteId: number, note: string) => {
    try {
      await contactsApi.updateNote(noteId, note);
      toast.success('Note mise à jour avec succès');
    } catch (error) {
      logger.error('Error updating contact note:', error);
      toast.error('Erreur lors de la mise à jour de la note');
      throw error;
    }
  };

  const deleteContactNote = async (noteId: number) => {
    try {
      await contactsApi.deleteNote(noteId);
      toast.success('Note supprimée avec succès');
    } catch (error) {
      logger.error('Error deleting contact note:', error);
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
          (filteredOpportunity as Record<ValidOpportunityColumn, unknown>)[key] = value;
        }
      }

      const newOpportunity = await opportunitiesApi.create(filteredOpportunity);
      setOpportunities((prev) => [...prev, newOpportunity]);
      toast.success('Opportunité ajoutée avec succès');
    } catch (error) {
      logger.error('Error adding opportunity:', error);
      toast.error("Erreur lors de l'ajout de l'opportunité");
    }
  };

  const updateOpportunity = async (id: string, updates: Partial<Opportunity>) => {
    const original = opportunities.find((opp) => opp.id === id);
    if (!original) return;

    try {
      // Optimistic UI update
      setOpportunities((prev) => prev.map((opp) => (opp.id === id ? syncOpportunityProperties(opp, updates) : opp)));

      /* ------------------------------------------------------------
         ✅ Bloc 3 — filteredUpdates typé via clés valides
      ------------------------------------------------------------- */
      const filteredUpdates: OpportunityInsert = {};
      for (const key of VALID_OPPORTUNITY_COLUMNS) {
        const value = updates[key as keyof Partial<Opportunity>];
        if (value !== undefined) {
          (filteredUpdates as Record<ValidOpportunityColumn, unknown>)[key] = value;
        }
      }

      await opportunitiesApi.update(id, filteredUpdates);
    } catch (error) {
      logger.error('Error updating opportunity:', error);
      toast.error("Erreur lors de la mise à jour de l'opportunité");
      // Revert optimistic update on error
      setOpportunities((prev) => prev.map((opp) => (opp.id === id ? original : opp)));
    }
  };

  const moveOpportunityToStage = async (opportunityId: string, stageId: number) => {
    await updateOpportunity(opportunityId, { stage_id: stageId });
  };

  const getOpportunitiesByStage = (stageId: number) => opportunities.filter((opp) => opp.stage_id === stageId);

  const addOpportunityNote = async (opportunityId: string, note: Omit<OpportunityNote, 'id' | 'created_at'>) => {
    try {
      const newNote = await notesApi.create({ ...note, opportunite_id: opportunityId });

      setOpportunities((prev) =>
        prev.map((opp) => {
          if (opp.id === opportunityId) {
            return { ...opp, opportunityNotes: [...(opp.opportunityNotes || []), newNote] };
          }
          return opp;
        })
      );

      toast.success('Note ajoutée avec succès');
    } catch (error) {
      logger.error('Error adding opportunity note:', error);
      toast.error("Erreur lors de l'ajout de la note");
    }
  };

  const getCompaniesBySearchId = (searchId: string) => companies.filter((company) => company.recherche_id === searchId);

  const getMapCompanies = (searchId: string) =>
    companies.filter((company) => company.recherche_id === searchId && company.sources.includes('google_maps'));

  const getGoogleCompanies = (searchId: string) =>
    companies.filter((company) => company.recherche_id === searchId && company.sources.includes('google_search'));

  const toggleLeadMagnet = async (opportunityId: string) => {
    const opportunity = opportunities.find((opp) => opp.id === opportunityId);
    if (!opportunity) return;

    const newLeadMagnetState = !opportunity.lead_magnet;
    await updateOpportunity(opportunityId, { lead_magnet: newLeadMagnetState });

    if (newLeadMagnetState) {
      const achievement: Omit<Achievement, 'id'> = {
        date: new Date().toISOString(),
        type_evenement: 'lead_magnet',
        description: `Lead magnet créé pour ${opportunity.companyName}`,
        opportunite_id: opportunityId,
      };

      try {
        const savedAchievement = await achievementsApi.create(achievement);
        setAchievements((prev) => [...prev, savedAchievement]);
      } catch (achievementError) {
        logger.error('Error creating achievement:', achievementError);
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
    // Ajoutez ici votre logique d’achievements
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
    addContactNote,     // ✅ types alignés
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
    refreshData,
  };

  return <AppDataContext.Provider value={contextValue}>{children}</AppDataContext.Provider>;
};

export const useAppData = () => {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
};
