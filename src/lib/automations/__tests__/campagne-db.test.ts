import type { SupabaseClient } from '@supabase/supabase-js'
import { chargerFaits, comptesDeCampagnes, reprendreInscriptions } from '../campagne-db'

/**
 * Un client Supabase de complaisance : chaque table rend ce qu'on lui a donné,
 * et toute la chaîne (`select`, `in`, `is`, `order`, `limit`) se replie sur
 * elle-même. On teste la LECTURE, pas le pilote.
 */
function clientAvec(tables: Record<string, unknown[]>): SupabaseClient {
  const chaine = (table: string) => {
    const resultat = { data: tables[table] ?? [], error: null }
    const noeud: Record<string, unknown> = {
      then: (resoudre: (v: unknown) => unknown) => Promise.resolve(resultat).then(resoudre),
    }
    for (const methode of ['select', 'in', 'is', 'eq', 'neq', 'order', 'limit']) {
      noeud[methode] = () => noeud
    }
    return noeud
  }
  return { from: (table: string) => chaine(table) } as unknown as SupabaseClient
}

const ENT = 42

const base = {
  entreprises: [{ id: ENT, email: 'contact@artisan.fr', telephone: '0612345678', archived_at: null }],
  contacts: [],
  sequence_enrollments: [],
  email_logs: [],
  opportunites: [{ id: 'opp-1', entreprise_id: ENT, archived_at: null }],
  email_suppressions: [],
  phone_blacklist: [],
}

const faitsDe = async (over: Partial<typeof base> = {}) => {
  const f = await chargerFaits(clientAvec({ ...base, ...over }), [ENT])
  return f.get(ENT)!
}

describe('chargerFaits', () => {
  it('collecte les canaux de l’entreprise ET de ses contacts', async () => {
    const f = await faitsDe({
      entreprises: [{ id: ENT, email: null, telephone: '0142334455', archived_at: null }],
      contacts: [{ entreprise_id: ENT, email: 'gerant@artisan.fr', tel: '0612345678', is_decision_maker: true }],
    })
    // Le fixe est sur l'entreprise, le mobile et l'e-mail sur le gérant : les
    // trois canaux existent, même si aucune ligne ne les porte tous.
    expect([...f.canaux].sort()).toEqual(['email', 'fixe', 'mobile'])
  })

  it('n’invente pas de canal quand il n’y en a aucun', async () => {
    const f = await faitsDe({
      entreprises: [{ id: ENT, email: null, telephone: null, archived_at: null }],
    })
    expect(f.canaux.size).toBe(0)
  })

  // LE TEST QUI COMPTE. `sales_pipeline_state.replied` vaut false sur 153 lignes
  // sur 153 en production, alors que 55 prospects ont répondu : la seule source
  // honnête est `vars.replies`. Un garde-fou qui la rate renvoie 49 personnes
  // ayant répondu en premier contact.
  describe('la réponse se lit dans vars.replies', () => {
    it('détecte une réponse enregistrée sur l’inscription', async () => {
      const f = await faitsDe({
        sequence_enrollments: [
          { entreprise_id: ENT, status: 'active', vars: { replies: { '1': true } } },
        ],
      })
      expect(f.aDejaReagi).toBe(true)
    })

    it('ne confond pas un sac vide avec une réponse', async () => {
      const f = await faitsDe({
        sequence_enrollments: [{ entreprise_id: ENT, status: 'active', vars: { replies: {} } }],
      })
      expect(f.aDejaReagi).toBe(false)
    })

    it('tient sur des vars absentes, nulles, ou d’une autre forme', async () => {
      for (const vars of [null, {}, { replies: null }, { replies: 'oui' }, { replies: [] }]) {
        const f = await faitsDe({
          sequence_enrollments: [{ entreprise_id: ENT, status: 'active', vars }],
        })
        expect(f.aDejaReagi).toBe(false)
      }
    })
  })

  it('détecte une réaction déclarée dans le fil d’échanges', async () => {
    for (const outcome of ['answered', 'later', 'not_interested', 'blocked']) {
      const f = await faitsDe({ email_logs: [{ entreprise_id: ENT, outcome }] })
      expect(f.aDejaReagi).toBe(true)
    }
    // « pas de réponse » n'est pas une réaction : la séquence continue.
    const muet = await faitsDe({ email_logs: [{ entreprise_id: ENT, outcome: 'no_answer' }] })
    expect(muet.aDejaReagi).toBe(false)
  })

  it('repère une inscription vivante ailleurs, et ignore les inscriptions closes', async () => {
    const vivante = await faitsDe({
      sequence_enrollments: [{ entreprise_id: ENT, status: 'paused', vars: {} }],
    })
    expect(vivante.inscriptionVivanteAilleurs).toBe(true)

    const close = await faitsDe({
      sequence_enrollments: [{ entreprise_id: ENT, status: 'exited', vars: {} }],
    })
    expect(close.inscriptionVivanteAilleurs).toBe(false)
  })

  it('repère un désabonnement par l’adresse comme par le numéro', async () => {
    const parMail = await faitsDe({ email_suppressions: [{ email: 'CONTACT@Artisan.fr' }] })
    expect(parMail.desabonne).toBe(true)

    const parTel = await faitsDe({ phone_blacklist: [{ e164: '+33 6 12 34 56 78' }] })
    expect(parTel.desabonne).toBe(true)

    const ni = await faitsDe()
    expect(ni.desabonne).toBe(false)
  })

  it('voit l’archivage et l’absence d’affaire', async () => {
    const archive = await faitsDe({
      entreprises: [{ id: ENT, email: 'a@b.fr', telephone: null, archived_at: '2026-08-01' }],
    })
    expect(archive.archive).toBe(true)

    const sansAffaire = await faitsDe({ opportunites: [] })
    expect(sansAffaire.aUneAffaire).toBe(false)
  })

  it('ne rend rien pour une liste vide, et n’interroge pas la base', async () => {
    const sb = clientAvec(base)
    const espion = jest.spyOn(sb, 'from')
    expect((await chargerFaits(sb, [])).size).toBe(0)
    expect(espion).not.toHaveBeenCalled()
  })

  it('dédoublonne les identifiants reçus', async () => {
    const f = await chargerFaits(clientAvec(base), [ENT, ENT, ENT])
    expect(f.size).toBe(1)
  })
})

/**
 * Un client qui laisse ÉCRIRE — et qui garde la trace de ce qu'on a écrit.
 * Les lectures rendent la table demandée ; `upsert` et `update` s'enregistrent
 * au lieu de partir. C'est tout ce qu'il faut pour juger une décision d'écriture.
 */
function clientEcrivain(tables: Record<string, unknown[]>) {
  const ecritures: { table: string; type: 'upsert' | 'update'; payload: unknown }[] = []

  const noeud = (table: string, resultat: () => { data: unknown; error: null }) => {
    const n: Record<string, unknown> = {
      then: (resoudre: (v: unknown) => unknown) => Promise.resolve(resultat()).then(resoudre),
    }
    for (const m of ['select', 'in', 'is', 'eq', 'neq', 'order', 'limit']) n[m] = () => n
    n.upsert = (rows: Record<string, unknown>[]) => {
      ecritures.push({ table, type: 'upsert', payload: rows })
      return noeud(table, () => ({ data: rows.map((_, i) => ({ id: i + 1 })), error: null }))
    }
    n.update = (patch: Record<string, unknown>) => {
      ecritures.push({ table, type: 'update', payload: patch })
      return noeud(table, () => ({ data: null, error: null }))
    }
    return n
  }

  const sb = { from: (t: string) => noeud(t, () => ({ data: tables[t] ?? [], error: null })) }
  return { sb: sb as unknown as SupabaseClient, ecritures }
}

const SEQ = '0e7a1f20-0000-4000-8000-000000000001'

describe('reprendreInscriptions', () => {
  const insertions = (ecritures: ReturnType<typeof clientEcrivain>['ecritures']) =>
    (ecritures.find((e) => e.type === 'upsert')?.payload ?? []) as Record<string, unknown>[]

  // C'EST LA FONCTION QUI RÉPOND À « MES LEADS NE SERONT PAS PERDUS ». 153
  // inscriptions vivent sans liste : la campagne qui les héberge doit les
  // compter, sinon la refonte les fait disparaître de l'écran qui la remplace.
  it('fait entrer une inscription vivante en « inscrit », avec son lien', async () => {
    const { sb, ecritures } = clientEcrivain({
      sequence_enrollments: [{ id: 'ins-1', entreprise_id: 7, contact_id: 'c-1', status: 'active' }],
      campagne_leads: [],
    })
    const r = await reprendreInscriptions(sb, SEQ)

    expect(r).toEqual({ reprises: 1, misAJour: 0, sansEntreprise: 0 })
    expect(insertions(ecritures)[0]).toMatchObject({
      automation_id: SEQ,
      entreprise_id: 7,
      contact_id: 'c-1',
      enrollment_id: 'ins-1',
      origine: 'reprise',
      statut: 'inscrit',
      motif_ecart: null,
    })
  })

  it('fait entrer une inscription close en « terminé » — elle raconte ce qui a été tenté', async () => {
    for (const status of ['finished', 'exited', 'replied']) {
      const { sb, ecritures } = clientEcrivain({
        sequence_enrollments: [{ id: 'ins-1', entreprise_id: 7, contact_id: null, status }],
        campagne_leads: [],
      })
      await reprendreInscriptions(sb, SEQ)
      expect(insertions(ecritures)[0]).toMatchObject({ statut: 'termine' })
    }
  })

  it('sur deux inscriptions d’une même entreprise, la vivante l’emporte', async () => {
    const { sb, ecritures } = clientEcrivain({
      sequence_enrollments: [
        { id: 'vieille', entreprise_id: 7, contact_id: null, status: 'exited' },
        { id: 'en-cours', entreprise_id: 7, contact_id: null, status: 'paused' },
      ],
      campagne_leads: [],
    })
    const r = await reprendreInscriptions(sb, SEQ)

    // Une seule ligne : la liste est indexée par entreprise, et c'est le bon
    // niveau — on ne démarche pas deux fois la même société.
    expect(r.reprises).toBe(1)
    expect(insertions(ecritures)).toHaveLength(1)
    expect(insertions(ecritures)[0]).toMatchObject({ enrollment_id: 'en-cours', statut: 'inscrit' })
  })

  it('compte les inscriptions sans entreprise au lieu de les perdre', async () => {
    const { sb, ecritures } = clientEcrivain({
      sequence_enrollments: [
        { id: 'ins-1', entreprise_id: null, contact_id: 'c-1', status: 'active' },
        { id: 'ins-2', entreprise_id: 7, contact_id: null, status: 'active' },
      ],
      campagne_leads: [],
    })
    const r = await reprendreInscriptions(sb, SEQ)

    expect(r).toEqual({ reprises: 1, misAJour: 0, sansEntreprise: 1 })
    expect(insertions(ecritures)).toHaveLength(1)
  })

  it('ne réécrit pas l’origine d’un lead déjà listé : il ne lui manquait que son lien', async () => {
    const { sb, ecritures } = clientEcrivain({
      sequence_enrollments: [{ id: 'ins-1', entreprise_id: 7, contact_id: null, status: 'active' }],
      campagne_leads: [{ id: 55, entreprise_id: 7, enrollment_id: null, statut: 'a_lancer' }],
    })
    const r = await reprendreInscriptions(sb, SEQ)

    expect(r).toEqual({ reprises: 0, misAJour: 1, sansEntreprise: 0 })
    const maj = ecritures.find((e) => e.type === 'update')
    expect(maj?.payload).toEqual({ enrollment_id: 'ins-1', statut: 'inscrit', motif_ecart: null })
    expect(maj?.payload).not.toHaveProperty('origine')
  })

  it('n’écrit rien quand la liste est déjà juste', async () => {
    const { sb, ecritures } = clientEcrivain({
      sequence_enrollments: [{ id: 'ins-1', entreprise_id: 7, contact_id: null, status: 'active' }],
      campagne_leads: [{ id: 55, entreprise_id: 7, enrollment_id: 'ins-1', statut: 'inscrit' }],
    })
    const r = await reprendreInscriptions(sb, SEQ)

    expect(r).toEqual({ reprises: 0, misAJour: 0, sansEntreprise: 0 })
    expect(ecritures).toHaveLength(0)
  })

  it('n’interroge pas la base pour une séquence sans inscription', async () => {
    const { sb, ecritures } = clientEcrivain({ sequence_enrollments: [] })
    expect(await reprendreInscriptions(sb, SEQ)).toEqual({ reprises: 0, misAJour: 0, sansEntreprise: 0 })
    expect(ecritures).toHaveLength(0)
  })
})

describe('comptesDeCampagnes', () => {
  it('lit la vue et convertit les nombres que Postgres rend en texte', async () => {
    const { sb } = clientEcrivain({
      v_campagne_leads_compte: [
        {
          automation_id: SEQ,
          total: '297',
          a_lancer: '250',
          inscrits: '0',
          ecartes: '47',
          termines: '0',
          ecartes_rattrapables: '31',
          dernier_ajout: '2026-08-19T10:00:00Z',
        },
      ],
    })
    const comptes = await comptesDeCampagnes(sb, [SEQ])
    expect(comptes.get(SEQ)).toEqual({
      total: 297,
      aLancer: 250,
      inscrits: 0,
      ecartes: 47,
      termines: 0,
      ecartesRattrapables: 31,
      dernierAjout: '2026-08-19T10:00:00Z',
    })
  })

  // Une campagne sans aucune ligne n'apparaît pas dans la vue. L'appelant ne
  // doit pas avoir à distinguer « zéro » de « absent » : l'écran afficherait un
  // trou là où il faut lire 0.
  it('rend zéro pour une campagne absente de la vue', async () => {
    const { sb } = clientEcrivain({ v_campagne_leads_compte: [] })
    const comptes = await comptesDeCampagnes(sb, [SEQ])
    expect(comptes.get(SEQ)).toEqual({
      total: 0,
      aLancer: 0,
      inscrits: 0,
      ecartes: 0,
      termines: 0,
      ecartesRattrapables: 0,
      dernierAjout: null,
    })
  })

  it('ne demande rien sans identifiant', async () => {
    const { sb } = clientEcrivain({})
    const espion = jest.spyOn(sb, 'from')
    expect((await comptesDeCampagnes(sb, [])).size).toBe(0)
    expect(espion).not.toHaveBeenCalled()
  })
})
