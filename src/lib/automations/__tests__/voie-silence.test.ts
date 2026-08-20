/**
 * La séquence en service, et ses deux issues.
 *
 * CE QUE CE FICHIER GARDE
 * « WhatsApp seul — sans e-mail » est la SEULE séquence active du CRM (153
 * inscrits). Son attente `s2` était en `replyTimeoutDays: 0` : 59 inscriptions
 * y dormaient sans date de réveil, et le piège n'était pas le gel — c'était sa
 * réparation. Poser un délai rend atteignable l'étape suivante du tronc, et
 * cette étape-là commence par « Très bien, je me suis permis de faire une
 * version plus vendeuse de votre site » : un texte écrit pour quelqu'un qui
 * VIENT DE RÉPONDRE. Débloquer sans écrire d'abord, c'était envoyer « très
 * bien » à 59 silencieux.
 *
 * La définition ci-dessous est la copie de celle qui est en base depuis le
 * 20/08/2026. Les deux issues ont désormais chacune leur étape, et le tronc ne
 * reprend qu'après. Ce test tient la forme : il rougit si quelqu'un remet
 * l'étape « Très bien » sur le tronc, ou retire la voie silence.
 */
import { cheminSuppose } from '../branches'
import type { SequenceStep } from '@/components/automations/types'

/** L'étape écrite pour quelqu'un qui vient de parler. */
const MODELE_REPONSE = '0e7a1f10-0000-4000-8000-000000000002'
/** L'étape écrite pour un silence. */
const MODELE_SILENCE = '0e7a1f10-0000-4000-8000-000000000004'

const SEQUENCE: SequenceStep[] = [
  { id: 's1', day: 0, kind: 'whatsapp', mode: 'manual', branch: null, template: '0e7a1f10-0000-4000-8000-000000000001' },
  { id: 's2', day: 0, kind: 'wait', branch: null, waitMode: 'reply', replyTimeoutDays: 3 },
  { id: 's3', day: 0, kind: 'whatsapp', mode: 'manual', branch: { waitId: 's2', on: 'reply' }, template: MODELE_REPONSE },
  { id: 's2b', day: 0, kind: 'whatsapp', mode: 'manual', branch: { waitId: 's2', on: 'timeout' }, template: MODELE_SILENCE },
  { id: 's4', day: 0, kind: 'wait', branch: null, waitMode: 'reply', replyTimeoutDays: 3 },
  { id: 's5', day: 3, kind: 'call', mode: 'manual', branch: null, script: '0e7a1f11-0000-4000-8000-000000000002' },
] as SequenceStep[]

const chemin = (issue: 'reply' | 'timeout') =>
  cheminSuppose(SEQUENCE, { s2: issue, s4: issue }).map((i) => SEQUENCE[i].id)

describe('« WhatsApp seul — sans e-mail », les deux issues de s2', () => {
  // LE TEST QUI COMPTE. C'est exactement ce qui serait parti aux 59.
  it('un silencieux ne reçoit JAMAIS l’étape écrite pour une réponse', () => {
    const ids = chemin('timeout')
    expect(ids).not.toContain('s3')
    expect(ids).toContain('s2b')
  })

  it('et réciproquement : qui a répondu ne reçoit pas la relance de silence', () => {
    const ids = chemin('reply')
    expect(ids).toContain('s3')
    expect(ids).not.toContain('s2b')
  })

  it('les deux voies se rejoignent sur le tronc, et finissent sur l’appel', () => {
    expect(chemin('timeout')).toEqual(['s1', 's2', 's2b', 's4', 's5'])
    expect(chemin('reply')).toEqual(['s1', 's2', 's3', 's4', 's5'])
  })

  // Sans délai, l'issue « sans réponse » n'arrive jamais : l'inscription reste
  // garée pour toujours et `aUneBrancheSilence` refuse même de dessiner la
  // voie. C'est l'état d'avant, et il ne doit pas revenir.
  it('l’attente relance vraiment — un délai nul est ce qui a gelé les 59', () => {
    const attente = SEQUENCE.find((s) => s.id === 's2')
    expect(Number(attente?.replyTimeoutDays)).toBeGreaterThan(0)
  })

  /**
   * Une branche est atteignable par SON issue seulement. Une étape laissée sur
   * le tronc entre les deux branches serait envoyée aux DEUX populations —
   * c'est la faute d'origine, et elle ne se voit pas en lisant la liste.
   */
  it('aucune étape de message n’est restée sur le tronc entre l’attente et sa reprise', () => {
    const entre = SEQUENCE.slice(
      SEQUENCE.findIndex((s) => s.id === 's2') + 1,
      SEQUENCE.findIndex((s) => s.id === 's4'),
    )
    expect(entre.every((s) => s.branch != null)).toBe(true)
  })
})
