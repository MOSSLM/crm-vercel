import { supabase } from './supabase/client';
import type { Site } from '@/types';

// ─── Sites API ───────────────────────────────────────────────────────────────

export const sitesApi = {
  async fetchAll(): Promise<Site[]> {
    const { data, error } = await supabase
      .from('sites')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as Site[];
  },

  async fetchById(id: string): Promise<Site | null> {
    const { data, error } = await supabase
      .from('sites')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Site | null;
  },

  async create(payload: { name: string; description?: string }): Promise<Site> {
    const { data, error } = await supabase
      .from('sites')
      .insert({ name: payload.name, description: payload.description ?? null })
      .select()
      .single();

    if (error) throw error;
    return data as Site;
  },

  async update(id: string, payload: Partial<Omit<Site, 'id' | 'created_at' | 'updated_at'>>): Promise<Site> {
    const { data, error } = await supabase
      .from('sites')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as Site;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('sites').delete().eq('id', id);
    if (error) throw error;
  },
};
