import { supabase } from './supabase/client';

/** API helpers for companies. */
export const companiesApi = {
  getAll: async () => {
    try {
      const { data, error } = await supabase
        .from('entreprises')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Supabase error:', error);
        // Return mock data as fallback with new fields
        return [
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
            created_at: '2024-01-15T00:00:00Z',
            updated_at: '2024-01-16T00:00:00Z',
            ca_estime_band: '500k-1m',
            nb_employes_band: '11-50',
            nb_employes_exact: 25,
            linkedin_url: 'https://linkedin.com/company/legourmet',
            site_web_canonique: 'https://legourmet.fr',
            manually_enriched: false,
            enriched_at: null,
            enriched_by: null
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
            created_at: '2024-01-15T00:00:00Z',
            updated_at: '2024-01-16T00:00:00Z',
            ca_estime_band: '100k-500k',
            nb_employes_band: '1-10',
            nb_employes_exact: 8,
            linkedin_url: null,
            site_web_canonique: 'https://bistrotparis.fr',
            manually_enriched: false,
            enriched_at: null,
            enriched_by: null
          }
        ];
      }
      return data || [];
    } catch (error) {
      console.error('API Error:', error);
      return [];
    }
  },
  
  create: async (companyData: any) => {
    try {
      const { data, error } = await supabase
        .from('entreprises')
        .insert([companyData])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating company:', error);
      return { ...companyData, id: Date.now(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    }
  },
  
  update: async (id: number, updates: any) => {
    try {
      // Helper function to convert enum values from UI format (with hyphens) to DB format (with underscores)
      const convertEnumForDatabase = (value: string): string => {
        if (typeof value === 'string') {
          return value.replace(/-/g, '_');
        }
        return value;
      };

      // Convert enum fields if they exist
      const convertedUpdates = { ...updates };
      if (convertedUpdates.ca_estime_band) {
        convertedUpdates.ca_estime_band = convertEnumForDatabase(convertedUpdates.ca_estime_band);
      }
      if (convertedUpdates.nb_employes_band) {
        convertedUpdates.nb_employes_band = convertEnumForDatabase(convertedUpdates.nb_employes_band);
      }

      const { data, error } = await supabase
        .from('entreprises')
        .update({ ...convertedUpdates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating company:', error);
      return { id, ...updates };
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
        console.error('Error fetching company raw_ids:', fetchError);
        throw fetchError;
      }

      // Delete associated raw companies if they exist
      if (company?.raw_ids && company.raw_ids.length > 0) {
        const { error: rawDeleteError } = await supabase
          .from('entreprises_raw')
          .delete()
          .in('id', company.raw_ids);

        if (rawDeleteError) {
          console.error('Error deleting raw companies:', rawDeleteError);
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
      console.error('Error deleting company:', error);
      throw error;
    }
  },

  getById: async (id: number) => {
    try {
      // Get company with all its fields
      const { data: company, error } = await supabase
        .from('entreprises')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        console.error('Error fetching company:', error);
        return null;
      }

      // Get raw contact data from entreprises_raw
      let rawContactInfo: any[] = [];
      if (company?.raw_ids && company.raw_ids.length > 0) {
        try {
          const { data: rawData, error: rawError } = await supabase
            .from('entreprises_raw')
            .select('*')
            .in('id', company.raw_ids);
          
          if (!rawError && rawData) {
            rawContactInfo = rawData;
          }
        } catch (rawError) {
          console.error('Error fetching raw contact data:', rawError);
        }
      }

      // Extract contact info from raw data
      let telephone = '';
      let email = '';
      let contact_name = '';
      
      if (rawContactInfo.length > 0) {
        // Look for telephone in raw data
        const phoneEntry = rawContactInfo.find(entry => entry.telephone);
        if (phoneEntry) {
          telephone = phoneEntry.telephone;
        }
        
        // Look for email in raw_json
        const emailEntry = rawContactInfo.find(entry => {
          if (entry.raw_json && typeof entry.raw_json === 'object') {
            return entry.raw_json.email || entry.raw_json.contact_email;
          }
          return false;
        });
        if (emailEntry) {
          email = emailEntry.raw_json.email || emailEntry.raw_json.contact_email;
        }
        
        // Look for contact name
        const nameEntry = rawContactInfo.find(entry => {
          if (entry.raw_json && typeof entry.raw_json === 'object') {
            return entry.raw_json.contact_name || entry.raw_json.owner;
          }
          return false;
        });
        if (nameEntry) {
          contact_name = nameEntry.raw_json.contact_name || nameEntry.raw_json.owner;
        }
      }

      return {
        ...company,
        raw_contact_info: rawContactInfo,
        telephone,
        email,
        contact_name
      };
    } catch (error) {
      console.error('Error fetching company by ID:', error);
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
          if (company.raw_ids && company.raw_ids.length > 0) {
            try {
              const { data: rawData } = await supabase
                .from('entreprises_raw')
                .select('*')
                .in('id', company.raw_ids);
              
              if (rawData) {
                // Extract contact info
                let telephone = '';
                let email = '';
                let contact_name = '';
                
                const phoneEntry = rawData.find(entry => entry.telephone);
                if (phoneEntry) telephone = phoneEntry.telephone;
                
                const emailEntry = rawData.find(entry => {
                  if (entry.raw_json && typeof entry.raw_json === 'object') {
                    return entry.raw_json.email || entry.raw_json.contact_email;
                  }
                  return false;
                });
                if (emailEntry) {
                  email = emailEntry.raw_json.email || emailEntry.raw_json.contact_email;
                }
                
                const nameEntry = rawData.find(entry => {
                  if (entry.raw_json && typeof entry.raw_json === 'object') {
                    return entry.raw_json.contact_name || entry.raw_json.owner;
                  }
                  return false;
                });
                if (nameEntry) {
                  contact_name = nameEntry.raw_json.contact_name || nameEntry.raw_json.owner;
                }
                
                return {
                  ...company,
                  raw_contact_info: rawData,
                  telephone,
                  email,
                  contact_name
                };
              }
            } catch (error) {
              console.error('Error fetching raw data for company:', company.id, error);
            }
          }
          return company;
        })
      );
      
      return companiesWithRawData;
    } catch (error) {
      console.error('Error fetching companies with raw data:', error);
      return [];
    }
  }
};
