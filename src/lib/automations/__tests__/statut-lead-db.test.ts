import type { SupabaseClient } from '@supabase/supabase-js'
import { releverLesStatuts, type LigneAJuger } from '../statut-lead-db'

/** Même client de complaisance que `campagne-db.test.ts` : on teste la lecture. */
function clientAvec(tables: Record<string, unknown[]>): SupabaseClient {
  const chaine = (table: string) => {
    const resultat = { data: tables[table] ?? [], error: null }
    const noeud: Record<string, unknown> = {
      then: (resoudre: (v: unknown) => unknown) => Promise.resolve(resultat).then(resoudre),
    }
    for (const m of ['select', 'in', 'is', 'eq', 'neq', 'order', 'limit']) noeud[m] = () => noeud
    return noeud
  }
  return { from: (table: string) => chaine(table) } as unknown as SupabaseClient
}

const ENT = 42
const AUTO = 'auto-1'

const vide = {
  sequence_enrollments: [] as unknown[],
  prospection_tasks: [] as unknown[],
  email_logs: [] as unknown[],
  entreprises_rapport_public: [] as unknown[],
  email_suppressions: [] as unknown[],
}

const inscription = (over: Record<string, unknown> = {}) => ({
  entreprise_id: ENT,
  status: 'active',
  hold_reason: null,
  next_run_at: '2026-08-21T09:00:00Z',
  vars: {},
  entered_at: '2026-08-01T09:00:00Z',
  ...over,
})

const relever = async (tables: Partial<typeof vide> = {}, ligne: Partial<LigneAJuger> = {}) => {
  const m = await releverLesStatuts(clientAvec({ ...vide, ...tables }), AUTO, [
    { entrepriseId: ENT, statutListe: 'a_lancer', motifEcart: null, ...ligne },
  ])
  return m.get(ENT)!
}

describe('releverLesStatuts — la progression', () => {
  it('dit « à lancer » quand rien n’existe encore', async () => {
    expect((await relever()).progression).toBe('a_lancer')
  })

  it('l’inscription prime sur la ligne de liste', async () => {
    // La liste dit « à lancer », l'inscription dit qu'il est parti.
    const r = await relever({ sequence_enrollments: [inscription()] })
    expect(r.progression).toBe('en_cours')
  })

  it('dit « gelé » — pas « en cours » — quand il n’y a ni réveil ni tâche', async () => {
    // C'est exactement le cas des 59 inscriptions qui ont dormi trois semaines.
    const r = await relever({ sequence_enrollments: [inscription({ next_run_at: null })] })
    expect(r.progression).toBe('gele')
  })

  it('ne dit pas « gelé » quand une tâche manuelle attend', async () => {
    const r = await relever({
      sequence_enrollments: [inscription({ next_run_at: null })],
      prospection_tasks: [{ entreprise_id: ENT }],
    })
    expect(r.progression).toBe('en_cours')
  })

  it('retient l’inscription VIVANTE quand il y en a plusieurs', async () => {
    const r = await relever({
      sequence_enrollments: [
        inscription({ status: 'finished', entered_at: '2026-08-10T09:00:00Z' }),
        inscription({ status: 'active', entered_at: '2026-07-01T09:00:00Z' }),
      ],
    })
    expect(r.progression).toBe('en_cours')
  })

  it('à défaut de vivante, retient la plus récente', async () => {
    const r = await relever({
      sequence_enrollments: [
        inscription({ status: 'finished', entered_at: '2026-07-01T09:00:00Z' }),
        inscription({ status: 'exited', entered_at: '2026-08-10T09:00:00Z' }),
      ],
    })
    expect(r.progression).toBe('termine')
  })

  it('range un écart RÉPARABLE en « à préparer », pas au cimetière', async () => {
    const r = await relever({}, { statutListe: 'ecarte', motifEcart: 'sans_canal' })
    expect(r.progression).toBe('a_preparer')
  })
})

describe('releverLesStatuts — l’engagement', () => {
  it('reste « non mesuré » tant que rien n’a été relevé', async () => {
    const r = await relever()
    expect(r.engagement).toBe('non_mesure')
    expect(r.mesure).toBe(false)
  })

  it('ne compte pas une note interne comme un envoi', async () => {
    const r = await relever({
      email_logs: [{ entreprise_id: ENT, status: 'sent', outcome: null, direction: 'interne', delivery_status: null, bounce_type: null }],
    })
    expect(r.engagement).toBe('non_mesure')
  })

  it('compte un WhatsApp sortant comme un envoi', async () => {
    const r = await relever({
      email_logs: [{ entreprise_id: ENT, status: 'sent', outcome: null, direction: 'sortant', delivery_status: null, bounce_type: null }],
    })
    expect(r.engagement).toBe('envoye')
  })

  it('lit les vues des liens à jeton — notre « ouverture » à nous', async () => {
    const r = await relever({ entreprises_rapport_public: [{ entreprise_id: ENT, vues: 0, plaquette_vues: 3 }] })
    expect(r.engagement).toBe('vu')
  })

  it('lit la réponse dans vars.replies, la seule source honnête', async () => {
    // La valeur est l'INSTANT du clic, pas un booléen : c'est ce qui permet de
    // dire « répondu il y a 3 jours » sans ajouter une table.
    const r = await relever({ sequence_enrollments: [inscription({ vars: { replies: { '2': '2026-08-13T10:00:00Z' } } })] })
    expect(r.engagement).toBe('repondu')
  })

  it('ignore une entrée de replies qui n’est pas un instant', async () => {
    const r = await relever({ sequence_enrollments: [inscription({ vars: { replies: { '2': true } } })] })
    expect(r.engagement).toBe('non_mesure')
  })

  it('garde le signal le plus fort : une issue « pas intéressé » prime sur l’envoi', async () => {
    const r = await relever({
      email_logs: [
        { entreprise_id: ENT, status: 'sent', outcome: null, direction: 'sortant', delivery_status: null, bounce_type: null },
        { entreprise_id: ENT, status: 'sent', outcome: 'not_interested', direction: 'sortant', delivery_status: null, bounce_type: null },
      ],
    })
    expect(r.engagement).toBe('pas_interesse')
  })

  it('ignore l’issue « other », qui ne dit rien de l’engagement', async () => {
    const r = await relever({
      email_logs: [{ entreprise_id: ENT, status: 'sent', outcome: 'other', direction: 'sortant', delivery_status: null, bounce_type: null }],
    })
    expect(r.engagement).toBe('envoye')
  })

  it('marque désabonné sur l’adresse, la seule clé que porte la table', async () => {
    const r = await relever(
      { email_suppressions: [{ email: 'contact@artisan.fr' }] },
      { email: 'Contact@Artisan.FR' },
    )
    expect(r.engagement).toBe('desabonne')
  })
})

describe('releverLesStatuts — l’étage', () => {
  it('range chaque lead à UN seul étage', async () => {
    const r = await relever({ sequence_enrollments: [inscription({ vars: { replies: { '1': '2026-08-13T10:00:00Z' } } })] })
    expect(r.etage).toBe('repondu')
  })

  it('rend une carte vide sans jamais interroger la base pour une page vide', async () => {
    const sb = { from: () => { throw new Error('aucune lecture ne doit partir') } } as unknown as SupabaseClient
    expect((await releverLesStatuts(sb, AUTO, [])).size).toBe(0)
  })
})

describe('releverLesStatuts — le motif du gel', () => {
  it('distingue une attente qui se terminera d’une attente que rien ne réveille', async () => {
    const avecRelance = await relever({
      sequence_enrollments: [inscription({ hold_reason: 'awaiting_reply', next_run_at: '2026-08-24T09:00:00Z' })],
    })
    const sansRelance = await relever({
      sequence_enrollments: [inscription({ hold_reason: 'awaiting_reply', next_run_at: null })],
    })
    expect(avecRelance.motif).toBe('en attente de réponse — relance prévue')
    expect(sansRelance.motif).toMatch(/rien ne la réveillera/)
    // Les deux sont « gelées » sur l'axe progression — c'est le motif qui les
    // sépare, et c'est tout l'intérêt de le porter jusqu'à l'écran.
    expect(avecRelance.progression).toBe('gele')
    expect(sansRelance.progression).toBe('gele')
  })

  it('nomme l’inscription enlisée, qui ne portait aucun mot à afficher', async () => {
    const r = await relever({
      sequence_enrollments: [inscription({ hold_reason: null, next_run_at: null })],
    })
    expect(r.motif).toBe('enlisée — aucun motif, aucune relance, aucune tâche')
  })

  it('ne pose aucun motif quand rien ne bloque', async () => {
    expect((await relever({ sequence_enrollments: [inscription()] })).motif).toBeNull()
    expect((await relever()).motif).toBeNull()
  })
})
