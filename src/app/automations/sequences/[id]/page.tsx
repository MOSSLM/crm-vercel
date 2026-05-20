import { SequenceBuilder } from '@/components/automations/SequenceBuilder'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <SequenceBuilder id={id} />
}
