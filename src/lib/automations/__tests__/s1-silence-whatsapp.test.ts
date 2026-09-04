/**
 * S1 — où va un prospect qui ne répond jamais au WhatsApp.
 *
 * CE QUE CE FICHIER GARDE
 * `mlQ`, la condition qui ouvre le bras e-mail de S1, était sur le TRONC. Un
 * silencieux WhatsApp — deux messages, quatre jours — le rencontrait donc comme
 * n'importe qui, et s'il avait une adresse il partait dans un bras qui ne mène
 * nulle part : `ml1` et `ml2` portent `transport: smtp`, que la flotte de
 * boîtes froides ne sert pas encore, et le régulateur est en pause. Le
 * téléphone l'attendait quinze étapes plus bas, et il ne l'atteignait jamais.
 *
 * `sql/20260904_s1_le_silence_whatsapp_va_a_lappel.sql` a posé sur `mlQ` la
 * branche `{waitId: 'waQ', on: 'timeout'}` : le bras e-mail est devenu la voie
 * « pas de mobile », c'est-à-dire l'entrée de ceux qu'on ne peut PAS joindre
 * sur WhatsApp. Une ligne, et la récursion d'`etapeAtteignable` fait le reste.
 *
 * LES DEUX SENS COMPTENT, ET C'EST TOUT L'OBJET DU FICHIER
 * Retirer la branche renvoie les silencieux dans l'impasse ; la poser sur la
 * mauvaise sortie (`reply`) coupe l'e-mail à ceux qui n'ont que ça. Les deux se
 * font d'un clic dans l'éditeur de séquence et ne cassent aucun rendu.
 *
 * La définition ci-dessous est la copie de celle qui est en base au 04/09/2026.
 */
import { cheminSuppose } from '../branches'
import type { SequenceStep } from '@/components/automations/types'

const S2 = '0e7a1f30-0000-4000-8000-000000000002'
const S3 = '0e7a1f30-0000-4000-8000-000000000003'

const S1: SequenceStep[] = [
  { id: 'waQ', day: 0, kind: 'condition', branch: null, condition: { champ: 'a_mobile', operateur: 'vrai' } },
  { id: 'wa1', day: 0, kind: 'whatsapp', mode: 'manual', branch: { waitId: 'waQ', on: 'reply' } },
  { id: 'waW', day: 0, kind: 'wait', waitMode: 'reply', replyTimeoutDays: 3, branch: { waitId: 'waQ', on: 'reply' } },
  { id: 'waDemo', day: 0, kind: 'whatsapp', mode: 'manual', branch: { waitId: 'waW', on: 'reply' } },
  { id: 'waGo', day: 0, kind: 'transition', branch: { waitId: 'waW', on: 'reply' }, transition: { automationId: S2 } },
  { id: 'wa2', day: 0, kind: 'whatsapp', mode: 'manual', branch: { waitId: 'waW', on: 'timeout' } },
  { id: 'waW2', day: 0, kind: 'wait', waitMode: 'reply', replyTimeoutDays: 4, branch: { waitId: 'waW', on: 'timeout' } },
  { id: 'waGo2', day: 0, kind: 'transition', branch: { waitId: 'waW2', on: 'reply' }, transition: { automationId: S2 } },
  // ⚠️ LA LIGNE DU FICHIER. Sans cette branche, `mlQ` est du tronc.
  { id: 'mlQ', day: 0, kind: 'condition', branch: { waitId: 'waQ', on: 'timeout' }, condition: { champ: 'a_email', operateur: 'vrai' } },
  { id: 'ml1', day: 0, kind: 'email', mode: 'auto', transport: 'smtp', branch: { waitId: 'mlQ', on: 'reply' } },
  { id: 'mlW', day: 0, kind: 'wait', waitMode: 'reply', replyTimeoutDays: 4, branch: { waitId: 'mlQ', on: 'reply' } },
  { id: 'mlGo', day: 0, kind: 'transition', branch: { waitId: 'mlW', on: 'reply' }, transition: { automationId: S2 } },
  { id: 'ml2', day: 0, kind: 'email', mode: 'auto', transport: 'smtp', branch: { waitId: 'mlW', on: 'timeout' } },
  { id: 'mlW2', day: 0, kind: 'wait', waitMode: 'reply', replyTimeoutDays: 3, branch: { waitId: 'mlW', on: 'timeout' } },
  { id: 'mlGo2', day: 0, kind: 'transition', branch: { waitId: 'mlW2', on: 'reply' }, transition: { automationId: S2 } },
  { id: 'ap1', day: 0, kind: 'call', mode: 'manual', branch: null },
  { id: 'issQ', day: 0, kind: 'condition', branch: null, condition: { champ: 'issue_dernier_appel', operateur: 'est', valeurs: ['answered', 'lukewarm'] } },
  { id: 'issGo', day: 0, kind: 'transition', branch: { waitId: 'issQ', on: 'reply' }, transition: { automationId: S2 } },
  { id: 'ap2', day: 7, kind: 'call', mode: 'manual', branch: { waitId: 'issQ', on: 'timeout' } },
  { id: 'issQ2', day: 7, kind: 'condition', branch: { waitId: 'issQ', on: 'timeout' }, condition: { champ: 'issue_dernier_appel', operateur: 'est', valeurs: ['answered', 'lukewarm'] } },
  { id: 'issGo2', day: 7, kind: 'transition', branch: { waitId: 'issQ2', on: 'reply' }, transition: { automationId: S2 } },
  { id: 'issS3', day: 7, kind: 'transition', branch: { waitId: 'issQ2', on: 'timeout' }, transition: { automationId: S3 } },
] as SequenceStep[]

/** Les étapes du bras e-mail — celles qu'un silencieux WhatsApp ne doit jamais voir. */
const BRAS_EMAIL = ['mlQ', 'ml1', 'mlW', 'mlGo', 'ml2', 'mlW2', 'mlGo2']

const chemin = (issues: Record<string, 'reply' | 'timeout'>) =>
  cheminSuppose(S1, issues).map((i) => S1[i].id)

describe('S1 — le silence WhatsApp mène au téléphone', () => {
  // LE CAS QUI A MOTIVÉ LE CHANGEMENT. 71 des 89 attentes en cours au
  // 04/09/2026 portent une adresse : sans cette règle, elles tombaient là.
  it('un silencieux qui a une adresse ne passe PAS par l’e-mail — il va à l’appel', () => {
    const ids = chemin({ waQ: 'reply', waW: 'timeout', waW2: 'timeout', mlQ: 'reply' })
    BRAS_EMAIL.forEach((id) => expect(ids).not.toContain(id))
    expect(ids).toContain('ap1')
    // Et il y arrive après avoir reçu les DEUX WhatsApp, pas avant.
    expect(ids.indexOf('wa2')).toBeGreaterThan(-1)
    expect(ids.indexOf('ap1')).toBeGreaterThan(ids.indexOf('wa2'))
  })

  it('l’appel est bien la PREMIÈRE étape qui suit le second silence', () => {
    const ids = chemin({ waQ: 'reply', waW: 'timeout', waW2: 'timeout' })
    expect(ids[ids.indexOf('waW2') + 1]).toBe('ap1')
  })

  // L'AUTRE SENS, tout aussi facile à casser : le bras e-mail reste l'entrée de
  // ceux qui n'ont pas de mobile. 220 inscriptions y vivaient au 04/09/2026.
  it('celui qui n’a pas de mobile entre toujours directement par l’e-mail', () => {
    const ids = chemin({ waQ: 'timeout', mlQ: 'reply' })
    expect(ids).toContain('mlQ')
    expect(ids).toContain('ml1')
    // Il n'a évidemment reçu aucun WhatsApp.
    expect(ids).not.toContain('wa1')
    expect(ids).not.toContain('wa2')
  })

  it('sans mobile ET sans adresse, on décroche tout de suite', () => {
    const ids = chemin({ waQ: 'timeout', mlQ: 'timeout' })
    expect(ids).toEqual(['waQ', 'mlQ', 'ap1', 'issQ', 'ap2', 'issQ2', 'issS3'])
  })

  it('un silencieux e-mail finit lui aussi à l’appel — ce chemin-là n’a pas bougé', () => {
    const ids = chemin({ waQ: 'timeout', mlQ: 'reply', mlW: 'timeout', mlW2: 'timeout' })
    expect(ids).toContain('ml2')
    expect(ids).toContain('ap1')
  })

  // LA NON-RÉGRESSION DE LA VOIE QUI MARCHE : celui qui répond part en S2 sans
  // voir ni l'e-mail ni l'appel.
  it('celui qui répond au premier WhatsApp reçoit sa démo et bascule en S2', () => {
    const ids = chemin({ waQ: 'reply', waW: 'reply' })
    expect(ids).toEqual(['waQ', 'wa1', 'waW', 'waDemo', 'waGo'])
  })

  it('celui qui répond au SECOND WhatsApp bascule en S2 sans passer par l’e-mail', () => {
    const ids = chemin({ waQ: 'reply', waW: 'timeout', waW2: 'reply' })
    expect(ids[ids.length - 1]).toBe('waGo2')
    BRAS_EMAIL.forEach((id) => expect(ids).not.toContain(id))
    expect(ids).not.toContain('ap1')
  })

  // Ce que le changement NE fait pas : toucher à ce qui suit l'appel.
  it('après l’appel, l’issue décide toujours — S2 si ça a parlé, sinon un second appel', () => {
    expect(chemin({ waQ: 'timeout', mlQ: 'timeout', issQ: 'reply' })).toContain('issGo')
    expect(chemin({ waQ: 'timeout', mlQ: 'timeout', issQ: 'timeout', issQ2: 'timeout' })).toContain('issS3')
  })
})
