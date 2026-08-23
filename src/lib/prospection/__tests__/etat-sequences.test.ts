import { etatDesSequences, libelleBloc } from '../etat-sequences'

/**
 * Le compte des blocs. Ce qui est vérifié ici n'est pas la mise en page mais la
 * PARTITION : sur une étape, une inscription est dans un seul état, et la somme
 * des états égale le nombre d'inscriptions arrêtées là. C'est cette propriété
 * qui rend l'écran lisible — et c'est celle qu'on casse en ajoutant un compteur
 * qui recoupe les autres.
 */

const MAINTENANT = new Date('2026-08-23T12:00:00Z')

const seq = (steps: { id: string; kind: string; label?: string | null }[]) => [
  { id: 'S', name: 'S1', status: 'on', steps: steps.map((s) => ({ ...s, day: 0 })) },
]

const inscription = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  automation_id: 'S',
  current_step: 0,
  status: 'active',
  next_run_at: null,
  send_at: null,
  hold_reason: null,
  ...over,
})

const trois = seq([
  { id: 'a', kind: 'whatsapp', label: 'Premier message' },
  { id: 'b', kind: 'wait' },
  { id: 'c', kind: 'call' },
])

describe('etatDesSequences — où en sont les inscrits', () => {
  it('range chaque inscription sur son bloc, et sur un seul', () => {
    const [etat] = etatDesSequences({
      sequences: trois,
      inscriptions: [
        inscription({ id: 'i1', current_step: 0 }),
        inscription({ id: 'i2', current_step: 2 }),
        inscription({ id: 'i3', current_step: 2 }),
      ],
      taches: [],
      maintenant: MAINTENANT,
    })
    expect(etat.blocs.map((b) => b.inscrits)).toEqual([1, 0, 2])
    expect(etat.actives).toBe(3)
  })

  // LE CHIFFRE QUI A MOTIVÉ L'ÉCRAN : ni tâche, ni horloge, donc rien.
  it('compte comme garée une inscription sans tâche et sans date de reprise', () => {
    const [etat] = etatDesSequences({
      sequences: trois,
      inscriptions: [inscription({ hold_reason: 'sequence_paused' })],
      taches: [],
      maintenant: MAINTENANT,
    })
    expect(etat.garees).toBe(1)
    expect(etat.blocs[0].garees).toBe(1)
    expect(etat.blocs[0].programmes).toBe(0)
    expect(etat.blocs[0].motifs).toEqual([
      { motif: 'sequence_paused', nature: 'reglage', n: 1 },
    ])
  })

  it('ne la compte plus garée dès qu’une horloge la reprendra', () => {
    const [etat] = etatDesSequences({
      sequences: trois,
      inscriptions: [inscription({ next_run_at: '2026-08-24T09:00:00Z' })],
      taches: [],
      maintenant: MAINTENANT,
    })
    expect(etat.garees).toBe(0)
    expect(etat.programmes).toBe(1)
    expect(etat.blocs[0].prochain).toBe('2026-08-24T09:00:00Z')
    expect(etat.prochain).toBe('2026-08-24T09:00:00Z')
  })

  it('ni garée ni programmée quand un humain a la main', () => {
    const [etat] = etatDesSequences({
      sequences: trois,
      inscriptions: [inscription({})],
      taches: [{ enrollment_id: 'i1', status: 'pending', due_at: '2026-08-25T09:00:00Z' }],
      maintenant: MAINTENANT,
    })
    expect(etat.taches).toBe(1)
    expect(etat.garees).toBe(0)
    expect(etat.enRetard).toBe(0)
    expect(etat.blocs[0].reportees).toBe(0)
  })

  it('compte le retard sur l’échéance, pas sur le statut', () => {
    const [etat] = etatDesSequences({
      sequences: trois,
      inscriptions: [inscription({})],
      taches: [{ enrollment_id: 'i1', status: 'pending', due_at: '2026-08-20T09:00:00Z' }],
      maintenant: MAINTENANT,
    })
    expect(etat.enRetard).toBe(1)
    expect(etat.blocs[0].taches).toBe(1)
  })

  // Une inscription reste UNE occupante, même quand elle traîne deux tâches.
  it('compte des inscriptions, pas des tâches', () => {
    const [etat] = etatDesSequences({
      sequences: trois,
      inscriptions: [inscription({})],
      taches: [
        { enrollment_id: 'i1', status: 'pending', due_at: '2026-08-20T09:00:00Z' },
        { enrollment_id: 'i1', status: 'snoozed', due_at: '2026-08-30T09:00:00Z' },
      ],
      maintenant: MAINTENANT,
    })
    expect(etat.blocs[0].taches).toBe(1)
    expect(etat.blocs[0].enRetard).toBe(1)
    // Reportée ne s'applique que si RIEN n'est dû : ici une tâche est en retard.
    expect(etat.blocs[0].reportees).toBe(0)
  })

  it('dit « reportée » quand tout est repoussé et que rien n’est dû', () => {
    const [etat] = etatDesSequences({
      sequences: trois,
      inscriptions: [inscription({})],
      taches: [{ enrollment_id: 'i1', status: 'snoozed', due_at: '2026-08-30T09:00:00Z' }],
      maintenant: MAINTENANT,
    })
    expect(etat.blocs[0].reportees).toBe(1)
    expect(etat.blocs[0].enRetard).toBe(0)
  })

  // UNE DÉFINITION RACCOURCIE NE FAIT PAS DISPARAÎTRE LES GENS.
  it('sort du plan une inscription posée sur une étape qui n’existe plus', () => {
    const [etat] = etatDesSequences({
      sequences: trois,
      inscriptions: [inscription({ current_step: 9 })],
      taches: [],
      maintenant: MAINTENANT,
    })
    expect(etat.horsPlan).toBe(1)
    expect(etat.actives).toBe(1)
    expect(etat.blocs.reduce((n, b) => n + b.inscrits, 0)).toBe(0)
  })

  it('sépare les terminées des sorties', () => {
    const [etat] = etatDesSequences({
      sequences: trois,
      inscriptions: [
        inscription({ id: 'a', status: 'finished' }),
        inscription({ id: 'b', status: 'exited' }),
      ],
      taches: [],
      maintenant: MAINTENANT,
    })
    expect(etat.termines).toBe(1)
    expect(etat.sorties).toBe(1)
    expect(etat.actives).toBe(0)
  })

  it('ignore les tâches d’une autre séquence', () => {
    const [etat] = etatDesSequences({
      sequences: trois,
      inscriptions: [inscription({})],
      taches: [{ enrollment_id: 'ailleurs', status: 'pending', due_at: null }],
      maintenant: MAINTENANT,
    })
    expect(etat.garees).toBe(1)
    expect(etat.taches).toBe(0)
  })

  it('nomme un bloc par son libellé, sinon par sa nature', () => {
    expect(libelleBloc({ id: 'a', kind: 'whatsapp', label: '  Relance  ' })).toBe('Relance')
    expect(libelleBloc({ id: 'b', kind: 'transition' })).toBe('Aiguillage')
    expect(libelleBloc({ id: 'c', kind: 'inconnu' })).toBe('Étape')
  })
})
