import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-service';
import type { Form } from '@/types';
import { SEED_FORM } from '@/lib/form-builder/seed-form';

export const dynamic = 'force-dynamic';

// GET /api/forms — list forms, optional ?tags=a,b&enterprise_id=123
export async function GET(request: Request) {
  const supabase = getSupabaseServiceClient();
  const url = new URL(request.url);
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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let forms = data ?? [];

  // Filter by tags overlap if requested
  if (tagsParam) {
    const siteTags = tagsParam.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    forms = forms.filter((f) =>
      (f.tags as string[]).some((t) => siteTags.includes(t.toLowerCase())),
    );
  }

  return NextResponse.json(forms);
}

// POST /api/forms — create a form (blank or from seed)
export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  try {
    const body = await request.json() as {
      name?: string;
      tags?: string[];
      enterprise_id?: number | null;
      fromSeed?: boolean;
    };

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

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
