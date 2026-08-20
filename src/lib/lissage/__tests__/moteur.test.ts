import type { SupabaseClient } from '@supabase/supabase-js'
import { tickLissage } from '../moteur'
import type { Constat } from '../passe'

/**
 * Un mini-Postgres en mémoire, parce que le tour de file ne se teste pas sur des
 * lectures figées : il DÉCIDE d'après ce que l'outil précédent vient d'écrire.
 * Un client qui rendrait toujours la même chose ne prouverait rien de la boucle.
 *
 * Trois tables suffisent : la file, les entreprises, et les constats qu'on pose.
 */
function baseFactice(init: {
  lignes: Record<string, unknown>[]
  entreprises: Record<string, unknown>[]
}) {
  const tables: Record<string, Record<string, unknown>[]> = {
    lissage_leads: init.lignes.map((l) => ({
      tentes: [],
      dossier: {},
      tentatives: 0,
      statut: 'a_faire',
      outil: null,
      lieu: null,
      motif: null,
      ...l,
    })),
    entreprises: init.entreprises,
    entreprises_donnees_publiques: [],
    v_presence_actuelle: [],
    lissage_passes: [{ id: 'p1', plan: {} }],
    constats_presence: [],
  }

  const from = (table: string) => {
    const filtres: [string, unknown][] = []
    const test = (r: Record<string, unknown>) =>
      filtres.every(([col, val]) =>
        Array.isArray(val) ? val.includes(r[col]) : r[col] === val,
      )
    const noeud: Record<string, unknown> = {}
    const resoudre = () => ({ data: (tables[table] ?? []).filter(test), error: null })
    for (const m of ['select', 'order', 'limit', 'is', 'or']) noeud[m] = () => noeud
    noeud.eq = (col: string, val: unknown) => (filtres.push([col, val]), noeud)
    noeud.in = (col: string, vals: unknown[]) => (filtres.push([col, vals]), noeud)
    noeud.then = (r: (v: unknown) => unknown) => Promise.resolve(resoudre()).then(r)
    noeud.maybeSingle = () => Promise.resolve({ data: resoudre().data[0] ?? null, error: null })
    noeud.insert = (lignes: Record<string, unknown>[]) => {
      tables[table] = [...(tables[table] ?? []), ...lignes]
      // `v_presence_actuelle` est une VUE sur `constats_presence` : le dernier
      // constat par (entreprise, sujet). La factice doit la tenir à jour, sinon
      // le tour suivant déciderait sur des faits d'avant l'écriture — et le
      // test ne prouverait rien de la boucle qu'il prétend éprouver.
      if (table === 'constats_presence') {
        for (const l of lignes) {
          tables.v_presence_actuelle = [
            ...tables.v_presence_actuelle.filter(
              (v) => !(v.entreprise_id === l.entreprise_id && v.sujet === l.sujet),
            ),
            l,
          ]
        }
      }
      return { then: (r: (v: unknown) => unknown) => Promise.resolve({ data: lignes, error: null }).then(r) }
    }
    noeud.update = (champs: Record<string, unknown>) => {
      const apres: Record<string, unknown> = {}
      const appliquer = () => {
        const touchees = (tables[table] ?? []).filter(test)
        for (const r of touchees) Object.assign(r, champs)
        return { data: touchees.map((r) => ({ id: r.id })), error: null }
      }
      for (const m of ['select', 'is']) apres[m] = () => apres
      apres.eq = (col: string, val: unknown) => (filtres.push([col, val]), apres)
      apres.in = (col: string, vals: unknown[]) => (filtres.push([col, vals]), apres)
      apres.then = (r: (v: unknown) => unknown) => Promise.resolve(appliquer()).then(r)
      return apres
    }
    return noeud
  }
  return { sb: { from } as unknown as SupabaseClient, tables }
}

const lancés: string[] = []
let reponse: (outil: string) => { constats: Constat[]; erreur?: string } = () => ({ constats: [] })

jest.mock('../outils-serveur', () => ({
  outilBranche: (id: string) => id !== 'jamais-branche',
  executerOutilServeur: jest.fn(async (_sb: unknown, outil: string) => {
    lancés.push(outil)
    return reponse(outil)
  }),
}))

const ENT = 7
const entreprise = (over: Record<string, unknown> = {}) => ({
  id: ENT,
  name: 'SARL Martin',
  ville: 'Dijon',
  siret: '81234567800012',
  google_place_id: 'ChIJx',
  site_web_canonique: 'https://martin.fr',
  canonical_url: null,
  ...over,
})

beforeEach(() => {
  lancés.length = 0
  reponse = () => ({ constats: [] })
})

describe('tickLissage', () => {
  it('ne réclame rien quand la file est vide, et le dit sans erreur', async () => {
    const { sb } = baseFactice({ lignes: [], entreprises: [] })
    expect(await tickLissage(sb)).toMatchObject({ prises: 0, lances: 0 })
  })

  it('dit CE QUI RESTE et de quoi c’est fait, même quand il n’a rien pris', async () => {
    // LE DÉFAUT QUE CE TEST GARDE. Un tick qui rend `prises: 0` ne se
    // distinguait pas d'une passe terminée : on appuyait, rien ne bougeait, et
    // l'écran se taisait. Or « il reste 521 prospects à prendre » et « les 19
    // qui restent attendent votre localhost » ne demandent pas le même geste.
    const { sb } = baseFactice({
      lignes: [
        { id: 1, passe_id: 'p', entreprise_id: 1, statut: 'a_faire', lieu: 'local', outil: 'dossier-web', tentes: [], tentatives: 1, dossier: {} },
        { id: 2, passe_id: 'p', entreprise_id: 2, statut: 'a_faire', lieu: 'humain', outil: 'choix-siret', tentes: [], tentatives: 1, dossier: {} },
      ],
      entreprises: [],
    })
    const bilan = await tickLissage(sb)
    expect(bilan.prises).toBe(0)
    expect(bilan.reste).toEqual({ serveur: 0, local: 1, humain: 1 })
  })

  it('conclut « complet » sans lancer un seul outil quand tout est déjà tranché', async () => {
    // Identité hydratée, RGE répondu, place_id et site en colonne : les quatre
    // sujets sont réglés à `moyenne`. Une passe relançable ne redépense rien.
    const { sb, tables } = baseFactice({
      lignes: [{ id: 1, passe_id: 'p1', entreprise_id: ENT }],
      entreprises: [entreprise()],
    })
    tables.entreprises_donnees_publiques.push({
      entreprise_id: ENT,
      identite_rafraichie_le: '2026-08-01T00:00:00Z',
      siret_interroge: '81234567800012',
      est_rge_indicatif: true,
    })
    const bilan = await tickLissage(sb)
    expect(bilan).toMatchObject({ prises: 1, lances: 0, complets: 1 })
    expect(lancés).toEqual([])
  })

  // LE TEST DE LA BOUCLE. Le RGE n'est tranché que par ce que l'outil vient
  // d'écrire : si le tour suivant décidait sur des faits périmés, il relancerait
  // le même outil — ou conclurait « il reste du RGE » alors qu'on vient de le
  // faire.
  it('enchaîne les sujets dans un seul appel, en rechargeant les faits', async () => {
    const { sb, tables } = baseFactice({
      lignes: [{ id: 1, passe_id: 'p1', entreprise_id: ENT }],
      entreprises: [entreprise()],
    })
    tables.entreprises_donnees_publiques.push({
      entreprise_id: ENT,
      identite_rafraichie_le: '2026-08-01T00:00:00Z',
      siret_interroge: '81234567800012',
      est_rge_indicatif: null, // le RGE reste à trancher
    })
    reponse = () => ({
      constats: [{ sujet: 'rge', etat: 'absent', confiance: 'certaine', source: 'ademe-rge' }],
    })

    const bilan = await tickLissage(sb)
    expect(lancés).toEqual(['ademe-rge'])
    expect(bilan.complets).toBe(1)
    // Le constat est bien allé dans la table de vérité, pas dans une colonne.
    expect(tables.constats_presence).toHaveLength(1)
    expect(tables.constats_presence[0]).toMatchObject({ sujet: 'rge', etat: 'absent', valeur: null })
  })

  it('pose l’étape locale et la RELÂCHE, au lieu de prétendre la faire', async () => {
    // Sans place_id ni URL, la fiche Google revient au dossier web — qui vit sur
    // la machine de Matteo. Le serveur ne s'y substitue pas.
    const { sb, tables } = baseFactice({
      lignes: [{ id: 1, passe_id: 'p1', entreprise_id: ENT }],
      entreprises: [entreprise({ google_place_id: null, site_web_canonique: null })],
    })
    tables.entreprises_donnees_publiques.push({
      entreprise_id: ENT,
      identite_rafraichie_le: '2026-08-01T00:00:00Z',
      siret_interroge: '81234567800012',
      est_rge_indicatif: false,
    })
    const bilan = await tickLissage(sb)
    expect(bilan.en_attente_local).toBe(1)
    expect(lancés).toEqual([])
    const ligne = tables.lissage_leads[0]
    expect(ligne).toMatchObject({ statut: 'a_faire', lieu: 'local', outil: 'dossier-web' })
    // Relâchée : sinon l'exécuteur local ne pourrait jamais la réclamer.
    expect(ligne.reclame_par).toBeNull()
  })

  it('n’écrit rien et le dit quand l’entreprise a disparu sous la passe', async () => {
    const { sb, tables } = baseFactice({
      lignes: [{ id: 1, passe_id: 'p1', entreprise_id: 999 }],
      entreprises: [],
    })
    const bilan = await tickLissage(sb)
    expect(bilan.pannes).toEqual(['entreprise 999 introuvable'])
    expect(tables.constats_presence).toHaveLength(0)
  })

  // LE TEST QUI EMPÊCHE LA FILE DE TOURNER EN ROND SUR UNE PANNE.
  it('ne crie PAS à la panne quand la source a répondu « je n’ai rien »', async () => {
    // LE DÉFAUT QUE CE TEST GARDE. « L'annuaire ne propose aucun candidat sur ce
    // nom » et « code postal différent du registre » passaient par le champ des
    // ERREURS, donc l'écran les affichait comme des pannes — à presque chaque
    // tour, sur du fonctionnement parfaitement normal. Une alerte qui crie tout
    // le temps finit par ne plus être lue, et c'est la vraie panne qu'on rate.
    //
    // ⚠️ SA PREMIÈRE VERSION NE TESTAIT RIEN. Elle recopiait les deux `if` du
    // moteur dans le corps du test au lieu d'appeler `tickLissage` — et c'est
    // exactement ce qui a laissé passer le défaut suivant : `remarques` était
    // déclaré, initialisé, sérialisé, lu par l'écran, et le moteur n'y poussait
    // JAMAIS rien. Un test qui réécrit le code qu'il vérifie ne vérifie que
    // lui-même.
    const { sb, tables } = baseFactice({
      lignes: [{ id: 1, passe_id: 'p1', entreprise_id: ENT }],
      entreprises: [entreprise()],
    })
    tables.entreprises_donnees_publiques.push({
      entreprise_id: ENT,
      identite_rafraichie_le: '2026-08-01T00:00:00Z',
      siret_interroge: '81234567800012',
      est_rge_indicatif: null,
    })
    reponse = () => ({ constats: [], note: 'aucun candidat sur ce nom' })

    const bilan = await tickLissage(sb)
    expect(bilan.pannes).toEqual([])
    expect(bilan.remarques).toEqual(['ademe-rge · aucun candidat sur ce nom'])
  })

  it('range un outil en panne dans les tentés, et remonte la panne en clair', async () => {
    const { sb, tables } = baseFactice({
      lignes: [{ id: 1, passe_id: 'p1', entreprise_id: ENT }],
      entreprises: [entreprise()],
    })
    tables.entreprises_donnees_publiques.push({
      entreprise_id: ENT,
      identite_rafraichie_le: '2026-08-01T00:00:00Z',
      siret_interroge: '81234567800012',
      est_rge_indicatif: null,
    })
    reponse = () => ({ constats: [], erreur: 'ADEME injoignable' })

    const bilan = await tickLissage(sb)
    expect(bilan.pannes).toEqual(['ademe-rge · ADEME injoignable'])
    // Un seul lancement, pas quatre : l'outil est tenté, il ne se relance pas.
    expect(lancés).toEqual(['ademe-rge'])
    expect(tables.lissage_leads[0].tentes).toEqual(['ademe-rge'])
    // Et la ligne sort en « sans_prise » AVEC son motif — jamais en silence.
    expect(tables.lissage_leads[0].statut).toBe('sans_prise')
    expect(String(tables.lissage_leads[0].motif)).toContain('rge')
  })
})
