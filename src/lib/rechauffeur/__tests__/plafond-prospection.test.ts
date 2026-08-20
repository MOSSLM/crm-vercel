/**
 * @jest-environment node
 *
 * LE COMPTE-GOUTTES : c'est la chauffe qui dit combien d'e-mails froids la
 * journée peut porter, et le régulateur qui les espace.
 *
 * `capacite()` savait traduire l'ancienneté et le placement mesuré en un
 * nombre ; personne ne lisait ce nombre en dehors de l'écran du réchauffeur. Ce
 * fichier tient le chaînon : la somme des capacités, et surtout la distinction
 * entre « je n'autorise rien » et « je n'ai rien à dire ».
 */

const mockFrom = jest.fn()

import { plafondProspectionDuJour } from '../rechauffeur-db'
import type { SupabaseClient } from '@supabase/supabase-js'

type Ligne = {
  id: string
  email: string
  statut: string
  demarre_le: string | null
  cible_jour: number
  plafond_prospection: number
}

const EXP = (over: Partial<Ligne>): Ligne => ({
  id: 'e1',
  email: 'contact@sama.fr',
  statut: 'chauffe',
  demarre_le: '2026-08-01',
  cible_jour: 40,
  plafond_prospection: 120,
  domaine_signant: 'sama.fr',
  fuseau: 'Europe/Paris',
  fenetre_de: 8,
  fenetre_a: 19,
  nom: 'Sama',
  ...over,
}) as unknown as Ligne

/** Base minimale : les expéditeurs donnés, et aucun message de chauffe journalisé. */
const wire = (expediteurs: Ligne[] | null, erreur?: unknown) => {
  mockFrom.mockImplementation((table: string) => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'lte', 'order', 'not', 'in']) c[m] = jest.fn(() => c)
    const res =
      table === 'rechauffe_expediteurs'
        ? { data: expediteurs, error: erreur ?? null }
        : { data: [], error: null }
    c.limit = jest.fn(() => Promise.resolve(res))
    c.maybeSingle = jest.fn().mockResolvedValue(res)
    c.then = (r: (v: unknown) => unknown) => Promise.resolve(res).then(r)
    return c
  })
  return { from: (...a: unknown[]) => mockFrom(...a) } as unknown as SupabaseClient
}

const LE_20_AOUT = new Date('2026-08-20T10:00:00Z')

beforeEach(() => mockFrom.mockReset())

describe('« rien à dire » n’est pas « je n’autorise rien »', () => {
  it('aucun expéditeur : rend null, et le régulateur garde son plafond', async () => {
    // C'est LE cas à ne pas rater. Confondre les deux éteindrait la
    // prospection d'un CRM qui n'a jamais voulu de réchauffeur.
    expect(await plafondProspectionDuJour(wire([]), LE_20_AOUT)).toBeNull()
  })

  it('table absente (42P01) : rend null aussi — il n’y a pas de réchauffeur', async () => {
    const p = await plafondProspectionDuJour(wire(null, { code: '42P01', message: 'relation absente' }), LE_20_AOUT)
    expect(p).toBeNull()
  })

  it('lecture en panne : rend ZÉRO, jamais null', async () => {
    // Le sens INVERSE de la pause du régulateur, et c'est voulu : rendre `null`
    // rendrait la main au plafond fixe — cent vingt e-mails — pour une seconde
    // d'indisponibilité de la base. Un garde-fou armé se ferme quand il ne
    // sait pas.
    const p = await plafondProspectionDuJour(wire(null, { code: '57014', message: 'timeout' }), LE_20_AOUT)
    expect(p?.plafond).toBe(0)
    expect(p?.explication).toContain('tant qu’on ne sait pas')
  })

  it('chauffe pas démarrée : rend ZÉRO, pas null — il a regardé', async () => {
    const p = await plafondProspectionDuJour(wire([EXP({ demarre_le: null })]), LE_20_AOUT)
    expect(p?.plafond).toBe(0)
    expect(p?.explication).toContain('pas démarrée')
  })
})

describe('ce que chaque statut autorise', () => {
  it('en pause, en erreur, bloqué par le DNS : rien', async () => {
    for (const statut of ['en_pause', 'erreur', 'dns_bloquant']) {
      const p = await plafondProspectionDuJour(wire([EXP({ statut })]), LE_20_AOUT)
      expect(p?.plafond).toBe(0)
    }
  })

  it('en entretien : la montée est finie, la boîte porte son plafond entier', async () => {
    const p = await plafondProspectionDuJour(
      wire([EXP({ statut: 'entretien', plafond_prospection: 90 })]),
      LE_20_AOUT,
    )
    expect(p?.plafond).toBe(90)
  })

  it('en chauffe : la courbe décide, et le chiffre monte avec les jours', async () => {
    const jeune = await plafondProspectionDuJour(wire([EXP({ demarre_le: '2026-08-19' })]), LE_20_AOUT)
    const age = await plafondProspectionDuJour(wire([EXP({ demarre_le: '2026-06-01' })]), LE_20_AOUT)
    expect(jeune!.plafond).toBeLessThan(age!.plafond)
    // Et c'est bien un compte-gouttes, pas une vanne : le deuxième jour de
    // chauffe n'autorise pas cent e-mails froids.
    expect(jeune!.plafond).toBeLessThan(20)
  })

  it('plusieurs expéditeurs : les capacités s’additionnent', async () => {
    const seul = await plafondProspectionDuJour(
      wire([EXP({ statut: 'entretien', plafond_prospection: 30 })]),
      LE_20_AOUT,
    )
    const deux = await plafondProspectionDuJour(
      wire([
        EXP({ id: 'e1', statut: 'entretien', plafond_prospection: 30 }),
        EXP({ id: 'e2', email: 'b@sama.fr', statut: 'entretien', plafond_prospection: 30 }),
      ]),
      LE_20_AOUT,
    )
    expect(deux!.plafond).toBe(seul!.plafond * 2)
    expect(deux!.expediteurs).toBe(2)
  })

  it('le plafond dur de la boîte reste une borne haute', async () => {
    // La courbe peut demander plus que ce que la boîte accepte : c'est la
    // boîte qui gagne, jamais la courbe.
    const p = await plafondProspectionDuJour(
      wire([EXP({ demarre_le: '2026-01-01', cible_jour: 200, plafond_prospection: 25 })]),
      LE_20_AOUT,
    )
    expect(p!.plafond).toBeLessThanOrEqual(25)
  })

  it('l’explication nomme l’expéditeur — un plafond sans son motif se contourne', async () => {
    const p = await plafondProspectionDuJour(wire([EXP({ statut: 'entretien' })]), LE_20_AOUT)
    expect(p?.explication).toContain('contact@sama.fr')
  })
})
