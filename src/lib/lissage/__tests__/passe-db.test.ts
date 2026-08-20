import type { SupabaseClient } from '@supabase/supabase-js'
import {
  candidatsDeLaFile,
  reclamerLot,
  rejouerPasse,
  chargerFaits,
  ecrireConstats,
  enregistrerResultat,
  libererEtapeHumaine,
  planDe,
  poserProchaineEtape,
  type LigneFile,
} from '../passe-db'
import { PLAN_DEFAUT, type Constat } from '../passe'

/**
 * Un client de complaisance qui GARDE ce qu'on lui écrit — les tests d'écriture
 * de ce module portent tous sur la forme exacte de la ligne envoyée, pas sur le
 * pilote. Les `update` rendent une ligne pour que la réclamation réussisse.
 */
function client(tables: Record<string, unknown[]>) {
  const ecrits: { table: string; op: string; lignes: unknown }[] = []
  // Les filtres transmis à PostgREST. Sans eux, impossible de distinguer un tri
  // fait EN BASE d'un tri fait en mémoire après coup — et c'est exactement la
  // différence qui a bloqué la file.
  const filtres: { methode: string; argument: unknown }[] = []
  const chaine = (table: string) => {
    const noeud: Record<string, unknown> = {
      then: (r: (v: unknown) => unknown) =>
        Promise.resolve({ data: tables[table] ?? [], error: null }).then(r),
    }
    for (const m of ['select', 'in', 'is', 'eq', 'neq', 'order', 'limit', 'or']) {
      noeud[m] = (argument: unknown) => {
        filtres.push({ methode: m, argument })
        return noeud
      }
    }
    noeud.single = () => Promise.resolve({ data: (tables[table] ?? [])[0] ?? null, error: null })
    for (const op of ['insert', 'upsert', 'update']) {
      noeud[op] = (lignes: unknown) => {
        ecrits.push({ table, op, lignes })
        const apres: Record<string, unknown> = {
          then: (r: (v: unknown) => unknown) =>
            Promise.resolve({ data: [{ id: 1 }], error: null }).then(r),
        }
        for (const m of ['select', 'eq', 'in', 'is']) apres[m] = () => apres
        return apres
      }
    }
    return noeud
  }
  const sb = { from: (t: string) => chaine(t) } as unknown as SupabaseClient
  return { sb, ecrits, filtres }
}

const ENT = 42
const vide = { entreprises: [], entreprises_donnees_publiques: [], v_presence_actuelle: [] }

const faitsDe = async (over: Record<string, unknown[]>, candidats?: Map<number, number>) => {
  const { sb } = client({
    ...vide,
    entreprises: [{ id: ENT, name: 'SARL Martin', ville: 'Dijon' }],
    ...over,
  })
  return (await chargerFaits(sb, [ENT], candidats)).get(ENT)!
}

describe('chargerFaits — dériver un constat des colonnes', () => {
  it('ne dérive rien quand la fiche est nue : personne n’a regardé', async () => {
    const f = await faitsDe({})
    expect(f.constats).toEqual({
      identite: undefined,
      rge: undefined,
      fiche_google: undefined,
      site_web: undefined,
    })
  })

  // LE TEST QUI PROTÈGE DES 54 878. L'estampille dit « interrogé le 16/08 » et
  // la réponse est vide : le remplissage de masse n'a jamais appelé l'ADEME.
  // Lire la date rendrait ces fiches « déjà faites » à jamais.
  it('ignore rge_rafraichi_le et ne lit que la réponse', async () => {
    const f = await faitsDe({
      entreprises_donnees_publiques: [
        {
          entreprise_id: ENT,
          identite_rafraichie_le: null,
          siret_interroge: null,
          est_rge_indicatif: null,
        },
      ],
    })
    expect(f.constats.rge).toBeUndefined()
  })

  it('lit un RGE trouvé comme « présent », un RGE cherché-et-nul comme « absent »', async () => {
    const oui = await faitsDe({
      entreprises_donnees_publiques: [{ entreprise_id: ENT, est_rge_indicatif: true }],
    })
    const non = await faitsDe({
      entreprises_donnees_publiques: [{ entreprise_id: ENT, est_rge_indicatif: false }],
    })
    expect(oui.constats.rge).toEqual({
      etat: 'present',
      confiance: 'haute',
      source: 'colonne:est_rge_indicatif',
    })
    // « absent » n'est PAS « inconnu » : l'ADEME a répondu, elle n'a rien.
    expect(non.constats.rge?.etat).toBe('absent')
  })

  it('n’accepte l’identité que si l’hydratation a laissé le SIRET qu’elle a interrogé', async () => {
    const estampilleSeule = await faitsDe({
      entreprises_donnees_publiques: [
        { entreprise_id: ENT, identite_rafraichie_le: '2026-08-16T02:17:00Z', siret_interroge: null },
      ],
    })
    expect(estampilleSeule.constats.identite).toBeUndefined()

    const vraie = await faitsDe({
      entreprises_donnees_publiques: [
        {
          entreprise_id: ENT,
          identite_rafraichie_le: '2026-08-16T02:17:00Z',
          siret_interroge: '81234567800012',
        },
      ],
    })
    expect(vraie.constats.identite?.etat).toBe('present')
  })

  // LES 67. Une URL en colonne et un constat « absent » : le constat a raison à
  // chaque fois — NXDOMAIN, ou le site de quelqu'un d'autre.
  it('fait gagner le constat sur la colonne, y compris quand ils se contredisent', async () => {
    const f = await faitsDe({
      entreprises: [{ id: ENT, name: 'SARL Martin', ville: 'Dijon', canonical_url: 'https://nxdomain.fr' }],
      v_presence_actuelle: [
        {
          entreprise_id: ENT,
          sujet: 'site_web',
          etat: 'absent',
          confiance: 'certaine',
          source: 'verifier-sites',
        },
      ],
    })
    expect(f.constats.site_web?.etat).toBe('absent')
    expect(f.constats.site_web?.source).toBe('verifier-sites')
    // L'URL reste lisible : elle est le préalable de l'outil qui ira la sonder.
    expect(f.url).toBe('https://nxdomain.fr')
  })

  it('déduit le site de la colonne en confiance « haute », jamais « certaine »', async () => {
    const f = await faitsDe({
      entreprises: [{ id: ENT, name: 'M', ville: 'D', site_web_canonique: 'https://martin.fr' }],
    })
    // `certaine` la rendrait indéboulonnable ; `haute` laisse une passe de
    // consolidation la faire vérifier. C'est le prix des 67.
    expect(f.constats.site_web).toEqual({
      etat: 'present',
      confiance: 'haute',
      source: 'colonne:site_web_canonique',
    })
  })

  it('traite une chaîne vide comme une absence de donnée, pas comme une valeur', async () => {
    const f = await faitsDe({
      entreprises: [{ id: ENT, name: 'M', ville: 'D', siret: '   ', google_place_id: '' }],
    })
    expect(f.siret).toBeNull()
    expect(f.constats.fiche_google).toBeUndefined()
  })

  it('porte les candidats de la file, que le serveur ne peut pas voir autrement', async () => {
    const f = await faitsDe({}, new Map([[ENT, 3]]))
    expect(f.candidats).toBe(3)
  })

  it('ne fait aucune requête pour une liste vide', async () => {
    const { sb } = client(vide)
    expect((await chargerFaits(sb, [])).size).toBe(0)
  })
})

describe('ecrireConstats', () => {
  const constat = (over: Partial<Constat>): Constat => ({
    sujet: 'site_web',
    etat: 'absent',
    confiance: 'haute',
    source: 'verifier-sites',
    ...over,
  })

  it('force valeur à null dès que l’état n’est pas « présent »', async () => {
    const { sb, ecrits } = client({ constats_presence: [] })
    // Un appelant distrait passe une valeur avec un « absent » : la contrainte
    // `constat_coherent` refuserait TOUT le lot, y compris les constats voisins
    // qui étaient bons. On la neutralise ici plutôt qu'en base.
    await ecrireConstats(sb, ENT, [constat({ valeur: 'https://ancien.fr' })])
    expect((ecrits[0].lignes as { valeur: unknown }[])[0].valeur).toBeNull()
  })

  it('écarte un « présent » sans valeur au lieu de faire tomber le lot', async () => {
    const { sb, ecrits } = client({ constats_presence: [] })
    const n = await ecrireConstats(sb, ENT, [
      constat({ etat: 'present', valeur: '  ' }),
      constat({ etat: 'absent' }),
    ])
    expect(n).toBe(1)
    expect((ecrits[0].lignes as unknown[]).length).toBe(1)
  })

  it('n’écrit rien du tout plutôt qu’un insert vide', async () => {
    const { sb, ecrits } = client({ constats_presence: [] })
    expect(await ecrireConstats(sb, ENT, [])).toBe(0)
    expect(ecrits).toHaveLength(0)
  })
})

describe('poserProchaineEtape', () => {
  const ligne = (over: Partial<LigneFile> = {}): LigneFile => ({
    id: 1,
    passeId: 'p',
    entrepriseId: ENT,
    statut: 'en_cours',
    outil: null,
    lieu: null,
    tentes: [],
    motif: null,
    dossier: {},
    tentatives: 1,
    ...over,
  })
  const faits = (over: Partial<Parameters<typeof poserProchaineEtape>[2]> = {}) => ({
    entrepriseId: ENT,
    nom: 'SARL Martin',
    ville: 'Dijon',
    siret: null,
    placeId: null,
    url: null,
    candidats: 0,
    constats: {},
    ...over,
  })

  it('pose l’outil et son lieu, et rend la ligne à la file', async () => {
    const { sb, ecrits } = client({ lissage_leads: [] })
    const apres = await poserProchaineEtape(sb, ligne(), faits(), PLAN_DEFAUT)
    expect(apres.statut).toBe('a_faire')
    expect(apres.outil).toBe('resolution-siret')
    expect(apres.lieu).toBe('serveur')
    // La réclamation est relâchée : sinon la ligne serait posée mais tenue.
    expect(ecrits[0].lignes).toMatchObject({ reclame_par: null, reclame_le: null })
  })

  it('écrit un motif en toutes lettres quand plus rien ne peut prendre la ligne', async () => {
    const { sb } = client({ lissage_leads: [] })
    // Sans nom ni ville, aucun outil d'identité n'a de prise, et le plan n'a
    // pas d'autre porte d'entrée.
    const apres = await poserProchaineEtape(
      sb,
      ligne(),
      faits({ nom: null, ville: null }),
      PLAN_DEFAUT,
    )
    expect(apres.statut).toBe('sans_prise')
    expect(apres.motif).toContain('nom_et_ville')
  })

  it('dit « complet » quand tous les sujets du plan sont tranchés', async () => {
    const { sb } = client({ lissage_leads: [] })
    const tranche = { etat: 'absent' as const, confiance: 'haute' as const }
    const apres = await poserProchaineEtape(
      sb,
      ligne(),
      faits({
        constats: {
          identite: tranche,
          rge: tranche,
          fiche_google: tranche,
          site_web: tranche,
        },
      }),
      PLAN_DEFAUT,
    )
    expect(apres.statut).toBe('complet')
    expect(apres.motif).toBe('tous les sujets du plan sont tranchés')
  })
})

describe('enregistrerResultat', () => {
  const ligne: LigneFile = {
    id: 1,
    passeId: 'p',
    entrepriseId: ENT,
    statut: 'en_cours',
    outil: 'dossier-web',
    lieu: 'local',
    tentes: [],
    motif: null,
    dossier: { candidats: ['a'] },
    tentatives: 1,
  }

  // LE TEST QUI EMPÊCHE LA FILE DE TOURNER EN ROND. Un outil qui n'a rien
  // conclu doit quand même entrer dans `tentes` : le relancer sur la même fiche
  // redonnerait le même silence, indéfiniment, en ayant l'air de travailler.
  it('range l’outil dans les tentés même quand il n’a rien rendu', async () => {
    const { sb, ecrits } = client({ lissage_leads: [] })
    await enregistrerResultat(sb, ligne, { outil: 'dossier-web', erreur: 'CAPTCHA' })
    expect(ecrits[0].lignes).toMatchObject({ tentes: ['dossier-web'], motif: 'CAPTCHA' })
  })

  it('fusionne le dossier au lieu de l’écraser', async () => {
    const { sb, ecrits } = client({ lissage_leads: [] })
    await enregistrerResultat(sb, ligne, { outil: 'verifier-sites', dossier: { sonde: 200 } })
    expect((ecrits[0].lignes as { dossier: unknown }).dossier).toEqual({
      candidats: ['a'],
      sonde: 200,
    })
  })

  it('ne range pas deux fois le même outil', async () => {
    const { sb, ecrits } = client({ lissage_leads: [] })
    await enregistrerResultat(sb, { ...ligne, tentes: ['dossier-web'] }, { outil: 'dossier-web' })
    expect(ecrits[0].lignes).toMatchObject({ tentes: ['dossier-web'] })
  })
})

describe('planDe', () => {
  it('complète un plan partiel par les défauts', () => {
    expect(planDe({ exigence: 'certaine' })).toEqual({ ...PLAN_DEFAUT, exigence: 'certaine' })
  })

  it('écarte un sujet inconnu plutôt que de le laisser traverser', () => {
    expect(planDe({ sujets: ['site_web', 'astrologie'] }).sujets).toEqual(['site_web'])
  })

  it('retombe sur le plan par défaut si le jsonb ne contient rien d’exploitable', () => {
    expect(planDe({ sujets: [] })).toEqual(PLAN_DEFAUT)
    expect(planDe(null)).toEqual(PLAN_DEFAUT)
  })
})

describe('les candidats d’identité viennent de la TABLE, pas du dossier', () => {
  it('les compte depuis entreprise_siret_candidats', async () => {
    // La première version les déposait dans `lissage_leads.dossier` : une
    // SECONDE liste de candidats SIRET, à côté de celle qui existait depuis le
    // 08/08 avec son score et ses rejets. Deux listes finissent par se
    // contredire, et ici la contradiction s'écrit en SIRET faux.
    const f = await faitsDe({
      entreprise_siret_candidats: [{ entreprise_id: ENT }, { entreprise_id: ENT }],
    })
    expect(f.candidatsIdentite).toBe(2)
  })

  it('vaut zéro quand rien n’attend — pas undefined', async () => {
    expect((await faitsDe({})).candidatsIdentite).toBe(0)
  })
})

describe('reclamerLot — le lieu se filtre EN BASE, jamais après coup', () => {
  it('transmet le filtre de lieu à PostgREST', async () => {
    // LA RÉGRESSION QUE CE TEST GARDE. La première version lisait `limit()`
    // lignes triées par id puis écartait les mauvais lieux en mémoire. Or une
    // ligne posée sur une étape locale reste `a_faire` et garde son id — et ce
    // sont les PREMIÈRES traitées, donc celles aux id les plus bas. Elles
    // saturaient la fenêtre et le tick ne voyait plus rien d'autre.
    //
    // Mesuré le 20/08 sur la passe « Premier test » : 19 lignes restantes, les
    // 19 en attente du poste local, ids 101 à 119. Le tick rendait `prises: 0`
    // indéfiniment — « j'ai beau appuyer, ça bloque ».
    const { sb, filtres } = client({ lissage_leads: [] })
    await reclamerLot(sb, { lieux: [null, 'serveur'], par: 'test', taille: 20 })
    const or = filtres.find((f) => f.methode === 'or')
    expect(or?.argument).toBe('lieu.is.null,lieu.eq.serveur')
  })

  it('demande le seul lieu local quand c’est l’exécuteur local qui réclame', async () => {
    const { sb, filtres } = client({ lissage_leads: [] })
    await reclamerLot(sb, { lieux: ['local'], par: 'local:test', taille: 5 })
    expect(filtres.find((f) => f.methode === 'or')?.argument).toBe('lieu.eq.local')
  })
})

describe('rejouerPasse — une découverte en entraîne une autre', () => {
  it('ne rouvre QUE ce qui est sorti sans être tranché, et oublie les outils tentés', async () => {
    // Une ligne sortie « sans prise » faute de SIRET n'y revenait jamais, même
    // une fois le SIRET tranché à l'écran. Et un outil entré dans `tentes`
    // n'était plus jamais rappelé — alors que ce qui lui manquait est peut-être
    // arrivé depuis (un code postal, une commune, des candidats).
    const { sb, ecrits } = client({ lissage_leads: [{ id: 1 }] })
    await rejouerPasse(sb, 'p1')
    expect(ecrits[0].lignes).toMatchObject({
      statut: 'a_faire',
      tentes: [],
      outil: null,
      lieu: null,
      motif: null,
      tentatives: 0,
    })
  })
})

describe('libererEtapeHumaine', () => {
  const ligneHumaine = { id: 9, tentes: [] }

  it('range l’outil dans les tentés et rend la ligne à la file', async () => {
    // Le tick serveur ne réclame que `null` et `serveur` : sans cette
    // libération, une fiche tranchée à l'écran resterait « attend une
    // relecture » pour toujours, sur une relecture déjà faite.
    const { sb, ecrits } = client({ lissage_leads: [ligneHumaine] })
    expect(await libererEtapeHumaine(sb, ENT, 'choix-siret')).toBe(1)
    expect(ecrits[0].lignes).toMatchObject({
      statut: 'a_faire',
      tentes: ['choix-siret'],
      outil: null,
      lieu: null,
      reclame_par: null,
    })
  })

  it('n’inscrit pas deux fois le même outil', async () => {
    const { sb, ecrits } = client({ lissage_leads: [{ id: 9, tentes: ['choix-siret'] }] })
    await libererEtapeHumaine(sb, ENT, 'choix-siret')
    expect((ecrits[0].lignes as { tentes: string[] }).tentes).toEqual(['choix-siret'])
  })

  it('porte le motif quand la décision n’a rien retenu', async () => {
    const { sb, ecrits } = client({ lissage_leads: [ligneHumaine] })
    await libererEtapeHumaine(sb, ENT, 'choix-siret', 'aucun candidat retenu')
    expect(ecrits[0].lignes).toMatchObject({ motif: 'aucun candidat retenu' })
  })
})

describe('candidatsDeLaFile', () => {
  it('compte un tableau, accepte un nombre, et ne suppose rien du reste', () => {
    const l = (id: number, dossier: Record<string, unknown>): LigneFile => ({
      id,
      passeId: 'p',
      entrepriseId: id,
      statut: 'a_faire',
      outil: null,
      lieu: null,
      tentes: [],
      motif: null,
      dossier,
      tentatives: 0,
    })
    const m = candidatsDeLaFile([
      l(1, { candidats: ['a', 'b'] }),
      l(2, { candidats: 5 }),
      l(3, {}),
      l(4, { candidats: 'oui' }),
    ])
    expect([...m]).toEqual([
      [1, 2],
      [2, 5],
      [3, 0],
      [4, 0],
    ])
  })
})
