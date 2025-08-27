import { supabase } from './supabase/client';

/** API helpers for raw company records. */
export const rawCompaniesApi = {
  getBySearch: async (rechercheId: string) => {
    try {
      const { data, error } = await supabase
        .from('entreprises_raw')
        .select('*')
        .eq('recherche_id', rechercheId)
        .order('position', { ascending: true });
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching raw companies:', error);
      return [];
    }
  },
  
  getByIds: async (ids: number[]) => {
    try {
      const { data, error } = await supabase
        .from('entreprises_raw')
        .select('*')
        .in('id', ids);
      
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching raw companies by IDs:', error);
      return [];
    }
  },
  
  create: async (rawCompanyData: any) => {
    try {
      const { data, error } = await supabase
        .from('entreprises_raw')
        .insert([rawCompanyData])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating raw company:', error);
      return { ...rawCompanyData, id: Date.now() };
    }
  }
};
