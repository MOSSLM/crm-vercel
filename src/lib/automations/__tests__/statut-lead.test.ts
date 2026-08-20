import {
  ETAGES,
  RANG_ENGAGEMENT,
  engagementDuLead,
  entonnoir,
  estMesure,
  etageDuLead,
  progressionDuLead,
  type Engagement,
  type FaitsEngagement,
  type Progression,
} from '../statut-lead'

describe('progressionDuLead', () => {
  it('sans liste ni inscription, un lead est à lancer', () => {
    expect(progressionDuLead({})).toBe('a_lancer')
  })

  // L'INSCRIPTION PRIME SUR LA LISTE : un prospect inscrit est parti, quoi que
  // sa ligne de liste raconte. L'inverse afficherait « à lancer » à quelqu'un
  // qui reçoit un message ce matin.
  it('l’inscription prime sur la liste', () => {
    const p = progressionDuLead({
      statutListe: 'a_lancer',
      inscription: { status: 'active', nextRunAt: '2026-08-20T09:00:00Z' },
    })
    expect(p).toBe('en_cours')
  })

  it('distingue gelé, en pause et terminé', () => {
    expect(progressionDuLead({ inscription: { status: 'paused' } })).toBe('en_pause')
    expect(
      progressionDuLead({ inscription: { status: 'active', holdReason: 'awaiting_reply' } }),
    ).toBe('gele')
    for (const status of ['finished', 'exited', 'replied']) {
      expect(progressionDuLead({ inscription: { status } })).toBe('termine')
    }
  })

  // Ni réveil, ni motif, ni tâche : l'inscription est enlisée. L'afficher
  // « en cours » est exactement le mensonge qui a laissé 59 inscriptions dormir.
  it('ne dit pas « en cours » d’une inscription que plus rien ne réveille', () => {
    expect(progressionDuLead({ inscription: { status: 'active', nextRunAt: null } })).toBe('gele')
    // Sauf si elle attend une tâche manuelle : là, c'est normal — 33 des 34
    // inscriptions sans réveil du parc sont dans ce cas.
    expect(
      progressionDuLead({ inscription: { status: 'active', nextRunAt: null }, tachesEnAttente: 1 }),
    ).toBe('en_cours')
  })

  // Un écart réparable est une tâche d'enrichissement, pas un refus. Les
  // confondre range 44 prospects sans canal au cimetière.
  it('sépare l’écart réparable de l’écart définitif', () => {
    expect(progressionDuLead({ statutListe: 'ecarte', motifEcart: 'sans_canal' })).toBe('a_preparer')
    expect(progressionDuLead({ statutListe: 'ecarte', motifEcart: 'sans_affaire' })).toBe('a_preparer')
    expect(progressionDuLead({ statutListe: 'ecarte', motifEcart: 'desabonne' })).toBe('ecarte')
    expect(progressionDuLead({ statutListe: 'ecarte', motifEcart: 'a_deja_reagi' })).toBe('ecarte')
  })

  it('dit ce qu’il sait d’une ligne « inscrit » dont l’inscription n’est pas chargée', () => {
    expect(progressionDuLead({ statutListe: 'inscrit' })).toBe('en_cours')
  })
})

describe('engagementDuLead', () => {
  // LA RÈGLE QUI GOUVERNE TOUT : un lead sans mesure n'est pas « pas ouvert »,
  // il est NON MESURÉ. Un zéro et une absence de mesure ne sont pas la même chose.
  it('rien de mesuré n’est pas rien de fait', () => {
    expect(engagementDuLead({})).toBe('non_mesure')
    expect(estMesure(engagementDuLead({}))).toBe(false)
    expect(estMesure(engagementDuLead({ envois: 1 }))).toBe(true)
  })

  it('suit le transport tant que le prospect n’a rien dit', () => {
    expect(engagementDuLead({ envois: 2 })).toBe('envoye')
    expect(engagementDuLead({ envois: 2, remis: true })).toBe('remis')
    expect(engagementDuLead({ envois: 2, remis: true, rebond: true })).toBe('rebond')
  })

  // Notre « ouverture » à nous : un lien à jeton consulté, compté côté serveur.
  // Meilleur qu'un pixel — un humain a cliqué, et la réputation ne paie rien.
  it('compte une vue de lien à jeton comme un signe du prospect', () => {
    expect(engagementDuLead({ envois: 1, remis: true, vuesLiens: 1 })).toBe('vu')
  })

  // Ce que le prospect a fait bat toujours ce que le transport raconte : un
  // rebond ne doit jamais masquer une réponse arrivée par ailleurs.
  it('une réponse l’emporte sur un rebond', () => {
    expect(engagementDuLead({ envois: 3, rebond: true, aRepondu: true })).toBe('repondu')
  })

  it('lit les issues déclarées dans le fil, et ignore « pas de réponse »', () => {
    expect(engagementDuLead({ envois: 1, issues: ['answered'] })).toBe('interesse')
    expect(engagementDuLead({ envois: 1, issues: ['later'] })).toBe('plus_tard')
    expect(engagementDuLead({ envois: 1, issues: ['not_interested'] })).toBe('pas_interesse')
    expect(engagementDuLead({ envois: 1, issues: ['blocked'] })).toBe('desabonne')
    expect(engagementDuLead({ envois: 1, issues: ['no_answer'] })).toBe('envoye')
    expect(engagementDuLead({ envois: 1, issues: ['inconnu'] })).toBe('envoye')
  })

  it('retient le plus décisif quand plusieurs issues cohabitent', () => {
    expect(engagementDuLead({ envois: 1, issues: ['answered', 'not_interested'] })).toBe('pas_interesse')
    expect(engagementDuLead({ envois: 1, aRepondu: true, desabonne: true })).toBe('desabonne')
  })

  it('le rang n’a aucun ex æquo — sinon deux leads identiques s’afficheraient différemment', () => {
    const rangs = Object.values(RANG_ENGAGEMENT)
    expect(new Set(rangs).size).toBe(rangs.length)
  })
})

describe('l’entonnoir est une PARTITION', () => {
  const lead = (progression: Progression, engagement: Engagement) => ({ progression, engagement })

  // C'EST LE GRIEF N° 2, ET IL A SON TEST. Les compteurs du haut de la page
  // Démarchage comptent le même prospect dans « en attente » ET dans
  // « à appeler » : personne ne sait plus combien de gens il y a.
  it('chaque lead est à un seul étage, et la somme égale le total', () => {
    const leads = [
      lead('a_lancer', 'non_mesure'),
      lead('a_preparer', 'non_mesure'),
      lead('ecarte', 'non_mesure'),
      lead('en_cours', 'envoye'),
      lead('en_cours', 'vu'),
      lead('gele', 'repondu'),
      lead('en_cours', 'interesse'),
      lead('termine', 'pas_interesse'),
      lead('en_cours', 'rebond'),
    ]
    const e = entonnoir(leads)
    expect(e.reduce((n, x) => n + x.n, 0)).toBe(leads.length)
    expect(new Set(e.map((x) => x.etage)).size).toBe(e.length)
  })

  it('range chaque combinaison à un étage connu, sans exception', () => {
    const progressions: Progression[] = ['a_preparer', 'a_lancer', 'ecarte', 'en_cours', 'gele', 'en_pause', 'termine']
    const engagements = Object.keys(RANG_ENGAGEMENT) as Engagement[]
    for (const p of progressions) {
      for (const e of engagements) {
        expect(ETAGES).toContain(etageDuLead(p, e))
      }
    }
  })

  it('ce que le prospect a dit passe avant où en est l’envoi', () => {
    // La séquence tourne encore, mais il a refusé : c'est un refus.
    expect(etageDuLead('en_cours', 'pas_interesse')).toBe('refuse')
    expect(etageDuLead('en_cours', 'desabonne')).toBe('refuse')
    // Terminé sans que le prospect ait rien dit : contacté, et rien de plus.
    expect(etageDuLead('termine', 'envoye')).toBe('contacte')
    expect(etageDuLead('gele', 'non_mesure')).toBe('contacte')
  })

  it('n’affiche pas les étages vides', () => {
    const e = entonnoir([lead('a_lancer', 'non_mesure')])
    expect(e.map((x) => x.etage)).toEqual(['a_lancer'])
  })

  it('tient sur une liste vide', () => {
    expect(entonnoir([])).toEqual([])
  })
})

describe('les faits partiels ne cassent rien', () => {
  it('accepte un sac vide sur chaque axe', () => {
    const vide: FaitsEngagement = {}
    expect(() => engagementDuLead(vide)).not.toThrow()
    expect(() => progressionDuLead({})).not.toThrow()
  })
})
