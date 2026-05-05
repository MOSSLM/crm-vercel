import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

export async function createClient() {
  return createSupabaseClient(`https://${projectId}.supabase.co`, publicAnonKey);
}
