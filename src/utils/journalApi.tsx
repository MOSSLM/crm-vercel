import { projectId, publicAnonKey } from './supabase/info';

import { ContactChannel, ContactDirection, ContactOutcome } from '../types';

import logger from './logger';
const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-5c06d9e7`;

const handleFetchError = async (
  response: Response,
  context: string,
): Promise<never> => {
  let message = context;
  try {
    const data = await response.json();
    message = data.error || data.message || message;
  } catch {
    try {
      const text = await response.text();
      if (text) {
        message = text;
      }
    } catch {
      // Ignore
    }
  }
  logger.error(context, message);
  throw new Error(message);
};

interface JournalEventData {
  type_evenement: string;
  description?: string;
  opportunite_id?: string;
  entreprise_id?: number;
}

interface JournalStats {
  appels: number;
  relances: number;
  rdvs: number;
  devis: number;
  signatures: number;
  acomptes: number;
  [key: string]: number;
}

interface JournalEntry {
  date: string;
  type_evenement: string;
  description?: string;
  opportunite_id?: string;
  entreprise_id?: number;
}

interface GetJournalHistoryOptions {
  limit?: number;
}

interface CreateTouchpointPayload {
  opportunite_id?: string;
  entreprise_id?: number;
  step_kind: string;
  channel: ContactChannel;
  direction?: ContactDirection;
  outcome?: ContactOutcome;
  details?: string;
}

export const createTouchpoint = async (
  payload: CreateTouchpointPayload,
): Promise<void> => {
  const response = await fetch(`${baseUrl}/journal/touchpoint`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({
      ...payload,
      direction: payload.direction ?? ContactDirection.Outgoing,
      outcome: payload.outcome ?? ContactOutcome.Inconnu,
    }),
  });

  if (!response.ok) {
    await handleFetchError(response, 'Failed to create touchpoint');
  }
};

// Fonction générique pour enregistrer un événement
export const logEvent = async (eventData: JournalEventData): Promise<void> => {
  const response = await fetch(`${baseUrl}/journal/log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify(eventData),
  });

  if (!response.ok) {
    await handleFetchError(response, 'Failed to log event');
  }
};

// Fonctions spécialisées pour chaque type d'événement
export const logCall = async (
  opportunite_id?: string,
  entreprise_id?: number,
  description?: string,
  channel: ContactChannel = ContactChannel.PasDefini,
  details?: string,
): Promise<void> => {
  await createTouchpoint({
    opportunite_id,
    entreprise_id,
    step_kind: 'cold_call',
    channel,
    details: details ?? description,
  });

  const response = await fetch(`${baseUrl}/journal/call`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({
      opportunite_id,
      entreprise_id,
      description,
      channel,
      details,
      skipTouchpoint: true,
    }),
  });

  if (!response.ok) {
    await handleFetchError(response, 'Failed to log call');
  }
};

export const logRelance = async (
  opportunite_id?: string,
  entreprise_id?: number,
  description?: string,
  channel: ContactChannel = ContactChannel.PasDefini,
  details?: string,
): Promise<void> => {
  await createTouchpoint({
    opportunite_id,
    entreprise_id,
    step_kind: 'relance',
    channel,
    details: details ?? description,
  });

  const response = await fetch(`${baseUrl}/journal/relance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({
      opportunite_id,
      entreprise_id,
      description,
      channel,
      details,
      skipTouchpoint: true,
    }),
  });

  if (!response.ok) {
    await handleFetchError(response, 'Failed to log relance');
  }
};

export const logRdv = async (
  opportunite_id?: string,
  entreprise_id?: number,
  description?: string,
  channel: ContactChannel = ContactChannel.PasDefini,
  details?: string,
): Promise<void> => {
  await createTouchpoint({
    opportunite_id,
    entreprise_id,
    step_kind: 'rdv',
    channel,
    details: details ?? description,
  });

  const response = await fetch(`${baseUrl}/journal/rdv`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({
      opportunite_id,
      entreprise_id,
      description,
      channel,
      details,
      skipTouchpoint: true,
    }),
  });

  if (!response.ok) {
    await handleFetchError(response, 'Failed to log rdv');
  }
};

export const logDevis = async (
  opportunite_id?: string,
  entreprise_id?: number,
  description?: string,
  channel: ContactChannel = ContactChannel.PasDefini,
  details?: string,
): Promise<void> => {
  await createTouchpoint({
    opportunite_id,
    entreprise_id,
    step_kind: 'devis',
    channel,
    details: details ?? description,
  });

  const response = await fetch(`${baseUrl}/journal/devis`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({
      opportunite_id,
      entreprise_id,
      description,
      channel,
      details,
      skipTouchpoint: true,
    }),
  });

  if (!response.ok) {
    await handleFetchError(response, 'Failed to log devis');
  }
};

export const logSignature = async (
  opportunite_id?: string,
  entreprise_id?: number,
  description?: string,
  channel: ContactChannel = ContactChannel.PasDefini,
  details?: string,
): Promise<void> => {
  await createTouchpoint({
    opportunite_id,
    entreprise_id,
    step_kind: 'signature',
    channel,
    details: details ?? description,
  });

  const response = await fetch(`${baseUrl}/journal/signature`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({
      opportunite_id,
      entreprise_id,
      description,
      channel,
      details,
      skipTouchpoint: true,
    }),
  });

  if (!response.ok) {
    await handleFetchError(response, 'Failed to log signature');
  }
};

export const logAcompte = async (
  opportunite_id?: string,
  entreprise_id?: number,
  description?: string,
  channel: ContactChannel = ContactChannel.PasDefini,
  details?: string,
): Promise<void> => {
  await createTouchpoint({
    opportunite_id,
    entreprise_id,
    step_kind: 'acompte',
    channel,
    details: details ?? description,
  });

  const response = await fetch(`${baseUrl}/journal/acompte`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({
      opportunite_id,
      entreprise_id,
      description,
      channel,
      details,
      skipTouchpoint: true,
    }),
  });

  if (!response.ok) {
    await handleFetchError(response, 'Failed to log acompte');
  }
};

export const logLeadMagnet = async (
  opportunite_id?: string,
  entreprise_id?: number,
  description?: string,
  channel: ContactChannel = ContactChannel.PasDefini,
  details?: string,
): Promise<void> => {
  await createTouchpoint({
    opportunite_id,
    entreprise_id,
    step_kind: 'lead_magnet',
    channel,
    details: details ?? description,
  });

  const response = await fetch(`${baseUrl}/journal/lead-magnet`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify({
      opportunite_id,
      entreprise_id,
      description,
      channel,
      details,
      skipTouchpoint: true,
    }),
  });

  if (!response.ok) {
    await handleFetchError(response, 'Failed to log lead magnet');
  }
};

// Obtenir les statistiques d'une opportunité ou entreprise
export const getJournalStats = async (opportunite_id?: string, entreprise_id?: number): Promise<JournalStats> => {
  const params = new URLSearchParams();
  if (opportunite_id) params.append('opportunite_id', opportunite_id);
  if (entreprise_id) params.append('entreprise_id', entreprise_id.toString());

  const response = await fetch(`${baseUrl}/journal/stats?${params}`, {
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get journal stats');
  }

  return response.json();
};

// Obtenir l'historique complet d'une opportunité ou entreprise
export const getJournalHistory = async (
  opportunite_id?: string,
  entreprise_id?: number,
  options?: GetJournalHistoryOptions
): Promise<JournalEntry[]> => {
  const params = new URLSearchParams();
  if (opportunite_id) params.append('opportunite_id', opportunite_id);
  if (entreprise_id) params.append('entreprise_id', entreprise_id.toString());
  const limit = options?.limit ?? 10;
  if (Number.isFinite(limit) && limit > 0) {
    params.append('limit', Math.floor(limit).toString());
  }

  const response = await fetch(`${baseUrl}/journal/history?${params}`, {
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get journal history');
  }

  return response.json();
};

// Obtenir le prochain numéro de séquence pour un type d'événement
export const getNextSequenceNumber = async (type: string, opportunite_id?: string, entreprise_id?: number): Promise<number> => {
  const params = new URLSearchParams();
  if (opportunite_id) params.append('opportunite_id', opportunite_id);
  if (entreprise_id) params.append('entreprise_id', entreprise_id.toString());

  const response = await fetch(`${baseUrl}/journal/next-sequence/${type}?${params}`, {
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get next sequence number');
  }

  const data = await response.json();
  return data.nextNumber;
};

/**
 * Mapping des étapes pipeline -> type d'événement
 * Découpé en 2 objets puis fusionné pour éviter les doublons dans un même literal (TS1117).
 */
const baseStageMap: Record<string, string> = {
  // Étapes génériques
  prospection: 'cold_call',
  contact: 'cold_call',
  qualification: 'qualification',
  rdv: 'rdv',
  proposition: 'devis',
  negotiation: 'negotiation',
  signature: 'signature',
  acompte: 'acompte',
  livraison: 'livraison',
  suivi: 'suivi',
};

const specificStageMap: Record<string, string> = {
  // Étapes spécifiques utilisées dans l'appli
  'cold call': 'cold_call',
  approche: 'cold_call',
  'relance 1': 'relance',
  'relance 2': 'relance',
  'relance 3': 'relance',
  'relance 4': 'relance',
  'relance 5': 'relance',
  'rdv de vente 1': 'rdv',
  'rdv de vente 2': 'rdv',
  'rdv de vente 3': 'rdv',
  'rdv 1': 'rdv',
  'rdv 2': 'rdv',
  'rdv 3': 'rdv',
  devis: 'devis',
  proposition: 'devis',          // surcharge voulue
  'devis envoyé': 'devis',
  'attente devis': 'devis',
  'négociation': 'negotiation',
  'négociation en cours': 'negotiation',
  signature: 'signature',
  'signé': 'signature',
  'contrat signé': 'signature',
  acompte: 'acompte',
  'acompte reçu': 'acompte',
  paiement: 'acompte',
  livraison: 'livraison',
  'livré': 'livraison',
  'terminé': 'livraison',
  suivi: 'suivi',
  'suivi client': 'suivi',
  'post-vente': 'suivi',
};

const stageToEventType: Record<string, string> = {
  ...baseStageMap,
  ...specificStageMap,
};

// Fonction utilitaire pour enregistrer automatiquement les changements d'étape dans le pipeline
export const logPipelineStageChange = async (
  newStage: string,
  opportunite_id?: string,
  entreprise_id?: number,
  description?: string,
  channel: ContactChannel = ContactChannel.PasDefini,
  details?: string,
): Promise<void> => {
  const normalizedStage = newStage.toLowerCase().trim();
  let eventType = stageToEventType[normalizedStage];

  // Si pas trouvé dans le mapping, utiliser la détection automatique
  if (!eventType) {
    logger.log(`[Journal] Étape "${newStage}" non trouvée dans le mapping, utilisation de la détection automatique`);
    eventType = detectEventTypeFromStageName(newStage);
  }

  try {
    switch (eventType) {
      case 'relance':
        await logRelance(
          opportunite_id,
          entreprise_id,
          description || `Passage à l'étape: ${newStage}`,
          channel,
          details,
        );
        break;
      case 'rdv':
        await logRdv(
          opportunite_id,
          entreprise_id,
          description || `Passage à l'étape: ${newStage}`,
          channel,
          details,
        );
        break;
      case 'devis':
        await logDevis(
          opportunite_id,
          entreprise_id,
          description || `Passage à l'étape: ${newStage}`,
          channel,
          details,
        );
        break;
      case 'signature':
        await logSignature(
          opportunite_id,
          entreprise_id,
          description || `Passage à l'étape: ${newStage}`,
          channel,
          details,
        );
        break;
      case 'acompte':
        await logAcompte(
          opportunite_id,
          entreprise_id,
          description || `Passage à l'étape: ${newStage}`,
          channel,
          details,
        );
        break;
      case 'cold_call':
        await logCall(
          opportunite_id,
          entreprise_id,
          description || `Passage à l'étape: ${newStage}`,
          channel,
          details,
        );
        break;
      default:
        await createTouchpoint({
          opportunite_id,
          entreprise_id,
          step_kind: eventType,
          channel,
          details: details ?? description,
        });
        await logEvent({
          type_evenement: eventType,
          description: description || `Passage à l'étape: ${newStage}`,
          opportunite_id,
          entreprise_id,
        });
        break;
    }
    logger.log(`[Journal] Événement "${eventType}" enregistré avec succès pour l'étape "${newStage}"`);
  } catch (error) {
    logger.error(`[Journal] Erreur lors de l'enregistrement de l'événement "${eventType}" pour l'étape "${newStage}":`, error);
    throw error;
  }
};

// Fonction utilitaire pour détecter automatiquement le type d'événement à partir du nom d'étape
export const detectEventTypeFromStageName = (stageName: string): string => {
  const normalized = stageName.toLowerCase().trim();

  // Détection par mots-clés (ordre important - du plus spécifique au plus général)
  if (
    normalized.includes('call') ||
    normalized.includes('appel') ||
    normalized.includes('cold') ||
    normalized.includes('approche')
  ) {
    return 'cold_call';
  }
  if (normalized.includes('relance')) {
    return 'relance';
  }
  if (
    normalized.includes('rdv') ||
    normalized.includes('rendez-vous') ||
    (normalized.includes('vente') && (normalized.includes('1') || normalized.includes('2') || normalized.includes('3')))
  ) {
    return 'rdv';
  }
  if (normalized.includes('devis') || normalized.includes('proposition') || normalized.includes('quote') || normalized.includes('estimate')) {
    return 'devis';
  }
  if (normalized.includes('négociation') || normalized.includes('negotiation') || normalized.includes('nego')) {
    return 'negotiation';
  }
  if (normalized.includes('signature') || normalized.includes('signé') || normalized.includes('contrat') || normalized.includes('signed')) {
    return 'signature';
  }
  if (normalized.includes('acompte') || normalized.includes('paiement') || normalized.includes('payment') || normalized.includes('deposit')) {
    return 'acompte';
  }
  if (
    normalized.includes('livraison') ||
    normalized.includes('livré') ||
    normalized.includes('delivery') ||
    normalized.includes('terminé') ||
    normalized.includes('completed')
  ) {
    return 'livraison';
  }
  if (normalized.includes('suivi') || normalized.includes('post') || normalized.includes('follow') || normalized.includes('maintenance')) {
    return 'suivi';
  }
  if (normalized.includes('qualification') || normalized.includes('qualifié') || normalized.includes('qualified')) {
    return 'qualification';
  }

  // Fallback: utiliser le nom normalisé comme type d'événement personnalisé
  return normalized.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
};

// Interface pour les totaux KPI depuis le journal
export interface JournalKpiPeriodTotals {
  total_appels: number;
  total_relances: number;
  total_rdvs: number;
  total_devis: number;
  total_signatures: number;
  total_acomptes: number;
  total_lead_magnets: number;
}

export interface JournalKpiTotals {
  total_appels: number;
  total_relances: number;
  total_rdvs: number;
  total_devis: number;
  total_signatures: number;
  total_acomptes: number;
  total_lead_magnets: number;
  week: JournalKpiPeriodTotals;
  month: JournalKpiPeriodTotals;
  quarter: JournalKpiPeriodTotals;
  year: JournalKpiPeriodTotals;
}

// Récupérer les totaux KPI depuis la vue journal
export const getJournalKpiTotals = async (): Promise<JournalKpiTotals> => {
  logger.log('📡 Appel API vers:', `${baseUrl}/kpi/journal-totals`);

  const response = await fetch(`${baseUrl}/kpi/journal-totals`, {
    headers: {
      Authorization: `Bearer ${publicAnonKey}`,
    },
  });

  logger.log('📡 Statut de la réponse:', response.status, response.statusText);

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("❌ Erreur de l'API:", errorText);

    let error;
    try {
      error = JSON.parse(errorText);
    } catch (e) {
      error = { error: errorText };
    }
    throw new Error(error.error || `HTTP ${response.status}: Failed to get journal KPI totals`);
  }

  const data = await response.json();
  logger.log("📊 Données reçues de l'API:", data);

  return data;
};

export const journalApi = {
  logEvent,
  logCall,
  logRelance,
  logRdv,
  logDevis,
  logSignature,
  logAcompte,
  logLeadMagnet,
  getJournalStats,
  getJournalHistory,
  getNextSequenceNumber,
  logPipelineStageChange,
  detectEventTypeFromStageName,
  getJournalKpiTotals,
};
