import {
  CORPUS,
  composerMessage,
  composerReponse,
  nouvelleReference,
  prenom,
} from '../contenu'

/** Une suite d'aléas déterministe, qui boucle. */
function suite(valeurs: number[]): () => number {
  let i = 0
  return () => valeurs[i++ % valeurs.length]
}

const QUI = {
  nomExpediteur: 'Matteo Salmi',
  emailExpediteur: 'contact@samadigitalstudio.fr',
  nomDestinataire: 'Claire Petit',
  emailDestinataire: 'claire.petit@orange.fr',
}

describe('le corpus', () => {
  const tout = [
    ...CORPUS.OUVERTURES, ...CORPUS.OBJETS, ...CORPUS.CORPS,
    ...CORPUS.SUITES, ...CORPUS.CLOTURES, ...CORPUS.REPONSES,
  ]

  it('ne contient aucun lien — un message de chauffe n\'a rien à vendre', () => {
    for (const f of tout) {
      expect(f).not.toMatch(/https?:\/\//i)
      expect(f).not.toMatch(/www\./i)
      expect(f).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i)
    }
  })

  it('ne contient aucun mot de démarchage', () => {
    const pieges = /gratuit|promo|offre|cliquez|urgent|félicitations|garanti|devis|remise/i
    for (const f of tout) expect(f).not.toMatch(pieges)
  })

  it('porte la combinatoire annoncée — rogner le corpus doit casser ce test', () => {
    const textes =
      CORPUS.OUVERTURES.length * CORPUS.OBJETS.length *
      CORPUS.CORPS.length * CORPUS.SUITES.length * CORPUS.CLOTURES.length
    expect(textes).toBeGreaterThanOrEqual(109_760)
    // Quatre bascules de structure : salutation, ouverture, suite, clôture.
    expect(textes * 2 ** 4).toBeGreaterThan(1_000_000)
  })
})

describe('prenom', () => {
  it('prend le premier mot du nom d\'affichage', () => {
    expect(prenom('Claire Petit', 'x@y.fr')).toBe('Claire')
  })

  it('retombe sur la partie locale quand le nom manque', () => {
    expect(prenom('', 'jean-luc@free.fr')).toBe('Jean')
    expect(prenom('   ', 'contact@orange.fr')).toBe('Contact')
  })
})

describe('composerMessage', () => {
  it('ne laisse jamais passer de lien, même sur mille tirages', () => {
    for (let i = 0; i < 1000; i++) {
      const m = composerMessage(QUI)
      expect(m.texte).not.toMatch(/https?:|www\.|@[a-z]+\.[a-z]{2,}/i)
    }
  })

  it('fait basculer les QUATRE variantes de structure, dans les deux sens', () => {
    // Une bascule qui ne bascule jamais est une constante déguisée : chacune
    // doit se voir présente ET absente sur cinq cents tirages.
    const compte = { salutation: 0, ouverture: 0, suite: 0, cloture: 0 }
    for (let i = 0; i < 500; i++) {
      const t = composerMessage(QUI).texte
      if (t.startsWith('Bonjour Claire,')) compte.salutation++
      if (CORPUS.OUVERTURES.some((o) => t.includes(`${o}. `))) compte.ouverture++
      if (CORPUS.SUITES.some((s) => t.includes(s))) compte.suite++
      if (CORPUS.CLOTURES.some((c) => t.includes(`${c},`))) compte.cloture++
    }
    for (const [nom, n] of Object.entries(compte)) {
      expect({ [nom]: n > 0 && n < 500 }).toEqual({ [nom]: true })
    }
  })

  it('produit des textes massivement distincts', () => {
    const vus = new Set<string>()
    for (let i = 0; i < 500; i++) vus.add(composerMessage(QUI).texte)
    expect(vus.size).toBeGreaterThan(400)
  })

  it('signe du prénom de l\'expéditeur et salue le destinataire', () => {
    // alea = 0 : salutation oui, ouverture oui, clôture oui, premiers fragments.
    const m = composerMessage(QUI, suite([0]))
    expect(m.texte).toContain('Bonjour Claire,')
    expect(m.texte).toContain('Matteo')
  })

  it('garde la référence HORS du texte — c\'est le gabarit qui se repère', () => {
    const m = composerMessage(QUI)
    expect(m.reference).toMatch(/^[0-9a-f]{12}$/)
    expect(m.texte).not.toContain(m.reference)
    expect(m.objet).not.toContain(m.reference)
  })
})

describe('composerReponse', () => {
  it('préfixe l\'objet une seule fois', () => {
    expect(composerReponse(QUI, 'point rapide').objet).toBe('Re: point rapide')
    expect(composerReponse(QUI, 'Re: point rapide').objet).toBe('Re: point rapide')
    expect(composerReponse(QUI, 're: le dossier').objet).toBe('re: le dossier')
  })

  it('reste court — une réponse de courtoisie ne fait pas trois paragraphes', () => {
    for (let i = 0; i < 200; i++) {
      expect(composerReponse(QUI, 'planning').texte.length).toBeLessThan(160)
    }
  })
})

describe('nouvelleReference', () => {
  it('rend douze caractères hexadécimaux', () => {
    expect(nouvelleReference(suite([0]))).toBe('000000000000')
    expect(nouvelleReference(suite([0.99]))).toBe('ffffffffffff')
  })

  it('ne se répète pas', () => {
    const vues = new Set<string>()
    for (let i = 0; i < 2000; i++) vues.add(nouvelleReference())
    expect(vues.size).toBe(2000)
  })
})
