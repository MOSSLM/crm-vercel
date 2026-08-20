/**
 * @jest-environment node
 *
 * SUSPENDRE UN CANAL SANS ARRÊTER LA SÉQUENCE.
 *
 * Le besoin vient du terrain : les boîtes d'envoi ne sont pas encore chaudes,
 * et faire partir un e-mail aujourd'hui abîmerait la réputation qu'on est
 * justement en train de construire. Les deux interrupteurs qui existaient
 * — `paused` et la phase de test — arrêtent TOUT : le prospect gèle là où il
 * est. Ce n'est pas ce qu'on veut. Un artisan sans mobile doit être appelé, pas
 * mis en attente six semaines.
 *
 * Ce fichier vérifie les deux moitiés du mécanisme, qui n'ont pas la même
 * nature et se contrôlent séparément :
 *
 *   1. LE CONTOURNEMENT — « a une adresse » répond non, donc l'échelle de
 *      canaux descend d'un barreau toute seule. Personne ne s'arrête.
 *   2. LA CEINTURE — le motif de retenue existe et se lit en français, pour
 *      les chemins qu'aucun aiguillage n'aura évités.
 */

const mockFrom = jest.fn()

import { releverLesFaits } from '../conditions-db'
import { cheminSuppose } from '../branches'
import { evaluerCondition } from '../conditions'
import { holdReasonLabel, toRegulatorSettings, CANAUX_SUSPENDABLES } from '../regulator'
import type { SequenceStep } from '@/components/automations/types'
import type { SupabaseClient } from '@supabase/supabase-js'

type ChainResult = { data: unknown; error?: unknown }

/** Chaîne Supabase minimale — les lectures finissent sur maybeSingle, limit ou await. */
const chain = (result: ChainResult) => {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'order']) c[m] = jest.fn(() => c)
  c.limit = jest.fn(() => Promise.resolve(result))
  c.maybeSingle = jest.fn().mockResolvedValue(result)
  c.then = (resolve: (v: ChainResult) => unknown) => Promise.resolve(result).then(resolve)
  return c
}

/** Une entreprise joignable par e-mail ET par mobile — le cas que Matteo redoute. */
const base = (canauxSuspendus: string[]) => {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'entreprises')
      return chain({ data: { email: 'contact@toiture-dupont.fr', telephone: '0612345678', telephones: [], cohorte_demarchage: 'B' } })
    if (table === 'regulator_settings') return chain({ data: { canaux_suspendus: canauxSuspendus } })
    return chain({ data: null })
  })
  return { from: (...args: unknown[]) => mockFrom(...args) } as unknown as SupabaseClient
}

beforeEach(() => mockFrom.mockReset())

describe('le fait « a une adresse » suit la suspension', () => {
  it('rend vrai quand rien n’est suspendu', async () => {
    const faits = await releverLesFaits(base([]), { entrepriseId: 1, contactId: null, opportuniteId: null })
    expect(faits.aEmail).toBe(true)
    expect(faits.aMobile).toBe(true)
  })

  it('rend faux quand l’e-mail est suspendu — et ne touche PAS au mobile', async () => {
    const faits = await releverLesFaits(base(['email']), { entrepriseId: 1, contactId: null, opportuniteId: null })
    expect(faits.aEmail).toBe(false)
    // `a_mobile` sert à la fois à WhatsApp et à l'appel : le masquer parce
    // qu'un canal est suspendu couperait le téléphone, qui n'a rien demandé.
    expect(faits.aMobile).toBe(true)
  })

  it('suspendre WhatsApp ne rend pas le mobile invisible', async () => {
    const faits = await releverLesFaits(base(['whatsapp']), { entrepriseId: 1, contactId: null, opportuniteId: null })
    expect(faits.aMobile).toBe(true)
    expect(faits.aEmail).toBe(true)
  })

  it('la colonne absente (migration non jouée) ne suspend rien', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'entreprises')
        return chain({ data: { email: 'a@b.fr', telephone: '0612345678', telephones: [], cohorte_demarchage: null } })
      if (table === 'regulator_settings') return chain({ data: null, error: { code: '42703' } })
      return chain({ data: null })
    })
    const sb = { from: (...args: unknown[]) => mockFrom(...args) } as unknown as SupabaseClient
    const faits = await releverLesFaits(sb, { entrepriseId: 1, contactId: null, opportuniteId: null })
    expect(faits.aEmail).toBe(true)
  })
})

/**
 * L'échelle de S1, en réduction : mobile ? → adresse ? → appel.
 * Chaque barreau porte son cycle sur sa voie « oui » et se termine par une
 * sortie ; un barreau dont la question répond non se traverse sans rien faire.
 */
const ECHELLE: SequenceStep[] = [
  { id: 'waQ', kind: 'condition', day: 0, condition: { champ: 'a_mobile', operateur: 'vrai' } },
  { id: 'wa1', kind: 'whatsapp', day: 0, branch: { waitId: 'waQ', on: 'reply' } },
  { id: 'waGo', kind: 'transition', day: 0, branch: { waitId: 'waQ', on: 'reply' } },
  { id: 'mlQ', kind: 'condition', day: 0, condition: { champ: 'a_email', operateur: 'vrai' } },
  { id: 'ml1', kind: 'email', day: 0, branch: { waitId: 'mlQ', on: 'reply' } },
  { id: 'mlGo', kind: 'transition', day: 0, branch: { waitId: 'mlQ', on: 'reply' } },
  { id: 'ap1', kind: 'call', day: 0 },
] as SequenceStep[]

const idsDe = (steps: SequenceStep[], chemin: number[]) => chemin.map((i) => steps[i].id)

describe('l’échelle contourne le canal suspendu au lieu de s’y arrêter', () => {
  it('sans mobile et avec une adresse : le prospect passe par l’e-mail', () => {
    const chemin = cheminSuppose(ECHELLE, { waQ: 'timeout', mlQ: 'reply' })
    expect(idsDe(ECHELLE, chemin)).toEqual(['waQ', 'mlQ', 'ml1', 'mlGo'])
  })

  it('sans mobile, e-mail suspendu : il descend jusqu’à l’appel, il ne gèle pas', () => {
    // `mlQ` répond « timeout » parce que `a_email` vaut faux — c'est exactement
    // ce que produit `releverLesFaits` sous suspension. AUCUNE étape e-mail
    // dans le chemin, et l'appel est bien atteint.
    const chemin = cheminSuppose(ECHELLE, { waQ: 'timeout', mlQ: 'timeout' })
    expect(idsDe(ECHELLE, chemin)).toEqual(['waQ', 'mlQ', 'ap1'])
    expect(idsDe(ECHELLE, chemin)).not.toContain('ml1')
  })

  it('avec un mobile : l’e-mail n’était de toute façon jamais sur le chemin', () => {
    // La réponse à « et si l'entreprise a mobile + e-mail ? » : le barreau
    // WhatsApp se termine par une sortie, la question sur l'adresse n'est
    // jamais atteinte. C'est l'échelle qui protège, pas la suspension.
    const chemin = cheminSuppose(ECHELLE, { waQ: 'reply' })
    expect(idsDe(ECHELLE, chemin)).toEqual(['waQ', 'wa1', 'waGo'])
  })

  it('le faux de la suspension se lit bien comme un « non », pas comme un « non mesuré »', () => {
    expect(evaluerCondition({ champ: 'a_email', operateur: 'vrai' }, { aEmail: false })).toBe('non')
    expect(evaluerCondition({ champ: 'a_email', operateur: 'vrai' }, {})).toBe('non_mesure')
  })
})

describe('la ceinture se lit', () => {
  it('le motif de retenue a un libellé qui dit où aller le débloquer', () => {
    expect(holdReasonLabel('canal_suspendu')).toContain('canal suspendu')
  })

  it('une valeur inconnue en base est écartée plutôt que gardée', () => {
    // Une faute de frappe suspendrait un canal qui n'existe pas : invisible.
    // Un canal qu'on croyait suspendu et qui envoie, lui, se voit.
    const s = toRegulatorSettings({ canaux_suspendus: ['email', 'pigeon voyageur'] })
    expect(s.canauxSuspendus).toEqual(['email'])
  })

  it('sans colonne, rien n’est suspendu', () => {
    expect(toRegulatorSettings({}).canauxSuspendus).toEqual([])
  })

  it('les genres suspendables sont ceux qui s’adressent à quelqu’un', () => {
    // `wait`, `condition` et `transition` n'envoient rien : les suspendre
    // n'aurait aucun sens et casserait la séquence en deux.
    expect(CANAUX_SUSPENDABLES).not.toContain('wait')
    expect(CANAUX_SUSPENDABLES).not.toContain('condition')
    expect(CANAUX_SUSPENDABLES).not.toContain('transition')
  })
})
