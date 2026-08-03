import { editDistance, suggestDomain, suggestEmail } from '../typo'

describe('editDistance', () => {
  it('compte une transposition pour 1, pas pour 2', () => {
    // C'est toute la raison d'être de Damerau : `gmial` → `gmail` est UNE
    // faute de frappe, une Levenshtein simple la compterait double et la
    // correction serait manquée.
    expect(editDistance('gmial.com', 'gmail.com')).toBe(1)
  })

  it('compte les insertions, suppressions et substitutions', () => {
    expect(editDistance('gmai.com', 'gmail.com')).toBe(1)
    expect(editDistance('gmaill.com', 'gmail.com')).toBe(1)
    expect(editDistance('gmzil.com', 'gmail.com')).toBe(1)
  })

  it('rend 0 sur deux chaînes identiques', () => {
    expect(editDistance('gmail.com', 'gmail.com')).toBe(0)
  })

  it('sort au-delà de la borne sans finir le calcul', () => {
    expect(editDistance('garage-dupont.fr', 'gmail.com', 2)).toBeGreaterThan(2)
  })
})

describe('suggestDomain', () => {
  it.each([
    ['gmial.com', 'gmail.com'],
    ['gmai.com', 'gmail.com'],
    ['hotmial.fr', 'hotmail.fr'],
    ['orang.fr', 'orange.fr'],
    ['wanadooo.fr', 'wanadoo.fr'],
  ])('corrige %s en %s', (typo, expected) => {
    expect(suggestDomain(typo)).toBe(expected)
  })

  it('ne propose rien quand le domaine est déjà bon', () => {
    expect(suggestDomain('gmail.com')).toBe(null)
    expect(suggestDomain('orange.fr')).toBe(null)
  })

  it('ne propose rien sur un domaine d’entreprise inconnu', () => {
    // Sans quoi chaque garage se verrait proposer « gmail.com ».
    expect(suggestDomain('garage-dupont.fr')).toBe(null)
  })

  it('rattrape une faute sur un domaine fréquent de la base', () => {
    // La liste figée ne connaît pas nos domaines maison ; l'appelant lui passe
    // les plus fréquents de la base, et la correction suit.
    expect(suggestDomain('samadigtalstudio.fr', ['samadigitalstudio.fr'])).toBe('samadigitalstudio.fr')
  })

  it('reste prudent sur les domaines courts', () => {
    // `free.fr` et `tree.fr` sont à distance 1 : corriger serait deviner.
    expect(suggestDomain('sfr.fr')).toBe(null)
  })

  it('reconstruit l’adresse complète', () => {
    expect(suggestEmail('jean@gmial.com')).toBe('jean@gmail.com')
    expect(suggestEmail('jean@garage-dupont.fr')).toBe(null)
  })
})
