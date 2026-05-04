import AutomationEditorLoader from '@/components/automations/AutomationEditorLoader'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AutomationEditorLoader id={id} />
}
