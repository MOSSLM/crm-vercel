/**
 * @jest-environment node
 *
 * SUSPENDRE L'E-MAIL, PUIS LE ROUVRIR AU COMPTE-GOUTTES.
 *
 * Les boîtes d'envoi ne sont pas chaudes. Faire partir un e-mail aujourd'hui
 * abîmerait la réputation qu'on est en train de construire — mais retirer les
 * étapes e-mail des séquences aurait voulu dire les réécrire plus tard.
 *
 * PREMIÈRE VERSION, ÉCARTÉE : rendre « a une adresse » faux, pour que l'échelle
 * de canaux contourne le barreau et descende à l'appel. Ça marchait, et c'était
 * le mauvais arbitrage — le verdict d'une question s'écrit UNE FOIS dans
 * l'inscription, donc contourner n'ajournait pas l'e-mail, il l'abandonnait.
 * Matteo a tranché : « si ça fige ceux qu'on doit contacter par e-mail, ça me
 * va ».
 *
 * CE QUI EST EN PLACE : le prospect va jusqu'à son étape e-mail et y RESTE, avec
 * un motif lisible. Il repart quand le plafond le permet — et ce plafond peut
 * être celui de la chauffe, qui monte jour après jour.
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

describe('le fait « a une adresse » ne ment pas', () => {
  // UNE VERSION DE CE FICHIER TESTAIT L'INVERSE. `aEmail` devenait faux sous
  // suspension pour que l'échelle contourne le barreau e-mail. Ça marchait, et
  // c'était le mauvais arbitrage : le verdict d'une question s'écrit une fois
  // pour toutes, donc contourner n'ajournait pas l'e-mail — il l'abandonnait.
  // Matteo a tranché : « si ça fige ceux qu'on doit contacter par e-mail, ça me
  // va ». Le fait redit donc ce qu'il dit, et c'est l'envoi qui retient.
  it('rend vrai même quand le canal est suspendu', async () => {
    const faits = await releverLesFaits(base(['email']), { entrepriseId: 1, contactId: null, opportuniteId: null })
    expect(faits.aEmail).toBe(true)
    expect(faits.aMobile).toBe(true)
  })

  it('ne va même plus lire les réglages du régulateur', async () => {
    await releverLesFaits(base(['email']), { entrepriseId: 1, contactId: null, opportuniteId: null })
    expect(mockFrom.mock.calls.map((c) => c[0])).not.toContain('regulator_settings')
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

describe('l’échelle mène bien à l’e-mail, et c’est là qu’on retient', () => {
  it('sans mobile et avec une adresse : le prospect arrive sur l’étape e-mail', () => {
    // Suspendu ou non, le chemin est le MÊME : c'est le moteur qui retient
    // l'inscription sur `ml1`, avec le motif `canal_suspendu`. Elle repartira
    // de là — pas d'un autre canal — quand le plafond le permettra.
    const chemin = cheminSuppose(ECHELLE, { waQ: 'timeout', mlQ: 'reply' })
    expect(idsDe(ECHELLE, chemin)).toEqual(['waQ', 'mlQ', 'ml1', 'mlGo'])
  })

  it('sans adresse du tout : il descend à l’appel, sans passer par l’e-mail', () => {
    const chemin = cheminSuppose(ECHELLE, { waQ: 'timeout', mlQ: 'timeout' })
    expect(idsDe(ECHELLE, chemin)).toEqual(['waQ', 'mlQ', 'ap1'])
  })

  it('avec un mobile qui répond : l’e-mail n’est pas sur le chemin', () => {
    const chemin = cheminSuppose(ECHELLE, { waQ: 'reply' })
    expect(idsDe(ECHELLE, chemin)).toEqual(['waQ', 'wa1', 'waGo'])
  })

  it('« a une adresse » faux se lit comme un non, pas comme un non mesuré', () => {
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
