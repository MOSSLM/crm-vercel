import {
  cheminSuppose,
  estCondition,
  estFourche,
  etapeAtteignable,
  etapeSuivante,
  lecteurDIssue,
  libelleIssue,
  planEditeur,
} from '../branches'
import { readConditions } from '../week'
import type { SequenceStep } from '@/components/automations/types'

/**
 * UNE CONDITION EST UNE FOURCHE, EXACTEMENT COMME UNE ATTENTE.
 *
 * C'est ce qui permet de ne RIEN changer au format stocké : `branch` garde ses
 * deux sorties, `on: 'reply'` devient OUI et `on: 'timeout'` devient NON. Les
 * six séquences existantes et les 92 `vars.replies` restent valides, et la
 * récursion d'atteignabilité marche telle quelle sur les deux natures.
 *
 * Ce fichier tient quatre choses :
 *   1. le chemin, sur les trois verdicts ;
 *   2. `siInconnu` appliqué à UN SEUL endroit — le lecteur d'issue ;
 *   3. une condition non tranchée n'ouvre AUCUNE voie par erreur ;
 *   4. les séquences sans condition ne changent pas de comportement.
 */

const email = (id: string, p: Partial<SequenceStep> = {}): SequenceStep =>
  ({ id, kind: 'email', day: 0, ...p }) as SequenceStep

const condition = (id: string, p: Partial<SequenceStep> = {}): SequenceStep =>
  ({ id, kind: 'condition', day: 0, condition: { champ: 'audit_pret', operateur: 'vrai' }, ...p }) as SequenceStep

/** L'accroche, la fourche « l'audit est-il prêt ? », ses deux voies, la clôture. */
const SEQ: SequenceStep[] = [
  email('s1'),
  condition('s2'),
  email('s3', { branch: { waitId: 's2', on: 'reply' } }),   // OUI  : e-mail avec l'audit
  email('s4', { branch: { waitId: 's2', on: 'timeout' } }), // NON  : appel
  email('s5'),                                              // tronc : clôture
]

const lire = (conditions: Record<string, 'oui' | 'non' | 'non_mesure'>, steps = SEQ) =>
  lecteurDIssue(steps, {}, conditions)

describe('la fourche', () => {
  it('se reconnaît sans se confondre avec l’attente', () => {
    expect(estCondition(SEQ[1])).toBe(true)
    expect(estCondition(SEQ[0])).toBe(false)
    expect(estFourche(SEQ[1])).toBe(true)
    // Une attente SANS délai n'est pas une fourche : sa voie « silence »
    // n'arrive jamais. C'est la règle qui a laissé 59 inscriptions garées.
    const attenteSansDelai = { id: 'w', kind: 'wait', day: 0, waitMode: 'reply' } as SequenceStep
    expect(estFourche(attenteSansDelai)).toBe(false)
  })

  it('nomme ses sorties selon sa nature, sans changer de stockage', () => {
    expect(libelleIssue(SEQ[1], 'reply').titre).toBe('Oui')
    expect(libelleIssue(SEQ[1], 'timeout').titre).toBe('Non')
    const attente = { id: 'w', kind: 'wait', day: 0, waitMode: 'reply', replyTimeoutDays: 3 } as SequenceStep
    expect(libelleIssue(attente, 'reply').titre).toBe('Il a répondu')
    expect(libelleIssue(attente, 'timeout').titre).toBe('Sans réponse')
  })

  it('dessine ses deux voies dans l’éditeur, même vides', () => {
    const plan = planEditeur(SEQ)
    const branches = plan.filter((l) => l.type === 'branche')
    expect(branches).toHaveLength(2)
    expect(plan.some((l) => l.type === 'reprise' && l.waitId === 's2')).toBe(true)
  })
})

describe('le chemin, selon le verdict', () => {
  it('OUI mène à la voie 1, NON à la voie 2 — et le tronc reprend', () => {
    expect(cheminSupposeAvec({ '1': 'oui' })).toEqual(['s1', 's2', 's3', 's5'])
    expect(cheminSupposeAvec({ '1': 'non' })).toEqual(['s1', 's2', 's4', 's5'])
  })

  it('NON MESURÉ prend la voie 2 par défaut', () => {
    expect(cheminSupposeAvec({ '1': 'non_mesure' })).toEqual(['s1', 's2', 's4', 's5'])
  })

  it('NON MESURÉ suit `siInconnu` quand il est réglé', () => {
    const seq = [...SEQ]
    seq[1] = condition('s2', { condition: { champ: 'audit_pret', operateur: 'vrai', siInconnu: 'oui' } })
    expect(cheminSupposeAvec({ '1': 'non_mesure' }, seq)).toEqual(['s1', 's2', 's3', 's5'])
    // Et il ne s'applique JAMAIS à un verdict qu'on a su rendre.
    expect(cheminSupposeAvec({ '1': 'non' }, seq)).toEqual(['s1', 's2', 's4', 's5'])
  })

  it('une condition PAS ENCORE tranchée n’ouvre aucune voie par erreur', () => {
    // Le sac est vide : l'inscription n'est pas encore passée par la fourche.
    // Elle doit prendre la sortie 2 — celle qu'on écrit pour quelqu'un dont on
    // ne sait rien — et surtout PAS les deux, ni sauter les deux.
    expect(etapeAtteignable(SEQ, 2, lire({}))).toBe(false)
    expect(etapeAtteignable(SEQ, 3, lire({}))).toBe(true)
    expect(etapeAtteignable(SEQ, 4, lire({}))).toBe(true)
  })

  it('les deux voies ne sont JAMAIS atteignables ensemble', () => {
    for (const v of ['oui', 'non', 'non_mesure'] as const) {
      const l = lire({ '1': v })
      const ouvertes = [2, 3].filter((i) => etapeAtteignable(SEQ, i, l))
      expect(ouvertes).toHaveLength(1)
    }
  })
})

/** Le chemin, en identifiants d'étape — plus lisible qu'une liste d'index. */
function cheminSupposeAvec(
  conditions: Record<string, 'oui' | 'non' | 'non_mesure'>,
  steps = SEQ,
): string[] {
  const l = lecteurDIssue(steps, {}, conditions)
  const out: string[] = []
  let i = etapeAtteignable(steps, 0, l) ? 0 : etapeSuivante(steps, -1, l)
  while (i < steps.length) {
    out.push(steps[i].id)
    i = etapeSuivante(steps, i, l)
  }
  return out
}

describe('ce qui existait déjà ne bouge pas', () => {
  it('une séquence sans condition garde son comportement au caractère près', () => {
    const simple: SequenceStep[] = [email('a'), email('b'), email('c')]
    expect(cheminSuppose(simple, {})).toEqual([0, 1, 2])
    const l = lecteurDIssue(simple, {}, {})
    expect(etapeSuivante(simple, 0, l)).toBe(1)
  })

  it('une attente-réponse continue de lire `vars.replies`', () => {
    const seq: SequenceStep[] = [
      email('s1'),
      { id: 's2', kind: 'wait', day: 0, waitMode: 'reply', replyTimeoutDays: 3 } as SequenceStep,
      email('s3', { branch: { waitId: 's2', on: 'reply' } }),
      email('s4', { branch: { waitId: 's2', on: 'timeout' } }),
    ]
    // Le sac des conditions est vide ; c'est `replies` qui décide.
    expect(etapeAtteignable(seq, 2, lecteurDIssue(seq, { '1': '2026-08-19T09:00:00Z' }, {}))).toBe(true)
    expect(etapeAtteignable(seq, 3, lecteurDIssue(seq, { '1': '2026-08-19T09:00:00Z' }, {}))).toBe(false)
    expect(etapeAtteignable(seq, 3, lecteurDIssue(seq, {}, {}))).toBe(true)
  })
})

describe('le sac des verdicts', () => {
  it('garde ce qui est écrit, par identifiant d’étape comme par rang', () => {
    expect(readConditions({ conditions: { '0': 'oui', '1': 'non', '2': 'non_mesure' } }))
      .toEqual({ '0': 'oui', '1': 'non', '2': 'non_mesure' })
    // ⚠️ LE SAC NE FILTRE PLUS SUR « oui / non / non_mesure », et il ne filtre
    // plus sur « la clé est un entier ». Deux raisons, toutes deux payées :
    //
    //   · un aiguillage écrit sa CLÉ DE SORTIE (`c2`, `sinon`), qui n'est
    //     aucune des trois valeurs historiques ;
    //   · la clé est l'IDENTIFIANT de l'étape depuis le 20/08/2026, plus son
    //     rang — insérer une carte au milieu d'une séquence en cours décalait
    //     tout ce qui suit.
    //
    // C'est `lecteurDIssue` qui décide si la valeur désigne une sortie qui
    // existe encore, et lui seul : le sac ne fait que transporter.
    expect(readConditions({ conditions: { s3: 'c2', s7: 'sinon' } }))
      .toEqual({ s3: 'c2', s7: 'sinon' })
    // Restent jetés : ce qui n'est pas une chaîne, et ce qui n'est pas un objet.
    expect(readConditions({ conditions: { '1': 3, '': 'oui' } })).toEqual({})
    expect(readConditions(null)).toEqual({})
    expect(readConditions({ conditions: ['oui'] })).toEqual({})
  })

  // Une sortie qui n'existe plus (le cas a été supprimé sous les pieds de
  // l'inscription) ne rend pas le prospect inatteignable partout : il retombe
  // dans « sinon », la voie qu'on écrit pour ceux dont on ne sait rien.
  it('retombe sur « sinon » quand la sortie notée n’existe plus', () => {
    const aiguillage: SequenceStep[] = [
      {
        id: 'a1',
        kind: 'condition',
        day: 0,
        condition: {
          champ: '',
          operateur: '',
          cas: [{ cle: 'c1', champ: 'a_mobile', operateur: 'vrai' }],
        },
      },
      { id: 'a2', kind: 'whatsapp', day: 0, branch: { waitId: 'a1', on: 'c1' } },
      { id: 'a3', kind: 'email', day: 0, branch: { waitId: 'a1', on: 'sinon' } },
    ]
    expect(lecteurDIssue(aiguillage, {}, { a1: 'c1' })(0)).toBe('c1')
    expect(lecteurDIssue(aiguillage, {}, { a1: 'c9' })(0)).toBe('sinon')
    // Rien de noté : la dernière voie, jamais la première.
    expect(lecteurDIssue(aiguillage, {}, {})(0)).toBe('sinon')
  })
})
