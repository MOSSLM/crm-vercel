import logger from '../logger';

export function handleSupabaseError(error: unknown, context: string): void {
  logger.error(`Supabase error in ${context}:`, error);
}

export default handleSupabaseError;
