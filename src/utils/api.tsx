import { supabase } from './supabase/client';
import { handleSupabaseError } from './supabase/error';

// Search Results API (table: recherches)
export const searchResultsApi = {
  getAll: async () => {
    try {
      const { data, error } = await supabase
        .from('recherches')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) handleSupabaseError(error, 'fetching searches');
      return data || [];
    } catch (error) {
      handleSupabaseError(error, 'fetching searches');
    }
  },

  create: async (searchData: any) => {
    try {
      const { data, error } = await supabase
        .from('recherches')
        .insert([searchData])
        .select()
        .single();

      if (error) handleSupabaseError(error, 'creating search');
      return data;
    } catch (error) {
      handleSupabaseError(error, 'creating search');
    }
  },

  update: async (id: string, updates: any) => {
    try {
      const { data, error } = await supabase
        .from('recherches')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) handleSupabaseError(error, 'updating search');
      return data;
    } catch (error) {
      handleSupabaseError(error, 'updating search');
    }
  }
};

// Companies API with enhanced fields (table: entreprises)
export const companiesApi = {
  getAll: async () => {
    try {
      const { data, error } = await supabase
        .from('entreprises')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) handleSupabaseError(error, 'fetching companies');
      return data || [];
    } catch (error) {
      handleSupabaseError(error, 'fetching companies');
    }
  },
  
  create: async (companyData: any) => {
    try {
      const { data, error } = await supabase
        .from('entreprises')
        .insert([companyData])
        .select()
        .single();

      if (error) handleSupabaseError(error, 'creating company');
      return data;
    } catch (error) {
      handleSupabaseError(error, 'creating company');
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

      if (error) handleSupabaseError(error, 'updating company');
      return data;
    } catch (error) {
      handleSupabaseError(error, 'updating company');
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

      if (fetchError) handleSupabaseError(fetchError, 'fetching company raw_ids');

      // Delete associated raw companies if they exist
      if (company?.raw_ids && company.raw_ids.length > 0) {
        const { error: rawDeleteError } = await supabase
          .from('entreprises_raw')
          .delete()
          .in('id', company.raw_ids);

        if (rawDeleteError) handleSupabaseError(rawDeleteError, 'deleting raw companies');
      }

      // Then delete the company
      const { error: companyDeleteError } = await supabase
        .from('entreprises')
        .delete()
        .eq('id', id);

      if (companyDeleteError) handleSupabaseError(companyDeleteError, 'deleting company');
    } catch (error) {
      handleSupabaseError(error, 'deleting company');
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

      if (error) handleSupabaseError(error, 'fetching company');

      // Get raw contact data from entreprises_raw
      let rawContactInfo: any[] = [];
      if (company?.raw_ids && company.raw_ids.length > 0) {
        try {
          const { data: rawData, error: rawError } = await supabase
            .from('entreprises_raw')
            .select('*')
            .in('id', company.raw_ids);

          if (rawError) handleSupabaseError(rawError, 'fetching raw contact data');
          if (rawData) {
            rawContactInfo = rawData;
          }
        } catch (rawError) {
          handleSupabaseError(rawError, 'fetching raw contact data');
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
      handleSupabaseError(error, 'fetching company by ID');
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
              const { data: rawData, error } = await supabase
                .from('entreprises_raw')
                .select('*')
                .in('id', company.raw_ids);

              if (error) handleSupabaseError(error, 'fetching raw data for company');

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
              handleSupabaseError(error, 'fetching raw data for company');
            }
          }
          return company;
        })
      );

      return companiesWithRawData;
    } catch (error) {
      handleSupabaseError(error, 'fetching companies with raw data');
    }
  }
};

// Raw Companies API (table: entreprises_raw)
export const rawCompaniesApi = {
  getBySearch: async (rechercheId: string) => {
    try {
      const { data, error } = await supabase
        .from('entreprises_raw')
        .select('*')
        .eq('recherche_id', rechercheId)
        .order('position', { ascending: true });

      if (error) handleSupabaseError(error, 'fetching raw companies');
      return data || [];
    } catch (error) {
      handleSupabaseError(error, 'fetching raw companies');
    }
  },
  
  getByIds: async (ids: number[]) => {
    try {
      const { data, error } = await supabase
        .from('entreprises_raw')
        .select('*')
        .in('id', ids);

      if (error) handleSupabaseError(error, 'fetching raw companies by IDs');
      return data || [];
    } catch (error) {
      handleSupabaseError(error, 'fetching raw companies by IDs');
    }
  },
  
  create: async (rawCompanyData: any) => {
    try {
      const { data, error } = await supabase
        .from('entreprises_raw')
        .insert([rawCompanyData])
        .select()
        .single();

      if (error) handleSupabaseError(error, 'creating raw company');
      return data;
    } catch (error) {
      handleSupabaseError(error, 'creating raw company');
    }
  }
};

// Contacts API using real database columns
export const contactsApi = {
  getAll: async () => {
    try {
      // Query contacts with all real columns
      const { data: contactsData, error: contactsError } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false });

      if (contactsError) handleSupabaseError(contactsError, 'fetching contacts');

      // If we have contacts, try to get company info separately
      if (contactsData && contactsData.length > 0) {
        const companyIds = contactsData.map(c => c.entreprise_id);
        const { data: companiesData, error } = await supabase
          .from('entreprises')
          .select('id, name, adresse, premiers_tags')
          .in('id', companyIds);

        if (error) handleSupabaseError(error, 'fetching companies for contacts');

        // Merge contact and company data with proper field mapping
        return contactsData.map(contact => {
          const company = companiesData?.find(c => c.id === contact.entreprise_id);
          return {
            ...contact,
            companyName: company?.name,
            address: company?.adresse,
            tags: company?.premiers_tags ? [company.premiers_tags] : [],
            // Legacy compatibility fields
            nom: contact.last_name,
            prenom: contact.first_name,
            poste: contact.role_title,
            linkedin: contact.linkedin_url
          };
        });
      }

      return [];
    } catch (error) {
      handleSupabaseError(error, 'fetching contacts');
    }
  },
  
  create: async (contactData: any) => {
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

      if (error) handleSupabaseError(error, 'creating contact');

      // Return with compatibility fields
      return {
        ...data,
        nom: data.last_name,
        prenom: data.first_name,
        poste: data.role_title,
        linkedin: data.linkedin_url
      };
    } catch (error) {
      handleSupabaseError(error, 'creating contact');
    }
  },
  
  update: async (id: string, updates: any) => {
    try {
      // Map UI fields to database columns
      const dbUpdates: any = {};
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

      if (error) handleSupabaseError(error, 'updating contact');

      // Return with compatibility fields
      return {
        ...data,
        nom: data.last_name,
        prenom: data.first_name,
        poste: data.role_title,
        linkedin: data.linkedin_url
      };
    } catch (error) {
      handleSupabaseError(error, 'updating contact');
    }
  },
  
  delete: async (id: string) => {
    try {
      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id);

      if (error) handleSupabaseError(error, 'deleting contact');
    } catch (error) {
      handleSupabaseError(error, 'deleting contact');
    }
  },
  
  // Get employees by company ID
  getByCompany: async (companyId: number) => {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('entreprise_id', companyId)
        .order('created_at', { ascending: false });

      if (error) handleSupabaseError(error, 'fetching contacts by company');

      // Return with compatibility fields
      return (data || []).map(contact => ({
        ...contact,
        nom: contact.last_name,
        prenom: contact.first_name,
        poste: contact.role_title,
        linkedin: contact.linkedin_url
      }));
    } catch (error) {
      handleSupabaseError(error, 'fetching contacts by company');
    }
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
      
      // Append new note with timestamp
      const timestamp = new Date().toLocaleString('fr-FR');
      const existingNotes = contact.notes || '';
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
      handleSupabaseError(error, 'adding contact note');
    }
  },

  getNotes: async (contactId: string) => {
    try {
      const { data: contact, error } = await supabase
        .from('contacts')
        .select('notes')
        .eq('id', contactId)
        .single();

      if (error) handleSupabaseError(error, 'fetching contact notes');

      // Parse notes into array format
      if (!contact.notes) return [];

      // Split notes by double newlines and parse each note
      const noteEntries: string[] = contact.notes
        .split('\n\n')
        .filter((note: string) => note.trim());

      return noteEntries
        .map((noteEntry: string, index: number) => {
          // Try to extract timestamp from note
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
      handleSupabaseError(error, 'fetching contact notes');
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
export const opportunitiesApi = {
  getAll: async () => {
    try {
      // Simple query without complex JOINs
      const { data: opportunitiesData, error: opportunitiesError } = await supabase
        .from('opportunites')
        .select('*')
        .order('created_at', { ascending: false });

      if (opportunitiesError) handleSupabaseError(opportunitiesError, 'fetching opportunities');

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
                    handleSupabaseError(rawError, 'fetching raw contact data');
                  }
                }
              }
            } catch (e) {
              handleSupabaseError(e, 'fetching company');
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
              handleSupabaseError(e, 'fetching stage');
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
      handleSupabaseError(error, 'fetching opportunities');
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

      if (error) handleSupabaseError(error, 'creating opportunity');

      console.log('Successfully created opportunity:', data);
      return data;
    } catch (error) {
      handleSupabaseError(error, 'creating opportunity');
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

      if (error) handleSupabaseError(error, 'updating opportunity');
      return data;
    } catch (error) {
      handleSupabaseError(error, 'updating opportunity');
    }
  },
  
  delete: async (id: string) => {
    try {
      const { error } = await supabase
        .from('opportunites')
        .delete()
        .eq('id', id);

      if (error) handleSupabaseError(error, 'deleting opportunity');
    } catch (error) {
      handleSupabaseError(error, 'deleting opportunity');
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

      if (error) handleSupabaseError(error, 'fetching pipeline stages');
      return data || [];
    } catch (error) {
      handleSupabaseError(error, 'fetching pipeline stages');
    }
  },
  
  create: async (stageData: any) => {
    try {
      const { data, error } = await supabase
        .from('etapes_pipeline')
        .insert([stageData])
        .select()
        .single();

      if (error) handleSupabaseError(error, 'creating stage');
      return data;
    } catch (error) {
      handleSupabaseError(error, 'creating stage');
    }
  },
  
  update: async (id: number, updates: any) => {
    try {
      const { data, error } = await supabase
        .from('etapes_pipeline')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) handleSupabaseError(error, 'updating stage');
      return data;
    } catch (error) {
      handleSupabaseError(error, 'updating stage');
    }
  }
};

// Notes API (table: notes)
export const notesApi = {
  getByOpportunity: async (opportuniteId: string) => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('opportunite_id', opportuniteId)
        .order('created_at', { ascending: false });

      if (error) handleSupabaseError(error, 'fetching notes');
      return data || [];
    } catch (error) {
      handleSupabaseError(error, 'fetching notes');
    }
  },
  
  create: async (noteData: any) => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .insert([noteData])
        .select()
        .single();

      if (error) handleSupabaseError(error, 'creating note');
      return data;
    } catch (error) {
      handleSupabaseError(error, 'creating note');
    }
  },
  
  update: async (id: number, updates: any) => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) handleSupabaseError(error, 'updating note');
      return data;
    } catch (error) {
      handleSupabaseError(error, 'updating note');
    }
  },
  
  delete: async (id: number) => {
    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id);

      if (error) handleSupabaseError(error, 'deleting note');
    } catch (error) {
      handleSupabaseError(error, 'deleting note');
    }
  }
};

// Achievements API (table: journal_succes)
export const achievementsApi = {
  getAll: async () => {
    try {
      // Simple query without JOINs to avoid relationship errors
      const { data, error } = await supabase
        .from('journal_succes')
        .select('*')
        .order('date', { ascending: false });

      if (error) handleSupabaseError(error, 'fetching achievements');

      // Transform data to match interface without complex JOINs
      return (data || []).map(achievement => ({
        ...achievement,
        type: achievement.type_evenement,
        title: achievement.description,
        value: null, // We'll skip this for now to avoid JOIN issues
        companyName: null // We'll skip this for now to avoid JOIN issues
      }));
    } catch (error) {
      handleSupabaseError(error, 'fetching achievements');
    }
  },
  
  create: async (achievementData: any) => {
    try {
      const { data, error } = await supabase
        .from('journal_succes')
        .insert([achievementData])
        .select()
        .single();

      if (error) handleSupabaseError(error, 'creating achievement');
      return data;
    } catch (error) {
      handleSupabaseError(error, 'creating achievement');
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
      handleSupabaseError(error, 'fetching dashboard stats');
    }
  },
  
  getKeywordStats: async () => {
    try {
      const { data, error } = await supabase
        .from('recherches')
        .select('keyword, nb_trouves');

      if (error) handleSupabaseError(error, 'fetching keyword stats');

      return (data || []).reduce((acc, item) => {
        acc[item.keyword] = (acc[item.keyword] || 0) + item.nb_trouves;
        return acc;
      }, {} as Record<string, number>);
    } catch (error) {
      handleSupabaseError(error, 'fetching keyword stats');
    }
  },
  
  getLocationStats: async () => {
    try {
      const { data, error } = await supabase
        .from('recherches')
        .select('location, nb_trouves');

      if (error) handleSupabaseError(error, 'fetching location stats');

      return (data || []).reduce((acc, item) => {
        acc[item.location] = (acc[item.location] || 0) + item.nb_trouves;
        return acc;
      }, {} as Record<string, number>);
    } catch (error) {
      handleSupabaseError(error, 'fetching location stats');
    }
  }
};

// Note: objectivesApi has been replaced by the new KPI system in /utils/kpiApi.tsx
// This legacy API is kept for backward compatibility but should no longer be used
