import { WorkflowBuilder } from '@/components/automations/WorkflowBuilder'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <WorkflowBuilder id={id} />
}
