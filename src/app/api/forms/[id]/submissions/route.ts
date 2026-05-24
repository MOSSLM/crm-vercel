import { json, jsonError } from '@/app/api/_lib/respond';
import { getServiceClient } from '@/app/api/_lib/service-client';
import { withAuth } from '@/app/api/_lib/with-auth';

export const dynamic = 'force-dynamic';

type Params = { id: string };

export const GET = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('form_submissions')
    .select('id, form_id, site_id, enterprise_id, answers, contact, source_url, status, created_at')
    .eq('form_id', params.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return jsonError(error.message, 500);
  return json(data ?? []);
});
