import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-service';
import type { Form } from '@/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/forms/[id] — read one form (admin)
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = getSupabaseServiceClient();
  const { data, error } = await supabase
    .from('forms')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

// PUT /api/forms/[id] — update form (full or partial)
export async function PUT(request: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = getSupabaseServiceClient();
  try {
    const body = await request.json() as Partial<Form>;

    // Whitelist updatable columns
    const allowed: (keyof Form)[] = [
      'name', 'slug', 'description', 'tags',
      'questions', 'logic', 'brand', 'settings', 'style',
      'is_published', 'enterprise_id',
    ];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) patch[key] = body[key];
    }

    const { data, error } = await supabase
      .from('forms')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

// DELETE /api/forms/[id]
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = getSupabaseServiceClient();
  const { error } = await supabase.from('forms').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
