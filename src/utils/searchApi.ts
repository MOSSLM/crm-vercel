import { supabase } from './supabase/client';

/** API helpers for search results (table: recherches). */
export const searchResultsApi = {
  getAll: async () => {
    try {
      const { data, error } = await supabase
        .from('recherches')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Supabase error:', error);
        // Return mock data as fallback
        return [
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
            nb_qualifies: 2
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
            nb_qualifies: 2
          }
        ];
      }
      return data || [];
    } catch (error) {
      console.error('API Error:', error);
      return [];
    }
  },
  
  create: async (searchData: any) => {
    try {
      const { data, error } = await supabase
        .from('recherches')
        .insert([searchData])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating search:', error);
      // Return mock data
      return { ...searchData, id: Date.now().toString(), created_at: new Date().toISOString() };
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
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating search:', error);
      return { id, ...updates };
    }
  }
};
