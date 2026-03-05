import { supabase } from './supabase/client';
import { KPIObjective, KPIActual, PeriodType } from '../components/objectives/types';

const toPeriodUnit = (periodType: PeriodType): string => {
  switch (periodType) {
    case 'week':
      return 'week';
    case 'month':
      return 'month';
    case 'quarter':
      return 'quarter';
    case 'year':
      return 'year';
    default:
      return 'month';
  }
};

const toDateRange = (periodType: PeriodType, index: number) => {
  const now = new Date();
  let startDate = new Date();
  let endDate = new Date();
  let label = '';

  if (periodType === 'week') {
    const d = new Date(now);
    d.setDate(now.getDate() - index * 7);
    startDate = new Date(d);
    const day = startDate.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    startDate.setDate(startDate.getDate() + mondayOffset);
    endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    label = `S${Math.ceil((((startDate.getTime() - new Date(startDate.getFullYear(), 0, 1).getTime()) / 86400000) + 1) / 7)}`;
  }

  if (periodType === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth() - index, 1);
    startDate = new Date(d.getFullYear(), d.getMonth(), 1);
    endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    label = startDate.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  }

  if (periodType === 'quarter') {
    const d = new Date(now);
    d.setMonth(now.getMonth() - index * 3);
    const quarter = Math.floor(d.getMonth() / 3) + 1;
    startDate = new Date(d.getFullYear(), (quarter - 1) * 3, 1);
    endDate = new Date(d.getFullYear(), quarter * 3, 0);
    label = `Q${quarter} ${String(d.getFullYear()).slice(-2)}`;
  }

  if (periodType === 'year') {
    const year = now.getFullYear() - index;
    startDate = new Date(year, 0, 1);
    endDate = new Date(year, 11, 31);
    label = String(year);
  }

  return {
    startDate,
    endDate,
    period_start: startDate.toISOString().split('T')[0],
    period_end: endDate.toISOString().split('T')[0],
    period_label: label,
  };
};

const emptyActual = (periodType: PeriodType, index: number): KPIActual => {
  const range = toDateRange(periodType, index);
  return {
    period_start: range.period_start,
    period_end: range.period_end,
    period_type: periodType,
    period_label: range.period_label,
    leads_trouves: 0,
    leads_qualifies: 0,
    appels: 0,
    rdv: 0,
    devis: 0,
    relances: 0,
    signatures: 0,
    acomptes: 0,
    leadmagnets: 0,
    relances_total: 0,
    ca: 0,
    mrr: 0,
  };
};

const aggregateFacts = async (
  periodType: PeriodType,
  count: number,
): Promise<KPIActual[]> => {
  const periods = Array.from({ length: count }, (_, i) => emptyActual(periodType, i)).reverse();
  const minDate = periods[0]?.period_start;
  const maxDate = periods[periods.length - 1]?.period_end;

  if (!minDate || !maxDate) return [];

  const { data, error } = await supabase
    .from('kpi_daily_facts')
    .select('fact_date, leads_trouves, leads_qualifies, appels, rdv, devis, relances, signatures, acomptes, ca, mrr')
    .gte('fact_date', minDate)
    .lte('fact_date', maxDate);

  if (error) {
    throw new Error(`Erreur lors de la récupération des KPI: ${error.message}`);
  }

  for (const period of periods) {
    const rows = (data ?? []).filter((row) => row.fact_date >= period.period_start && row.fact_date <= period.period_end);
    rows.forEach((row) => {
      period.leads_trouves += Number(row.leads_trouves ?? 0);
      period.leads_qualifies += Number(row.leads_qualifies ?? 0);
      period.appels += Number(row.appels ?? 0);
      period.rdv += Number(row.rdv ?? 0);
      period.devis += Number(row.devis ?? 0);
      period.relances += Number(row.relances ?? 0);
      period.signatures += Number(row.signatures ?? 0);
      period.acomptes += Number(row.acomptes ?? 0);
      period.ca += Number(row.ca ?? 0);
      period.mrr += Number(row.mrr ?? 0);
    });
    period.relances_total = period.relances;
  }

  return periods;
};

export const objectivesApi = {
  async saveObjectives(objectives: KPIObjective[]): Promise<void> {
    for (const objective of objectives) {
      const payload = {
        scope: 'global',
        owner_id: null,
        period_unit: toPeriodUnit(objective.period_unit),
        period_start: objective.period_start,
        period_end: objective.period_end,
        label: objective.label ?? null,
        leads_trouves: objective.leads_trouves ?? 0,
        leads_qualifies: objective.leads_qualifies ?? 0,
        appels: objective.appels ?? 0,
        rdv: objective.rdv ?? 0,
        devis: objective.devis ?? 0,
        relances: objective.relances ?? 0,
        signatures: objective.signatures ?? 0,
        acomptes: objective.acomptes ?? 0,
        ca: objective.ca ?? 0,
        mrr: objective.mrr ?? 0,
      };

      const { error } = await supabase
        .from('kpi_targets')
        .upsert(payload, { onConflict: 'scope,owner_id,period_unit,period_start' });

      if (error) {
        throw new Error(`Erreur lors de la sauvegarde des objectifs: ${error.message}`);
      }
    }
  },

  async getObjectives(): Promise<KPIObjective[]> {
    const { data, error } = await supabase
      .from('kpi_targets')
      .select('*')
      .eq('scope', 'global')
      .is('owner_id', null)
      .order('period_start', { ascending: false });

    if (error) {
      throw new Error(`Erreur lors de la récupération des objectifs: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      period_unit: row.period_unit as PeriodType,
      period_start: row.period_start,
      period_end: row.period_end,
      leads_trouves: Number(row.leads_trouves ?? 0),
      leads_qualifies: Number(row.leads_qualifies ?? 0),
      appels: Number(row.appels ?? 0),
      rdv: Number(row.rdv ?? 0),
      devis: Number(row.devis ?? 0),
      relances: Number(row.relances ?? 0),
      signatures: Number(row.signatures ?? 0),
      acomptes: Number(row.acomptes ?? 0),
      leadmagnets: 0,
      relances_total: Number(row.relances ?? 0),
      ca: Number(row.ca ?? 0),
      mrr: Number(row.mrr ?? 0),
      label: row.label ?? undefined,
      created_at: row.created_at,
    }));
  },

  async getKPIDataByPeriod(periodType: PeriodType): Promise<KPIActual[]> {
    return aggregateFacts(periodType, 6);
  },

  async getHistoricalKPIData(periodType: PeriodType, limit = 24): Promise<KPIActual[]> {
    return aggregateFacts(periodType, limit);
  },
};
