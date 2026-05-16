import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getSupabaseServiceClient } from '@/lib/supabase-service';
import type { Form, FormQuestion } from '@/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function extractContact(
  questions: FormQuestion[],
  answers: Record<string, unknown>,
): { name?: string; email?: string; phone?: string; zip?: string } {
  const contact: { name?: string; email?: string; phone?: string; zip?: string } = {};
  for (const q of questions) {
    const val = answers[q.id];
    if (typeof val !== 'string' || !val) continue;
    if (q.type === 'email') contact.email = val;
    if (q.type === 'phone') contact.phone = val;
    if (q.type === 'short_text') {
      const ref = q.ref?.toLowerCase() ?? '';
      const title = q.title?.toLowerCase() ?? '';
      if (!contact.name && (ref.includes('name') || title.includes('nom') || title.includes('prénom') || title.includes('comment vous'))) {
        contact.name = val;
      }
      if (!contact.zip && (ref.includes('zip') || title.includes('postal') || (q.maxLen === 5 && /^\d{5}$/.test(val)))) {
        contact.zip = val;
      }
    }
  }
  return contact;
}

// POST /api/forms/[id]/submit — public submission
export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  // Fetch form to verify it's published and get questions
  const { data: form, error: formErr } = await supabase
    .from('forms')
    .select('id, is_published, settings, enterprise_id, questions')
    .eq('id', id)
    .single() as { data: Pick<Form, 'id' | 'is_published' | 'settings' | 'enterprise_id' | 'questions'> | null; error: unknown };

  if (formErr || !form) return NextResponse.json({ error: 'Formulaire introuvable' }, { status: 404 });
  if (!form.is_published) return NextResponse.json({ error: 'Formulaire non publié' }, { status: 403 });

  let body: {
    answers?: Record<string, unknown>;
    source_url?: string;
    site_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 });
  }

  const answers = body.answers ?? {};
  const contact = extractContact(form.questions as FormQuestion[], answers);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const { data: submission, error: subErr } = await supabase
    .from('form_submissions')
    .insert({
      form_id: id,
      site_id: body.site_id ?? null,
      enterprise_id: form.enterprise_id ?? null,
      answers,
      contact,
      user_agent: request.headers.get('user-agent'),
      ip_hash: hashIp(ip),
      source_url: body.source_url ?? null,
      status: 'received',
    })
    .select('id')
    .single();

  if (subErr) return NextResponse.json({ error: subErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    submission_id: submission.id,
    redirect_url: (form.settings as { redirect_url?: string })?.redirect_url ?? null,
  });
}
