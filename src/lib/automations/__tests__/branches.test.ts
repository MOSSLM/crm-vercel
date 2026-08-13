/**
 * Les deux suites d'une attente-réponse.
 *
 * Ce que ce fichier protège : une attente avec délai a DEUX issues, et le
 * message qui suit ne peut pas convenir aux deux. « Merci pour votre réponse ! »
 * envoyé à un silence de trois jours, ou « je me permets de revenir vers vous »
 * à quelqu'un qui vient d'écrire — c'est exactement ce qui partait avant.
 */
import {
  attenteGouvernante,
  cheminSuppose,
  debutDeBranche,
  etapeAtteignable,
  etapeSuivante,
  retourVersLaReponse,
  aUneBrancheSilence,
} from '../branches'
import type { SequenceStep } from '@/components/automations/types'

/** La séquence WhatsApp réelle, branchée : accroche, attente, puis deux suites. */
const SEQUENCE: SequenceStep[] = [
  { id: 's1', kind: 'whatsapp', day: 0 },
  { id: 's2', kind: 'wait', day: 0, waitMode: 'reply', replyTimeoutDays: 3 },
  { id: 's3', kind: 'whatsapp', day: 0, branch: { waitId: 's2', on: 'reply' } },
  { id: 's4', kind: 'whatsapp', day: 3, branch: { waitId: 's2', on: 'timeout' } },
  { id: 's5', kind: 'call', day: 5 },
]

/** `vars.replies` sous la forme que lit le moteur : index d'étape → instant. */
const repondu = (...indexes: number[]) => (i: number) => indexes.includes(i)
const jamais = () => false

describe('etapeSuivante', () => {
  it('mène à la branche « il a répondu » quand une réponse est déclarée', () => {
    expect(etapeSuivante(SEQUENCE, 1, repondu(1))).toBe(2)
  })

  it('mène à la branche « sans réponse » quand le délai s’écoule', () => {
    expect(etapeSuivante(SEQUENCE, 1, jamais)).toBe(3)
  })

  it('saute l’autre branche pour rejoindre le tronc, dans les deux sens', () => {
    // Depuis la réponse (s3), la relance du silence (s4) ne doit PAS partir.
    expect(etapeSuivante(SEQUENCE, 2, repondu(1))).toBe(4)
    // Depuis le silence (s4), on ne repasse pas par le message de réponse.
    expect(etapeSuivante(SEQUENCE, 3, jamais)).toBe(4)
  })

  it('termine la séquence quand plus rien n’est atteignable', () => {
    expect(etapeSuivante(SEQUENCE, 4, jamais)).toBe(SEQUENCE.length)
  })

  it('ne change rien à une séquence sans branche', () => {
    const plate: SequenceStep[] = [
      { id: 'a', kind: 'email', day: 0 },
      { id: 'b', kind: 'wait', day: 3 },
      { id: 'c', kind: 'call', day: 3 },
    ]
    expect(etapeSuivante(plate, 0, jamais)).toBe(1)
    expect(etapeSuivante(plate, 1, jamais)).toBe(2)
    expect(etapeSuivante(plate, 2, jamais)).toBe(3)
  })
})

describe('etapeAtteignable', () => {
  it('laisse toujours passer le tronc', () => {
    expect(etapeAtteignable(SEQUENCE, 0, jamais)).toBe(true)
    expect(etapeAtteignable(SEQUENCE, 4, jamais)).toBe(true)
  })

  it('écarte une branche orpheline plutôt que de la prendre pour du tronc', () => {
    // L'attente a été supprimée de l'éditeur : envoyer le message « par défaut »
    // serait le mauvais côté de l'erreur — on ne devine pas.
    const casse: SequenceStep[] = [
      { id: 'a', kind: 'whatsapp', day: 0 },
      { id: 'b', kind: 'whatsapp', day: 0, branch: { waitId: 'disparue', on: 'reply' } },
    ]
    expect(etapeAtteignable(casse, 1, repondu(0))).toBe(false)
    expect(etapeSuivante(casse, 0, repondu(0))).toBe(2)
  })

  it('écarte une branche placée avant son attente', () => {
    const desordre: SequenceStep[] = [
      { id: 'b', kind: 'whatsapp', day: 0, branch: { waitId: 'w', on: 'reply' } },
      { id: 'w', kind: 'wait', day: 0, waitMode: 'reply', replyTimeoutDays: 2 },
    ]
    expect(etapeAtteignable(desordre, 0, repondu(1))).toBe(false)
  })

  it('n’ouvre pas les branches d’une attente qu’on n’a jamais atteinte', () => {
    // `w2` vit DANS la branche réponse de `w1`. Sur le chemin du silence, `w2`
    // n'est jamais exécutée : sans la récursion, sa propre branche « sans
    // réponse » passerait pour atteignable — personne n'ayant répondu à une
    // attente qui n'a pas eu lieu.
    const imbrique: SequenceStep[] = [
      { id: 'w1', kind: 'wait', day: 0, waitMode: 'reply', replyTimeoutDays: 3 },
      { id: 'w2', kind: 'wait', day: 0, waitMode: 'reply', replyTimeoutDays: 2, branch: { waitId: 'w1', on: 'reply' } },
      { id: 'x', kind: 'whatsapp', day: 0, branch: { waitId: 'w2', on: 'timeout' } },
      { id: 'y', kind: 'call', day: 4, branch: { waitId: 'w1', on: 'timeout' } },
    ]
    expect(etapeAtteignable(imbrique, 2, jamais)).toBe(false)
    expect(etapeSuivante(imbrique, 0, jamais)).toBe(3)
    // Sur le chemin de la réponse à `w1`, la branche de `w2` redevient possible.
    expect(etapeAtteignable(imbrique, 2, repondu(0))).toBe(true)
  })
})

describe('aUneBrancheSilence', () => {
  it('n’existe que si l’attente relance vraiment', () => {
    expect(aUneBrancheSilence(SEQUENCE[1])).toBe(true)
    // Sans délai, l'inscription reste garée pour toujours : promettre un envoi
    // sur cette branche serait promettre un message qui ne partira jamais.
    expect(aUneBrancheSilence({ id: 'w', kind: 'wait', day: 0, waitMode: 'reply' })).toBe(false)
    expect(aUneBrancheSilence({ id: 'w', kind: 'wait', day: 3 })).toBe(false)
  })
})

describe('retourVersLaReponse', () => {
  it('ramène sur la branche réponse quand il répond après la relance', () => {
    // Le cas le plus fréquent, pas un cas limite : c'est la relance qui l'a
    // réveillé. L'inscription est sur `s4`, il écrit, on repart en `s3`.
    expect(retourVersLaReponse(SEQUENCE, 3)).toEqual({ waitIdx: 1, cible: 2 })
  })

  it('ne rattrape rien depuis le tronc ni depuis la branche réponse', () => {
    expect(retourVersLaReponse(SEQUENCE, 4)).toBeNull()
    expect(retourVersLaReponse(SEQUENCE, 2)).toBeNull()
  })

  it('ne rattrape rien quand aucune branche réponse n’est écrite', () => {
    const sansReponse: SequenceStep[] = [
      { id: 'w', kind: 'wait', day: 0, waitMode: 'reply', replyTimeoutDays: 3 },
      { id: 'r', kind: 'whatsapp', day: 3, branch: { waitId: 'w', on: 'timeout' } },
    ]
    expect(retourVersLaReponse(sansReponse, 1)).toBeNull()
  })
})

describe('attenteGouvernante et debutDeBranche', () => {
  it('nomme l’attente dont dépend une étape de branche', () => {
    expect(attenteGouvernante(SEQUENCE, 3)).toBe(1)
    expect(attenteGouvernante(SEQUENCE, 4)).toBe(-1)
  })

  it('trouve la première étape de chaque branche', () => {
    expect(debutDeBranche(SEQUENCE, 's2', 'reply')).toBe(2)
    expect(debutDeBranche(SEQUENCE, 's2', 'timeout')).toBe(3)
    expect(debutDeBranche(SEQUENCE, 's2', 'reply')).not.toBe(debutDeBranche(SEQUENCE, 's2', 'timeout'))
  })
})

describe('cheminSuppose', () => {
  it('déroule le chemin complet d’une issue, l’autre branche exclue', () => {
    expect(cheminSuppose(SEQUENCE, { s2: 'reply' })).toEqual([0, 1, 2, 4])
    expect(cheminSuppose(SEQUENCE, { s2: 'timeout' })).toEqual([0, 1, 3, 4])
  })
})
