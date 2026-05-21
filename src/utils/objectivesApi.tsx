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

  const normalizeStageName = (value: string): string =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const [{ data: stageRows, error: stageError }, { count: stockCount, error: stockError }] = await Promise.all([
    supabase.from('etapes_pipeline').select('id, nom, ordre'),
    supabase
      .from('entreprises')
      .select('id', { count: 'exact', head: true })
      .eq('qualifie', false)
      .or('hidden_in_qualification.is.null,hidden_in_qualification.eq.false'),
  ]);

  if (stageError) {
    throw new Error(`Erreur lors de la récupération des étapes: ${stageError.message}`);
  }

  if (stockError) {
    throw new Error(`Erreur lors de la récupération du stock d'entreprises: ${stockError.message}`);
  }

  type StageMetadata = { id: number; nom: string; ordre: number };
  const stages = (stageRows ?? []) as StageMetadata[];
  const stageById = new Map<number, StageMetadata>();
  for (const stage of stages) {
    stageById.set(stage.id, stage);
  }

  const findStage = (matcher: (normalizedName: string) => boolean): StageMetadata | undefined =>
    stages.find((stage) => matcher(normalizeStageName(stage.nom)));

  const callStage = findStage((name) => name === 'approche');
  const rdvStages = stages
    .filter((stage) => normalizeStageName(stage.nom).startsWith('rdv'))
    .sort((a, b) => a.ordre - b.ordre);
  const devisStage = findStage((name) => name === 'devis');
  const signatureStage = findStage((name) => name === 'signature');
  const acompteStage = findStage((name) => name === 'acompte');
  const relanceStages = stages
    .filter((stage) => normalizeStageName(stage.nom).startsWith('relance'))
    .sort((a, b) => a.ordre - b.ordre);
  const maxRelanceOrder = relanceStages[relanceStages.length - 1]?.ordre ?? Number.NEGATIVE_INFINITY;

  for (const period of periods) {
    const startDateTime = `${period.period_start}T00:00:00.000Z`;
    const endDateTime = `${period.period_end}T23:59:59.999Z`;

    const [{ data: qualifiedRows, error: qualifiedError }, { data: opportunities, error: opportunitiesError }] = await Promise.all([
      supabase
        .from('entreprises')
        .select('id')
        .eq('qualifie', true)
        .gte('updated_at', startDateTime)
        .lte('updated_at', endDateTime),
      supabase
        .from('opportunites')
        .select('stage_id, montant, lead_magnet, type, mrr, updated_at')
        .gte('updated_at', startDateTime)
        .lte('updated_at', endDateTime),
    ]);

    if (qualifiedError) {
      throw new Error(`Erreur lors de la récupération des entreprises qualifiées: ${qualifiedError.message}`);
    }
    if (opportunitiesError) {
      throw new Error(`Erreur lors de la récupération des opportunités: ${opportunitiesError.message}`);
    }

    period.leads_trouves = Number(stockCount ?? 0);
    period.leads_qualifies = (qualifiedRows ?? []).length;

    for (const opportunity of opportunities ?? []) {
      const stageId = Number(opportunity.stage_id ?? 0);
      const stage = stageById.get(stageId);
      const order = stage?.ordre ?? Number.NEGATIVE_INFINITY;

      if (callStage && order >= callStage.ordre) {
        period.appels += 1;
      }

      const rdvPoints = rdvStages.reduce((acc, rdvStage) => acc + (order >= rdvStage.ordre ? 1 : 0), 0);
      period.rdv += rdvPoints;

      if (devisStage && order >= devisStage.ordre) {
        period.devis += 1;
      }

      if (signatureStage && order >= signatureStage.ordre) {
        period.signatures += 1;
      }

      if (acompteStage && order >= acompteStage.ordre) {
        period.acomptes += 1;
      }

      if (opportunity.lead_magnet) {
        period.leadmagnets += 1;
      }

      if (relanceStages.length > 0) {
        if (order >= maxRelanceOrder) {
          period.relances += relanceStages.length;
        } else {
          period.relances += relanceStages.reduce((acc, relanceStage) => acc + (order >= relanceStage.ordre ? 1 : 0), 0);
        }
      }

      if (signatureStage && order >= signatureStage.ordre) {
        period.ca += Number(opportunity.montant ?? 0);
        if (opportunity.type === 'mrr') {
          period.mrr += Number(opportunity.mrr ?? 0);
        }
      }
    }

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
        entreprises_enrichies: objective.entreprises_enrichies ?? 0,
        sites_crees: objective.sites_crees ?? 0,
        audits_crees: objective.audits_crees ?? 0,
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
      entreprises_enrichies: Number(row.entreprises_enrichies ?? 0),
      sites_crees: Number(row.sites_crees ?? 0),
      audits_crees: Number(row.audits_crees ?? 0),
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
