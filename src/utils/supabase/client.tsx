import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

export const supabase = createSupabaseClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey
);

// Export the createClient function for compatibility
export const createClient = () => supabase;

export default supabase;