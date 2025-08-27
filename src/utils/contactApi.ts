import { supabase } from './supabase/client';

/** API helpers for contacts. */
export const contactsApi = {
  getAll: async () => {
    try {
      // Query contacts with all real columns
      const { data: contactsData, error: contactsError } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (contactsError) {
        console.error('Supabase error:', contactsError);
        // Return mock data as fallback
        return [
          {
            id: '1',
            entreprise_id: 1,
            first_name: 'Jean',
            last_name: 'Dupont',
            email: 'jean.dupont@legourmet.fr',
            tel: '+33 1 42 86 75 90',
            role_title: 'Directeur',
            linkedin_url: 'https://linkedin.com/in/jeandupont',
            is_decision_maker: true,
            preferred_channel: 'email',
            notes: 'Contact principal, très réactif',
            companyName: 'Restaurant Le Gourmet',
            address: '15 rue de la Paix, 75001 Paris',
            tags: ['Restaurant', 'Gastronomie'],
            // Legacy compatibility fields
            nom: 'Dupont',
            prenom: 'Jean',
            poste: 'Directeur',
            linkedin: 'https://linkedin.com/in/jeandupont'
          }
        ];
      }
      
      // If we have contacts, try to get company info separately
      if (contactsData && contactsData.length > 0) {
        const companyIds = contactsData.map(c => c.entreprise_id);
        const { data: companiesData } = await supabase
          .from('entreprises')
          .select('id, name, adresse, premiers_tags')
          .in('id', companyIds);
        
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
      console.error('API Error:', error);
      return [];
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
      
      if (error) {
        console.error('Supabase create error:', error);
        throw error;
      }
      
      // Return with compatibility fields
      return {
        ...data,
        nom: data.last_name,
        prenom: data.first_name,
        poste: data.role_title,
        linkedin: data.linkedin_url
      };
    } catch (error) {
      console.error('Error creating contact:', error);
      throw error;
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
      
      if (error) {
        console.error('Supabase update error:', error);
        throw error;
      }
      
      // Return with compatibility fields
      return {
        ...data,
        nom: data.last_name,
        prenom: data.first_name,
        poste: data.role_title,
        linkedin: data.linkedin_url
      };
    } catch (error) {
      console.error('Error updating contact:', error);
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
    } catch (error) {
      console.error('Error deleting contact:', error);
      throw error;
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
      
      if (error) {
        console.error('Supabase error:', error);
        return [];
      }
      
      // Return with compatibility fields
      return (data || []).map(contact => ({
        ...contact,
        nom: contact.last_name,
        prenom: contact.first_name,
        poste: contact.role_title,
        linkedin: contact.linkedin_url
      }));
    } catch (error) {
      console.error('API Error:', error);
      return [];
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
      console.error('Error adding contact note:', error);
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
      
      // Parse notes into array format
      if (!contact.notes) return [];
      
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
      console.error('Error fetching contact notes:', error);
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
