import { notFound } from 'next/navigation'
import { LotDetail } from '@/components/prospection/LotDetail'

/**
 * Le contenu d'un lot : `/prospection/lots/{id}`.
 *
 * L'IDENTIFIANT EST VALIDÉ ICI, pas dans le composant. Une adresse recopiée à
 * la main — un `/prospection/lots/undefined` collé depuis un onglet — doit
 * rendre un 404 franc, pas un écran qui charge indéfiniment puis annonce une
 * panne de lecture. La garde est côté serveur pour que la réponse porte le bon
 * code, ce qui compte pour les journaux comme pour l'historique du navigateur.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lotId = Number(id)
  if (!Number.isInteger(lotId) || lotId <= 0) notFound()
  return <LotDetail lotId={lotId} />
}
