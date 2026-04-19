import { supabase } from './supabase/client';
import type { EnrichmentLogEntry } from '../components/EnrichmentProgressModal';

export interface NotificationSummary {
  success: number;
  errors: number;
  noWebsite: number;
  skipped: number;
  total: number;
}

export interface NotificationRecord {
  id: string;
  created_at: string;
  type: string;
  title: string;
  status: 'success' | 'partial' | 'error';
  summary: NotificationSummary;
  logs: EnrichmentLogEntry[];
  user_id: string;
}

export interface CreateNotificationInput {
  type?: string;
  title: string;
  status: 'success' | 'partial' | 'error';
  summary: NotificationSummary;
  logs: EnrichmentLogEntry[];
}

export async function createNotification(data: CreateNotificationInput): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('notifications').insert({
    type: data.type ?? 'enrichment',
    title: data.title,
    status: data.status,
    summary: data.summary,
    logs: data.logs,
    user_id: user.id,
  });
}

export async function getNotifications(limit = 50): Promise<NotificationRecord[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as NotificationRecord[];
}
