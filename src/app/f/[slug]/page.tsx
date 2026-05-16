import { getSupabaseServiceClient } from '@/lib/supabase-service';
import { notFound } from 'next/navigation';
import type { Form } from '@/types';
import { FormRuntime } from '@/components/form-builder/runtime/FormRuntime';
import '@/components/form-builder/forms-theme.css';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export default async function PublicFormPage({ params }: Props) {
  const { slug } = await params;
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from('forms')
    .select('id, name, slug, questions, logic, brand, settings, style, is_published')
    .eq('slug', slug)
    .eq('is_published', true)
    .single();

  if (error || !data) notFound();

  const form = data as unknown as Form;

  return (
    <div
      data-form-builder
      data-density="regular"
      style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}
    >
      <FormRuntime form={form} mode={form.settings?.renderMode ?? 'step'} />
    </div>
  );
}
