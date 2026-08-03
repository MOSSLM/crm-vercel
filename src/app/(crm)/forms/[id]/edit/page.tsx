import FormBuilderApp from '@/components/form-builder/FormBuilderApp';

type Props = { params: Promise<{ id: string }> };

export default async function EditPage({ params }: Props) {
  const { id } = await params;
  return <FormBuilderApp formId={id} />;
}
