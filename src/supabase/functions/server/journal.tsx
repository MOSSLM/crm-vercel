import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

import logger from '../../../utils/logger.ts';
import { ContactChannel, ContactDirection, ContactOutcome } from '../../../types/index.ts';
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

export interface JournalEntry {
  date: string;
  type_evenement: string;
  description?: string;
  opportunite_id?: string;
  entreprise_id?: number;
}

export interface JournalStats {
  appels: number;
  relances: number;
  rdvs: number;
  devis: number;
  signatures: number;
  acomptes: number;
  [key: string]: number;
}

type TouchpointPayload = {
  opportunite_id?: string | null;
  entreprise_id?: number | null;
  step_kind: string;
  channel: ContactChannel;
  direction?: ContactDirection;
  outcome?: ContactOutcome;
  details?: string | null;
};

type ContactTouchpointKind = 'approche' | 'relance' | 'autre';

const translateTouchpointKind = (stepKind: string): ContactTouchpointKind => {
  switch (stepKind) {
    case 'approche':
    case 'cold_call':
      return 'approche';
    case 'relance':
      return 'relance';
    default:
      return 'autre';
  }
};

const getNextTouchpointSequence = async ({
  opportunite_id,
  entreprise_id,
  step_kind,
}: {
  opportunite_id?: string | null;
  entreprise_id?: number | null;
  step_kind: ContactTouchpointKind;
}) => {
  let query = supabase
    .from('opportunity_touchpoints')
    .select('step_sequence')
    .eq('step_kind', step_kind)
    .order('step_sequence', { ascending: false })
    .limit(1);

  if (opportunite_id) {
    query = query.eq('opportunite_id', opportunite_id);
  } else if (entreprise_id) {
    query = query.eq('entreprise_id', entreprise_id);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('Error getting touchpoint sequence:', error);
    throw error;
  }

  const last = data?.[0]?.step_sequence ?? 0;
  return (typeof last === 'number' ? last : parseInt(String(last), 10) || 0) + 1;
};

export const createTouchpoint = async (payload: TouchpointPayload) => {
  const touchpoint_kind = translateTouchpointKind(payload.step_kind);
  let step_sequence: number | null = null;

  if (touchpoint_kind === 'relance') {
    step_sequence = await getNextTouchpointSequence({
      opportunite_id: payload.opportunite_id ?? undefined,
      entreprise_id: payload.entreprise_id ?? undefined,
      step_kind: touchpoint_kind,
    });
  } else if (touchpoint_kind === 'approche') {
    step_sequence = 1;
  }

  const { error } = await supabase
    .from('opportunity_touchpoints')
    .insert({
      opportunite_id: payload.opportunite_id ?? null,
      entreprise_id: payload.entreprise_id ?? null,
      step_kind: touchpoint_kind,
      step_sequence: step_sequence ?? null,
      channel: payload.channel,
      direction: payload.direction ?? ContactDirection.Outgoing,
      outcome: payload.outcome ?? ContactOutcome.Inconnu,
      details: payload.details ?? null,
    });

  if (error) {
    logger.error('Error inserting touchpoint:', error);
    throw error;
  }

  return {
    step_sequence,
    touchpoint_kind,
  };
};

// Enregistrer une nouvelle entrée dans le journal
export const logEvent = async (
  entry: Omit<JournalEntry, 'date'> & {
    channel?: ContactChannel | null;
    details?: string | null;
  },
): Promise<void> => {
  const payload: Record<string, any> = {
    date: new Date().toISOString(),
    type_evenement: entry.type_evenement,
    description: entry.description || null,
    opportunite_id: entry.opportunite_id || null,
    entreprise_id: entry.entreprise_id || null,
  };

  if (entry.details) {
    payload.details = entry.details;
  }

  if (entry.channel) {
    payload.channel = entry.channel;
  }

  const { error } = await supabase.from('journal_succes').insert(payload);

  if (error) {
    const missingChannel = !!entry.channel && error.message?.includes('column "channel"');
    const missingDetails = !!entry.details && error.message?.includes('column "details"');

    if (missingChannel || missingDetails) {
      const fallback = { ...payload };
      if (missingChannel) {
        delete fallback.channel;
        const channelInfo = `Canal: ${entry.channel}`;
        fallback.description = [entry.description, channelInfo]
          .filter(Boolean)
          .join(' - ');
      }
      if (missingDetails) {
        delete fallback.details;
      }

      const retry = await supabase.from('journal_succes').insert(fallback);
      if (retry.error) {
        logger.error('Error logging journal entry (retry):', retry.error);
        throw retry.error;
      }
    } else {
      logger.error('Error logging journal entry:', error);
      throw error;
    }
  }
};

// Obtenir le prochain numéro de séquence pour un type d'événement
export const getNextSequenceNumber = async (
  type_prefix: string, 
  opportunite_id?: string, 
  entreprise_id?: number
): Promise<number> => {
  let query = supabase
    .from('journal_succes')
    .select('type_evenement')
    .like('type_evenement', `${type_prefix}_%`);

  if (opportunite_id) {
    query = query.eq('opportunite_id', opportunite_id);
  } else if (entreprise_id) {
    query = query.eq('entreprise_id', entreprise_id);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Error getting sequence number:', error);
    return 1;
  }

  if (!data || data.length === 0) {
    return 1;
  }

  // Extraire les numéros de séquence existants
  const existingNumbers = data
    .map(entry => {
      const match = entry.type_evenement.match(new RegExp(`^${type_prefix}_(\\d+)$`));
      return match ? parseInt(match[1]) : 0;
    })
    .filter(num => num > 0);

  return Math.max(...existingNumbers, 0) + 1;
};

// Obtenir les statistiques d'une opportunité ou entreprise
export const getJournalStats = async (opportunite_id?: string, entreprise_id?: number): Promise<JournalStats> => {
  let query = supabase
    .from('journal_succes')
    .select('type_evenement');

  if (opportunite_id) {
    query = query.eq('opportunite_id', opportunite_id);
  } else if (entreprise_id) {
    query = query.eq('entreprise_id', entreprise_id);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Error getting journal stats:', error);
    return { appels: 0, relances: 0, rdvs: 0, devis: 0, signatures: 0, acomptes: 0 };
  }

  const stats: JournalStats = {
    appels: 0,
    relances: 0,
    rdvs: 0,
    devis: 0,
    signatures: 0,
    acomptes: 0
  };

  if (data) {
    for (const entry of data) {
      const type = entry.type_evenement;
      
      if (type === 'cold_call' || type === 'appel') {
        stats.appels++;
      } else if (type.startsWith('relance_')) {
        stats.relances++;
      } else if (type.startsWith('rdv_')) {
        stats.rdvs++;
      } else if (type === 'devis') {
        stats.devis++;
      } else if (type === 'signature') {
        stats.signatures++;
      } else if (type === 'acompte') {
        stats.acomptes++;
      } else {
        // Autres types d'événements
        if (stats[type] !== undefined) {
          stats[type] = (stats[type] || 0) + 1;
        }
      }
    }
  }

  return stats;
};

// Obtenir l'historique complet d'une opportunité ou entreprise
const JOURNAL_HISTORY_COLUMNS = 'date,type_evenement,description,opportunite_id,entreprise_id';

export const getJournalHistory = async (
  opportunite_id?: string,
  entreprise_id?: number,
  limit = 10
) => {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 10;
  let query = supabase
    .from('journal_succes')
    .select(JOURNAL_HISTORY_COLUMNS)
    .order('date', { ascending: false })
    .limit(safeLimit);

  if (opportunite_id) {
    query = query.eq('opportunite_id', opportunite_id);
  } else if (entreprise_id) {
    query = query.eq('entreprise_id', entreprise_id);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('Error getting journal history:', error);
    throw error;
  }

  return data || [];
};

type LogOptions = {
  description?: string | null;
  channel?: ContactChannel;
  details?: string | null;
  skipTouchpoint?: boolean;
  direction?: ContactDirection;
  outcome?: ContactOutcome;
};

const resolveChannel = (channel?: ContactChannel) => channel ?? ContactChannel.PasDefini;

export const logCall = async (
  opportunite_id?: string,
  entreprise_id?: number,
  options: LogOptions = {},
) => {
  const channel = resolveChannel(options.channel);
  if (!options.skipTouchpoint) {
    await createTouchpoint({
      opportunite_id,
      entreprise_id,
      step_kind: 'cold_call',
      channel,
      direction: options.direction,
      outcome: options.outcome,
      details: options.details ?? options.description ?? null,
    });
  }

  await logEvent({
    type_evenement: 'cold_call',
    description: options.description ?? null,
    opportunite_id,
    entreprise_id,
    channel,
    details: options.details ?? null,
  });
};

export const logRelance = async (
  opportunite_id?: string,
  entreprise_id?: number,
  options: LogOptions = {},
) => {
  const channel = resolveChannel(options.channel);
  if (!options.skipTouchpoint) {
    await createTouchpoint({
      opportunite_id,
      entreprise_id,
      step_kind: 'relance',
      channel,
      direction: options.direction,
      outcome: options.outcome,
      details: options.details ?? options.description ?? null,
    });
  }

  const nextNumber = await getNextSequenceNumber('relance', opportunite_id, entreprise_id);
  await logEvent({
    type_evenement: `relance_${nextNumber}`,
    description: options.description ?? null,
    opportunite_id,
    entreprise_id,
    channel,
    details: options.details ?? null,
  });
};

export const logRdv = async (
  opportunite_id?: string,
  entreprise_id?: number,
  options: LogOptions = {},
) => {
  const channel = resolveChannel(options.channel);
  if (!options.skipTouchpoint) {
    await createTouchpoint({
      opportunite_id,
      entreprise_id,
      step_kind: 'rdv',
      channel,
      direction: options.direction,
      outcome: options.outcome,
      details: options.details ?? options.description ?? null,
    });
  }

  const nextNumber = await getNextSequenceNumber('rdv', opportunite_id, entreprise_id);
  await logEvent({
    type_evenement: `rdv_${nextNumber}`,
    description: options.description ?? null,
    opportunite_id,
    entreprise_id,
    channel,
    details: options.details ?? null,
  });
};

export const logDevis = async (
  opportunite_id?: string,
  entreprise_id?: number,
  options: LogOptions = {},
) => {
  const channel = resolveChannel(options.channel);
  if (!options.skipTouchpoint) {
    await createTouchpoint({
      opportunite_id,
      entreprise_id,
      step_kind: 'devis',
      channel,
      direction: options.direction,
      outcome: options.outcome,
      details: options.details ?? options.description ?? null,
    });
  }

  await logEvent({
    type_evenement: 'devis',
    description: options.description ?? null,
    opportunite_id,
    entreprise_id,
    channel,
    details: options.details ?? null,
  });
};

export const logSignature = async (
  opportunite_id?: string,
  entreprise_id?: number,
  options: LogOptions = {},
) => {
  const channel = resolveChannel(options.channel);
  if (!options.skipTouchpoint) {
    await createTouchpoint({
      opportunite_id,
      entreprise_id,
      step_kind: 'signature',
      channel,
      direction: options.direction,
      outcome: options.outcome,
      details: options.details ?? options.description ?? null,
    });
  }

  await logEvent({
    type_evenement: 'signature',
    description: options.description ?? null,
    opportunite_id,
    entreprise_id,
    channel,
    details: options.details ?? null,
  });
};

export const logAcompte = async (
  opportunite_id?: string,
  entreprise_id?: number,
  options: LogOptions = {},
) => {
  const channel = resolveChannel(options.channel);
  if (!options.skipTouchpoint) {
    await createTouchpoint({
      opportunite_id,
      entreprise_id,
      step_kind: 'acompte',
      channel,
      direction: options.direction,
      outcome: options.outcome,
      details: options.details ?? options.description ?? null,
    });
  }

  await logEvent({
    type_evenement: 'acompte',
    description: options.description ?? null,
    opportunite_id,
    entreprise_id,
    channel,
    details: options.details ?? null,
  });
};

export const logLeadMagnet = async (
  opportunite_id?: string,
  entreprise_id?: number,
  options: LogOptions = {},
) => {
  const channel = resolveChannel(options.channel);
  if (!options.skipTouchpoint) {
    await createTouchpoint({
      opportunite_id,
      entreprise_id,
      step_kind: 'lead_magnet',
      channel,
      direction: options.direction,
      outcome: options.outcome,
      details: options.details ?? options.description ?? null,
    });
  }

  await logEvent({
    type_evenement: 'lead_magnet',
    description: options.description ?? null,
    opportunite_id,
    entreprise_id,
    channel,
    details: options.details ?? null,
  });
};