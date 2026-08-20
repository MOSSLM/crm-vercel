/**
 * @jest-environment node
 *
 * ANNULER N'EST NI FAIRE NI ARRÊTER.
 *
 * Une tâche « Fait » avance la séquence, une issue « pas intéressé » la ferme.
 * Une tâche ANNULÉE ne faisait ni l'un ni l'autre — et surtout ne posait aucun
 * motif : l'inscription restait `active`, `hold_reason` nul, `send_at` nul,
 * `next_run_at` nul. Aucun tick ne la reprend, aucun écran ne la montre, aucune
 * phrase ne l'explique. C'est le même défaut que partout ailleurs dans ce
 * projet — un état qui ne dit pas de quoi il est fait — appliqué à une
 * inscription au lieu d'un écran.
 *
 * Mesuré le 20/08/2026 : une seule inscription dans cet état en production
 * (« Adiana Services », WhatsApp fait le 13/08 puis appel annulé). Une seule,
 * parce qu'il faut une annulation SANS autre tâche derrière — mais elle y
 * serait restée indéfiniment.
 */
import { garerTacheAnnulee } from '../engine'

jest.mock('@/app/api/_lib/service-client', () => ({ getServiceClient: () => ({}) }))

interface Etat {
  inscription: Record<string, unknown> | null
  taches: unknown[]
}

/**
 * Client de complaisance à deux tables. On n'inspecte que ce qui est ÉCRIT sur
 * l'inscription : c'est le seul effet attendu de la fonction.
 */
function clientAvec(etat: Etat) {
  const updates: Record<string, unknown>[] = []
  const from = (table: string) => {
    const chaine: Record<string, unknown> = {
      select: () => chaine,
      eq: () => chaine,
      in: () => chaine,
      limit: () => Promise.resolve({ data: etat.taches, error: null }),
      maybeSingle: () => Promise.resolve({ data: etat.inscription, error: null }),
      update: (u: Record<string, unknown>) => {
        if (table === 'sequence_enrollments') updates.push(u)
        return chaine
      },
    }
    return chaine
  }
  return { sb: { from } as never, updates }
}

const VIVANTE = {
  id: 'insc-1',
  opportunite_id: 'opp-1',
  status: 'active',
  hold_reason: null,
}

describe('garerTacheAnnulee', () => {
  it('pose un motif lisible sur une inscription que plus rien ne porte', async () => {
    const { sb, updates } = clientAvec({ inscription: VIVANTE, taches: [] })
    await garerTacheAnnulee(sb, 'insc-1')

    expect(updates).toHaveLength(1)
    expect(updates[0]).toEqual({ hold_reason: 'tache_annulee', send_at: null })
  })

  // Garer une inscription qu'une autre tâche va porter lui donnerait un motif
  // de blocage alors qu'elle n'est pas bloquée — et l'écran des gelées se
  // remplirait de lignes qui avancent très bien.
  it('ne gare rien tant qu’une autre tâche court', async () => {
    for (const taches of [[{ id: 't-2' }], [{ id: 't-3' }, { id: 't-4' }]]) {
      const { sb, updates } = clientAvec({ inscription: VIVANTE, taches })
      await garerTacheAnnulee(sb, 'insc-1')
      expect(updates).toHaveLength(0)
    }
  })

  // Une inscription déjà garée porte DÉJÀ une explication, souvent meilleure
  // (« attente sans limite », « audit à faire »). L'écraser perdrait la vraie.
  it('n’écrase jamais un motif déjà posé', async () => {
    const { sb, updates } = clientAvec({
      inscription: { ...VIVANTE, hold_reason: 'awaiting_reply' },
      taches: [],
    })
    await garerTacheAnnulee(sb, 'insc-1')
    expect(updates).toHaveLength(0)
  })

  it('ne touche pas une inscription qui n’est plus active', async () => {
    for (const status of ['exited', 'finished', 'replied', 'paused']) {
      const { sb, updates } = clientAvec({ inscription: { ...VIVANTE, status }, taches: [] })
      await garerTacheAnnulee(sb, 'insc-1')
      expect(updates).toHaveLength(0)
    }
  })

  it('ne jette pas sur une inscription disparue', async () => {
    const { sb, updates } = clientAvec({ inscription: null, taches: [] })
    await expect(garerTacheAnnulee(sb, 'insc-inconnue')).resolves.toBeUndefined()
    expect(updates).toHaveLength(0)
  })
})
