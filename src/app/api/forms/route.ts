import { json, jsonError } from '@/app/api/_lib/respond';
import { getServiceClient } from '@/app/api/_lib/service-client';
import { withAuth } from '@/app/api/_lib/with-auth';
import type { Form } from '@/types';
import { SEED_FORM } from '@/lib/form-builder/seed-form';

export const dynamic = 'force-dynamic';

export const GET = withAuth({ role: "admin" },async ({ req }) => {
  const supabase = getServiceClient();
  const url = new URL(req.url);
  const tagsParam = url.searchParams.get('tags');
  const enterpriseId = url.searchParams.get('enterprise_id');

  let query = supabase
    .from('forms')
    .select('id, name, slug, description, tags, is_published, enterprise_id, settings, style, brand, created_at, updated_at, questions, logic')
    .order('updated_at', { ascending: false });

  if (enterpriseId) {
    query = query.eq('enterprise_id', parseInt(enterpriseId, 10));
  }

  const { data, error } = await query;
  if (error) return jsonError(error.message, 500);

  let forms = data ?? [];
  if (tagsParam) {
    const siteTags = tagsParam.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    forms = forms.filter((f) =>
      (f.tags as string[]).some((t) => siteTags.includes(t.toLowerCase())),
    );
  }
  return json(forms);
});

export const POST = withAuth({ role: "admin" },async ({ req }) => {
  const supabase = getServiceClient();
  let body: {
    name?: string;
    tags?: string[];
    enterprise_id?: number | null;
    fromSeed?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_body', 400);
  }

  const name = body.name || 'Nouveau formulaire';
  const tags = body.tags ?? [];

  const payload: Partial<Form> & { name: string } = body.fromSeed
    ? {
        ...SEED_FORM,
        name,
        tags: tags.length ? tags : SEED_FORM.tags,
        enterprise_id: body.enterprise_id ?? null,
      }
    : {
        name,
        tags,
        enterprise_id: body.enterprise_id ?? null,
        questions: [],
        logic: [],
        brand: {},
        settings: {
          progressBar: true,
          showQuestionNumber: true,
          submitLabel: 'Envoyer ma demande',
          renderMode: 'step',
        },
        style: {},
        is_published: false,
      };

  const { data, error } = await supabase
    .from('forms')
    .insert(payload)
    .select()
    .single();

  if (error) return jsonError(error.message, 500);
  return json(data, { status: 201 });
});
