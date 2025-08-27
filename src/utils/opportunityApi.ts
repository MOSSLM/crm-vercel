import { supabase } from './supabase/client';

/** API helpers for opportunities. */
export const opportunitiesApi = {
  getAll: async () => {
    try {
      // Simple query without complex JOINs
      const { data: opportunitiesData, error: opportunitiesError } = await supabase
        .from('opportunites')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (opportunitiesError) {
        console.error('Supabase error:', opportunitiesError);
        // Return mock data as fallback
        return [
          {
            id: '1',
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
            companyName: 'Restaurant Le Gourmet',
            contactId: '1',
            stage: 'RDV de vente 1',
            value: 2500,
            priority: 'high',
            notes: 'Très intéressé, RDV prévu',
            createdDate: '2024-01-16',
            lastUpdate: '2024-01-18',
            nextFollowUp: '2024-01-25',
            leadMagnet: true,
            opportunityNotes: [],
            pipelineHistory: []
          }
        ];
      }
      
      // Get related data separately to avoid JOIN issues
      const enrichedData = [];
      if (opportunitiesData) {
        for (const opp of opportunitiesData) {
          let companyName = '';
          let companyUrl = '';
          let stageName = '';
          let telephone = '';
          let email = '';
          let linkedin_url = '';
          let contact_name = '';
          
          // Get company data with contact info
          if (opp.entreprise_id) {
            try {
              const { data: companyData } = await supabase
                .from('entreprises')
                .select('name, canonical_url, raw_ids, linkedin_url')
                .eq('id', opp.entreprise_id)
                .single();
              
              if (companyData) {
                companyName = companyData.name || '';
                companyUrl = companyData.canonical_url || '';
                linkedin_url = companyData.linkedin_url || '';
                
                // Get raw contact data if available
                if (companyData.raw_ids && companyData.raw_ids.length > 0) {
                  try {
                    const { data: rawData } = await supabase
                      .from('entreprises_raw')
                      .select('*')
                      .in('id', companyData.raw_ids);
                    
                    if (rawData && rawData.length > 0) {
                      // Extract contact info from raw data
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
                    }
                  } catch (rawError) {
                    console.error('Error fetching raw contact data:', rawError);
                  }
                }
              }
            } catch (e) {
              console.error('Error fetching company:', e);
            }
          }
          
          // Get stage name
          if (opp.stage_id) {
            try {
              const { data: stageData } = await supabase
                .from('etapes_pipeline')
                .select('nom')
                .eq('id', opp.stage_id)
                .single();
              stageName = stageData?.nom || '';
            } catch (e) {
              console.error('Error fetching stage:', e);
            }
          }
          
          enrichedData.push({
            ...opp,
            companyName,
            companyUrl,
            contactId: opp.contact_id,
            stage: stageName,
            value: opp.montant,
            priority: opp.priorite === 'haute' ? 'high' : opp.priorite === 'basse' ? 'low' : 'medium',
            notes: opp.note_base,
            createdDate: opp.created_at?.split('T')[0],
            lastUpdate: opp.updated_at?.split('T')[0],
            nextFollowUp: opp.date_prochain_suivi,
            leadMagnet: opp.lead_magnet,
            opportunityNotes: [],
            pipelineHistory: [],
            // Contact information
            telephone,
            email,
            linkedin_url,
            contact_name
          });
        }
      }
      
      return enrichedData;
    } catch (error) {
      console.error('API Error:', error);
      return [];
    }
  },
  
  create: async (opportunityData: any) => {
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
      
      console.log('Creating opportunity with data:', opportunityData);
      
      const filteredData = Object.keys(opportunityData)
        .filter(key => validColumns.includes(key))
        .reduce((obj, key) => {
          obj[key] = opportunityData[key];
          return obj;
        }, {} as any);
        
      console.log('Filtered data for opportunity creation:', filteredData);

      const { data, error } = await supabase
        .from('opportunites')
        .insert([filteredData])
        .select()
        .single();
      
      if (error) {
        console.error('Supabase opportunity creation error:', error);
        throw error;
      }
      
      console.log('Successfully created opportunity:', data);
      return data;
    } catch (error) {
      console.error('Error creating opportunity:', error);
      return { ...opportunityData, id: crypto.randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    }
  },
  
  update: async (id: string, updates: any) => {
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
          obj[key] = updates[key];
          return obj;
        }, {} as any);

      const { data, error } = await supabase
        .from('opportunites')
        .update({ ...filteredUpdates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating opportunity:', error);
      return { id, ...updates };
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
      console.error('Error deleting opportunity:', error);
    }
  }
};

// Pipeline Stages API (table: etapes_pipeline)
