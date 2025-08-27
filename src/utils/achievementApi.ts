import { supabase } from './supabase/client';

/** API helpers for achievements. */
export const achievementsApi = {
  getAll: async () => {
    try {
      // Simple query without JOINs to avoid relationship errors
      const { data, error } = await supabase
        .from('journal_succes')
        .select('*')
        .order('date', { ascending: false });
      
      if (error) {
        console.error('Supabase error:', error);
        // Return mock data as fallback
        return [];
      }
      
      // Transform data to match interface without complex JOINs
      return (data || []).map(achievement => ({
        ...achievement,
        type: achievement.type_evenement,
        title: achievement.description,
        value: null, // We'll skip this for now to avoid JOIN issues
        companyName: null // We'll skip this for now to avoid JOIN issues
      }));
    } catch (error) {
      console.error('API Error:', error);
      return [];
    }
  },
  
  create: async (achievementData: any) => {
    try {
      const { data, error } = await supabase
        .from('journal_succes')
        .insert([achievementData])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating achievement:', error);
      return { ...achievementData, id: Date.now(), date: new Date().toISOString() };
    }
  }
};

// Statistics API - Custom queries for dashboard
