/**
 * Les issues d'une étape de démarchage.
 *
 * Ce que ces tests protègent, c'est la SÉPARATION des deux familles : une issue
 * qui « continue » ne doit jamais annuler les envois planifiés, et une issue qui
 * « arrête » doit toujours le faire. Se tromper de côté se paie soit par une
 * séquence qui insiste après un refus, soit par un prospect perdu pour un
 * simple « pas de réponse ».
 */
import { STEP_OUTCOMES, SALES_REACTIONS, stepOutcome } from '../stages'

describe('STEP_OUTCOMES — le vocabulaire', () => {
  it('couvre les deux familles', () => {
    expect(STEP_OUTCOMES.some((o) => o.flow === 'continue')).toBe(true)
    expect(STEP_OUTCOMES.some((o) => o.flow === 'stop')).toBe(true)
  })

  it('n’a que des identifiants uniques', () => {
    const ids = STEP_OUTCOMES.map((o) => o.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('dit son effet en clair pour chaque issue', () => {
    // L'opérateur clique dans une modale : s'il doit deviner ce que fait le
    // bouton, il choisira « pas intéressé » par prudence et perdra le prospect.
    for (const o of STEP_OUTCOMES) {
      expect(o.label.trim()).toBeTruthy()
      expect(o.note.trim()).toBeTruthy()
    }
  })

  it('ne fait pointer aucune issue vers une réaction inconnue', () => {
    const connues = new Set(SALES_REACTIONS.map((r) => r.id))
    for (const o of STEP_OUTCOMES) {
      if (o.reaction) expect(connues.has(o.reaction)).toBe(true)
    }
  })

  // C'EST LE TEST QUI COMPTE. `applyReaction` annule tout ce qui est encore
  // planifié dès qu'on lui passe une réaction : brancher une issue « continue »
  // sur `no` ou `bad` couperait la séquence d'un prospect toujours vivant.
  it('ne branche jamais une issue « continue » sur une réaction qui stoppe', () => {
    const stoppent = new Set(['no', 'bad'])
    for (const o of STEP_OUTCOMES.filter((x) => x.flow === 'continue')) {
      expect(stoppent.has(o.reaction ?? '')).toBe(false)
    }
  })

  it('donne une réaction à toutes les issues qui arrêtent', () => {
    // Sans réaction, « arrêter » n'annulerait rien : la note serait écrite et
    // l'e-mail partirait quand même le lendemain.
    for (const o of STEP_OUTCOMES.filter((x) => x.flow === 'stop')) {
      expect(o.reaction).toBeTruthy()
    }
  })

  it('n’exige une date que là où une relance est promise', () => {
    for (const o of STEP_OUTCOMES) {
      if (o.needsDate) expect(o.reaction).toBe('later')
    }
  })

  it('exige une description là où le libellé seul n’apprend rien', () => {
    // « Autre » et « Pas intéressé » sans motif ne se relisent pas : le premier
    // ne dit rien, le second ferme un prospect sans qu'on sache pourquoi.
    expect(stepOutcome('other')?.needsNote).toBe(true)
    expect(stepOutcome('not_interested')?.needsNote).toBe(true)
  })

  it('ne libère une attente que pour une issue où quelqu’un a parlé', () => {
    // Libérer l'attente sur « pas de réponse » enverrait le message suivant à
    // quelqu'un qui n'a jamais répondu — exactement ce que l'attente empêche.
    expect(stepOutcome('no_answer')?.releasesWait).toBeFalsy()
    expect(stepOutcome('answered')?.releasesWait).toBe(true)
    expect(stepOutcome('lukewarm')?.releasesWait).toBe(true)
  })
})

describe('stepOutcome', () => {
  it('rend l’issue demandée', () => {
    expect(stepOutcome('answered')?.flow).toBe('continue')
    expect(stepOutcome('blocked')?.flow).toBe('stop')
  })

  it('rend null sur une issue inconnue plutôt que de deviner', () => {
    // La route s'en sert pour refuser en 400 : deviner ferait enregistrer une
    // issue que personne n'a choisie.
    expect(stepOutcome('nawak')).toBeNull()
    expect(stepOutcome('')).toBeNull()
  })
})
