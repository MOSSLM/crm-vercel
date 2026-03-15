export type PeriodType = 'week' | 'month' | 'quarter' | 'year';

export interface Period {
  id: string;
  type: PeriodType;
  label: string;
  startDate: Date;
  endDate: Date;
  number?: number; // Pour semaines numérotées
}

export interface KPIObjective {
  id?: string;
  period_unit: PeriodType;
  period_start: string; // Format YYYY-MM-DD
  period_end: string; // Format YYYY-MM-DD
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
  mrr?: number;
  label?: string;
  created_at?: string;
}

export interface KPIActual {
  period_start: string;
  period_end: string;
  period_type: PeriodType;
  period_label: string;
  leads_trouves: number;
  leads_qualifies: number;
  appels: number;
  rdv: number;
  devis: number;
  relances: number;
  signatures: number;
  acomptes: number;
  leadmagnets: number;
  relances_total: number;
  ca: number;
  mrr: number;
}

export interface PeriodComparison extends KPIActual {
  objectives: KPIObjective | null;
  completion_rates: {
    leads_trouves: number;
    leads_qualifies: number;
    appels: number;
    rdv: number;
    devis: number;
    relances: number;
    signatures: number;
    acomptes: number;
    leadmagnets: number;
    relances_total: number;
    ca: number;
    mrr: number;
  };
}

export interface ChartKPI {
  key: keyof Omit<KPIActual, 'period_start' | 'period_end' | 'period_type' | 'period_label'>;
  label: string;
  color: string;
  enabled: boolean;
}

export const KPI_DEFINITIONS: ChartKPI[] = [
  { key: 'leads_trouves', label: 'Leads trouvés', color: 'var(--chart-1, #8884d8)', enabled: true },
  { key: 'leads_qualifies', label: 'Leads qualifiés', color: 'var(--chart-2, #82ca9d)', enabled: true },
  { key: 'appels', label: 'Appels effectués', color: 'var(--chart-3, #ffc658)', enabled: true },
  { key: 'rdv', label: 'RDV obtenus', color: 'var(--chart-4, #ff7c7c)', enabled: true },
  { key: 'devis', label: 'Devis envoyés', color: 'var(--chart-5, #8dd1e1)', enabled: true },
  { key: 'relances', label: 'Relances effectuées', color: 'var(--chart-6, #d084d0)', enabled: false },
  { key: 'signatures', label: 'Signatures obtenues', color: 'var(--chart-7, #87d068)', enabled: true },
  { key: 'acomptes', label: 'Acomptes reçus', color: 'var(--chart-8, #ffb347)', enabled: true },
  { key: 'leadmagnets', label: 'Lead magnets créés', color: 'var(--chart-9, #ff9999)', enabled: false },
  { key: 'relances_total', label: 'Total relances', color: 'var(--chart-10, #87ceeb)', enabled: false },
  { key: 'ca', label: 'Chiffre d\'affaires', color: 'var(--chart-11, #20b2aa)', enabled: true },
  { key: 'mrr', label: 'MRR', color: 'var(--chart-12, #dda0dd)', enabled: true }
];

// Interface pour les données de la vue v_kpi_totals_from_journal
export interface JournalKpiRow {
  metric: string;
  total: number;
  total_week: number;
  total_month: number;
  total_quarter: number;
  total_year: number;
}
