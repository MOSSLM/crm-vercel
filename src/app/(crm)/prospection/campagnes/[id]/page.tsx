import { CampagneDetail } from '@/components/prospection/CampagneDetail'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <CampagneDetail id={id} />
}
