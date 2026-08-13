import { getServiceClient } from '@/app/api/_lib/service-client';
import { notFound } from 'next/navigation';
import type { Form } from '@/types';
import { FormRuntime } from '@/components/form-builder/runtime/FormRuntime';
import { PublicAnalytics } from '@/components/analytics/PublicAnalytics';
import '@/components/form-builder/forms-theme.css';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export default async function PublicFormPage({ params }: Props) {
  const { slug } = await params;
  const supabase = getServiceClient();

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
      {/* Cette page est publique et envoyée à des prospects, mais elle vit dans
          le groupe de routes (crm) qui n'injecte pas le tag GA4. Sans ça,
          `window.gtag` n'existe pas et les événements de formulaire émis par
          FormRuntime partaient dans le vide : un formulaire rempli depuis ce
          lien hébergé restait invisible du radar. */}
      <PublicAnalytics />
      <FormRuntime form={form} mode={form.settings?.renderMode ?? 'step'} />
    </div>
  );
}
