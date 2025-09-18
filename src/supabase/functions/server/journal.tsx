import { createClient } from 'npm:@supabase/supabase-js@2.39.3';

import logger from '../../../utils/logger.ts';
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

// Enregistrer une nouvelle entrée dans le journal
export const logEvent = async (entry: Omit<JournalEntry, 'date'>): Promise<void> => {
  const { error } = await supabase
    .from('journal_succes')
    .insert({
      date: new Date().toISOString(),
      type_evenement: entry.type_evenement,
      description: entry.description || null,
      opportunite_id: entry.opportunite_id || null,
      entreprise_id: entry.entreprise_id || null
    });

  if (error) {
    logger.error('Error logging journal entry:', error);
    throw error;
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

// Fonctions spécialisées pour chaque type d'événement
export const logCall = async (opportunite_id?: string, entreprise_id?: number, description?: string) => {
  await logEvent({
    type_evenement: 'cold_call',
    description,
    opportunite_id,
    entreprise_id
  });
};

export const logRelance = async (opportunite_id?: string, entreprise_id?: number, description?: string) => {
  const nextNumber = await getNextSequenceNumber('relance', opportunite_id, entreprise_id);
  await logEvent({
    type_evenement: `relance_${nextNumber}`,
    description,
    opportunite_id,
    entreprise_id
  });
};

export const logRdv = async (opportunite_id?: string, entreprise_id?: number, description?: string) => {
  const nextNumber = await getNextSequenceNumber('rdv', opportunite_id, entreprise_id);
  await logEvent({
    type_evenement: `rdv_${nextNumber}`,
    description,
    opportunite_id,
    entreprise_id
  });
};

export const logDevis = async (opportunite_id?: string, entreprise_id?: number, description?: string) => {
  await logEvent({
    type_evenement: 'devis',
    description,
    opportunite_id,
    entreprise_id
  });
};

export const logSignature = async (opportunite_id?: string, entreprise_id?: number, description?: string) => {
  await logEvent({
    type_evenement: 'signature',
    description,
    opportunite_id,
    entreprise_id
  });
};

export const logAcompte = async (opportunite_id?: string, entreprise_id?: number, description?: string) => {
  await logEvent({
    type_evenement: 'acompte',
    description,
    opportunite_id,
    entreprise_id
  });
};

export const logLeadMagnet = async (opportunite_id?: string, entreprise_id?: number, description?: string) => {
  await logEvent({
    type_evenement: 'lead_magnet',
    description,
    opportunite_id,
    entreprise_id
  });
};