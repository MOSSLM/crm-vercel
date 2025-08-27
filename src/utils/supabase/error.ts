import { toast } from 'sonner';

export function handleSupabaseError(error: unknown, context?: string): never {
  console.error(`Supabase error${context ? ` in ${context}` : ''}:`, error);
  const message = error instanceof Error ? error.message : 'Unexpected error';
  if (typeof window !== 'undefined') {
    toast.error(message);
  }
  throw error instanceof Error ? error : new Error(message);
}
