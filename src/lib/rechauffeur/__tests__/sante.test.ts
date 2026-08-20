import { capacite, sante, type Glissant, type Sante } from '../sante'

const glissant = (over: Partial<Glissant> = {}): Glissant => ({
  envoyes: 100, enBoite: 90, enSpam: 10, introuvables: 0, reponses: 30, echecs: 1, ...over,
})

describe('sante', () => {
  // AUCUN PLACEMENT MESURÉ N'EST PAS UN MAUVAIS SCORE — c'est une absence de
  // mesure, et le palier gèle. Même règle que partout ailleurs dans le CRM.
  it('gèle le palier quand rien n’a été mesuré, sans crier au mauvais score', () => {
    const s = sante(glissant({ enBoite: 0, enSpam: 0 }))
    expect(s.verdict).toBe('tenir')
    expect(s.motif).toMatch(/Aucun placement mesuré/)
    expect(s.tauxPlacement).toBe(0)
  })

  it('redescend sous 80 % de placement', () => {
    const s = sante(glissant({ enBoite: 70, enSpam: 30 }))
    expect(s.verdict).toBe('redescendre')
    expect(s.motif).toMatch(/plancher 80/)
  })

  it('redescend aussi quand les échecs d’envoi dérapent, même avec un bon placement', () => {
    const s = sante(glissant({ enBoite: 100, enSpam: 0, echecs: 10 }))
    expect(s.tauxPlacement).toBe(1)
    expect(s.verdict).toBe('redescendre')
    expect(s.motif).toMatch(/Échecs d’envoi/)
  })

  it('ne monte qu’au-dessus de 92 %, et seulement sur assez de mesures', () => {
    expect(sante(glissant({ enBoite: 95, enSpam: 5, echecs: 1 })).verdict).toBe('monter')
    // 90 % : au-dessus du plancher, sous le seuil de montée.
    expect(sante(glissant({ enBoite: 90, enSpam: 10 })).verdict).toBe('tenir')
    // Placement parfait mais quatre mesures : on ne tranche pas sur si peu.
    const peu = sante(glissant({ envoyes: 4, enBoite: 4, enSpam: 0, reponses: 1, echecs: 0 }))
    expect(peu.verdict).toBe('tenir')
    expect(peu.motif).toMatch(/pas assez pour trancher/)
  })

  it('donne un score entre 0 et 100, et jamais un score nu', () => {
    for (const g of [glissant(), glissant({ enBoite: 50, enSpam: 50 }), glissant({ introuvables: 40 })]) {
      const s = sante(g)
      expect(s.score).toBeGreaterThanOrEqual(0)
      expect(s.score).toBeLessThanOrEqual(100)
      expect(s.motif.length).toBeGreaterThan(10)
    }
  })

  it('pénalise les messages introuvables — ni boîte, ni spam, c’est le pire cas', () => {
    const propre = sante(glissant({ introuvables: 0 }))
    const perdus = sante(glissant({ introuvables: 30 }))
    expect(perdus.score).toBeLessThan(propre.score)
  })
})

describe('capacite', () => {
  const bonne: Sante = { score: 95, tauxPlacement: 0.95, tauxReponse: 0.3, tauxEchec: 0.01, verdict: 'monter', motif: '', mesure: true }
  const mauvaise: Sante = { score: 40, tauxPlacement: 0.6, tauxReponse: 0, tauxEchec: 0.1, verdict: 'redescendre', motif: '', mesure: true }

  // LA SANTÉ MODULE LA PROSPECTION, JAMAIS LA CHAUFFE : on ne réduit pas la
  // chauffe parce que ça va mal, c'est précisément le remède.
  it('suspend la prospection sous 50, sans toucher à la chauffe', () => {
    const bon = capacite({ jourDeChauffe: 20, cibleQuotidienne: 40, plafondDur: 120, sante: bonne })
    const mauvais = capacite({ jourDeChauffe: 20, cibleQuotidienne: 40, plafondDur: 120, sante: mauvaise })

    expect(mauvais.froidAujourdhui).toBe(0)
    expect(mauvais.chauffeAujourdhui).toBe(bon.chauffeAujourdhui)
    expect(mauvais.explication).toMatch(/prospection suspendue/)
  })

  it('réduit progressivement entre 50 et 85', () => {
    const scores = [55, 75, 95].map(
      (score) =>
        capacite({
          jourDeChauffe: 25,
          cibleQuotidienne: 40,
          plafondDur: 120,
          sante: { ...bonne, score },
        }).froidAujourdhui,
    )
    expect(scores[0]).toBeLessThan(scores[1])
    expect(scores[1]).toBeLessThan(scores[2])
  })

  // Une pénalité coûte quatre jours de courbe : redescendre d'un palier, c'est
  // revenir là où le placement tenait, pas s'arrêter.
  it('recule de quatre jours par palier perdu, sans jamais passer sous le premier jour', () => {
    const sansPenalite = capacite({ jourDeChauffe: 20, cibleQuotidienne: 40, plafondDur: 120, sante: bonne })
    const avec = capacite({ jourDeChauffe: 20, cibleQuotidienne: 40, plafondDur: 120, sante: bonne, penalite: 2 })
    expect(avec.chauffeAujourdhui).toBeLessThan(sansPenalite.chauffeAujourdhui)
    expect(avec.explication).toMatch(/2 palier\(s\) perdu\(s\), on repart du jour 12/)

    const ecrase = capacite({ jourDeChauffe: 2, cibleQuotidienne: 40, plafondDur: 120, sante: bonne, penalite: 10 })
    expect(ecrase.chauffeAujourdhui).toBe(4) // le jour 1 de la courbe, pas moins
  })

  // Le plafond dur vient du régulateur (`regulator_settings.daily_cap`), pas
  // d'une famille de fournisseur : nous n'envoyons pas depuis une boîte Gmail,
  // nous passons par Resend.
  it('respecte le plafond du régulateur et le dit', () => {
    const c = capacite({ jourDeChauffe: 60, cibleQuotidienne: 40, plafondDur: 10, sante: bonne })
    expect(c.froidAujourdhui).toBe(10)
    expect(c.explication).toMatch(/plafonné à 10 par le régulateur/)
  })

  it('n’ouvre rien avant le huitième jour', () => {
    const c = capacite({ jourDeChauffe: 3, cibleQuotidienne: 40, plafondDur: 120, sante: bonne })
    expect(c.froidAujourdhui).toBe(0)
    expect(c.chauffeAujourdhui).toBe(4)
  })
})

/* ── Ce que l'audit du 20/08/2026 a trouvé ───────────────────────────────── */

describe('« aucun placement mesuré » n’est pas « mauvais score »', () => {
  /**
   * LE DÉFAUT. `sante()` traitait bien le cas — verdict `tenir`, motif
   * explicite — mais le codait en `score: 0` ; et `capacite()` ne lisait QUE le
   * score. Elle rendait donc 0 message autorisé, avec le motif « prospection
   * suspendue tant que le score est sous 50 ». Le premier jour d'une boîte
   * neuve, avant le moindre relevé, la chauffe se suspendait elle-même — et
   * c'est l'inverse exact de la règle écrite en tête de `sante()`.
   */
  it('ne module pas la capacité tant que rien n’a été mesuré', () => {
    const jamaisMesuree = sante(glissant({ enBoite: 0, enSpam: 0 }))
    expect(jamaisMesuree.mesure).toBe(false)

    const c = capacite({ jourDeChauffe: 20, cibleQuotidienne: 40, plafondDur: 120, sante: jamaisMesuree })
    const pleinPot = capacite({
      jourDeChauffe: 20,
      cibleQuotidienne: 40,
      plafondDur: 120,
      sante: { ...jamaisMesuree, mesure: true, score: 95 },
    })

    expect(c.froidAujourdhui).toBe(pleinPot.froidAujourdhui)
    expect(c.froidAujourdhui).toBeGreaterThan(0)
  })

  // Le motif ne doit pas invoquer un score qui n'existe pas : c'est lui qu'un
  // humain lit pour comprendre pourquoi rien ne part.
  it('dit « aucun placement mesuré », jamais « score sous 50 »', () => {
    const jamaisMesuree = sante(glissant({ enBoite: 0, enSpam: 0 }))
    const c = capacite({ jourDeChauffe: 20, cibleQuotidienne: 40, plafondDur: 120, sante: jamaisMesuree })
    expect(c.explication).toMatch(/aucun placement mesuré/)
    expect(c.explication).not.toMatch(/sous 50/)
  })

  it('un vrai mauvais score suspend toujours', () => {
    const vraimentMauvaise: Sante = {
      score: 40,
      tauxPlacement: 0.6,
      tauxReponse: 0,
      tauxEchec: 0.1,
      verdict: 'redescendre',
      motif: '',
      mesure: true,
    }
    const c = capacite({ jourDeChauffe: 20, cibleQuotidienne: 40, plafondDur: 120, sante: vraimentMauvaise })
    expect(c.froidAujourdhui).toBe(0)
    expect(c.explication).toMatch(/prospection suspendue/)
  })
})
