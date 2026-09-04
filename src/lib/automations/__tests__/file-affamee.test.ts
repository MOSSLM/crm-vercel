/**
 * @jest-environment node
 *
 * LA FAMINE DE LA FILE — ce qui a arrêté le moteur sans qu'aucun compteur ne
 * bouge.
 *
 * LE CAS RÉEL, mesuré le 04/09/2026. `loadDueEnrollments` lisait les
 * inscriptions dues en UNE requête, triée par échéance et plafonnée à 200. Ce
 * jour-là, 277 étaient dues — et 200 d'entre elles étaient en `test_hold`,
 * arrêtées depuis le 30/08 sur une étape e-mail qui ne pouvait pas partir
 * (régulateur en pause, et `transport: smtp` derrière). Un gel de ce genre NE
 * REPOUSSE PAS `next_run_at`, volontairement : l'inscription doit rester
 * visible et repartir d'elle-même dès que le motif tombe.
 *
 * Conséquence : les 200 plus vieilles lignes de la file étaient exactement
 * celles qui ne se résolvaient jamais. Elles remplissaient la fenêtre à chaque
 * tick, et les 77 autres — dont 23 attentes de réponse échues depuis la veille
 * et 15 depuis le matin — n'étaient JAMAIS servies. Le tick tournait toutes les
 * minutes et rendait fidèlement « 200 traitées ».
 *
 * CE QUE CE FICHIER TIENT : le travail vivant a sa propre fenêtre, quel que
 * soit le volume du gel — et le gel continue d'être lu, sinon couper la phase
 * de test ne relancerait plus rien.
 */

const mockFrom = jest.fn()
jest.mock('@/app/api/_lib/service-client', () => ({
  getServiceClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}))

import { loadDueEnrollments } from '../regulator-db'

const NOW = Date.parse('2026-09-04T16:00:00.000Z')
const LIMITE = 200

/** Une inscription due, sur une étape MANUELLE — elle ressort dans `others`. */
const inscription = (id: string, holdReason: string | null, echeance: string) => ({
  id,
  automation_id: 'auto-1',
  contact_id: null,
  entreprise_id: 1,
  opportunite_id: null,
  current_step: 0,
  status: 'active',
  next_run_at: echeance,
  hold_reason: holdReason,
  vars: {},
  created_by: null,
  entered_at: '2026-08-20T08:00:00.000Z',
  updated_at: '2026-08-30T08:00:00.000Z',
  finished_at: null,
})

const SEQUENCE = {
  id: 'auto-1',
  name: 'S1 — Premier contact',
  kind: 'sequence',
  status: 'on',
  // Une étape d'APPEL : aucun e-mail, donc aucun garde d'envoi à traverser.
  definition: { steps: [{ id: 'ap1', kind: 'call', day: 0, mode: 'manual' }] },
  settings: {},
}

/**
 * Le faux client, fidèle sur le seul point qui compte : il applique le PLAFOND
 * à chaque lecture, séparément. Sans ça le test ne pourrait pas voir la famine,
 * qui n'existe que parce que la fenêtre est bornée.
 */
const wire = (rows: ReturnType<typeof inscription>[]) => {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'automations') {
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'order', 'limit']) c[m] = jest.fn(() => c)
      c.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [SEQUENCE], error: null }).then(r)
      return c
    }
    if (table === 'sequence_enrollments') {
      // ⚠️ LE FAUX CLIENT APPLIQUE VRAIMENT LE FILTRE, et c'est ce qui rend le
      // test capable d'échouer. Sans filtre déclaré — la lecture unique d'avant
      // — il rend TOUTE la file triée puis coupée au plafond : c'est là que le
      // gel mangeait la fenêtre. Un faux client qui ignorerait `or` verrait le
      // correctif et le bug se comporter pareil.
      // ⚠️ LE FAUX CLIENT LIT LE FILTRE ENVOYÉ PAR LE CODE, il ne rejoue pas sa
      // propre liste. C'est la seule façon pour ce fichier de MORDRE : avec une
      // liste recopiée dans le test, élargir `GELS_QUI_SE_LIBERENT` dans le
      // code laisserait les huit cas verts alors que la famine serait revenue.
      // Les motifs libres sont donc extraits de `hold_reason.in.(…)`, exactement
      // comme PostgREST les lirait.
      let fenetre: 'tout' | 'vivant' | 'gel' = 'tout'
      let libres: string[] = []
      const listeDe = (filtre: string) => {
        const m = /hold_reason\.(?:not\.)?in\.\(([^)]*)\)/.exec(filtre)
        return m ? m[1].split(',').map((v) => v.trim()).filter(Boolean) : []
      }
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'lte', 'gte', 'order', 'in']) c[m] = jest.fn(() => c)
      c.or = jest.fn((filtre: string) => {
        if (filtre.includes('hold_reason')) {
          fenetre = 'vivant'
          libres = listeDe(filtre)
        }
        return c
      })
      c.not = jest.fn((colonne: string, _op?: string, valeur?: string) => {
        if (colonne !== 'hold_reason') return c
        fenetre = 'gel'
        if (typeof valeur === 'string') libres = listeDe(`hold_reason.not.in.${valeur}`)
        return c
      })
      c.limit = jest.fn(() => c)
      c.then = (r: (v: unknown) => unknown) => {
        const gele = (e: ReturnType<typeof inscription>) =>
          e.hold_reason != null && !libres.includes(e.hold_reason)
        const garde = (e: ReturnType<typeof inscription>) =>
          fenetre === 'tout' ? true : fenetre === 'gel' ? gele(e) : !gele(e)
        const sous = rows
          .filter(garde)
          .sort((a, b) => Date.parse(a.next_run_at) - Date.parse(b.next_run_at))
          .slice(0, LIMITE)
        return Promise.resolve({ data: sous, error: null }).then(r)
      }
      return c
    }
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'not', 'lte', 'gte', 'or', 'in', 'order', 'limit']) c[m] = jest.fn(() => c)
    c.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null })
    c.then = (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r)
    return c
  })
}

const sb = { from: (...args: unknown[]) => mockFrom(...args) } as never

/** La photo du 04/09/2026 : 200 gels plus vieux, 77 vivantes derrière. */
const LE_CAS_REEL = [
  ...Array.from({ length: 200 }, (_, i) =>
    inscription(`gel-${i}`, 'test_hold', new Date(Date.parse('2026-08-30T08:00:00.000Z') + i * 1000).toISOString()),
  ),
  ...Array.from({ length: 77 }, (_, i) =>
    inscription(`vif-${i}`, i % 3 === 0 ? 'awaiting_reply' : null, new Date(Date.parse('2026-09-03T10:19:00.000Z') + i * 1000).toISOString()),
  ),
]

beforeEach(() => mockFrom.mockReset())

describe('loadDueEnrollments — le gel ne prend la place de personne', () => {
  it('sert les 77 vivantes alors que 200 gels plus vieux les précèdent', async () => {
    wire(LE_CAS_REEL)
    const { others } = await loadDueEnrollments(sb, NOW, LIMITE)
    const vifs = others.filter((o) => o.enrollment.id.startsWith('vif-'))
    // AVANT le correctif : zéro. La fenêtre était pleine à 100 % de gel.
    expect(vifs).toHaveLength(77)
  })

  it('lit quand même les gelées — sinon couper la phase de test ne relance plus rien', async () => {
    wire(LE_CAS_REEL)
    const { others } = await loadDueEnrollments(sb, NOW, LIMITE)
    expect(others.filter((o) => o.enrollment.id.startsWith('gel-'))).toHaveLength(200)
  })

  it('ne rend jamais deux fois la même inscription — les deux fenêtres sont disjointes', async () => {
    wire(LE_CAS_REEL)
    const { others } = await loadDueEnrollments(sb, NOW, LIMITE)
    const ids = others.map((o) => o.enrollment.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('tient à n’importe quel volume de gel : mille gelées n’enlèvent rien aux vivantes', async () => {
    wire([
      ...Array.from({ length: 1000 }, (_, i) =>
        inscription(`gel-${i}`, 'test_hold', new Date(Date.parse('2026-07-01T08:00:00.000Z') + i * 1000).toISOString()),
      ),
      ...Array.from({ length: 40 }, (_, i) =>
        inscription(`vif-${i}`, null, new Date(Date.parse('2026-09-04T09:00:00.000Z') + i * 1000).toISOString()),
      ),
    ])
    const { others } = await loadDueEnrollments(sb, NOW, LIMITE)
    expect(others.filter((o) => o.enrollment.id.startsWith('vif-'))).toHaveLength(40)
  })

  it('tient sur le gel SUIVANT — global_pause, celui que coupera le prochain geste', async () => {
    // La première version listait trois motifs et en oubliait six. Celui-ci
    // arrive dès qu'on coupe le mode test sans dépauser : `planQueue` rend
    // `global_pause`, le tick l'écrit sans toucher `next_run_at`, et la ligne
    // reste due avec son échéance d'août.
    wire([
      ...Array.from({ length: 200 }, (_, i) =>
        inscription(`gel-${i}`, 'global_pause', new Date(Date.parse('2026-08-30T08:00:00.000Z') + i * 1000).toISOString()),
      ),
      ...Array.from({ length: 30 }, (_, i) =>
        inscription(`vif-${i}`, null, new Date(Date.parse('2026-09-04T09:00:00.000Z') + i * 1000).toISOString()),
      ),
    ])
    const { others } = await loadDueEnrollments(sb, NOW, LIMITE)
    expect(others.filter((o) => o.enrollment.id.startsWith('vif-'))).toHaveLength(30)
  })

  it('range aussi sequence_paused et tache_annulee du côté du gel', async () => {
    wire([
      ...Array.from({ length: 120 }, (_, i) =>
        inscription(`gel-p-${i}`, 'sequence_paused', new Date(Date.parse('2026-08-20T08:00:00.000Z') + i * 1000).toISOString()),
      ),
      ...Array.from({ length: 120 }, (_, i) =>
        inscription(`gel-t-${i}`, 'tache_annulee', new Date(Date.parse('2026-08-25T08:00:00.000Z') + i * 1000).toISOString()),
      ),
      ...Array.from({ length: 12 }, (_, i) =>
        inscription(`vif-${i}`, 'awaiting_reply', new Date(Date.parse('2026-09-04T09:00:00.000Z') + i * 1000).toISOString()),
      ),
    ])
    const { others } = await loadDueEnrollments(sb, NOW, LIMITE)
    expect(others.filter((o) => o.enrollment.id.startsWith('vif-'))).toHaveLength(12)
  })

  it('un motif INCONNU tombe du côté du gel — le sens de l’erreur est choisi', async () => {
    // Un `hold_reason` ajouté demain sans toucher à ce fichier ne doit pas
    // pouvoir affamer la fenêtre vivante. La liste positive garantit ce sens-là.
    wire([
      ...Array.from({ length: 200 }, (_, i) =>
        inscription(`gel-${i}`, 'motif_invente_demain', new Date(Date.parse('2026-08-01T08:00:00.000Z') + i * 1000).toISOString()),
      ),
      inscription('vif-1', null, '2026-09-04T09:00:00.000Z'),
    ])
    const { others } = await loadDueEnrollments(sb, NOW, LIMITE)
    expect(others.map((o) => o.enrollment.id)).toContain('vif-1')
  })

  it('un gel qui repousse son échéance reste dans la fenêtre vivante — il se limite tout seul', async () => {
    // `demo_manquante`, `no_email`, `email_invalid`… repoussent `next_run_at` de
    // deux heures : ils ne peuvent pas affamer la file, et les écarter de la
    // fenêtre vivante les priverait de leur reprise automatique.
    wire([inscription('vif-demo', 'demo_manquante', '2026-09-04T15:00:00.000Z')])
    const { others } = await loadDueEnrollments(sb, NOW, LIMITE)
    expect(others.map((o) => o.enrollment.id)).toEqual(['vif-demo'])
  })
})
