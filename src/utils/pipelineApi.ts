import { supabase } from './supabase/client';

/** API helpers for pipeline stages. */
export const pipelineStagesApi = {
  getAll: async () => {
    try {
      const { data, error } = await supabase
        .from('etapes_pipeline')
        .select('*')
        .eq('visible', true)
        .order('ordre', { ascending: true });
      
      if (error) {
        console.error('Supabase error:', error);
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
      return data || [];
    } catch (error) {
      console.error('API Error:', error);
      return [];
    }
  },
  
  create: async (stageData: any) => {
    try {
      const { data, error } = await supabase
        .from('etapes_pipeline')
        .insert([stageData])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating stage:', error);
      return { ...stageData, id: Date.now() };
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
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating stage:', error);
      return { id, ...updates };
    }
  }
};

// Notes API (table: notes)
