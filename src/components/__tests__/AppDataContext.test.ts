import {
  companyHasSearchReference,
  filterCompaniesBySearchId,
  filterGoogleCompanies,
  filterMapCompanies,
  normalizeCompanyRawIds,
} from '../AppDataContext';
import type { Company } from '@/types';

describe('AppDataContext search helpers', () => {
  const createCompany = (partial: Partial<Company> & { id: number }): Company => ({
    canonical_url: undefined,
    name: partial.name,
    adresse: partial.adresse,
    lat: partial.lat,
    lng: partial.lng,
    premiers_tags: partial.premiers_tags,
    sources: partial.sources ?? [],
    raw_ids: partial.raw_ids as unknown as string[] | undefined,
    qualifie: partial.qualifie ?? false,
    created_at: partial.created_at ?? new Date().toISOString(),
    updated_at: partial.updated_at ?? new Date().toISOString(),
    ca_estime_band: partial.ca_estime_band,
    nb_employes_band: partial.nb_employes_band,
    nb_employes_exact: partial.nb_employes_exact ?? null,
    linkedin_url: partial.linkedin_url,
    site_web_canonique: partial.site_web_canonique ?? null,
    manually_enriched: partial.manually_enriched,
    enriched_at: partial.enriched_at ?? null,
    enriched_by: partial.enriched_by,
    reseau_id: partial.reseau_id ?? null,
    note_moyenne: partial.note_moyenne,
    nombre_avis: partial.nombre_avis,
    ville: partial.ville,
    code_postal: partial.code_postal,
    pays: partial.pays,
    telephone: partial.telephone ?? null,
    id: partial.id,
  });

  it('normalizes raw ids by removing nulls and casting to string', () => {
    const rawIds = normalizeCompanyRawIds([123, null, '456'] as unknown as string[]);
    expect(rawIds).toEqual(['123', '456']);
  });

  it('matches companies even when Supabase returns numeric raw ids', () => {
    const company = createCompany({ id: 1, raw_ids: [123] as unknown as string[] });
    expect(companyHasSearchReference(company, '123')).toBe(true);
  });

  it('filters companies for search details consistently across sources', () => {
    const companies: Company[] = [
      createCompany({
        id: 1,
        name: 'Maps only',
        sources: ['google_maps'],
        raw_ids: [123, '999'] as unknown as string[],
      }),
      createCompany({
        id: 2,
        name: 'Google only',
        sources: ['google_search'],
        raw_ids: ['123'] as unknown as string[],
      }),
      createCompany({
        id: 3,
        name: 'Other search',
        sources: ['bing'],
        raw_ids: ['456'] as unknown as string[],
      }),
    ];

    expect(filterCompaniesBySearchId(companies, '123').map((c) => c.name)).toEqual([
      'Maps only',
      'Google only',
    ]);
    expect(filterMapCompanies(companies, '123').map((c) => c.name)).toEqual(['Maps only']);
    expect(filterGoogleCompanies(companies, '123').map((c) => c.name)).toEqual(['Google only']);
  });
});
