import {
  blocDeplace,
  CARTE_H,
  ciblesDeDepot,
  deplacerVers,
  depotValide,
  EN_TETE_VOIE,
  GOUTTIERE,
  hauteurDeVoie,
  LIGNE_H,
  MARGE,
  PASTILLE_H,
  planCanvas,
  type CibleDepot,
} from '../canvas'
import type { SequenceStep } from '@/components/automations/types'

/** Une attente à délai : celle qui ouvre deux voies. */
const attente = (id: string): SequenceStep => ({
  id,
  kind: 'wait',
  day: 0,
  waitMode: 'reply',
  replyTimeoutDays: 3,
})

const etape = (id: string, branch?: SequenceStep['branch']): SequenceStep => ({
  id,
  kind: 'whatsapp',
  day: 0,
  ...(branch ? { branch } : {}),
})

/** s1 · attente s2 · voie réponse (s3, s4) · voie silence (s5) · tronc s6 */
const FOURCHE: SequenceStep[] = [
  etape('s1'),
  attente('s2'),
  etape('s3', { waitId: 's2', on: 'reply' }),
  etape('s4', { waitId: 's2', on: 'reply' }),
  etape('s5', { waitId: 's2', on: 'timeout' }),
  etape('s6'),
]

const noeud = (plan: ReturnType<typeof planCanvas>, key: string) =>
  plan.noeuds.find((n) => n.key === key)

describe('planCanvas — la forme', () => {
  it('descend en colonne 0 quand il n’y a pas de fourche', () => {
    const plan = planCanvas([etape('s1'), etape('s2')])

    expect(plan.noeuds.map((n) => n.key)).toEqual(['entree', 's:s1', 's:s2', 'fin'])
    expect(plan.noeuds.every((n) => n.col === 0)).toBe(true)
    // Une carte par interligne, la première sous la marge.
    expect(plan.noeuds.map((n) => n.y)).toEqual([
      MARGE,
      MARGE + LIGNE_H,
      MARGE + 2 * LIGNE_H,
      MARGE + 3 * LIGNE_H,
    ])
    expect(plan.colMin).toBe(0)
    expect(plan.colMax).toBe(0)
  })

  it('écarte les deux voies de part et d’autre du tronc', () => {
    const plan = planCanvas(FOURCHE)

    expect(noeud(plan, 'v:s2:reply')?.col).toBe(-1)
    expect(noeud(plan, 'v:s2:timeout')?.col).toBe(1)
    expect(plan.colMin).toBe(-1)
    expect(plan.colMax).toBe(1)
  })

  it('fait partir les deux voies de la MÊME hauteur — ce sont des alternatives', () => {
    const plan = planCanvas(FOURCHE)

    expect(noeud(plan, 'v:s2:reply')?.y).toBe(noeud(plan, 'v:s2:timeout')?.y)
    // Juste sous l'attente, qui est elle-même sous l'entrée et s1.
    expect(noeud(plan, 'v:s2:reply')?.y).toBe(MARGE + 3 * LIGNE_H)
  })

  it('place les étapes d’une voie dans sa colonne, sous la bande de titre', () => {
    const plan = planCanvas(FOURCHE)
    const hautDeVoie = MARGE + 3 * LIGNE_H

    expect(noeud(plan, 's:s3')).toMatchObject({ col: -1, y: hautDeVoie + EN_TETE_VOIE })
    expect(noeud(plan, 's:s4')).toMatchObject({ col: -1, y: hautDeVoie + EN_TETE_VOIE + LIGNE_H })
    expect(noeud(plan, 's:s5')).toMatchObject({ col: 1, y: hautDeVoie + EN_TETE_VOIE })
  })

  it('réserve dans chaque voie une bande pour son bouton, sous la dernière carte', () => {
    const plan = planCanvas(FOURCHE)
    const voie = noeud(plan, 'v:s2:reply')
    const derniere = noeud(plan, 's:s4')

    expect(voie?.h).toBe(hauteurDeVoie(2))
    // Le cadre descend PLUS BAS que sa dernière carte : sans cette bande, le
    // bouton « Ajouter ici » se retrouvait caché sous elle.
    expect((voie?.y ?? 0) + (voie?.h ?? 0)).toBeGreaterThan((derniere?.y ?? 0) + CARTE_H)
  })

  it('fait attendre la reprise la plus longue des deux voies', () => {
    const plan = planCanvas(FOURCHE)
    const reply = noeud(plan, 'v:s2:reply')
    const timeout = noeud(plan, 'v:s2:timeout')

    expect(reply?.h).toBe(hauteurDeVoie(2))
    expect(timeout?.h).toBe(hauteurDeVoie(1))
    expect(noeud(plan, 'r:s2')?.y).toBe((reply?.y ?? 0) + (reply?.h ?? 0) + GOUTTIERE)
    // Puis le tronc reprend sous la pastille de reprise.
    expect(noeud(plan, 's:s6')?.y).toBe(
      (noeud(plan, 'r:s2')?.y ?? 0) + PASTILLE_H + GOUTTIERE,
    )
  })

  it('garde de la place sous une voie vide — c’est là que va son bouton', () => {
    const plan = planCanvas([attente('s1')])

    expect(noeud(plan, 'v:s1:reply')?.h).toBe(hauteurDeVoie(0))
    expect(noeud(plan, 'v:s1:timeout')?.h).toBe(hauteurDeVoie(0))
  })

  it('relie l’attente à ses deux voies, et les deux voies à la reprise', () => {
    const { liens } = planCanvas(FOURCHE)

    expect(liens).toContainEqual(expect.objectContaining({ de: 's:s2', vers: 'v:s2:reply', on: 'reply' }))
    expect(liens).toContainEqual(
      expect.objectContaining({ de: 's:s2', vers: 'v:s2:timeout', on: 'timeout' }),
    )
    // C'est le CADRE de la voie qui rejoint la reprise, pas sa dernière carte.
    expect(liens).toContainEqual(expect.objectContaining({ de: 'v:s2:reply', vers: 'r:s2' }))
    expect(liens).toContainEqual(expect.objectContaining({ de: 'v:s2:timeout', vers: 'r:s2' }))
    expect(liens).toContainEqual(expect.objectContaining({ de: 'r:s2', vers: 's:s6' }))
  })

  it('ne chaîne les cartes d’une voie qu’entre elles', () => {
    const { liens } = planCanvas(FOURCHE)

    expect(liens).toContainEqual(expect.objectContaining({ de: 's:s3', vers: 's:s4' }))
    // Aucun trait du cadre vers sa première carte : il partirait du bas du
    // cadre pour REMONTER vers elle, invisible sauf entre deux cartes.
    expect(liens.some((l) => l.de === 'v:s2:reply' && l.vers === 's:s3')).toBe(false)
  })

  it('relie une voie VIDE directement à la reprise, sans carte intermédiaire', () => {
    const { liens } = planCanvas([attente('s1')])

    expect(liens).toContainEqual(expect.objectContaining({ de: 'v:s1:reply', vers: 'r:s1' }))
  })

  it('signale une étape qui déclare une voie dont la fourche a disparu', () => {
    const plan = planCanvas([etape('s1', { waitId: 'parti', on: 'reply' })])

    expect(noeud(plan, 's:s1')?.orpheline).toBe(true)
    expect(noeud(plan, 's:s1')?.col).toBe(0)
  })

  it('donne une taille de plan qui contient tout', () => {
    const plan = planCanvas(FOURCHE)

    for (const n of plan.noeuds) {
      expect(n.x + n.l).toBeLessThanOrEqual(plan.largeur)
      expect(n.y + n.h).toBeLessThanOrEqual(plan.hauteur)
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.y).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('ciblesDeDepot', () => {
  const plan = planCanvas(FOURCHE)
  const cibles = ciblesDeDepot(FOURCHE, plan)
  const par = (key: string) => cibles.find((c) => c.key === key)

  // UNE PLACE PAR CARTE, désignée par l'identifiant de la carte et non par son
  // rang : depuis que les fourches s'imbriquent, le rang d'une carte ne dit plus
  // à quel niveau elle vit, et deux niveaux différents portaient la même clé.
  it('ouvre une place au-dessus de chaque étape de tronc, et une à la fin', () => {
    expect(par('a:s1')).toMatchObject({ index: 0, branch: null, col: 0 })
    expect(par('a:s6')).toMatchObject({ index: 5, branch: null, col: 0 })
    expect(par('t:fin')).toMatchObject({ index: FOURCHE.length, branch: null })
  })

  it('ouvre une place dans chaque voie, marquée de la bonne branche', () => {
    expect(par('a:s3')).toMatchObject({ index: 2, branch: { waitId: 's2', on: 'reply' } })
    expect(par('a:s5')).toMatchObject({ index: 4, branch: { waitId: 's2', on: 'timeout' } })
  })

  it('ouvre une place en fin de voie, y compris quand la voie est vide', () => {
    expect(par('v:s2:reply:fin')?.index).toBe(4)
    const vide = planCanvas([attente('s1')])
    expect(ciblesDeDepot([attente('s1')], vide).find((c) => c.key === 'v:s1:reply:fin')?.index).toBe(1)
  })
})

describe('blocDeplace', () => {
  it('n’emmène qu’elle-même pour une étape ordinaire', () => {
    expect(blocDeplace(FOURCHE, 0)).toEqual([0])
    expect(blocDeplace(FOURCHE, 3)).toEqual([3])
  })

  it('emmène ses deux voies quand on tire une attente à fourche', () => {
    expect(blocDeplace(FOURCHE, 1)).toEqual([1, 2, 3, 4])
  })
})

describe('depotValide', () => {
  const cible = (over: Partial<CibleDepot>): CibleDepot => ({
    key: 'x',
    index: 0,
    branch: null,
    col: 0,
    x: 0,
    y: 0,
    ...over,
  })

  it('refuse de poser une attente dans sa propre voie', () => {
    expect(depotValide(FOURCHE, 's2', cible({ index: 3, branch: { waitId: 's2', on: 'reply' } }))).toBe(
      false,
    )
  })

  it('refuse de poser une attente au milieu du bloc qu’elle emmène', () => {
    expect(depotValide(FOURCHE, 's2', cible({ index: 3 }))).toBe(false)
  })

  it('refuse un dépôt qui ne change rien', () => {
    // s1 est en tête du tronc : l'y remettre, au-dessus comme en-dessous, est un
    // geste sans effet — le marqueur ne doit pas s'y afficher.
    expect(depotValide(FOURCHE, 's1', cible({ index: 0 }))).toBe(false)
    expect(depotValide(FOURCHE, 's1', cible({ index: 1 }))).toBe(false)
  })

  it('accepte de sortir une étape de sa voie vers le tronc', () => {
    expect(depotValide(FOURCHE, 's3', cible({ index: 5 }))).toBe(true)
  })

  it('accepte de faire passer une étape d’une voie à l’autre', () => {
    expect(
      depotValide(FOURCHE, 's3', cible({ index: 4, branch: { waitId: 's2', on: 'timeout' } })),
    ).toBe(true)
  })
})

describe('deplacerVers', () => {
  const cible = (over: Partial<CibleDepot>): CibleDepot => ({
    key: 'x',
    index: 0,
    branch: null,
    col: 0,
    x: 0,
    y: 0,
    ...over,
  })

  it('fait passer une étape d’une voie à l’autre, tag compris', () => {
    const apres = deplacerVers(FOURCHE, 's3', cible({ index: 5, branch: { waitId: 's2', on: 'timeout' } }))

    expect(apres.find((s) => s.id === 's3')?.branch).toEqual({ waitId: 's2', on: 'timeout' })
    // Elle est passée derrière s5, la seule étape de la voie silence.
    expect(apres.map((s) => s.id)).toEqual(['s1', 's2', 's4', 's5', 's3', 's6'])
  })

  it('détache une étape vers le tronc en effaçant sa voie', () => {
    const apres = deplacerVers(FOURCHE, 's3', cible({ index: 6 }))

    expect(apres.find((s) => s.id === 's3')?.branch).toBeNull()
    expect(apres.map((s) => s.id)).toEqual(['s1', 's2', 's4', 's5', 's6', 's3'])
  })

  it('compte les cartes retirées : une carte tirée vers le bas ne dépasse pas sa place', () => {
    // s1 (rang 0) posée juste avant s6 (rang 5) doit finir juste avant s6.
    const apres = deplacerVers(FOURCHE, 's1', cible({ index: 5 }))

    expect(apres.map((s) => s.id)).toEqual(['s2', 's3', 's4', 's5', 's1', 's6'])
  })

  it('emmène la fourche entière quand on déplace l’attente', () => {
    const apres = deplacerVers(FOURCHE, 's2', cible({ index: 0 }))

    expect(apres.map((s) => s.id)).toEqual(['s2', 's3', 's4', 's5', 's1', 's6'])
    // Les voies pointent toujours vers leur attente, et la retrouvent au-dessus.
    expect(planCanvas(apres).noeuds.find((n) => n.key === 's:s3')?.col).toBe(-1)
  })

  it('rend le tableau intact sur un dépôt refusé', () => {
    expect(deplacerVers(FOURCHE, 's2', cible({ index: 3 }))).toBe(FOURCHE)
  })
})
