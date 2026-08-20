import {
  OUTILS,
  PLAN_DEFAUT,
  natureDuSujet,
  nomDeSelection,
  couverture,
  estArret,
  prealableTenu,
  prochaineEtape,
  resteATrancher,
  sujetRegle,
  type FaitsDuProspect,
  type PlanPasse,
} from '@/lib/lissage/passe'
import { BOTS } from '@/lib/architecture/bots'

const nu = (over: Partial<FaitsDuProspect> = {}): FaitsDuProspect => ({
  entrepriseId: 1,
  nom: 'Toiture Martin',
  ville: 'Angers',
  codePostal: '49000',
  siret: null,
  placeId: null,
  url: null,
  constats: {},
  ...over,
})

describe('le catalogue ne fabrique aucun outil', () => {
  it('chaque outil pointe une entrée RÉELLE du registre des bots', () => {
    // La règle du projet : on ne crée pas un bot sans son entrée. La réciproque
    // vaut — on ne fabrique pas ici un outil qui n'existerait pas là-bas.
    const connus = new Set(BOTS.map((b) => b.id))
    for (const o of OUTILS) expect(connus.has(o.id)).toBe(true)
  })

  it('déclare le même lieu d’exécution que le registre', () => {
    const parId = new Map(BOTS.map((b) => [b.id, b]))
    for (const o of OUTILS) {
      const bot = parId.get(o.id)!
      if (o.lieu === 'local') expect(bot.execution).toBe('script-local')
      if (o.lieu === 'serveur') expect(['route-api', 'edge-function', 'cron']).toContain(bot.execution)
    }
  })

  it('déclare la même écriture en base que le registre', () => {
    const parId = new Map(BOTS.map((b) => [b.id, b]))
    // C'est la question la plus importante du registre : `false` = relançable
    // sans conséquence, `true` = archiver avant.
    for (const o of OUTILS) expect(o.ecrit).toBe(parId.get(o.id)!.ecrit)
  })
})

describe('trois états, et « inconnu » n’est jamais une réponse', () => {
  it('un sujet présent avec assez de confiance est réglé', () => {
    const f = nu({ constats: { rge: { etat: 'present', confiance: 'certaine' } } })
    expect(sujetRegle(f, 'rge', 'moyenne')).toBe(true)
  })

  it('« il n’en a pas » est un RÉSULTAT : le sujet est réglé', () => {
    const f = nu({ constats: { site_web: { etat: 'absent', confiance: 'haute' } } })
    expect(sujetRegle(f, 'site_web', 'moyenne')).toBe(true)
  })

  it('« on ne sait pas » n’est JAMAIS réglé, même en confiance certaine', () => {
    // Un `inconnu` certain voudrait dire « je suis sûr de ne pas savoir » : une
    // information, pas une réponse.
    const f = nu({ constats: { site_web: { etat: 'inconnu', confiance: 'certaine' } } })
    expect(sujetRegle(f, 'site_web', 'moyenne')).toBe(false)
  })

  it('une confiance sous l’exigence laisse le sujet ouvert', () => {
    const f = nu({ constats: { site_web: { etat: 'present', confiance: 'faible' } } })
    expect(sujetRegle(f, 'site_web', 'moyenne')).toBe(false)
    expect(sujetRegle(f, 'site_web', 'faible')).toBe(true)
  })

  it('l’absence de constat n’est pas un « absent »', () => {
    expect(sujetRegle(nu(), 'site_web', 'faible')).toBe(false)
  })
})

describe('l’ordre de la file suit ce qu’on a déjà appris', () => {
  it('attaque l’identité d’abord — c’est elle qui donne le SIRET', () => {
    const e = prochaineEtape(nu(), PLAN_DEFAUT)
    expect(estArret(e)).toBe(false)
    if (!estArret(e)) {
      expect(e.sujet).toBe('identite')
      expect(e.outil.id).toBe('resolution-siret')
    }
  })

  it('ne propose pas l’ADEME tant que le SIRET manque — l’appel serait perdu', () => {
    const f = nu({ constats: { identite: { etat: 'absent', confiance: 'haute' } } })
    const e = prochaineEtape(f, PLAN_DEFAUT)
    if (!estArret(e)) expect(e.outil.id).not.toBe('ademe-rge')
  })

  it('propose l’ADEME dès que le SIRET est là', () => {
    const f = nu({
      siret: '12345678900011',
      constats: { identite: { etat: 'present', confiance: 'certaine' } },
    })
    const e = prochaineEtape(f, PLAN_DEFAUT)
    if (!estArret(e)) expect(e.outil.id).toBe('ademe-rge')
  })

  it('consulte la fiche Google AVANT de chercher le site', () => {
    // La fiche déclare souvent le site : la lire d'abord évite une recherche
    // entière, et le registre le dit.
    const f = nu({
      siret: '1',
      placeId: 'ChIJxxx',
      constats: {
        identite: { etat: 'present', confiance: 'certaine' },
        rge: { etat: 'absent', confiance: 'certaine' },
      },
    })
    const e = prochaineEtape(f, PLAN_DEFAUT)
    if (!estArret(e)) expect(e.sujet).toBe('fiche_google')
  })

  it('finit par le site, le seul sujet qui demande un jugement humain', () => {
    const f = nu({
      siret: '1',
      constats: {
        identite: { etat: 'present', confiance: 'certaine' },
        rge: { etat: 'absent', confiance: 'certaine' },
        fiche_google: { etat: 'absent', confiance: 'haute' },
      },
    })
    const e = prochaineEtape(f, PLAN_DEFAUT)
    if (!estArret(e)) expect(e.sujet).toBe('site_web')
  })
})

describe('la passe est relançable sans conséquence', () => {
  const tout: FaitsDuProspect = nu({
    siret: '1',
    constats: {
      identite: { etat: 'present', confiance: 'certaine' },
      rge: { etat: 'absent', confiance: 'certaine' },
      fiche_google: { etat: 'present', confiance: 'haute' },
      site_web: { etat: 'absent', confiance: 'certaine' },
    },
  })

  it('ne relance rien quand tout est réglé, et le dit', () => {
    const e = prochaineEtape(tout, PLAN_DEFAUT)
    expect(e).toEqual({ motif: 'complet', restants: [], manques: [] })
  })

  it('ne relance pas un outil déjà tenté sur ce prospect', () => {
    // Sans ça, un outil qui rend « inconnu » — CAPTCHA, API muette — serait
    // relancé indéfiniment et la file tournerait en rond en ayant l'air de
    // travailler.
    const f = nu({ constats: { identite: { etat: 'inconnu', confiance: 'faible' } } })
    const premier = prochaineEtape(f, PLAN_DEFAUT)
    expect(estArret(premier)).toBe(false)
    const second = prochaineEtape(f, PLAN_DEFAUT, ['recherche-entreprises'])
    if (!estArret(second)) expect(second.outil.id).not.toBe('recherche-entreprises')
  })
})

describe('quand plus rien ne peut prendre, on le DIT', () => {
  // UN OUTIL PEUT RÉPONDRE À DEUX QUESTIONS. Le dossier web interroge l'API
  // Places et cherche le site dans le même passage : lui faire porter un seul
  // sujet obligeait à jeter un de ses deux verdicts, et laissait la fiche
  // Google sans aucun outil dès qu'on n'avait pas déjà le place_id.
  it('propose le dossier web pour la fiche Google quand aucun place_id n’est connu', () => {
    const e = prochaineEtape(
      nu({
        constats: {
          identite: { etat: 'present', confiance: 'certaine' },
          rge: { etat: 'absent', confiance: 'certaine' },
        },
      }),
      PLAN_DEFAUT,
    )
    expect(estArret(e)).toBe(false)
    if (!estArret(e)) {
      expect(e.sujet).toBe('fiche_google')
      expect(e.outil.id).toBe('dossier-web')
    }
  })

  it('nomme les sujets restants et ce qui manque pour reprendre', () => {
    const f = nu({ nom: null, ville: null })
    const e = prochaineEtape(f, PLAN_DEFAUT)
    expect(estArret(e)).toBe(true)
    if (estArret(e)) {
      expect(e.motif).toBe('sans_prise')
      expect(e.restants).toEqual(['identite', 'rge', 'fiche_google', 'site_web'])
      // Sans nom ni ville on ne peut rien lancer : c'est ça qu'il faut aller
      // chercher, et l'écran doit pouvoir le dire.
      expect(e.manques).toContain('nom_et_ville')
      expect(e.manques).toContain('siret')
    }
  })

  it('respecte le refus des outils facturés', () => {
    const sansFacture: PlanPasse = { ...PLAN_DEFAUT, facture: false }
    const f = nu({
      siret: '1',
      placeId: 'ChIJxxx',
      constats: {
        identite: { etat: 'present', confiance: 'certaine' },
        rge: { etat: 'absent', confiance: 'certaine' },
      },
    })
    const e = prochaineEtape(f, sansFacture)
    // `refresh-google-stats` et `dossier-web` sont facturés ; il ne reste que
    // le vérificateur, qui exige une URL qu'on n'a pas.
    expect(estArret(e)).toBe(true)
  })

  it('respecte le refus des étapes locales', () => {
    const sansLocal: PlanPasse = { ...PLAN_DEFAUT, local: false }
    const f = nu({
      siret: '1',
      url: 'https://toituremartin.fr',
      constats: {
        identite: { etat: 'present', confiance: 'certaine' },
        rge: { etat: 'absent', confiance: 'certaine' },
        fiche_google: { etat: 'absent', confiance: 'haute' },
      },
    })
    const e = prochaineEtape(f, sansLocal)
    if (!estArret(e)) expect(e.outil.lieu).not.toBe('local')
  })
})

describe('la couverture partitionne la population', () => {
  const pop: FaitsDuProspect[] = [
    nu({ entrepriseId: 1, constats: { site_web: { etat: 'present', confiance: 'certaine' } } }),
    nu({ entrepriseId: 2, constats: { site_web: { etat: 'absent', confiance: 'haute' } } }),
    nu({ entrepriseId: 3, constats: { site_web: { etat: 'inconnu', confiance: 'faible' } } }),
    nu({ entrepriseId: 4 }),
    nu({ entrepriseId: 5 }),
  ]

  it('compte chaque prospect une fois et une seule', () => {
    const [c] = couverture(pop, ['site_web'])
    expect(c).toMatchObject({ present: 1, absent: 1, inconnu: 1, jamais_regarde: 2 })
    expect(c.present + c.absent + c.inconnu + c.jamais_regarde).toBe(pop.length)
  })

  it('sépare « on a regardé sans conclure » de « personne n’a regardé »', () => {
    // Deux travaux différents : le premier demande un autre outil, le second
    // demande juste de lancer une passe. Les fondre donne un chiffre sur lequel
    // on ne sait pas quoi faire.
    const [c] = couverture(pop, ['site_web'])
    expect(c.inconnu).toBe(1)
    expect(c.jamais_regarde).toBe(2)
  })

  it('rend une ligne par sujet demandé, même vide', () => {
    expect(couverture([], ['identite', 'rge'])).toHaveLength(2)
  })
})

describe('prealableTenu', () => {
  it('exige le nom ET la ville — le nom seul ramène la France entière', () => {
    expect(prealableTenu(nu({ ville: null }), 'nom_et_ville')).toBe(false)
    expect(prealableTenu(nu(), 'nom_et_ville')).toBe(true)
  })

  it('ne prend pas une chaîne d’espaces pour une valeur', () => {
    expect(prealableTenu(nu({ siret: '   ' }), 'siret')).toBe(false)
  })
})

describe('l’identité : chercher, trancher, hydrater — et jamais l’un pour l’autre', () => {
  it('NE CHERCHE PAS une identité pour une fiche qui a déjà son SIRET', () => {
    // LA RÉGRESSION QUE CE TEST GARDE. `resolution-siret` n'exigeait que
    // `nom_et_ville` : toute fiche ayant un nom et une commune le déclenchait,
    // y compris les 57 801 qui portent déjà un SIRET. Un appel à l'annuaire par
    // fiche, pour reproposer une identité déjà écrite — et la file avait l'air
    // de travailler. Ce qu'il faut à une fiche qui a son SIRET, c'est
    // l'hydratation.
    const e = prochaineEtape(nu({ siret: '12345678900012' }), PLAN_DEFAUT)
    expect(estArret(e)).toBe(false)
    if (!estArret(e)) expect(e.outil.id).toBe('donnees-publiques')
  })

  it('tente D’ABORD de trancher sans humain quand un candidat attend', () => {
    // Ce qui peut se décider sur la règle des quatre critères ne doit jamais
    // arriver dans un écran : 72 fiches sur 210 sont dans ce cas, et les y
    // laisser use l'attention qu'il faut garder pour les 138 autres.
    const e = prochaineEtape(nu({ candidatsIdentite: 3 }), PLAN_DEFAUT)
    expect(estArret(e)).toBe(false)
    if (!estArret(e)) {
      expect(e.outil.id).toBe('identite-evidente')
      expect(e.outil.lieu).toBe('serveur')
    }
  })

  it('passe la main à l’écran quand la règle automatique a déjà renoncé', () => {
    // `identite-evidente` n'écrit rien quand ce n'est pas évident, mais il
    // entre dans `tentes` comme tout outil lancé — c'est ce qui fait passer la
    // ligne à l'étape humaine au tour suivant, au lieu de la faire boucler.
    const e = prochaineEtape(nu({ candidatsIdentite: 3 }), PLAN_DEFAUT, ['identite-evidente'])
    expect(estArret(e)).toBe(false)
    if (!estArret(e)) {
      expect(e.outil.id).toBe('choix-siret')
      expect(e.outil.lieu).toBe('humain')
    }
  })

  it('trancher passe AVANT chercher : on ne repaye pas une recherche déjà rendue', () => {
    // Des candidats proposés le 08/08 attendent encore. Relancer l'annuaire
    // dessus, c'est repayer pour reproposer ce qui attend déjà une décision.
    const e = prochaineEtape(nu({ candidatsIdentite: 1 }), PLAN_DEFAUT)
    if (!estArret(e)) expect(e.outil.id).not.toBe('resolution-siret')
  })

  it('ne confond pas un candidat d’identité avec un candidat de site', () => {
    // Un compteur unique envoyait relire le SITE d'un prospect à qui l'annuaire
    // avait proposé trois SIRET. Deux familles, deux préalables.
    const f = nu({
      siret: '12345678900012',
      candidatsIdentite: 3,
      constats: {
        identite: { etat: 'present', confiance: 'certaine' },
        rge: { etat: 'absent', confiance: 'certaine' },
        fiche_google: { etat: 'absent', confiance: 'haute' },
      },
    })
    const e = prochaineEtape(f, { ...PLAN_DEFAUT, local: false })
    expect(estArret(e)).toBe(true)
    if (estArret(e)) expect(e.manques).toContain('candidat_site')
  })
})

describe('natureDuSujet — ce qu’un sujet coûte dépend du plan, pas du sujet', () => {
  const plan = (over: Partial<PlanPasse> = {}): PlanPasse => ({ ...PLAN_DEFAUT, ...over })

  it('marque « facturé » et « local » ensemble quand les deux chemins existent', () => {
    // `fiche_google` a `refresh-google-stats` (serveur, facturé) ET
    // `dossier-web` (local, facturé). Ce ne sont pas des cases qui s'excluent,
    // ce sont deux routes vers la même réponse.
    const n = natureDuSujet('fiche_google', plan())
    expect(n.facture).toBe(true)
    expect(n.local).toBe(true)
    expect(n.impraticable).toBe(false)
  })

  it('DIT qu’un sujet devient impraticable quand on ferme ses deux chemins', () => {
    // LE CAS QU'IL FAUT MONTRER AVANT DE LANCER : sans outils facturés,
    // `fiche_google` perd ses deux seuls outils. La passe partirait quand même
    // et s'arrêterait en `sans_prise` sur TOUTE la population — du travail pour
    // rien, découvert après coup.
    expect(natureDuSujet('fiche_google', plan({ facture: false })).impraticable).toBe(true)
  })

  it('ne marque pas « facturé » un sujet qui a un chemin serveur gratuit', () => {
    const n = natureDuSujet('rge', plan())
    expect(n.gratuitEnLigne).toBe(true)
    expect(n.facture).toBe(false)
    expect(n.local).toBe(false)
  })

  it('signale la relecture humaine de l’identité', () => {
    expect(natureDuSujet('identite', plan()).humain).toBe(true)
  })

  it('retire le marquage local dès que le poste local est refusé', () => {
    const n = natureDuSujet('site_web', plan({ local: false }))
    expect(n.local).toBe(false)
  })
})

describe('resteATrancher', () => {
  it('rend les sujets dans l’ordre du plan', () => {
    expect(resteATrancher(nu(), PLAN_DEFAUT)).toEqual(['identite', 'rge', 'fiche_google', 'site_web'])
  })
})

describe('la relecture humaine n’est proposée que s’il y a quelque chose à relire', () => {
  const presqueFini = (over: Partial<FaitsDuProspect> = {}) =>
    nu({
      siret: '1',
      constats: {
        identite: { etat: 'present', confiance: 'certaine' },
        rge: { etat: 'absent', confiance: 'certaine' },
        fiche_google: { etat: 'absent', confiance: 'haute' },
      },
      ...over,
    })

  it('ne l’envoie pas relire un prospect dont personne n’a rien cherché', () => {
    // Sans ce garde, la file envoyait un écran vide à relire — et l'humain,
    // qui est la ressource la plus rare de la chaîne, y perdait son temps.
    const e = prochaineEtape(presqueFini(), { ...PLAN_DEFAUT, local: false })
    expect(estArret(e)).toBe(true)
    if (estArret(e)) expect(e.manques).toContain('candidat_site')
  })

  it('la propose dès qu’un dossier a monté des candidats', () => {
    const e = prochaineEtape(presqueFini({ candidats: 3 }), { ...PLAN_DEFAUT, local: false })
    expect(estArret(e)).toBe(false)
    if (!estArret(e)) {
      expect(e.outil.id).toBe('appliquer-dossiers')
      expect(e.outil.lieu).toBe('humain')
    }
  })
})

/**
 * LE NOM D'UNE PASSE QU'ON N'A PAS NOMMÉE.
 *
 * Un lot coché dans le pipeline marketing n'a pas de critères à afficher : son
 * nom est la SEULE chose qui permettra de le retrouver dans la liste. Il doit
 * donc porter les trois questions qu'on se posera — d'où, combien, quand — et
 * l'heure doit être celle d'Annecy, pas celle du serveur.
 */
describe('nomDeSelection', () => {
  const QUAND = new Date('2026-08-20T12:32:00Z')

  it('dit la provenance, l’effectif et l’heure', () => {
    expect(nomDeSelection(120, QUAND, 'Pipeline marketing')).toBe(
      'Pipeline marketing — 120 fiches, 20/08 à 14 h 32',
    )
  })

  // LE PIÈGE, ET IL EST RÉEL : Vercel tourne en UTC. Sans fuseau explicite,
  // une passe lancée à 14 h 32 s'appellerait « 12 h 32 » — donc introuvable
  // pour celui qui l'a lancée.
  it('donne l’heure de Paris, pas celle du serveur', () => {
    const nom = nomDeSelection(1, new Date('2026-01-15T23:10:00Z'), 'Sélection')
    expect(nom).toContain('16/01 à 00 h 10')
  })

  it('accorde le singulier', () => {
    expect(nomDeSelection(1, QUAND)).toBe('Sélection — 1 fiche, 20/08 à 14 h 32')
  })
})
