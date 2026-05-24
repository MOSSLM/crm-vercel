import { json, jsonError } from '@/app/api/_lib/respond';
import { getServiceClient } from '@/app/api/_lib/service-client';
import { withAuth } from '@/app/api/_lib/with-auth';
import type { Form } from '@/types';

export const dynamic = 'force-dynamic';

type Params = { id: string };

const ALLOWED_KEYS: (keyof Form)[] = [
  'name', 'slug', 'description', 'tags',
  'questions', 'logic', 'brand', 'settings', 'style',
  'is_published', 'enterprise_id',
];

export const GET = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('id', params.id)
    .single();
  if (error) return jsonError(error.message, 404);
  return json(data);
});

export const PUT = withAuth<undefined, Params>({}, async ({ req, params }) => {
  const supabase = getServiceClient();
  let body: Partial<Form>;
  try {
    body = (await req.json()) as Partial<Form>;
  } catch {
    return jsonError('invalid_body', 400);
  }
  const patch: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    if (key in body) patch[key] = body[key];
  }
  const { data, error } = await supabase
    .from('forms')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single();
  if (error) return jsonError(error.message, 500);
  return json(data);
});

export const DELETE = withAuth<undefined, Params>({}, async ({ params }) => {
  const supabase = getServiceClient();
  const { error } = await supabase.from('forms').delete().eq('id', params.id);
  if (error) return jsonError(error.message, 500);
  return json({ ok: true });
});
