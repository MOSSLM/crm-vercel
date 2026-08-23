'use client'
// useGestes — la mécanique du retour en arrière, sans son habillage.
//
// DEUX ÉCRANS DEMANDENT LA MÊME CHOSE ET N'ONT PAS LA MÊME CHARTE : le tableau
// des tâches parle lemlist (`.lem-skin`), le poste de travail « Ma journée »
// parle la maquette SAMA (`.dm-skin`). Recopier le composant d'un skin à
// l'autre aurait recopié l'appel réseau, ses refus et ses messages ; on ne
// partage donc que ce qui n'a pas de couleur — la liste, l'annulation, et
// l'état « annulation en cours ».
//
// LE SILENCE EST VOULU À LA LECTURE : si la route répond mal (migration
// absente, droits), on n'affiche rien plutôt qu'une erreur. Ce bloc est un
// confort posé au-dessus d'écrans qui servent à autre chose, il ne doit jamais
// les casser. À L'ANNULATION en revanche, tout se dit : c'est un geste
// délibéré, son refus a une raison, et cette raison indique quoi faire.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { authedFetch } from '@/utils/authedFetch'

export interface Geste {
  id: string
  geste: 'terminer' | 'ignorer' | 'reporter'
  faitLe: string
  entreprise: string | null
  titre: string | null
  resume: string
  /** Calculé par le serveur ligne par ligne : `possible: false` porte son motif. */
  verdict: { possible: boolean; motif: string }
}

export const LIBELLE_GESTE: Record<Geste['geste'], string> = {
  terminer: 'Terminée',
  ignorer: 'Ignorée',
  reporter: 'Reportée',
}

/** « il y a 4 min », « il y a 2 h », « le 21/08 » — jamais un horodatage brut. */
export function depuis(iso: string): string {
  const quand = new Date(iso).getTime()
  if (Number.isNaN(quand)) return ''
  const minutes = Math.floor((Date.now() - quand) / 60000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  if (minutes < 60 * 24) return `il y a ${Math.floor(minutes / 60)} h`
  return `le ${new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`
}

export function useGestes({
  endpoint,
  limite = 8,
  apres,
}: {
  endpoint: string
  limite?: number
  /** Rappelé après une annulation réussie : l'écran d'à côté doit se relire. */
  apres?: () => void
}) {
  const [gestes, setGestes] = useState<Geste[]>([])
  const [enCours, setEnCours] = useState<string | null>(null)

  const recharger = useCallback(async () => {
    try {
      const res = await authedFetch(`${endpoint}?limite=${limite}`)
      if (!res.ok) return
      const data = await res.json()
      setGestes(Array.isArray(data?.gestes) ? data.gestes : [])
    } catch {
      // silencieux : voir l'en-tête
    }
  }, [endpoint, limite])

  useEffect(() => {
    void recharger()
  }, [recharger])

  const annuler = useCallback(
    async (g: Geste) => {
      setEnCours(g.id)
      try {
        const res = await authedFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: g.id }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error ?? 'Annulation impossible')
        toast.success(`C’est revenu en arrière : ${data.motif}`)
        await recharger()
        apres?.()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Annulation impossible')
      } finally {
        setEnCours(null)
      }
    },
    [endpoint, recharger, apres],
  )

  return { gestes, enCours, annuler, recharger }
}
