import { supabase } from './supabase/client';

/** API helpers for notes. */
export const notesApi = {
  getByOpportunity: async (opportuniteId: string) => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .eq('opportunite_id', opportuniteId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching notes:', error);
      return [];
    }
  },
  
  create: async (noteData: any) => {
    try {
      const { data, error } = await supabase
        .from('notes')
        .insert([noteData])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating note:', error);
      return { ...noteData, id: Date.now(), created_at: new Date().toISOString() };
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
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating note:', error);
      return { id, ...updates };
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
      console.error('Error deleting note:', error);
    }
  }
};

// Achievements API (table: journal_succes)
