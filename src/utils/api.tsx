import { supabase } from './supabase/client';
import {
  Achievement,
  Company,
  CompanyNetwork,
  CompanyRaw,
  Contact,
  EmployeeBand,
  Opportunity,
  OpportunityNote,
  PipelineStage,
  RevenueBand,
  SearchResult,
  UrlBlacklist,
} from '@/types';

import logger from './logger';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isCompanyRow = (row: unknown): row is Company =>
  isRecord(row) && typeof row.id === 'number';

const isCompanyRawRow = (row: unknown): row is CompanyRaw =>
  isRecord(row) && typeof row.id === 'number' && typeof row.recherche_id === 'string';

export const isOpportunityRow = (row: unknown): row is Opportunity =>
  isRecord(row) && typeof row.id === 'string' && 'lead_magnet' in row;

const isStageRow = (row: unknown): row is { id: number; nom?: string | null } =>
  isRecord(row) && typeof row.id === 'number';

const isFullStageRow = (row: unknown): row is PipelineStage =>
  isStageRow(row) &&
  typeof row.nom === 'string' &&
  typeof (row as { ordre?: unknown }).ordre === 'number' &&
  typeof (row as { visible?: unknown }).visible === 'boolean';

export const isSearchResultRow = (row: unknown): row is SearchResult =>
  isRecord(row) && typeof row.id === 'string' && typeof row.keyword === 'string';

const isCompanyNetworkRow = (row: unknown): row is CompanyNetwork =>
  isRecord(row) && typeof row.id === 'string' && typeof row.label === 'string';

const isUrlBlacklistRow = (row: unknown): row is UrlBlacklist =>
  isRecord(row) && typeof row.id === 'string' && typeof row.value === 'string';

export const isAchievementRow = (row: unknown): row is Achievement =>
  isRecord(row) && typeof row.id === 'number' && typeof row.date === 'string';

export const isOpportunityNoteRow = (row: unknown): row is OpportunityNote =>
  isRecord(row) &&
  typeof row.id === 'number' &&
  typeof row.opportunite_id === 'string' &&
  typeof row.theme === 'string' &&
  typeof row.created_at === 'string';

const SEARCH_RESULTS_COLUMNS = [
  'id',
  'created_at',
  'keyword',
  'location',
  'precision',
  'source_google',
  'source_maps',
  'status',
  'nb_trouves',
  'nb_qualifies'
] as const;
const SEARCH_RESULTS_SELECT = SEARCH_RESULTS_COLUMNS.join(',');

const COMPANY_COLUMNS = [
  'id',
  'canonical_url',
  'site_web_canonique',
  'name',
  'adresse',
  'lat',
  'lng',
  'premiers_tags',
  'sources',
  'raw_ids',
  'qualifie',
  'is_network',
  'is_blacklisted',
  'reseau_id',
  'created_at',
  'updated_at',
  'ca_estime_band',
  'nb_employes_band',
  'nb_employes_exact',
  'linkedin_url',
  'manually_enriched',
  'enriched_at',
  'enriched_by',
  'recherche_id',
  'place_id',
  'reference_url',
  'position',
  'note_moyenne',
  'nombre_avis',
  'ville',
  'code_postal',
  'pays',
  'telephone',
  'email',
  'contact_name'
] as const;
const COMPANY_SELECT = COMPANY_COLUMNS.join(',');

const RAW_COMPANY_COLUMNS = [
  'id',
  'recherche_id',
  'source',
  'position',
  'page',
  'title',
  'meta',
  'url',
  'keyword',
  'location',
  'name',
  'avis',
  'nombre_avis',
  'tags',
  'adresse',
  'lat',
  'lng',
  'telephone',
  'ferme_definitivement',
  'raw_json',
  'inserted_at'
] as const;
const RAW_COMPANY_SELECT = RAW_COMPANY_COLUMNS.join(',');

const COMPANY_METADATA_COLUMNS = ['id', 'name', 'canonical_url', 'raw_ids', 'linkedin_url'] as const;
const COMPANY_METADATA_SELECT = COMPANY_METADATA_COLUMNS.join(',');

const RAW_CONTACT_COLUMNS = ['id', 'telephone', 'raw_json'] as const;
const RAW_CONTACT_SELECT = RAW_CONTACT_COLUMNS.join(',');

const STAGE_METADATA_COLUMNS = ['id', 'nom'] as const;
const STAGE_METADATA_SELECT = STAGE_METADATA_COLUMNS.join(',');

const OPPORTUNITY_COLUMNS = [
  'id',
  'contact_id',
  'entreprise_id',
  'montant',
  'priorite',
  'stage_id',
  'lead_magnet',
  'note_base',
  'tags',
  'date_prochain_suivi',
  'created_at',
  'updated_at',
  'name',
  'type',
  'mrr',
  'recurrence_months'
] as const;
const OPPORTUNITY_SELECT = OPPORTUNITY_COLUMNS.join(',');

const COMPANIES_PAGE_SIZE = 500;

type CompanyMetadata = {
  id: number;
  name?: string | null;
  canonical_url?: string | null;
  raw_ids?: number[] | null;
  linkedin_url?: string | null;
};

type RawContactRecord = {
  id: number;
  telephone?: string | null;
  raw_json?: unknown;
};

const isCompanyMetadataRow = (row: unknown): row is CompanyMetadata =>
  isRecord(row) && typeof row.id === 'number';

const isRawContactRecord = (row: unknown): row is RawContactRecord =>
  isRecord(row) && typeof row.id === 'number';

const companyMetadataCache = new Map<number, CompanyMetadata>();
const stageMetadataCache = new Map<number, string>();

const parseRawJson = (raw: unknown): Record<string, unknown> | null => {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
};

const toOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const toOptionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined;

const toOptionalBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const toNumberArray = (value: unknown): number[] =>
  Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number')
    : [];

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

const buildCompanyFromPartial = (
  id: number,
  partial: Partial<Company> & {
    sources?: unknown;
    raw_ids?: unknown;
    qualifie?: unknown;
  }
): Company => {
  const now = new Date().toISOString();
  const lat = toOptionalNumber(partial.lat);
  const lng = toOptionalNumber(partial.lng);
  const latitude = toOptionalNumber(partial.latitude) ?? lat;
  const longitude = toOptionalNumber(partial.longitude) ?? lng;
  return {
    id,
    sources: toStringArray(partial.sources),
    raw_ids: toNumberArray(partial.raw_ids),
    qualifie: typeof partial.qualifie === 'boolean' ? partial.qualifie : false,
    created_at: typeof partial.created_at === 'string' ? partial.created_at : now,
    updated_at: typeof partial.updated_at === 'string' ? partial.updated_at : now,
    canonical_url: toOptionalString(partial.canonical_url),
    site_web_canonique: toOptionalString(partial.site_web_canonique),
    name: toOptionalString(partial.name),
    adresse: toOptionalString(partial.adresse),
    lat,
    lng,
    latitude,
    longitude,
    premiers_tags: toOptionalString(partial.premiers_tags),
    is_network: toOptionalBoolean(partial.is_network),
    is_blacklisted: toOptionalBoolean(partial.is_blacklisted),
    reseau_id: toOptionalString(partial.reseau_id),
    ca_estime_band:
      typeof partial.ca_estime_band === 'string'
        ? (partial.ca_estime_band as RevenueBand)
        : undefined,
    nb_employes_band:
      typeof partial.nb_employes_band === 'string'
        ? (partial.nb_employes_band as EmployeeBand)
        : undefined,
    nb_employes_exact: toOptionalNumber(partial.nb_employes_exact),
    linkedin_url: toOptionalString(partial.linkedin_url),
    manually_enriched: toOptionalBoolean(partial.manually_enriched),
    enriched_at: toOptionalString(partial.enriched_at),
    enriched_by: toOptionalString(partial.enriched_by),
    recherche_id: toOptionalString(partial.recherche_id),
    place_id: toOptionalString(partial.place_id),
    reference_url: toOptionalString(partial.reference_url),
    position: toOptionalNumber(partial.position),
    note_moyenne: toOptionalNumber(partial.note_moyenne),
    nombre_avis: toOptionalNumber(partial.nombre_avis),
    ville: toOptionalString(partial.ville),
    code_postal: toOptionalString(partial.code_postal),
    pays: toOptionalString(partial.pays),
    telephone: toOptionalString(partial.telephone),
    tel: toOptionalString(partial.tel),
    email: toOptionalString(partial.email),
    contact_name: toOptionalString(partial.contact_name),
    raw_contact_info: Array.isArray(partial.raw_contact_info)
      ? partial.raw_contact_info.filter(isCompanyRawRow)
      : undefined,
  };
};

const buildOpportunityFromPartial = (
  id: string,
  partial: Partial<Opportunity> & {
    priorite?: unknown;
    lead_magnet?: unknown;
  }
): Opportunity => {
  const now = new Date().toISOString();
  const priorite: Opportunity['priorite'] =
    partial.priorite === 'haute' || partial.priorite === 'moyenne' || partial.priorite === 'basse'
      ? partial.priorite
      : 'moyenne';
  const leadMagnet = typeof partial.lead_magnet === 'boolean' ? partial.lead_magnet : false;
  const opportunityNotes = Array.isArray(partial.opportunityNotes)
    ? (partial.opportunityNotes as unknown[]).filter(isOpportunityNoteRow)
    : [];

  return {
    id,
    priorite,
    lead_magnet: leadMagnet,
    created_at: typeof partial.created_at === 'string' ? partial.created_at : now,
    updated_at: typeof partial.updated_at === 'string' ? partial.updated_at : now,
    contact_id: toOptionalString(partial.contact_id),
    entreprise_id: toOptionalNumber(partial.entreprise_id),
    montant: toOptionalNumber(partial.montant),
    stage_id: toOptionalNumber(partial.stage_id),
    note_base: toOptionalString(partial.note_base),
    tags: toOptionalString(partial.tags),
    date_prochain_suivi: toOptionalString(partial.date_prochain_suivi),
    name: toOptionalString(partial.name),
    type:
      partial.type === 'one_shot' || partial.type === 'mrr'
        ? partial.type
        : undefined,
    mrr: toOptionalNumber(partial.mrr),
    recurrence_months: toOptionalNumber(partial.recurrence_months),
    companyName: toOptionalString(partial.companyName),
    companyUrl: toOptionalString(partial.companyUrl),
    contactId: toOptionalString(partial.contactId),
    stage: toOptionalString(partial.stage),
    value: toOptionalNumber(partial.value),
    priority:
      partial.priority === 'high' || partial.priority === 'medium' || partial.priority === 'low'
        ? partial.priority
        : undefined,
    notes: toOptionalString(partial.notes),
    createdDate: toOptionalString(partial.createdDate),
    lastUpdate: toOptionalString(partial.lastUpdate),
    nextFollowUp: toOptionalString(partial.nextFollowUp),
    opportunityNotes,
    pipelineHistory: Array.isArray(partial.pipelineHistory)
      ? (partial.pipelineHistory as unknown[])
      : [],
    leadMagnet: typeof partial.leadMagnet === 'boolean' ? partial.leadMagnet : undefined,
    leadMagnetCreatedDate: toOptionalString(partial.leadMagnetCreatedDate),
    telephone: toOptionalString(partial.telephone),
    email: toOptionalString(partial.email),
    linkedin_url: toOptionalString(partial.linkedin_url),
    contact_name: toOptionalString(partial.contact_name),
  };
};

const mapOpportunityPriority = (
  priorite: Opportunity['priorite']
): NonNullable<Opportunity['priority']> => {
  switch (priorite) {
    case 'haute':
      return 'high';
    case 'basse':
      return 'low';
    case 'moyenne':
    default:
      return 'medium';
  }
};

const mapAchievementEventType = (
  typeEvenement: string | undefined
): Achievement['type'] | undefined => {
  switch (typeEvenement) {
    case 'signature':
    case 'deposit':
    case 'lead_magnet':
    case 'qualified':
    case 'meeting':
    case 'monthly_goal':
      return typeEvenement;
    default:
      return undefined;
  }
};

const buildAchievementFromPartial = (
  id: number,
  partial: Partial<Achievement>
): Achievement => {
  const now = new Date().toISOString();
  return {
    id,
    date: typeof partial.date === 'string' ? partial.date : now,
    type_evenement: toOptionalString(partial.type_evenement),
    description: toOptionalString(partial.description),
    opportunite_id: toOptionalString(partial.opportunite_id),
    entreprise_id: toOptionalNumber(partial.entreprise_id),
    type:
      partial.type === 'signature' ||
      partial.type === 'deposit' ||
      partial.type === 'lead_magnet' ||
      partial.type === 'qualified' ||
      partial.type === 'meeting' ||
      partial.type === 'monthly_goal'
        ? partial.type
        : undefined,
    title: toOptionalString(partial.title),
    value: toOptionalNumber(partial.value),
    companyName: toOptionalString(partial.companyName),
  };
};

const buildOpportunityNoteFromPartial = (
  id: number,
  partial: Partial<OpportunityNote>
): OpportunityNote => {
  const now = new Date().toISOString();
  const theme: OpportunityNote['theme'] =
    partial.theme === 'appel' ||
    partial.theme === 'linkedin' ||
    partial.theme === 'whatsapp' ||
    partial.theme === 'email' ||
    partial.theme === 'autre'
      ? partial.theme
      : 'autre';

  return {
    id,
    opportunite_id: toOptionalString(partial.opportunite_id) ?? '',
    theme,
    contenu: toOptionalString(partial.contenu),
    created_at: typeof partial.created_at === 'string' ? partial.created_at : now,
  };
};

const extractContactInfoFromRawEntries = (rawEntries: RawContactRecord[]) => {
  let telephone = '';
  let email = '';
  let contact_name = '';

  for (const entry of rawEntries) {
    if (!telephone && entry.telephone) {
      telephone = entry.telephone;
    }

    const parsed = parseRawJson(entry.raw_json);
    if (parsed) {
      if (!email) {
        const candidate = parsed.email || parsed.contact_email;
        if (typeof candidate === 'string') {
          email = candidate;
        }
      }
      if (!contact_name) {
        const candidate = parsed.contact_name || parsed.owner;
        if (typeof candidate === 'string') {
          contact_name = candidate;
        }
      }
    }

    if (telephone && email && contact_name) {
      break;
    }
  }

  return { telephone, email, contact_name };
};

export const canonicalizeDomain = (url: string): string => {
  try {
    const { hostname } = new URL(url.startsWith('http') ? url : `http://${url}`);
    return hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return url
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .toLowerCase();
  }
};
// Search Results API (table: recherches)
export const searchResultsApi = {
  getAll: async (): Promise<SearchResult[]> => {
    try {
      const { data, error } = await supabase
        .from('recherches')
        .select(SEARCH_RESULTS_SELECT)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error('Supabase error:', error);
        const fallback: SearchResult[] = [
          {
            id: '1',
            created_at: '2024-01-15T00:00:00Z',
            keyword: 'restaurant',
            location: 'Paris',
            precision: 'Précise',
            source_google: true,
            source_maps: true,
            status: 'completed',
            nb_trouves: 5,
            nb_qualifies: 2,
          },
          {
            id: '2',
            created_at: '2024-01-14T00:00:00Z',
            keyword: 'coiffeur',
            location: 'Lyon',
            precision: 'Large',
            source_google: true,
            source_maps: true,
            status: 'completed',
            nb_trouves: 5,
            nb_qualifies: 2,
          },
        ];
        return fallback;
      }

      const rows = Array.isArray(data) ? (data as unknown[]) : [];
      return rows.filter(isSearchResultRow);
    } catch (error) {
      logger.error('API Error:', error);
      return [];
    }
  },

  create: async (
    searchData: Omit<SearchResult, 'id' | 'created_at'>
  ): Promise<SearchResult> => {
    try {
      const { data, error } = await supabase
        .from('recherches')
        .insert([searchData])
        .select()
        .single();

      if (error) throw error;
      if (isSearchResultRow(data)) {
        return data;
      }
      logger.error('Invalid search result payload received from Supabase');
    } catch (error) {
      logger.error('Error creating search:', error);
    }

    const now = new Date().toISOString();
    return {
      id: Date.now().toString(),
      created_at: now,
      keyword: searchData.keyword,
      location: searchData.location,
      precision: searchData.precision,
      source_google: searchData.source_google,
      source_maps: searchData.source_maps,
      status: searchData.status ?? 'pending',
      nb_trouves: searchData.nb_trouves ?? 0,
      nb_qualifies: searchData.nb_qualifies ?? 0,
    };
  },

  update: async (
    id: string,
    updates: Partial<SearchResult>
  ): Promise<SearchResult> => {
    try {
      const { data, error } = await supabase
        .from('recherches')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      if (isSearchResultRow(data)) {
        return data;
      }
      logger.error('Invalid updated search result payload received from Supabase');
    } catch (error) {
      logger.error('Error updating search:', error);
    }

    const status =
      typeof updates.status === 'string' &&
      ['pending', 'completed', 'failed'].includes(updates.status)
        ? (updates.status as SearchResult['status'])
        : 'pending';

    return {
      id,
      created_at:
        typeof updates.created_at === 'string'
          ? updates.created_at
          : new Date().toISOString(),
      keyword: typeof updates.keyword === 'string' ? updates.keyword : '',
      location: typeof updates.location === 'string' ? updates.location : '',
      precision: typeof updates.precision === 'string' ? updates.precision : '',
      source_google:
        typeof updates.source_google === 'boolean' ? updates.source_google : false,
      source_maps:
        typeof updates.source_maps === 'boolean' ? updates.source_maps : false,
      status,
      nb_trouves: typeof updates.nb_trouves === 'number' ? updates.nb_trouves : 0,
      nb_qualifies:
        typeof updates.nb_qualifies === 'number' ? updates.nb_qualifies : 0,
    };
  },
};

// Companies API with enhanced fields (table: entreprises)
export const companiesApi = {
  getAll: async () => {
    try {
      const allCompanies: Company[] = [];
      let from = 0;
      let to = COMPANIES_PAGE_SIZE - 1;
      let pageIndex = 0;

      while (true) {
        const { data, error } = await supabase
          .from('entreprises')
          .select(COMPANY_SELECT)
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) {
          logger.error('Supabase error:', error);
          if (pageIndex === 0) {
            const fallbackCompanies: Company[] = [
              {
                id: 1,
                canonical_url: 'https://legourmet.fr',
                name: 'Restaurant Le Gourmet',
                adresse: '15 rue de la Paix, 75001 Paris',
                lat: 48.8566,
                lng: 2.3522,
                premiers_tags: 'Restaurant,Gastronomie',
                sources: ['google_search'],
                raw_ids: [1],
                qualifie: true,
                is_network: false,
                is_blacklisted: false,
                created_at: '2024-01-15T00:00:00Z',
                updated_at: '2024-01-16T00:00:00Z',
                ca_estime_band: '500k-1m',
                nb_employes_band: '11-50',
                nb_employes_exact: 25,
                linkedin_url: 'https://linkedin.com/company/legourmet',
                site_web_canonique: 'https://legourmet.fr',
                manually_enriched: false,
                enriched_at: undefined,
                enriched_by: undefined,
              },
              {
                id: 2,
                canonical_url: 'https://bistrotparis.fr',
                name: 'Bistrot de Paris',
                adresse: '8 rue Saint-Antoine, 75004 Paris',
                lat: 48.8553,
                lng: 2.3647,
                premiers_tags: 'Restaurant,Bistrot',
                sources: ['google_maps'],
                raw_ids: [2],
                qualifie: true,
                is_network: false,
                is_blacklisted: false,
                created_at: '2024-01-15T00:00:00Z',
                updated_at: '2024-01-16T00:00:00Z',
                ca_estime_band: '100k-500k',
                nb_employes_band: '1-10',
                nb_employes_exact: 8,
                linkedin_url: undefined,
                site_web_canonique: 'https://bistrotparis.fr',
                manually_enriched: false,
                enriched_at: undefined,
                enriched_by: undefined,
              },
            ];
            return fallbackCompanies;
          }
          break;
        }

        const rows = Array.isArray(data) ? (data as unknown[]) : [];
        const validCompanies = rows.filter(isCompanyRow);
        if (validCompanies.length > 0) {
          allCompanies.push(...validCompanies);
        }

        if (rows.length < COMPANIES_PAGE_SIZE) {
          break;
        }

        pageIndex += 1;
        from += COMPANIES_PAGE_SIZE;
        to += COMPANIES_PAGE_SIZE;
      }

      const deduped: Company[] = [];
      const seenIds = new Set<number>();
      for (const company of allCompanies) {
        if (!company) {
          continue;
        }
        if (typeof company?.id === 'number') {
          if (seenIds.has(company.id)) {
            continue;
          }
          seenIds.add(company.id);
        }
        deduped.push(company);
      }

      return deduped;
    } catch (error) {
      logger.error('API Error:', error);
      return [];
    }
  },

  getQualifiedOnly: async () => {
    const pageSize = COMPANIES_PAGE_SIZE;
    let from = 0;
    let to = pageSize - 1;
    const allQualified: Company[] = [];

    try {
      while (true) {
        const { data, error } = await supabase
          .from('entreprises')
          .select(COMPANY_SELECT)
          .eq('qualifie', true)
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) {
          logger.error('Supabase error:', error);
          break;
        }

        const rows = Array.isArray(data) ? (data as unknown[]) : [];
        const validCompanies = rows.filter(isCompanyRow);
        if (validCompanies.length > 0) {
          allQualified.push(...validCompanies);
        }

        if (rows.length < pageSize) {
          break;
        }

        from += pageSize;
        to += pageSize;
      }

      return allQualified;
    } catch (error) {
      logger.error('API Error:', error);
      return [];
    }
  },
  
  create: async (
    companyData: Omit<Company, 'id' | 'created_at' | 'updated_at'>
  ) => {
    try {
      const { data, error } = await supabase
        .from('entreprises')
        .insert([companyData])
        .select()
        .single();
      
      if (error) throw error;
      if (isCompanyRow(data)) {
        return data;
      }
      logger.error('Invalid company payload received from Supabase');
      throw new Error('Invalid company payload');
    } catch (error) {
      logger.error('Error creating company:', error);
      const now = new Date().toISOString();
      return buildCompanyFromPartial(Date.now(), {
        ...companyData,
        created_at: now,
        updated_at: now,
        is_network: false,
        is_blacklisted: false,
      });
    }
  },
  
  update: async (id: number, updates: Partial<Company>) => {
    try {
      // Helper function to convert enum values from UI format (with hyphens) to DB format (with underscores)
      const convertEnumForDatabase = (value: string): string => {
        return value.replace(/-/g, '_');
      };

      // Convert enum fields if they exist
      const convertedUpdates = { ...updates } as Partial<Company> & Record<string, unknown>;
      if (convertedUpdates.ca_estime_band) {
        convertedUpdates.ca_estime_band = convertEnumForDatabase(convertedUpdates.ca_estime_band as string) as RevenueBand;
      }
      if (convertedUpdates.nb_employes_band) {
        convertedUpdates.nb_employes_band = convertEnumForDatabase(convertedUpdates.nb_employes_band as string) as EmployeeBand;
      }

      const { data, error } = await supabase
        .from('entreprises')
        .update({ ...convertedUpdates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      if (isCompanyRow(data)) {
        return data;
      }
      logger.error('Invalid updated company payload received from Supabase');
      throw new Error('Invalid company payload');
    } catch (error) {
      logger.error('Error updating company:', error);
      const now = new Date().toISOString();
      return buildCompanyFromPartial(id, { ...updates, updated_at: now });
    }
  },
  
  delete: async (id: number) => {
    try {
      // First, get the raw_ids associated with this company
      const { data: company, error: fetchError } = await supabase
        .from('entreprises')
        .select('raw_ids')
        .eq('id', id)
        .single();

      if (fetchError) {
        logger.error('Error fetching company raw_ids:', fetchError);
        throw fetchError;
      }

      // Delete associated raw companies if they exist
      const rawIds = isRecord(company) && Array.isArray((company as { raw_ids?: unknown }).raw_ids)
        ? ((company as { raw_ids: number[] }).raw_ids)
        : [];

      if (rawIds.length > 0) {
        const { error: rawDeleteError } = await supabase
          .from('entreprises_raw')
          .delete()
          .in('id', rawIds);

        if (rawDeleteError) {
          logger.error('Error deleting raw companies:', rawDeleteError);
          // Continue with company deletion even if raw deletion fails
        }
      }

      // Then delete the company
      const { error: companyDeleteError } = await supabase
        .from('entreprises')
        .delete()
        .eq('id', id);
      
      if (companyDeleteError) throw companyDeleteError;
    } catch (error) {
      logger.error('Error deleting company:', error);
      throw error;
    }
  },

  getById: async (id: number) => {
    try {
      // Get company with all its fields
      const { data: company, error } = await supabase
        .from('entreprises')
        .select(COMPANY_SELECT)
        .eq('id', id)
        .single();
      
      if (error) {
        logger.error('Error fetching company:', error);
        return null;
      }

      if (!company) {
        logger.warn(`No company found with id ${id}`);
        return null;
      }

      if (!isCompanyRow(company)) {
        logger.error('Invalid company payload received from Supabase');
        return null;
      }

      const companyData: Company = company;

      const rawIds = Array.isArray(companyData.raw_ids) ? companyData.raw_ids : [];
      let rawContactInfo: CompanyRaw[] = [];

      if (rawIds.length > 0) {
        try {
          const { data: rawData, error: rawError } = await supabase
            .from('entreprises_raw')
            .select(RAW_COMPANY_SELECT)
            .in('id', rawIds);

          if (!rawError) {
            const rawRows = Array.isArray(rawData) ? (rawData as unknown[]) : [];
            const validRawData = rawRows.filter(isCompanyRawRow);
            if (validRawData.length > 0) {
              rawContactInfo = validRawData;
            }
          }
        } catch (rawError) {
          logger.error('Error fetching raw contact data:', rawError);
        }
      }

      const contactInfo = extractContactInfoFromRawEntries(
        rawContactInfo.map((entry) => ({
          id: entry.id,
          telephone: entry.telephone,
          raw_json: entry.raw_json,
        }))
      );

      return {
        ...companyData,
        raw_contact_info: rawContactInfo,
        telephone: contactInfo.telephone,
        email: contactInfo.email,
        contact_name: contactInfo.contact_name,
      };
    } catch (error) {
      logger.error('Error fetching company by ID:', error);
      return null;
    }
  },

  // Get companies with their raw contact info
  getAllWithRawData: async () => {
    try {
      const companies = await companiesApi.getAll();
      
      // For each company, fetch raw contact data
      const companiesWithRawData = await Promise.all(
        companies.map(async (company) => {
          const rawIds = Array.isArray(company.raw_ids) ? company.raw_ids : [];
          if (rawIds.length > 0) {
            try {
              const { data: rawData, error: rawError } = await supabase
                .from('entreprises_raw')
                .select(RAW_COMPANY_SELECT)
                .in('id', rawIds);

              if (!rawError) {
                const rawRows = Array.isArray(rawData) ? (rawData as unknown[]) : [];
                const validRawData = rawRows.filter(isCompanyRawRow);
                if (validRawData.length > 0) {
                  const contactInfo = extractContactInfoFromRawEntries(
                    validRawData.map((entry) => ({
                      id: entry.id,
                      telephone: entry.telephone,
                      raw_json: entry.raw_json,
                    }))
                  );

                  return {
                    ...company,
                    raw_contact_info: validRawData,
                    telephone: contactInfo.telephone,
                    email: contactInfo.email,
                    contact_name: contactInfo.contact_name,
                  };
                }
              }
            } catch (error) {
              logger.error('Error fetching raw data for company:', company.id, error);
            }
          }
          return company;
        })
      );
      
      return companiesWithRawData;
    } catch (error) {
      logger.error('Error fetching companies with raw data:', error);
      return [];
    }
  }
};

// Raw Companies API (table: entreprises_raw)
export const rawCompaniesApi = {
  getBySearch: async (rechercheId: string) => {
    try {
      const { data, error } = await supabase
        .from('entreprises_raw')
        .select(RAW_COMPANY_SELECT)
        .eq('recherche_id', rechercheId)
        .order('position', { ascending: true });
      
      if (error) throw error;
      return Array.isArray(data) ? data.filter(isCompanyRawRow) : [];
    } catch (error) {
      logger.error('Error fetching raw companies:', error);
      return [];
    }
  },
  
  getByIds: async (ids: number[]) => {
    try {
      const { data, error } = await supabase
        .from('entreprises_raw')
        .select(RAW_COMPANY_SELECT)
        .in('id', ids);
      
      if (error) throw error;
      return Array.isArray(data) ? data.filter(isCompanyRawRow) : [];
    } catch (error) {
      logger.error('Error fetching raw companies by IDs:', error);
      return [];
    }
  },
  
  create: async (rawCompanyData: Record<string, unknown>) => {
    try {
      const { data, error } = await supabase
        .from('entreprises_raw')
        .insert([rawCompanyData])
        .select()
        .single();
      
      if (error) throw error;
      if (isCompanyRawRow(data)) {
        return data;
      }
      logger.error('Invalid raw company payload received from Supabase');
      throw new Error('Invalid raw company payload');
    } catch (error) {
      logger.error('Error creating raw company:', error);
      return { ...rawCompanyData, id: Date.now() };
    }
  }
};

// Contacts API using real database columns
const CONTACTS_MAX_PAGE_SIZE = 200;
const DEFAULT_CONTACTS_PAGE_SIZE = 200;

type ContactsCacheEntry = {
  contacts: Contact[];
  nextCursor: string | null;
  fullyLoaded: boolean;
};

type CompanyContactsResponse = {
  contacts: Contact[];
  nextCursor: string | null;
  hasMore: boolean;
};

const contactsListCache = new Map<number, ContactsCacheEntry>();

const createEmptyContactsCacheEntry = (): ContactsCacheEntry => ({
  contacts: [],
  nextCursor: null,
  fullyLoaded: false,
});

const mapContactRecord = (contact: any): Contact => ({
  ...contact,
  nom: contact.last_name,
  prenom: contact.first_name,
  poste: contact.role_title,
  linkedin: contact.linkedin_url,
});

const invalidateContactsCache = (companyId?: number) => {
  if (companyId !== undefined && companyId !== null) {
    contactsListCache.delete(companyId);
  } else {
    contactsListCache.clear();
  }
};

const getContactsCacheEntry = (companyId: number): ContactsCacheEntry => {
  const existing = contactsListCache.get(companyId);
  if (existing) {
    return existing;
  }
  const emptyEntry = createEmptyContactsCacheEntry();
  contactsListCache.set(companyId, emptyEntry);
  return emptyEntry;
};

const fetchContactsPage = async (
  companyId: number,
  after: string | null,
  size: number
): Promise<CompanyContactsResponse> => {
  const pageSize = Math.min(size, CONTACTS_MAX_PAGE_SIZE);

  const { data, error } = await supabase.rpc('list_company_contacts', {
    p_company_id: companyId,
    p_after: after,
    p_page_size: pageSize,
  });

  if (error) {
    logger.error('Supabase error:', error);
    return { contacts: [], nextCursor: after, hasMore: false };
  }

  const mapped = (data || []).map(mapContactRecord);
  const nextCursor = mapped.length > 0 ? mapped[mapped.length - 1]?.created_at ?? null : after;
  const hasMore = mapped.length === pageSize;

  return { contacts: mapped, nextCursor, hasMore };
};

const loadContactsForCompany = async (
  companyId: number,
  options?: { cursor?: string | null; forceRefresh?: boolean; pageSize?: number }
): Promise<CompanyContactsResponse> => {
  const forceRefresh = options?.forceRefresh ?? false;
  const requestedPageSize = options?.pageSize ?? DEFAULT_CONTACTS_PAGE_SIZE;
  const targetSize = requestedPageSize > 0 ? requestedPageSize : DEFAULT_CONTACTS_PAGE_SIZE;

  let entry = forceRefresh ? createEmptyContactsCacheEntry() : getContactsCacheEntry(companyId);

  if (forceRefresh) {
    contactsListCache.set(companyId, entry);
  }

  if (options?.cursor !== undefined && options.cursor !== null) {
    const cursor = options.cursor;
    let aggregated: Contact[] = [];
    let currentCursor: string | null = cursor;
    let nextCursor: string | null = cursor;
    let hasMore = true;

    while (hasMore && aggregated.length < targetSize) {
      const remaining = targetSize - aggregated.length;
      const { contacts, nextCursor: pageCursor, hasMore: pageHasMore } = await fetchContactsPage(
        companyId,
        currentCursor,
        remaining > 0 ? remaining : CONTACTS_MAX_PAGE_SIZE
      );

      if (contacts.length === 0) {
        hasMore = false;
        break;
      }

      aggregated = aggregated.concat(contacts);
      currentCursor = pageCursor;
      nextCursor = pageCursor;
      hasMore = pageHasMore;
    }

    if (entry.nextCursor === cursor) {
      entry = {
        contacts: entry.contacts.concat(aggregated),
        nextCursor,
        fullyLoaded: entry.fullyLoaded || !hasMore,
      };
      contactsListCache.set(companyId, entry);
    } else if (forceRefresh || entry.contacts.length === 0) {
      entry = {
        contacts: aggregated,
        nextCursor,
        fullyLoaded: !hasMore,
      };
      contactsListCache.set(companyId, entry);
    }

    return {
      contacts: aggregated,
      nextCursor,
      hasMore,
    };
  }

  if (entry.contacts.length === 0 || forceRefresh) {
    entry = createEmptyContactsCacheEntry();
  }

  let hasMore = !entry.fullyLoaded;

  while (entry.contacts.length < targetSize && hasMore) {
    const remaining = targetSize - entry.contacts.length;
    const { contacts, nextCursor, hasMore: pageHasMore } = await fetchContactsPage(
      companyId,
      entry.nextCursor,
      remaining > 0 ? remaining : CONTACTS_MAX_PAGE_SIZE
    );

    if (contacts.length === 0) {
      entry.fullyLoaded = true;
      hasMore = false;
      break;
    }

    entry.contacts = entry.contacts.concat(contacts);
    entry.nextCursor = nextCursor;
    entry.fullyLoaded = !pageHasMore;
    hasMore = pageHasMore;
  }

  contactsListCache.set(companyId, entry);

  return {
    contacts: entry.contacts,
    nextCursor: entry.nextCursor,
    hasMore: !entry.fullyLoaded,
  };
};

export const contactsApi = {
  getAll: async (options?: {
    companyIds?: number[];
    forceRefresh?: boolean;
    pageSizePerCompany?: number;
  }): Promise<Contact[]> => {
    try {
      const companyIds = options?.companyIds ?? [];

      if (companyIds.length === 0) {
        return Array.from(contactsListCache.values()).flatMap((entry) => entry.contacts);
      }

      const results = await Promise.all(
        companyIds.map((companyId) =>
          loadContactsForCompany(companyId, {
            forceRefresh: options?.forceRefresh,
            pageSize: options?.pageSizePerCompany,
          })
        )
      );

      return results.flatMap((result) => result.contacts);
    } catch (error) {
      logger.error('API Error:', error);
      return [];
    }
  },
  
  create: async (contactData: Partial<Contact>) => {
    try {
      // Map UI fields to database columns
      const dbFields = {
        entreprise_id: contactData.entreprise_id,
        first_name: contactData.first_name,
        last_name: contactData.last_name,
        email: contactData.email,
        tel: contactData.tel,
        role_title: contactData.poste || contactData.role_title,
        linkedin_url: contactData.linkedin || contactData.linkedin_url,
        is_decision_maker: contactData.is_decision_maker || false,
        preferred_channel: contactData.preferred_channel,
        notes: contactData.notes
      };

      // Remove undefined values
      const cleanedFields = Object.fromEntries(
        Object.entries(dbFields).filter(([_, value]) => value !== undefined)
      );

      const { data, error } = await supabase
        .from('contacts')
        .insert([cleanedFields])
        .select()
        .single();
      
      if (error) {
        logger.error('Supabase create error:', error);
        throw error;
      }
      
      if (!isRecord(data)) {
        logger.error('Invalid contact payload received from Supabase');
        throw new Error('Invalid contact payload');
      }

      const mapped = mapContactRecord(data);

      if (mapped.entreprise_id) {
        const cached = contactsListCache.get(mapped.entreprise_id);
        if (cached) {
          contactsListCache.set(mapped.entreprise_id, {
            ...cached,
            contacts: [mapped, ...cached.contacts],
          });
        } else {
          contactsListCache.set(mapped.entreprise_id, {
            contacts: [mapped],
            nextCursor: null,
            fullyLoaded: false,
          });
        }
      }

      return mapped;
    } catch (error) {
      logger.error('Error creating contact:', error);
      throw error;
    }
  },
  
  update: async (id: string, updates: Partial<Contact>) => {
    try {
      // Map UI fields to database columns
      const dbUpdates: Record<string, unknown> = {};
      if (updates.first_name !== undefined) dbUpdates.first_name = updates.first_name;
      if (updates.last_name !== undefined) dbUpdates.last_name = updates.last_name;
      if (updates.email !== undefined) dbUpdates.email = updates.email;
      if (updates.tel !== undefined) dbUpdates.tel = updates.tel;
      if (updates.poste !== undefined) dbUpdates.role_title = updates.poste;
      if (updates.role_title !== undefined) dbUpdates.role_title = updates.role_title;
      if (updates.linkedin !== undefined) dbUpdates.linkedin_url = updates.linkedin;
      if (updates.linkedin_url !== undefined) dbUpdates.linkedin_url = updates.linkedin_url;
      if (updates.is_decision_maker !== undefined) dbUpdates.is_decision_maker = updates.is_decision_maker;
      if (updates.preferred_channel !== undefined) dbUpdates.preferred_channel = updates.preferred_channel;
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
      
      // Add updated timestamp
      dbUpdates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('contacts')
        .update(dbUpdates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        logger.error('Supabase update error:', error);
        throw error;
      }

      if (!isRecord(data)) {
        logger.error('Invalid contact payload received from Supabase');
        throw new Error('Invalid contact payload');
      }

      const mapped = mapContactRecord(data);

      if (mapped.entreprise_id) {
        const cached = contactsListCache.get(mapped.entreprise_id);
        if (cached) {
          contactsListCache.set(mapped.entreprise_id, {
            ...cached,
            contacts: cached.contacts.map((contact) =>
              contact.id === mapped.id ? mapped : contact
            ),
          });
        }
      } else {
        invalidateContactsCache();
      }

      return mapped;
    } catch (error) {
      logger.error('Error updating contact:', error);
      throw error;
    }
  },

  delete: async (id: string) => {
    try {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      contactsListCache.forEach((entry, companyId) => {
        const filtered = entry.contacts.filter((contact) => contact.id !== id);
        if (filtered.length !== entry.contacts.length) {
          contactsListCache.set(companyId, {
            ...entry,
            contacts: filtered,
          });
        }
      });
    } catch (error) {
      logger.error('Error deleting contact:', error);
      throw error;
    }
  },

  // Get employees by company ID
  getByCompany: async (
    companyId: number,
    options?: { cursor?: string | null; pageSize?: number; forceRefresh?: boolean }
  ): Promise<CompanyContactsResponse> => {
    try {
      const response = await loadContactsForCompany(companyId, {
        cursor: options?.cursor ?? null,
        forceRefresh: options?.forceRefresh,
        pageSize: options?.pageSize,
      });

      return response;
    } catch (error) {
      logger.error('API Error:', error);
      return { contacts: [], nextCursor: null, hasMore: false };
    }
  },

  getManyByCompanyIds: async (
    companyIds: number[],
    options?: { forceRefresh?: boolean; pageSizePerCompany?: number }
  ): Promise<Record<number, Contact[]>> => {
    const uniqueIds = Array.from(new Set(companyIds));
    const result: Record<number, Contact[]> = {};

    if (uniqueIds.length === 0) {
      return result;
    }

    const targetSize = options?.pageSizePerCompany ?? DEFAULT_CONTACTS_PAGE_SIZE;

    const idsToFetch = options?.forceRefresh
      ? uniqueIds
      : uniqueIds.filter((id) => {
          const entry = contactsListCache.get(id);
          if (!entry) {
            return true;
          }

          if (!entry.fullyLoaded && entry.contacts.length < targetSize) {
            return true;
          }

          return false;
        });

    if (idsToFetch.length > 0) {
      const responses = await Promise.all(
        idsToFetch.map((id) =>
          loadContactsForCompany(id, {
            forceRefresh: options?.forceRefresh,
            pageSize: targetSize,
          })
        )
      );

      responses.forEach((response, index) => {
        const companyId = idsToFetch[index];
        contactsListCache.set(companyId, {
          contacts: response.contacts,
          nextCursor: response.nextCursor,
          fullyLoaded: !response.hasMore,
        });
      });
    }

    uniqueIds.forEach((id) => {
      const entry = contactsListCache.get(id);
      result[id] = entry ? entry.contacts : [];
    });

    return result;
  },

  // Contact notes methods - using the notes field in contacts table
  addNote: async (contactId: string, note: string) => {
    try {
      // Get current contact
      const { data: contact, error: fetchError } = await supabase
        .from('contacts')
        .select('notes')
        .eq('id', contactId)
        .single();
      
      if (fetchError) throw fetchError;
      if (!isRecord(contact)) {
        throw new Error('Invalid contact notes payload');
      }

      // Append new note with timestamp
      const timestamp = new Date().toLocaleString('fr-FR');
      const existingNotes = typeof contact.notes === 'string' ? contact.notes : '';
      const newNoteWithTimestamp = `[${timestamp}] ${note}`;
      const updatedNotes = existingNotes 
        ? `${existingNotes}\n\n${newNoteWithTimestamp}`
        : newNoteWithTimestamp;
      
      // Update contact with new notes
      const { error: updateError } = await supabase
        .from('contacts')
        .update({ 
          notes: updatedNotes,
          updated_at: new Date().toISOString()
        })
        .eq('id', contactId);
      
      if (updateError) throw updateError;
      
      // Return note object for compatibility
      return {
        id: Date.now(),
        contact_id: contactId,
        note: newNoteWithTimestamp,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error adding contact note:', error);
      throw error;
    }
  },

  getNotes: async (contactId: string) => {
    try {
      const { data: contact, error } = await supabase
        .from('contacts')
        .select('notes')
        .eq('id', contactId)
        .single();
      
      if (error) throw error;
      if (!isRecord(contact)) {
        throw new Error('Invalid contact notes payload');
      }

      // Parse notes into array format
      if (!contact.notes || typeof contact.notes !== 'string') return [];
      
      // Split notes by double newlines and parse each note
      const noteEntries: string[] = contact.notes
        .split('\n\n')
        .filter((note: string) => note.trim());
      
      return noteEntries
        .map((noteEntry: string, index: number) => {
          // Try to extract timestamp from note
          // avant:  /^\[([^\]]+)\] (.+)$/s
          const timestampMatch = noteEntry.match(/^\[([^\]]+)\] ([\s\S]+)$/);
          if (timestampMatch) {
            return {
              id: index + 1,
              contact_id: contactId,
              note: timestampMatch[2],
              created_at: new Date(timestampMatch[1]).toISOString() || new Date().toISOString(),
              updated_at: new Date(timestampMatch[1]).toISOString() || new Date().toISOString()
            };
          } else {
            return {
              id: index + 1,
              contact_id: contactId,
              note: noteEntry,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
          }
        })
        .reverse(); // Show newest first
    } catch (error) {
      logger.error('Error fetching contact notes:', error);
      return [];
    }
  },

  updateNote: async (noteId: number, note: string) => {
    // For simplicity, we'll just add this as a new note
    // In a real implementation, we'd need a more complex note management system
    throw new Error('Note editing not supported in simplified implementation');
  },

  deleteNote: async (noteId: number) => {
    // For simplicity, we'll not support note deletion
    // In a real implementation, we'd need a more complex note management system
    throw new Error('Note deletion not supported in simplified implementation');
  }
};

// Opportunities API (table: opportunites)
const createFallbackOpportunity = (): Opportunity => {
  const baseOpportunity = buildOpportunityFromPartial('1', {
    contact_id: '1',
    entreprise_id: 1,
    montant: 2500,
    priorite: 'moyenne',
    stage_id: 1,
    lead_magnet: true,
    note_base: 'Très intéressé, RDV prévu',
    tags: 'Restaurant,Urgent',
    date_prochain_suivi: '2024-01-25',
    created_at: '2024-01-16T00:00:00Z',
    updated_at: '2024-01-18T00:00:00Z',
  });

  return {
    ...baseOpportunity,
    companyName: 'Restaurant Le Gourmet',
    contactId: '1',
    stage: 'RDV de vente 1',
    value: baseOpportunity.montant,
    priority: mapOpportunityPriority(baseOpportunity.priorite),
    notes: baseOpportunity.note_base,
    createdDate: '2024-01-16',
    lastUpdate: '2024-01-18',
    nextFollowUp: '2024-01-25',
    leadMagnet: true,
    opportunityNotes: [],
    pipelineHistory: [],
  };
};

export const opportunitiesApi = {
  getAll: async (): Promise<Opportunity[]> => {
    try {
      const { data: opportunitiesData, error: opportunitiesError } = await supabase
        .from('opportunites')
        .select(OPPORTUNITY_SELECT)
        .order('created_at', { ascending: false });

      if (opportunitiesError) {
        logger.error('Supabase error:', opportunitiesError);
        // Return mock data as fallback
        return [createFallbackOpportunity()];
      }

      const opportunitiesRows = Array.isArray(opportunitiesData)
        ? (opportunitiesData as unknown[])
        : [];

      if (opportunitiesRows.length === 0) {
        return [];
      }

      const validOpportunities = opportunitiesRows.filter(isOpportunityRow);
      if (validOpportunities.length === 0) {
        return [];
      }

      const companyIds = Array.from(
        new Set(
          validOpportunities
            .map((opp) => opp.entreprise_id)
            .filter((id): id is number => typeof id === 'number')
        )
      );

      const stageIds = Array.from(
        new Set(
          validOpportunities
            .map((opp) => opp.stage_id)
            .filter((id): id is number => typeof id === 'number')
        )
      );

      const missingCompanyIds = companyIds.filter((id) => !companyMetadataCache.has(id));
      if (missingCompanyIds.length > 0) {
        const { data: companyRows, error: companyError } = await supabase
          .from('entreprises')
          .select(COMPANY_METADATA_SELECT)
          .in('id', missingCompanyIds);

        if (companyError) {
          logger.error('Error fetching company metadata:', companyError);
        } else if (Array.isArray(companyRows)) {
          const metadataRows = (companyRows as unknown[]).filter(isCompanyMetadataRow);
          metadataRows.forEach((row) => {
            companyMetadataCache.set(row.id, row);
          });
        }
      }

      const companiesMetadata = new Map<number, CompanyMetadata>();
      companyIds.forEach((id) => {
        const cached = companyMetadataCache.get(id);
        if (cached) {
          companiesMetadata.set(id, cached);
        }
      });

      const allRawIds = new Set<number>();
      companiesMetadata.forEach((metadata) => {
        (metadata.raw_ids || []).forEach((rawId) => {
          if (typeof rawId === 'number') {
            allRawIds.add(rawId);
          }
        });
      });

      let rawDataMap = new Map<number, RawContactRecord>();
      if (allRawIds.size > 0) {
        const { data: rawRows, error: rawError } = await supabase
          .from('entreprises_raw')
          .select(RAW_CONTACT_SELECT)
          .in('id', Array.from(allRawIds));

        if (rawError) {
          logger.error('Error fetching raw contact data:', rawError);
        } else if (Array.isArray(rawRows)) {
          const records = (rawRows as unknown[]).filter(isRawContactRecord);
          rawDataMap = new Map(records.map((row) => [row.id, row]));
        }
      }

      const missingStageIds = stageIds.filter((id) => !stageMetadataCache.has(id));
      if (missingStageIds.length > 0) {
        const { data: stageRows, error: stageError } = await supabase
          .from('etapes_pipeline')
          .select(STAGE_METADATA_SELECT)
          .in('id', missingStageIds);

        if (stageError) {
          logger.error('Error fetching stage metadata:', stageError);
        } else if (Array.isArray(stageRows)) {
          const stages = (stageRows as unknown[]).filter(isStageRow);
          stages.forEach((row) => {
            stageMetadataCache.set(row.id, row.nom || '');
          });
        }
      }

      const enrichedData = validOpportunities.map((opp) => {
        const metadata =
          typeof opp.entreprise_id === 'number'
            ? companiesMetadata.get(opp.entreprise_id)
            : undefined;
        let companyName = '';
        let companyUrl = '';
        let linkedin_url = '';
        let telephone = '';
        let email = '';
        let contact_name = '';

        if (metadata) {
          companyName = metadata.name || '';
          companyUrl = metadata.canonical_url || '';
          linkedin_url = metadata.linkedin_url || '';

          const rawEntries = (metadata.raw_ids || [])
            .map((rawId) => rawDataMap.get(rawId))
            .filter((entry): entry is RawContactRecord => Boolean(entry));

          if (rawEntries.length > 0) {
            const contactInfo = extractContactInfoFromRawEntries(rawEntries);
            telephone = contactInfo.telephone;
            email = contactInfo.email;
            contact_name = contactInfo.contact_name;
          }
        }

        const stageName =
          typeof opp.stage_id === 'number'
            ? stageMetadataCache.get(opp.stage_id) || ''
            : '';

        return {
          ...opp,
          companyName,
          companyUrl,
          contactId: opp.contact_id,
          stage: stageName,
          value: opp.montant,
          priority: mapOpportunityPriority(opp.priorite),
          notes: opp.note_base,
          createdDate: opp.created_at ? opp.created_at.split('T')[0] : undefined,
          lastUpdate: opp.updated_at ? opp.updated_at.split('T')[0] : undefined,
          nextFollowUp: opp.date_prochain_suivi,
          leadMagnet: opp.lead_magnet,
          opportunityNotes: [],
          pipelineHistory: [],
          telephone,
          email,
          linkedin_url,
          contact_name
        };
      });

      return enrichedData;
    } catch (error) {
      logger.error('API Error:', error);
      return [];
    }
  },
  
  create: async (opportunityData: Partial<Opportunity>) => {
    try {
      // Filter to only include actual database columns
      const validColumns = [
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
        'recurrence_months'
      ];
      
      logger.log('Creating opportunity with data:', opportunityData);
      
      const filteredData = Object.keys(opportunityData)
        .filter(key => validColumns.includes(key))
        .reduce((obj, key) => {
          obj[key] = (opportunityData as Record<string, unknown>)[key];
          return obj;
        }, {} as Record<string, unknown>);
        
      logger.log('Filtered data for opportunity creation:', filteredData);

      const { data, error } = await supabase
        .from('opportunites')
        .insert([filteredData])
        .select()
        .single();

      if (error) {
        logger.error('Supabase opportunity creation error:', error);
        throw error;
      }

      if (!isOpportunityRow(data)) {
        logger.error('Invalid opportunity payload received from Supabase');
        throw new Error('Invalid opportunity payload');
      }

      logger.log('Successfully created opportunity:', data);
      return data;
    } catch (error) {
      logger.error('Error creating opportunity:', error);
      const now = new Date().toISOString();
      const fallbackId =
        typeof globalThis.crypto !== 'undefined' &&
        typeof globalThis.crypto.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : Date.now().toString();
      return buildOpportunityFromPartial(fallbackId, {
        ...opportunityData,
        created_at: now,
        updated_at: now,
      });
    }
  },
  
  update: async (id: string, updates: Partial<Opportunity>) => {
    try {
      // Filter updates to only include actual database columns
      const validColumns = [
        'contact_id',
        'entreprise_id', 
        'montant',
        'priorite',
        'stage_id',
        'lead_magnet',
        'note_base',
        'tags',
        'date_prochain_suivi'
      ];
      
      const filteredUpdates = Object.keys(updates)
        .filter(key => validColumns.includes(key))
        .reduce((obj, key) => {
          obj[key] = (updates as Record<string, unknown>)[key];
          return obj;
        }, {} as Record<string, unknown>);

      const { data, error } = await supabase
        .from('opportunites')
        .update({ ...filteredUpdates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      if (isOpportunityRow(data)) {
        return data;
      }
      logger.error('Invalid opportunity payload received from Supabase');
      throw new Error('Invalid opportunity payload');
    } catch (error) {
      logger.error('Error updating opportunity:', error);
      const now = new Date().toISOString();
      return buildOpportunityFromPartial(id, { ...updates, updated_at: now });
    }
  },
  
  delete: async (id: string) => {
    try {
      const { error } = await supabase
        .from('opportunites')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    } catch (error) {
      logger.error('Error deleting opportunity:', error);
    }
  }
};

// Pipeline Stages API (table: etapes_pipeline)
export const pipelineStagesApi = {
  getAll: async () => {
    try {
      const { data, error } = await supabase
        .from('etapes_pipeline')
        .select('*')
        .eq('visible', true)
        .order('ordre', { ascending: true });
      
      if (error) {
        logger.error('Supabase error:', error);
        // Return default pipeline stages as fallback
        return [
          { id: 1, nom: 'Qualifié', ordre: 1, visible: true },
          { id: 2, nom: 'Cold Call', ordre: 2, visible: true },
          { id: 3, nom: 'Relance 1', ordre: 3, visible: true },
          { id: 4, nom: 'Relance 2', ordre: 4, visible: true },
          { id: 5, nom: 'Relance 3', ordre: 5, visible: true },
          { id: 6, nom: 'RDV de vente 1', ordre: 6, visible: true },
          { id: 7, nom: 'RDV de vente 2', ordre: 7, visible: true },
          { id: 8, nom: 'Devis', ordre: 8, visible: true },
          { id: 9, nom: 'Signature', ordre: 9, visible: true },
          { id: 10, nom: 'Acompte', ordre: 10, visible: true }
        ];
      }
      return Array.isArray(data) ? data.filter(isFullStageRow) : [];
    } catch (error) {
      logger.error('API Error:', error);
      return [];
    }
  },
  
  create: async (stageData: Record<string, unknown>) => {
    try {
      const { data, error } = await supabase
        .from('etapes_pipeline')
        .insert([stageData])
        .select()
        .single();
      
      if (error) throw error;
      if (isFullStageRow(data)) {
        return data;
      }
      logger.error('Invalid stage payload received from Supabase');
      throw new Error('Invalid stage payload');
    } catch (error) {
      logger.error('Error creating stage:', error);
      return { ...stageData, id: Date.now() };
    }
  },
  
  update: async (id: number, updates: Record<string, unknown>) => {
    try {
      const { data, error } = await supabase
        .from('etapes_pipeline')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      if (isFullStageRow(data)) {
        return data;
      }
      logger.error('Invalid stage payload received from Supabase');
      throw new Error('Invalid stage payload');
    } catch (error) {
      logger.error('Error updating stage:', error);
      return { id, ...updates };
    }
  }
};

// Notes API (table: notes)
export const notesApi = {
  getByOpportunity: async (opportuniteId: string): Promise<OpportunityNote[]> => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('opportunite_id', opportuniteId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const rows = Array.isArray(data) ? (data as unknown[]) : [];
      return rows.filter(isOpportunityNoteRow);
    } catch (error) {
      logger.error('Error fetching notes:', error);
      return [];
    }
  },

  create: async (
    noteData: Omit<OpportunityNote, 'id' | 'created_at'> & { opportunite_id: string }
  ): Promise<OpportunityNote> => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .insert([noteData])
        .select()
        .single();

      if (error) throw error;
      if (isOpportunityNoteRow(data)) {
        return data;
      }
      throw new Error('Invalid note payload');
    } catch (error) {
      logger.error('Error creating note:', error);
      const id = Date.now();
      return buildOpportunityNoteFromPartial(id, noteData);
    }
  },

  update: async (
    id: number,
    updates: Partial<OpportunityNote>
  ): Promise<OpportunityNote> => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      if (isOpportunityNoteRow(data)) {
        return data;
      }
      throw new Error('Invalid note payload');
    } catch (error) {
      logger.error('Error updating note:', error);
      const now = new Date().toISOString();
      return buildOpportunityNoteFromPartial(id, { ...updates, created_at: now });
    }
  },
  
  delete: async (id: number) => {
    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    } catch (error) {
      logger.error('Error deleting note:', error);
    }
  }
};

// Achievements API (table: journal_succes)
export const achievementsApi = {
  getAll: async (): Promise<Achievement[]> => {
    try {
      // Simple query without JOINs to avoid relationship errors
      const { data, error } = await supabase
        .from('journal_succes')
        .select('*')
        .order('date', { ascending: false });

      if (error) {
        logger.error('Supabase error:', error);
        // Return mock data as fallback
        return [];
      }

      const rows = Array.isArray(data) ? (data as unknown[]) : [];
      const achievements = rows.filter(isAchievementRow);

      return achievements.map((achievement) => ({
        ...achievement,
        type: mapAchievementEventType(achievement.type_evenement),
        title: achievement.description,
        value: achievement.value ?? undefined,
        companyName: achievement.companyName ?? undefined,
      }));
    } catch (error) {
      logger.error('API Error:', error);
      return [];
    }
  },

  create: async (achievementData: Omit<Achievement, 'id'>): Promise<Achievement> => {
    try {
      const { data, error } = await supabase
        .from('journal_succes')
        .insert([achievementData])
        .select()
        .single();

      if (error) throw error;
      if (isAchievementRow(data)) {
        return data;
      }
      throw new Error('Invalid achievement payload');
    } catch (error) {
      logger.error('Error creating achievement:', error);
      const id = Date.now();
      return buildAchievementFromPartial(id, achievementData);
    }
  }
};

// Statistics API - Custom queries for dashboard
export const statisticsApi = {
  getDashboardStats: async () => {
    try {
      // Get counts for different metrics
      const [
        { count: totalCompanies },
        { count: qualifiedCompanies },
        { count: totalContacts },
        { count: totalOpportunities }
      ] = await Promise.all([
        supabase.from('entreprises').select('*', { count: 'exact', head: true }),
        supabase.from('entreprises').select('*', { count: 'exact', head: true }).eq('qualifie', true),
        supabase.from('contacts').select('*', { count: 'exact', head: true }),
        supabase.from('opportunites').select('*', { count: 'exact', head: true })
      ]);
      
      return {
        totalCompanies: totalCompanies || 0,
        qualifiedCompanies: qualifiedCompanies || 0,
        totalContacts: totalContacts || 0,
        totalOpportunities: totalOpportunities || 0
      };
    } catch (error) {
      logger.error('Error fetching dashboard stats:', error);
      // Return mock stats as fallback
      return {
        totalCompanies: 10,
        qualifiedCompanies: 4,
        totalContacts: 4,
        totalOpportunities: 4
      };
    }
  },
  
  getKeywordStats: async () => {
    try {
      const { data, error } = await supabase
        .from('recherches')
        .select('keyword, nb_trouves');
      
      if (error) {
        // Return mock data as fallback
        return {
          'restaurant': 5,
          'coiffeur': 5
        };
      }
      
      const rows = Array.isArray(data) ? data : [];

      return rows.reduce((acc, item) => {
        acc[item.keyword] = (acc[item.keyword] || 0) + item.nb_trouves;
        return acc;
      }, {} as Record<string, number>);
    } catch (error) {
      logger.error('Error fetching keyword stats:', error);
      return {};
    }
  },
  
  getLocationStats: async () => {
    try {
      const { data, error } = await supabase
        .from('recherches')
        .select('location, nb_trouves');
      
      if (error) {
        // Return mock data as fallback
        return {
          'Paris': 5,
          'Lyon': 5
        };
      }
      
      const rows = Array.isArray(data) ? data : [];

      return rows.reduce((acc, item) => {
        acc[item.location] = (acc[item.location] || 0) + item.nb_trouves;
        return acc;
      }, {} as Record<string, number>);
    } catch (error) {
      logger.error('Error fetching location stats:', error);
      return {};
    }
  }
};

export const networksApi = {
  getAll: async (): Promise<CompanyNetwork[]> => {
    try {
      const { data, error } = await supabase
        .from('reseaux_entreprises')
        .select('*');
      if (error) throw error;
      return Array.isArray(data) ? data.filter(isCompanyNetworkRow) : [];
    } catch (error) {
      logger.error('Error fetching networks:', error);
      return [];
    }
  },

  getById: async (id: string): Promise<CompanyNetwork | null> => {
    try {
      const { data, error } = await supabase
        .from('reseaux_entreprises')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      if (isCompanyNetworkRow(data)) {
        return data;
      }
      logger.error('Invalid company network payload received from Supabase');
      return null;
    } catch (error) {
      logger.error('Error fetching network:', error);
      return null;
    }
  },

  create: async (
    network: Omit<CompanyNetwork, 'id' | 'members_count' | 'created_at' | 'updated_at'>
  ): Promise<CompanyNetwork> => {
    const { data, error } = await supabase
      .from('reseaux_entreprises')
      .insert([network])
      .select()
      .single();
    if (error) throw error;
    if (isCompanyNetworkRow(data)) {
      return data;
    }
    throw new Error('Invalid company network payload');
  },

  update: async (
    id: string,
    updates: Partial<CompanyNetwork>
  ): Promise<CompanyNetwork> => {
    const { data, error } = await supabase
      .from('reseaux_entreprises')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    if (isCompanyNetworkRow(data)) {
      return data;
    }
    throw new Error('Invalid company network payload');
  },

  delete: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('reseaux_entreprises')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
};

export const urlBlacklistApi = {
  getAll: async (): Promise<UrlBlacklist[]> => {
    try {
      const { data, error } = await supabase
        .from('url_blacklist')
        .select('*')
        .eq('active', true);
      if (error) throw error;
      return Array.isArray(data) ? data.filter(isUrlBlacklistRow) : [];
    } catch (error) {
      logger.error('Error fetching url blacklist:', error);
      return [];
    }
  },

  create: async (
    scope: 'domain' | 'exact_url',
    value: string,
    reason?: string
  ): Promise<UrlBlacklist> => {
    const row: { scope: 'domain' | 'exact_url'; value: string; reason?: string } = {
      scope,
      value
    };
    if (reason) row.reason = reason;
    logger.log('urlBlacklistApi.create row:', row);

    const { data, error } = await supabase
      .from('url_blacklist')
      .insert([row])
      .select()
      .single();

    logger.log('url_blacklist insert returned data:', data);
    if (error) {
      logger.error('Supabase error inserting url_blacklist:', error.message);
      throw error;
    }
    if (isUrlBlacklistRow(data)) {
      return data;
    }
    throw new Error('Invalid url blacklist payload');
  },

  deactivate: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('url_blacklist')
      .update({ active: false })
      .eq('id', id);
    if (error) throw error;
  }
};

// Note: objectivesApi has been replaced by the new KPI system in /utils/kpiApi.tsx
// This legacy API is kept for backward compatibility but should no longer be used
