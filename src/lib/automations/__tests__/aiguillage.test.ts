/**
 * L'aiguillage, les renvois, et la clé sous laquelle on note.
 *
 * Ce que ce fichier protège, dans l'ordre de ce que ça coûte quand ça casse :
 *
 *   1. **La clé du sac.** Jusqu'au 20/08/2026, une réponse déclarée était notée
 *      sous le RANG de l'attente. Insérer une carte au milieu de « WhatsApp
 *      seul » a décalé 34 inscriptions garées vers une voie qu'elles n'avaient
 *      jamais prise et rendu muettes 9 réponses. La clé est l'identifiant.
 *   2. **La voie par défaut.** Une fourche pas encore tranchée envoie sur sa
 *      DERNIÈRE voie — « sans réponse », « non », « sinon ». Jamais sur la
 *      première : ce serait faire partir chez un inconnu le message réservé à
 *      ceux qui ont répondu.
 *   3. **Le renvoi cassé arrête.** Une cible supprimée termine la séquence au
 *      lieu de reprendre la descente : reprendre le fil ferait recevoir au
 *      prospect les messages d'un chemin que personne n'a choisi pour lui.
 */
import {
  arbreEditeur,
  casDeLaCondition,
  cheminSuppose,
  ciblesDeRedirection,
  cleDeFourche,
  estAiguillage,
  estSortie,
  etapeSuivante,
  incoherencesDeSuite,
  issueParDefaut,
  lecteurDIssue,
  libelleIssue,
  lireLeSac,
  MAX_TOURS,
  planEditeur,
  positionDInsertion,
  sortiesDeLaFourche,
  suiteDeLEtape,
} from '../branches'
import {
  evaluerAiguillage,
  raisonDeRefusAiguillage,
  SORTIE_SINON,
  type CasAiguillage,
} from '../conditions'
import { planCanvas, CARTE_L, COLONNE_L } from '../canvas'
import type { SequenceStep } from '@/components/automations/types'

const cas = (cle: string, champ: string, operateur = 'vrai', reste: Partial<CasAiguillage> = {}) =>
  ({ cle, champ, operateur, ...reste }) as CasAiguillage

/** L'aiguillage par canal : celui qui permet à UNE séquence de porter tout le fichier. */
const PAR_CANAL = [cas('c1', 'a_mobile'), cas('c2', 'a_email'), cas('c3', 'a_fixe')]

const fourche = (id: string, liste: CasAiguillage[]): SequenceStep => ({
  id,
  kind: 'condition',
  day: 0,
  condition: { champ: '', operateur: '', cas: liste },
})

const etape = (id: string, branch?: SequenceStep['branch'], suite?: SequenceStep['suite']): SequenceStep => ({
  id,
  kind: 'whatsapp',
  day: 0,
  ...(branch ? { branch } : {}),
  ...(suite ? { suite } : {}),
})

/* ── Évaluer ──────────────────────────────────────────────────────────────── */

describe('evaluerAiguillage', () => {
  it('rend le PREMIER cas vrai, pas le plus précis', () => {
    // Le prospect a un mobile ET une adresse : c'est l'ordre qui tranche, et
    // c'est pour ça que l'éditeur laisse le réordonner.
    expect(evaluerAiguillage(PAR_CANAL, { aMobile: true, aEmail: true }).sortie).toBe('c1')
    expect(evaluerAiguillage(PAR_CANAL, { aMobile: false, aEmail: true }).sortie).toBe('c2')
    expect(evaluerAiguillage(PAR_CANAL, { aMobile: false, aEmail: false, aFixe: true }).sortie).toBe('c3')
  })

  it('tombe dans « sinon » quand aucun cas ne décrit le prospect', () => {
    expect(evaluerAiguillage(PAR_CANAL, { aMobile: false, aEmail: false, aFixe: false }).sortie)
      .toBe(SORTIE_SINON)
  })

  /**
   * LA RÈGLE QUI CHANGE TOUT PAR RAPPORT À UNE FOURCHE À DEUX VOIES.
   *
   * Sur une question, `siInconnu` dit où envoyer celui dont la donnée manque.
   * Dans une cascade, un cas qu'on ne sait pas trancher NE PEUT PAS prétendre
   * attraper le prospect : il laisse passer. « Sinon » ramasse donc aussi ceux
   * dont on ne savait rien — d'où la trace, sans quoi on ne pourrait plus
   * jamais séparer les deux populations.
   */
  it('laisse passer un cas non mesuré, et le note', () => {
    const issue = evaluerAiguillage(PAR_CANAL, { aEmail: true })
    expect(issue.sortie).toBe('c2')
    expect(issue.nonMesures).toEqual(['c1'])

    const rien = evaluerAiguillage(PAR_CANAL, {})
    expect(rien.sortie).toBe(SORTIE_SINON)
    expect(rien.nonMesures).toEqual(['c1', 'c2', 'c3'])
  })

  it('traite un cas incohérent comme non mesuré, jamais comme faux', () => {
    // Seuil manquant : la condition ne peut pas trancher. La compter « fausse »
    // ferait passer au cas suivant SANS le dire — et un aiguillage dont un cas
    // n'attrape jamais personne est pire qu'un aiguillage absent.
    const bancal = [cas('c1', 'effectif', 'au_moins'), cas('c2', 'a_email')]
    const issue = evaluerAiguillage(bancal, { effectif: 40, aEmail: true })
    expect(issue.sortie).toBe('c2')
    expect(issue.nonMesures).toEqual(['c1'])
  })
})

describe('raisonDeRefusAiguillage', () => {
  it('refuse un aiguillage sans cas', () => {
    expect(raisonDeRefusAiguillage([])).toMatch(/au moins un cas/)
  })

  it('refuse deux cas qui portent la même clé', () => {
    expect(raisonDeRefusAiguillage([cas('c1', 'a_mobile'), cas('c1', 'a_email')]))
      .toMatch(/se confondraient/)
  })

  it('refuse un cas qui ne tranchera jamais', () => {
    expect(raisonDeRefusAiguillage([cas('c1', 'effectif', 'au_moins')])).toMatch(/seuil/i)
  })

  /** Le second est inatteignable, et rien à l'écran ne le dirait : la voie
   *  resterait dessinée, vide de tout prospect pour toujours. */
  it('refuse un cas que le précédent rend inatteignable', () => {
    expect(raisonDeRefusAiguillage([cas('c1', 'a_mobile'), cas('c2', 'a_mobile')]))
      .toMatch(/ne sera jamais atteint/)
  })

  it('accepte l’aiguillage par canal', () => {
    expect(raisonDeRefusAiguillage(PAR_CANAL)).toBeNull()
  })
})

/* ── Les sorties ──────────────────────────────────────────────────────────── */

describe('sortiesDeLaFourche', () => {
  it('donne deux sorties à une attente à délai, nommées par l’attente', () => {
    const attente: SequenceStep = { id: 'w', kind: 'wait', day: 0, waitMode: 'reply', replyTimeoutDays: 3 }
    expect(sortiesDeLaFourche(attente).map((s) => s.cle)).toEqual(['reply', 'timeout'])
    expect(sortiesDeLaFourche(attente)[0].titre).toBe('Il a répondu')
  })

  it('donne deux sorties à une question, nommées oui et non', () => {
    const question: SequenceStep = {
      id: 'q',
      kind: 'condition',
      day: 0,
      condition: { champ: 'a_mobile', operateur: 'vrai' },
    }
    expect(sortiesDeLaFourche(question).map((s) => s.titre)).toEqual(['Oui', 'Non'])
    expect(estAiguillage(question)).toBe(false)
  })

  it('donne une sortie par cas, plus « sinon », à un aiguillage', () => {
    const f = fourche('a', PAR_CANAL)
    expect(sortiesDeLaFourche(f).map((s) => s.cle)).toEqual(['c1', 'c2', 'c3', 'sinon'])
    expect(estAiguillage(f)).toBe(true)
    expect(casDeLaCondition(f)).toHaveLength(3)
  })

  it('nomme la voie d’après le libellé, ou d’après ce qu’elle teste', () => {
    const f = fourche('a', [cas('c1', 'a_mobile', 'vrai', { libelle: 'Joignable au mobile' })])
    expect(sortiesDeLaFourche(f)[0].titre).toBe('Joignable au mobile')
    expect(sortiesDeLaFourche(fourche('b', PAR_CANAL))[0].titre).toBe('A un mobile')
  })

  /** Une attente SANS délai n'a pas de voie « sans réponse » : l'issue n'arrive
   *  jamais, et proposer d'y écrire promettrait un envoi qui ne partira pas. */
  it('ne donne aucune sortie à une attente sans délai', () => {
    expect(sortiesDeLaFourche({ id: 'w', kind: 'wait', day: 0, waitMode: 'reply' })).toEqual([])
  })

  it('rend toujours la DERNIÈRE voie par défaut', () => {
    expect(issueParDefaut(fourche('a', PAR_CANAL))).toBe(SORTIE_SINON)
    expect(issueParDefaut({ id: 'w', kind: 'wait', day: 0, waitMode: 'reply', replyTimeoutDays: 2 }))
      .toBe('timeout')
  })

  it('dit qu’une voie orpheline ne partira jamais', () => {
    const f = fourche('a', PAR_CANAL)
    expect(libelleIssue(f, 'c9').titre).toBe('Voie orpheline')
    expect(libelleIssue(f, 'c9').aide).toMatch(/ne partira jamais/)
  })
})

/* ── Le sac, et sa clé ────────────────────────────────────────────────────── */

describe('cleDeFourche et lireLeSac', () => {
  const steps = [etape('s1'), fourche('s2', PAR_CANAL), etape('s3')]

  it('écrit sous l’identifiant', () => {
    expect(cleDeFourche(steps, 1)).toBe('s2')
  })

  /**
   * LA RÉGRESSION QU'ON NE VEUT PLUS. Un sac écrit avant le 20/08/2026 porte le
   * rang ; le jeter aurait effacé ce que 92 inscriptions savent d'elles-mêmes.
   */
  it('relit l’identifiant d’abord, le rang ensuite', () => {
    expect(lireLeSac({ s2: 'c1' }, steps, 1)).toBe('c1')
    expect(lireLeSac({ '1': 'c2' }, steps, 1)).toBe('c2')
    // L'identifiant gagne quand les deux sont là : c'est le plus récent.
    expect(lireLeSac({ s2: 'c1', '1': 'c2' }, steps, 1)).toBe('c1')
  })

  it('fait suivre la lecture quand une étape est insérée au-dessus', () => {
    const avant = [etape('s1'), fourche('s2', PAR_CANAL)]
    const apres = [etape('s1'), etape('s1b'), fourche('s2', PAR_CANAL)]
    const sac = { [cleDeFourche(avant, 1)]: 'c2' }
    // Le rang de la fourche a changé (1 → 2), sa clé non.
    expect(lecteurDIssue(apres, {}, sac)(2)).toBe('c2')
  })
})

/* ── Le chemin ────────────────────────────────────────────────────────────── */

describe('etapeSuivante avec une suite déclarée', () => {
  const lire = (steps: SequenceStep[]) => lecteurDIssue(steps, {}, {})

  it('s’arrête quand l’étape déclare une fin', () => {
    const steps = [etape('s1', undefined, { type: 'fin', motif: 'sans réponse' }), etape('s2')]
    expect(etapeSuivante(steps, 0, lire(steps))).toBe(steps.length)
    expect(suiteDeLEtape(steps[0])).toEqual({ type: 'fin', motif: 'sans réponse' })
  })

  it('saute à la cible d’un renvoi, en avant comme en arrière', () => {
    const enAvant = [etape('s1', undefined, { type: 'aller_a', cible: 's4' }), etape('s2'), etape('s3'), etape('s4')]
    expect(etapeSuivante(enAvant, 0, lire(enAvant))).toBe(3)

    const enArriere = [etape('s1'), etape('s2', undefined, { type: 'aller_a', cible: 's1' })]
    expect(etapeSuivante(enArriere, 1, lire(enArriere))).toBe(0)
  })

  /** Le bon côté de l'erreur : on arrête, on ne reprend pas la descente. */
  it('s’arrête quand la cible a été supprimée', () => {
    const steps = [etape('s1', undefined, { type: 'aller_a', cible: 'disparue' }), etape('s2')]
    expect(etapeSuivante(steps, 0, lire(steps))).toBe(steps.length)
  })

  /**
   * UN PASSAGE DE RELAIS EST UN CUL-DE-SAC, et l'aperçu doit le dire.
   *
   * `processTransitionStep` ferme l'inscription et en ouvre une ailleurs : rien
   * ne suit la carte. Le chemin l'ignorait et continuait tranquillement — sur
   * « S1 — Premier contact », il montrait à l'auteur l'appel de qualification
   * derrière une carte qui, en vrai, fait sortir de la séquence. Trouvé en
   * faisant tourner l'aperçu sur la vraie séquence, pas en relisant le code.
   */
  it('s’arrête sur un passage de relais — rien ne le suit', () => {
    const steps: SequenceStep[] = [
      etape('s1'),
      { id: 's2', kind: 'transition', day: 0, transition: { automationId: 'auto-2' } },
      etape('s3'),
    ]
    expect(estSortie(steps[1])).toBe(true)
    expect(etapeSuivante(steps, 1, lire(steps))).toBe(steps.length)
    expect(cheminSuppose(steps, {}).map((i) => steps[i].id)).toEqual(['s1', 's2'])
  })

  it('ignore une suite écrite par une version plus récente', () => {
    // Interrompre une séquence sur un mot qu'on ne comprend pas serait la pire
    // des lectures : on continue.
    const steps = [
      { ...etape('s1'), suite: { type: 'téléporter' } as unknown as SequenceStep['suite'] },
      etape('s2'),
    ]
    expect(etapeSuivante(steps, 0, lire(steps))).toBe(1)
  })
})

describe('ciblesDeRedirection', () => {
  //  s1 · fourche s2 · voie c1 (s3) · voie sinon (s4) · tronc s5
  const steps = [
    etape('s1'),
    fourche('s2', [cas('c1', 'a_mobile')]),
    etape('s3', { waitId: 's2', on: 'c1' }),
    etape('s4', { waitId: 's2', on: 'sinon' }),
    etape('s5'),
  ]

  it('offre le tronc commun et sa propre voie', () => {
    expect(ciblesDeRedirection(steps, 2).map((i) => steps[i].id)).toEqual(['s1', 's2', 's5'])
    expect(ciblesDeRedirection(steps, 0).map((i) => steps[i].id)).toEqual(['s2', 's5'])
  })

  /**
   * POURQUOI PAS UNE VOIE SŒUR. Le renvoi ferait exécuter la carte, puis la
   * descente sauterait tout le reste de cette voie : l'atteignabilité dit
   * toujours que la fourche a rendu l'AUTRE sortie. Le prospect recevrait la
   * première carte d'un chemin et rien de la suite, sans que rien ne le dise.
   */
  it('refuse une voie sœur', () => {
    expect(ciblesDeRedirection(steps, 3).map((i) => steps[i].id)).not.toContain('s3')
  })

  it('garde les deux étapes d’une même voie', () => {
    const longue = [...steps, etape('s6', { waitId: 's2', on: 'c1' })]
    expect(ciblesDeRedirection(longue, 2).map((i) => longue[i].id)).toContain('s6')
  })
})

describe('incoherencesDeSuite', () => {
  it('signale une cible supprimée', () => {
    const steps = [etape('s1', undefined, { type: 'aller_a', cible: 'nulle-part' })]
    expect(incoherencesDeSuite(steps)[0].phrase).toMatch(/n’existe plus/)
  })

  it('signale un renvoi vers une voie sœur', () => {
    const steps = [
      fourche('s1', [cas('c1', 'a_mobile')]),
      etape('s2', { waitId: 's1', on: 'c1' }),
      etape('s3', { waitId: 's1', on: 'sinon' }, { type: 'aller_a', cible: 's2' }),
    ]
    expect(incoherencesDeSuite(steps)[0].phrase).toMatch(/une autre voie/)
  })

  it('signale une boucle dont on ne peut pas sortir', () => {
    const steps = [etape('s1'), etape('s2', undefined, { type: 'aller_a', cible: 's1' })]
    expect(incoherencesDeSuite(steps)[0].phrase).toMatch(/reboucle/)
  })

  it('se tait quand la boucle a une fourche pour en sortir', () => {
    const steps = [
      etape('s1'),
      fourche('s2', [cas('c1', 'rdv_pris')]),
      etape('s3', { waitId: 's2', on: 'sinon' }, { type: 'aller_a', cible: 's1' }),
    ]
    expect(incoherencesDeSuite(steps)).toEqual([])
  })
})

describe('cheminSuppose', () => {
  it('rend chaque voie d’un aiguillage', () => {
    const steps = [
      fourche('s1', PAR_CANAL),
      etape('s2', { waitId: 's1', on: 'c1' }),
      etape('s3', { waitId: 's1', on: 'c2' }),
      etape('s4', { waitId: 's1', on: 'c3' }),
      etape('s5', { waitId: 's1', on: 'sinon' }),
      etape('s6'),
    ]
    expect(cheminSuppose(steps, { s1: 'c2' }).map((i) => steps[i].id)).toEqual(['s1', 's3', 's6'])
    // Rien de supposé : la dernière voie, celle qu'on écrit pour un inconnu.
    expect(cheminSuppose(steps, {}).map((i) => steps[i].id)).toEqual(['s1', 's5', 's6'])
  })

  /** Un rebouclage se traverse plusieurs fois, et le prospect reçoit plusieurs
   *  fois : l'aperçu doit le montrer, pas le lisser. Mais il s'arrête au même
   *  plafond que le moteur, sinon il promettrait plus de tours qu'il n'en part. */
  it('rend les tours d’une boucle, et s’arrête au plafond du moteur', () => {
    const steps = [etape('s1'), etape('s2', undefined, { type: 'aller_a', cible: 's1' })]
    const chemin = cheminSuppose(steps, {})
    expect(chemin.filter((i) => i === 0)).toHaveLength(MAX_TOURS)
    expect(chemin.length).toBeLessThanOrEqual(2 * MAX_TOURS)
  })
})

/* ── Ce que l'éditeur dessine ─────────────────────────────────────────────── */

describe('planEditeur et planCanvas', () => {
  const steps = [
    fourche('s1', PAR_CANAL),
    etape('s2', { waitId: 's1', on: 'c1' }),
    etape('s3', { waitId: 's1', on: 'c2' }),
    etape('s4', { waitId: 's1', on: 'c3' }),
    etape('s5', { waitId: 's1', on: 'sinon' }),
  ]

  it('dessine une voie par sortie, même vide', () => {
    const voies = planEditeur(steps).filter((l) => l.type === 'branche')
    expect(voies.map((v) => (v as { on: string }).on)).toEqual(['c1', 'c2', 'c3', 'sinon'])
  })

  /** Supprimer un cas laisse des étapes qui pointent dans le vide. Les taire les
   *  rendrait invisibles tout en les gardant en base. */
  it('dessine aussi les voies dont la sortie n’existe plus', () => {
    const ampute = [fourche('s1', [PAR_CANAL[0]]), ...steps.slice(1)]
    const voies = planEditeur(ampute).filter((l) => l.type === 'branche') as {
      on: string
      orpheline?: boolean
    }[]
    expect(voies.map((v) => v.on)).toEqual(['c1', 'sinon', 'c2', 'c3'])
    expect(voies.filter((v) => v.orpheline).map((v) => v.on)).toEqual(['c2', 'c3'])
  })

  it('écarte les quatre voies symétriquement, à un pas constant', () => {
    const plan = planCanvas(steps)
    const x = (id: string) => plan.noeuds.find((n) => n.key === `v:s1:${id}`)?.x ?? NaN
    expect(x('c2') - x('c1')).toBe(COLONNE_L)
    expect(x('c3') - x('c2')).toBe(COLONNE_L)
    expect(x('sinon') - x('c3')).toBe(COLONNE_L)
    // Le tronc reste au milieu : la fourche et la reprise sont à mi-chemin.
    const tronc = plan.noeuds.find((n) => n.key === 's:s1')?.x ?? NaN
    expect(tronc).toBeCloseTo((x('c1') + x('sinon')) / 2, 5)
  })

  it('trace un trait de redirection, et coupe la reprise quand la voie ne revient pas', () => {
    const avecRenvoi = [
      ...steps.slice(0, 5).map((s) => (s.id === 's5' ? etape('s5', s.branch, { type: 'fin' }) : s)),
      etape('s6'),
      etape('s7', undefined, { type: 'aller_a', cible: 's6' }),
    ]
    const plan = planCanvas(avecRenvoi)
    expect(plan.liens.some((l) => l.de === 'v:s1:sinon' && l.vers === 'r:s1')).toBe(false)
    expect(plan.liens.some((l) => l.de === 'v:s1:c1' && l.vers === 'r:s1')).toBe(true)
    const renvoi = plan.liens.find((l) => l.redirection)
    expect(renvoi).toMatchObject({ de: 's:s7', vers: 's:s6' })
  })

  it('insère dans la bonne voie, après les précédentes', () => {
    // « sinon » est la dernière : une étape qui y entre se range après celles
    // de c1, c2 et c3, sinon la fourche se dessine à l'envers.
    expect(positionDInsertion(steps, 's1', SORTIE_SINON)).toBe(5)
    expect(positionDInsertion(steps.slice(0, 3), 's1', 'c3')).toBe(3)
  })
})

/* ── La fourche dans la fourche ───────────────────────────────────────────── */

/**
 * CE QUE L'ÉDITEUR NE SAVAIT PAS MONTRER.
 *
 * « WhatsApp, attends ; s'il répond on qualifie, sinon on écrit, on attend
 * encore, et s'il ne répond toujours pas on appelle » — c'est une attente dans
 * la voie d'une attente. Le moteur l'exécutait très bien (la règle
 * d'atteignabilité est récursive depuis le premier jour), mais le plan ne
 * dessinait qu'un niveau : les étapes du second niveau ressortaient sur le
 * tronc, marquées orphelines. On croyait à une erreur, et on n'écrivait pas la
 * séquence dont on avait besoin.
 */
describe('une fourche dans une voie', () => {
  const attente = (id: string): SequenceStep => ({
    id,
    kind: 'wait',
    day: 0,
    waitMode: 'reply',
    replyTimeoutDays: 3,
  })

  //  w1 · voie réponse : a1 · voie silence : e1, w2 (imbriquée) → r1 / t1
  const IMBRIQUE: SequenceStep[] = [
    attente('w1'),
    etape('a1', { waitId: 'w1', on: 'reply' }),
    etape('e1', { waitId: 'w1', on: 'timeout' }),
    { ...attente('w2'), branch: { waitId: 'w1', on: 'timeout' } },
    etape('r1', { waitId: 'w2', on: 'reply' }),
    etape('t1', { waitId: 'w2', on: 'timeout' }),
    etape('fin'),
  ]

  it('déplie le second niveau au lieu de le renvoyer sur le tronc', () => {
    const arbre = arbreEditeur(IMBRIQUE)
    // Le tronc : la première attente, puis la clôture. Rien d'autre.
    expect(arbre.map((n) => IMBRIQUE[n.index].id)).toEqual(['w1', 'fin'])
    expect(arbre.every((n) => !n.perdue)).toBe(true)

    const silence = arbre[0].type === 'fourche' ? arbre[0].voies.find((v) => v.on === 'timeout') : undefined
    expect(silence?.contenu.map((n) => IMBRIQUE[n.index].id)).toEqual(['e1', 'w2'])
    const sousFourche = silence?.contenu[1]
    expect(sousFourche?.type).toBe('fourche')
  })

  it('élargit la voie qui porte une sous-fourche, et garde le tronc au centre', () => {
    const plan = planCanvas(IMBRIQUE)
    const n = (k: string) => plan.noeuds.find((x) => x.key === k)

    // Le cadre de la voie silence contient deux colonnes de cartes : il est
    // plus large qu'une carte, sinon la sous-fourche déborderait dessus.
    const cadre = n('v:w1:timeout')
    expect(cadre?.l).toBe(COLONNE_L + CARTE_L)

    // Les deux voies de la sous-fourche sont bien DANS ce cadre.
    for (const cle of ['v:w2:reply', 'v:w2:timeout']) {
      const voie = n(cle)!
      expect(voie.x).toBeGreaterThanOrEqual(cadre!.x)
      expect(voie.x + voie.l).toBeLessThanOrEqual(cadre!.x + cadre!.l)
      expect(voie.y).toBeGreaterThan(cadre!.y)
    }

    // Et le tronc reste au milieu de ce qu'il porte.
    expect(n('s:w1')?.x).toBe(n('s:fin')?.x)
    expect(n('r:w1')?.x).toBe(n('s:w1')?.x)
  })

  it('fait descendre la clôture SOUS la reprise, pas à côté', () => {
    const plan = planCanvas(IMBRIQUE)
    const reprise = plan.noeuds.find((x) => x.key === 'r:w1')!
    const cloture = plan.noeuds.find((x) => x.key === 's:fin')!
    expect(cloture.y).toBeGreaterThan(reprise.y)
    // Le plan contient tout ce qu'il dessine — largeur comme hauteur.
    for (const x of plan.noeuds) {
      expect(x.x + x.l).toBeLessThanOrEqual(plan.largeur)
      expect(x.y + x.h).toBeLessThanOrEqual(plan.hauteur)
    }
  })
})
