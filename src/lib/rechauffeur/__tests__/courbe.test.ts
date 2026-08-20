import {
  coefficientDuJour,
  creneauxDuJour,
  delaiDeReponseMs,
  jourDeChauffe,
  palierDuJour,
} from '../courbe'

describe('palierDuJour', () => {
  // La progression doit être RÉGULIÈRE : jamais d'escalier. Un expéditeur qui
  // passe de 4 à 40 messages du jour au lendemain se fait remarquer.
  it('monte sans jamais sauter de marche', () => {
    const suite = Array.from({ length: 30 }, (_, i) => palierDuJour(i + 1, 40).chauffe)
    for (let i = 1; i < suite.length; i++) {
      expect(suite[i]).toBeGreaterThanOrEqual(suite[i - 1])
      expect(suite[i] - suite[i - 1]).toBeLessThanOrEqual(2)
    }
  })

  it('suit les paliers annoncés', () => {
    expect(palierDuJour(1, 40).chauffe).toBe(4)
    expect(palierDuJour(3, 40).chauffe).toBe(4)
    expect(palierDuJour(4, 40).chauffe).toBe(6)
    expect(palierDuJour(7, 40).chauffe).toBe(12)
    expect(palierDuJour(8, 40).chauffe).toBe(14)
  })

  it('ne dépasse jamais la cible', () => {
    for (const jour of [20, 28, 29, 100]) {
      expect(palierDuJour(jour, 20).chauffe).toBeLessThanOrEqual(20)
    }
    expect(palierDuJour(60, 40).chauffe).toBe(40)
  })

  // LA PROSPECTION NE S'OUVRE QU'À J+8, et plus lentement que la chauffe : on
  // ne remplace pas du volume dont on mesure le placement par du volume inconnu.
  it('n’ouvre la prospection qu’au huitième jour, et derrière la chauffe', () => {
    for (const jour of [1, 5, 7]) expect(palierDuJour(jour, 40).froid).toBe(0)
    expect(palierDuJour(8, 40).froid).toBe(2)

    for (let jour = 8; jour <= 28; jour++) {
      const p = palierDuJour(jour, 40)
      expect(p.froid).toBeLessThan(p.chauffe)
    }
  })

  it('rend zéro avant le premier jour', () => {
    expect(palierDuJour(0, 40)).toEqual({ chauffe: 0, froid: 0 })
    expect(palierDuJour(-3, 40)).toEqual({ chauffe: 0, froid: 0 })
  })
})

describe('coefficientDuJour', () => {
  // Une boîte qui garde le même débit sept jours sur sept ne ressemble à
  // aucune entreprise — mais une boîte totalement muette le week-end est un
  // motif elle aussi. Jamais zéro, donc.
  it('lève le pied le week-end sans jamais s’arrêter tout à fait', () => {
    const dimanche = new Date('2026-08-16T10:00:00Z')
    const samedi = new Date('2026-08-15T10:00:00Z')
    const mardi = new Date('2026-08-18T10:00:00Z')

    expect(coefficientDuJour(dimanche)).toBe(0.15)
    expect(coefficientDuJour(samedi)).toBe(0.4)
    expect(coefficientDuJour(mardi)).toBe(1)
    expect(coefficientDuJour(dimanche)).toBeGreaterThan(0)
  })
})

describe('jourDeChauffe', () => {
  it('compte le premier jour comme le jour 1', () => {
    expect(jourDeChauffe('2026-08-19', new Date('2026-08-19T14:00:00Z'))).toBe(1)
    expect(jourDeChauffe('2026-08-19', new Date('2026-08-20T02:00:00Z'))).toBe(2)
  })

  it('rend zéro quand la chauffe n’a jamais démarré', () => {
    expect(jourDeChauffe(null, new Date())).toBe(0)
    expect(jourDeChauffe('pas une date', new Date())).toBe(0)
  })
})

describe('creneauxDuJour', () => {
  const jour = new Date('2026-08-19T00:00:00Z')
  // Un aléa déterministe : le test porte sur la RÉPARTITION, pas sur le hasard.
  const enSuite = (valeurs: number[]) => {
    let i = 0
    return () => valeurs[i++ % valeurs.length]
  }

  it('rend autant de créneaux que demandé, dans l’ordre', () => {
    const c = creneauxDuJour(6, jour, 'Europe/Paris', { de: 8, a: 19 }, enSuite([0.5]))
    expect(c).toHaveLength(6)
    for (let i = 1; i < c.length; i++) {
      expect(c[i].getTime()).toBeGreaterThan(c[i - 1].getTime())
    }
  })

  it('tient dans la fenêtre horaire locale', () => {
    const c = creneauxDuJour(10, jour, 'Europe/Paris', { de: 8, a: 19 }, enSuite([0, 1]))
    // `format()` en fr-FR rend « 08 h » : on lit la partie, pas la chaîne.
    const fmt = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })
    const heures = c.map((d) =>
      Number(fmt.formatToParts(d).find((p) => p.type === 'hour')?.value),
    )
    for (const h of heures) {
      expect(h).toBeGreaterThanOrEqual(8)
      expect(h).toBeLessThan(19)
    }
  })

  // LA CADENCE DOIT ÊTRE IRRÉGULIÈRE : un intervalle constant est la signature
  // d'un automate, et c'est ce qui se repère avant le volume.
  it('n’espace jamais deux envois du même intervalle', () => {
    const c = creneauxDuJour(8, jour, 'Europe/Paris', { de: 8, a: 19 }, enSuite([0.1, 0.9, 0.3, 0.7]))
    const ecarts = c.slice(1).map((d, i) => d.getTime() - c[i].getTime())
    expect(new Set(ecarts).size).toBeGreaterThan(1)
  })

  it('ne rend rien quand il n’y a rien à envoyer', () => {
    expect(creneauxDuJour(0, jour, 'Europe/Paris')).toEqual([])
    expect(creneauxDuJour(-2, jour, 'Europe/Paris')).toEqual([])
  })
})

describe('delaiDeReponseMs', () => {
  // Beaucoup de réponses rapides, une longue traîne : la forme observée chez
  // de vrais gens. Une réponse en trente secondes, ou toujours au bout d’une
  // heure pile, se repère.
  it('reste entre douze minutes et sept heures', () => {
    for (const a of [0, 0.25, 0.5, 0.75, 1]) {
      const ms = delaiDeReponseMs(() => a)
      expect(ms).toBeGreaterThanOrEqual(12 * 60_000 - 1)
      expect(ms).toBeLessThanOrEqual(7 * 3_600_000 + 1)
    }
  })

  it('penche vers les délais courts — la médiane est sous deux heures', () => {
    expect(delaiDeReponseMs(() => 0.5)).toBeLessThan(2 * 3_600_000)
  })
})
