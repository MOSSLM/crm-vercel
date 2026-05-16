import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase-service';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/forms/[id]/submissions — list submissions for admin
export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('form_submissions')
    .select('id, form_id, site_id, enterprise_id, answers, contact, source_url, status, created_at')
    .eq('form_id', id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
