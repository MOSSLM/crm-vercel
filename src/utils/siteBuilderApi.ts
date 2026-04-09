import { supabase } from './supabase/client';
import type { Site, SitePage, SavedComponent } from '@/types';

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

// ─── Site Pages API ──────────────────────────────────────────────────────────

export const sitePagesApi = {
  async fetchBySite(siteId: string): Promise<SitePage[]> {
    const { data, error } = await supabase
      .from('site_pages')
      .select('*')
      .eq('site_id', siteId)
      .order('order', { ascending: true });

    if (error) throw error;
    return (data ?? []) as SitePage[];
  },

  async fetchById(id: string): Promise<SitePage | null> {
    const { data, error } = await supabase
      .from('site_pages')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as SitePage | null;
  },

  async create(payload: { site_id: string; name: string; path_name?: string; order?: number }): Promise<SitePage> {
    const { data, error } = await supabase
      .from('site_pages')
      .insert({
        site_id: payload.site_id,
        name: payload.name,
        path_name: payload.path_name ?? '',
        order: payload.order ?? 0,
        content: '[]',
      })
      .select()
      .single();

    if (error) throw error;
    return data as SitePage;
  },

  async update(id: string, payload: Partial<Omit<SitePage, 'id' | 'site_id' | 'created_at' | 'updated_at'>>): Promise<SitePage> {
    const { data, error } = await supabase
      .from('site_pages')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as SitePage;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('site_pages').delete().eq('id', id);
    if (error) throw error;
  },
};

// ─── Saved Components API ────────────────────────────────────────────────────

export const componentsApi = {
  async fetchAll(): Promise<SavedComponent[]> {
    const { data, error } = await supabase
      .from('site_builder_components')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SavedComponent[];
  },

  async create(payload: { name: string; category?: string; content: string }): Promise<SavedComponent> {
    const { data, error } = await supabase
      .from('site_builder_components')
      .insert({ name: payload.name, category: payload.category ?? 'custom', content: payload.content })
      .select()
      .single();
    if (error) throw error;
    return data as SavedComponent;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('site_builder_components').delete().eq('id', id);
    if (error) throw error;
  },
};
