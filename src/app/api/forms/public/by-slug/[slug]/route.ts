import { NextResponse } from 'next/server';
import { getServiceClient } from '@/app/api/_lib/service-client';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ slug: string }> };

// GET /api/forms/public/by-slug/[slug] — public runtime read by slug
export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('forms')
    .select('id, name, slug, questions, logic, brand, settings, style, is_published')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Formulaire introuvable' }, { status: 404 });
  return NextResponse.json(data);
}
