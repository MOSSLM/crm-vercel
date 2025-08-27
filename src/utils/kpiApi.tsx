import { supabase } from './supabase/client';
import { handleSupabaseError } from './supabase/error';
// Types pour les métriques KPI
export type KPIMetric = 
  | 'leads_trouves' 
  | 'leads_qualifies' 
  | 'appels' 
  | 'rdv' 
  | 'devis' 
  | 'relances' 
  | 'signatures' 
  | 'acomptes' 
  | 'leadmagnets' 
  | 'relances_total' 
  | 'ca' 
  | 'mrr';

export type PeriodUnit = 'week' | 'month' | 'quarter' | 'year';

// Interfaces pour les données KPI
export interface KPITarget {
  id?: string;
  metric: KPIMetric;
  period_unit: PeriodUnit;
  period_start: string;
  period_end: string;
  target_value: number;
  label: string;
  created_at?: string;
  updated_at?: string;
}

export interface KPIProgressCurrent {
  metric: KPIMetric;
  period_unit: PeriodUnit;
  period_start: string;
  period_end: string;
  target_value: number;
  actual_value: number;
  progress_pct: number;
  remaining: number;
}

export interface KPIMonthlyCurve {
  metric: KPIMetric;
  month: string; // Format YYYY-MM
  target_value: number;
  actual_value: number;
  progress_pct: number;
}

// Configuration des KPIs
export const KPI_CONFIG: Record<KPIMetric, {
  label: string;
  unit: string;
  color: string;
  category: 'generation' | 'commercial' | 'financial';
}> = {
  leads_trouves: {
    label: 'Leads trouvés',
    unit: 'leads',
    color: '#3b82f6',
    category: 'generation'
  },
  leads_qualifies: {
    label: 'Leads qualifiés',
    unit: 'leads',
    color: '#10b981',
    category: 'generation'
  },
  appels: {
    label: 'Appels effectués',
    unit: 'appels',
    color: '#f59e0b',
    category: 'commercial'
  },
  rdv: {
    label: 'RDV obtenus',
    unit: 'rdv',
    color: '#ef4444',
    category: 'commercial'
  },
  devis: {
    label: 'Devis envoyés',
    unit: 'devis',
    color: '#8b5cf6',
    category: 'commercial'
  },
  relances: {
    label: 'Relances effectuées',
    unit: 'relances',
    color: '#06b6d4',
    category: 'commercial'
  },
  signatures: {
    label: 'Signatures obtenues',
    unit: 'signatures',
    color: '#84cc16',
    category: 'commercial'
  },
  acomptes: {
    label: 'Acomptes reçus',
    unit: 'acomptes',
    color: '#22c55e',
    category: 'financial'
  },
  leadmagnets: {
    label: 'Lead magnets créés',
    unit: 'magnets',
    color: '#f97316',
    category: 'generation'
  },
  relances_total: {
    label: 'Total relances',
    unit: 'relances',
    color: '#0ea5e9',
    category: 'commercial'
  },
  ca: {
    label: 'Chiffre d\'affaires',
    unit: '€',
    color: '#dc2626',
    category: 'financial'
  },
  mrr: {
    label: 'MRR',
    unit: '€/mois',
    color: '#7c3aed',
    category: 'financial'
  }
};

export const PERIOD_CONFIG: Record<PeriodUnit, {
  label: string;
  duration: number; // en jours
}> = {
  week: { label: 'Semaine', duration: 7 },
  month: { label: 'Mois', duration: 30 },
  quarter: { label: 'Trimestre', duration: 90 },
  year: { label: 'Année', duration: 365 }
};

// Utilitaires pour les périodes
export const periodUtils = {
  // Calculer les dates de début et fin d'une période
  getPeriodDates(year: number, unit: PeriodUnit, value: number): { start: string; end: string } {
    let startDate: Date;
    let endDate: Date;

    switch (unit) {
      case 'week':
        // Calculer la date de début de la semaine (lundi)
        const jan1 = new Date(year, 0, 1);
        const daysToMonday = (jan1.getDay() + 6) % 7; // Jours jusqu'au lundi
        const firstMonday = new Date(year, 0, 1 + (7 - daysToMonday) % 7);
        startDate = new Date(firstMonday.getTime() + (value - 1) * 7 * 24 * 60 * 60 * 1000);
        endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000);
        break;

      case 'month':
        startDate = new Date(year, value - 1, 1);
        endDate = new Date(year, value, 0); // Dernier jour du mois
        break;

      case 'quarter':
        const startMonth = (value - 1) * 3;
        startDate = new Date(year, startMonth, 1);
        endDate = new Date(year, startMonth + 3, 0); // Dernier jour du trimestre
        break;

      case 'year':
        startDate = new Date(year, 0, 1);
        endDate = new Date(year, 11, 31);
        break;

      default:
        throw new Error(`Unité de période non supportée: ${unit}`);
    }

    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0]
    };
  },

  // Formater l'affichage d'une période
  formatPeriodDisplay(unit: PeriodUnit, start: string, end: string): string {
    const startDate = new Date(start);
    const endDate = new Date(end);

    switch (unit) {
      case 'week':
        return `Semaine du ${startDate.toLocaleDateString('fr-FR', { 
          day: '2-digit', 
          month: '2-digit' 
        })} au ${endDate.toLocaleDateString('fr-FR', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric' 
        })}`;
      case 'month':
        return startDate.toLocaleDateString('fr-FR', { 
          month: 'long', 
          year: 'numeric' 
        });
      case 'quarter':
        const quarter = Math.ceil((startDate.getMonth() + 1) / 3);
        return `Q${quarter} ${startDate.getFullYear()}`;
      case 'year':
        return startDate.getFullYear().toString();
      default:
        return `${start} - ${end}`;
    }
  }
};

// Fonctions utilitaires pour le formatage
export const formatKPIValue = (value: number | null | undefined, metric: KPIMetric): string => {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return '0';
  }

  const numValue = Number(value);
  const config = KPI_CONFIG[metric];

  if (config.unit === '€' || config.unit === '€/mois') {
    if (numValue >= 1000000) {
      return `${(numValue / 1000000).toFixed(1)}M€`;
    } else if (numValue >= 1000) {
      return `${(numValue / 1000).toFixed(1)}K€`;
    } else {
      return `${numValue.toLocaleString('fr-FR')}€`;
    }
  }

  return numValue.toLocaleString('fr-FR');
};

export const formatPercentage = (value: number | null | undefined): string => {
  if (value === null || value === undefined || isNaN(Number(value))) {
    return '0%';
  }
  return `${Math.round(Number(value))}%`;
};

export const getKPIColor = (metric: KPIMetric): string => {
  return KPI_CONFIG[metric]?.color || '#6b7280';
};

// API pour les objectifs KPI (kpi_targets)
export const kpiTargetsApi = {
  // Récupérer tous les objectifs
  async getAll(): Promise<KPITarget[]> {
    try {
      const { data, error } = await supabase
        .from('kpi_targets')
        .select('*')
        .order('period_start', { ascending: false });

      if (error) {
        handleSupabaseError(error, 'kpiTargetsApi.getAll');
        throw error;
      }

      return data || [];
    } catch (error) {
      handleSupabaseError(error, 'kpiTargetsApi.getAll');
      throw error;
    }
  },

  // Créer un objectif
  async create(target: Omit<KPITarget, 'id'>): Promise<KPITarget | null> {
    try {
      const { data, error } = await supabase
        .from('kpi_targets')
        .insert([target])
        .select()
        .single();

      if (error) {
        handleSupabaseError(error, 'kpiTargetsApi.create');
        throw error;
      }

      return data;
    } catch (error) {
      handleSupabaseError(error, 'kpiTargetsApi.create');
      throw error;
    }
  }
};

// API pour la progression actuelle (v_kpi_progress_current)
export const kpiProgressCurrentApi = {
  // Récupérer toute la progression actuelle
  async getAll(): Promise<KPIProgressCurrent[]> {
    try {
      const { data, error } = await supabase
        .from('v_kpi_progress_current')
        .select('*')
        .order('period_unit', { ascending: true })
        .order('metric', { ascending: true });

      if (error) {
        handleSupabaseError(error, 'kpiProgressCurrentApi.getAll');
        throw error;
      }

      return data || [];
    } catch (error) {
      handleSupabaseError(error, 'kpiProgressCurrentApi.getAll');
      throw error;
    }
  }
};

// API pour les courbes mensuelles (v_kpi_monthly_curve)
export const kpiMonthlyCurveApi = {
  // Récupérer toutes les courbes mensuelles
  async getAll(): Promise<KPIMonthlyCurve[]> {
    try {
      const { data, error } = await supabase
        .from('v_kpi_monthly_curve')
        .select('*')
        .order('month', { ascending: true })
        .order('metric', { ascending: true });

      if (error) {
        handleSupabaseError(error, 'kpiMonthlyCurveApi.getAll');
        throw error;
      }

      return data || [];
    } catch (error) {
      handleSupabaseError(error, 'kpiMonthlyCurveApi.getAll');
      throw error;
    }
  }
};

// Interface pour les totaux KPI du journal
export interface JournalKpiTotals {
  total_appels: number;
  total_relances: number;
  total_rdvs: number;
  total_devis: number;
  total_signatures: number;
  total_acomptes: number;
  total_lead_magnets: number;
}

// API pour les totaux KPI depuis le journal
export const journalKpiApi = {
  // Récupérer les totaux depuis le serveur backend
  async getTotals(): Promise<JournalKpiTotals> {
    try {
      // Utiliser directement l'API existante du journal
      const { journalApi } = await import('./journalApi');
      return await journalApi.getJournalKpiTotals();
    } catch (error) {
      handleSupabaseError(error, 'journalKpiApi.getTotals');
      throw error;
    }
  }
};

// Export par défaut
export default {
  kpiTargetsApi,
  kpiProgressCurrentApi,
  kpiMonthlyCurveApi,
  journalKpiApi,
  periodUtils,
  formatKPIValue,
  formatPercentage,
  getKPIColor,
  KPI_CONFIG,
  PERIOD_CONFIG
};