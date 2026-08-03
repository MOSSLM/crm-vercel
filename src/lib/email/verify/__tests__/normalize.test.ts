import { canonicalEmail, domainPart, localPart, normalizeEmail, toAscii } from '../normalize'

describe('normalizeEmail', () => {
  it('met en minuscules et rogne les espaces', () => {
    expect(normalizeEmail('  Contact@Garage-Dupont.FR ')).toBe('contact@garage-dupont.fr')
  })

  it('retire un mailto: et ses paramètres', () => {
    expect(normalizeEmail('mailto:contact@garage.fr?subject=Devis')).toBe('contact@garage.fr')
    expect(normalizeEmail('MAILTO: contact@garage.fr')).toBe('contact@garage.fr')
  })

  it('extrait l’adresse d’une forme « Nom <adresse> »', () => {
    expect(normalizeEmail('Jean Dupont <jean@garage.fr>')).toBe('jean@garage.fr')
  })

  it('décode les séquences échappées du HTML et du JSON', () => {
    expect(normalizeEmail('contact%40garage.fr')).toBe('contact@garage.fr')
    expect(normalizeEmail('contact&#64;garage.fr')).toBe('contact@garage.fr')
    expect(normalizeEmail('\\u003econtact@garage.fr')).toBe('contact@garage.fr')
  })

  it('retire la ponctuation de fin de phrase collée à l’adresse', () => {
    expect(normalizeEmail('Écrivez à contact@garage.fr.')).toBe(null) // l'espace disqualifie
    expect(normalizeEmail('contact@garage.fr.')).toBe('contact@garage.fr')
    expect(normalizeEmail('(contact@garage.fr)')).toBe('contact@garage.fr')
  })

  it('neutralise les espaces invisibles du HTML', () => {
    // Espace insécable puis largeur nulle, tels qu'ils sortent d'une page scrapée.
    const scraped = ` contact@garage.fr​`
    expect(normalizeEmail(scraped)).toBe('contact@garage.fr')
  })

  it('refuse ce qui n’est pas une adresse', () => {
    expect(normalizeEmail('')).toBe(null)
    expect(normalizeEmail(null)).toBe(null)
    expect(normalizeEmail(undefined)).toBe(null)
    expect(normalizeEmail('garage.fr')).toBe(null)
    expect(normalizeEmail('@garage.fr')).toBe(null)
    expect(normalizeEmail('contact@')).toBe(null)
    expect(normalizeEmail('deux adresses@garage.fr')).toBe(null)
  })

  it('découpe partie locale et domaine', () => {
    expect(localPart('jean.dupont@garage.fr')).toBe('jean.dupont')
    expect(domainPart('jean.dupont@garage.fr')).toBe('garage.fr')
  })
})

describe('toAscii', () => {
  it('laisse un domaine ASCII intact', () => {
    expect(toAscii('garage-dupont.fr')).toBe('garage-dupont.fr')
  })

  it('convertit un domaine accentué en punycode', () => {
    // Le DNS ne connaît que la forme ASCII : les deux écritures doivent
    // converger, sinon la même entreprise serait vérifiée deux fois.
    expect(toAscii('café.fr').startsWith('xn--')).toBe(true)
  })
})

describe('canonicalEmail', () => {
  it('replie les alias Gmail sur une seule boîte', () => {
    expect(canonicalEmail('jean.dupont+devis@gmail.com')).toBe('jeandupont@gmail.com')
    expect(canonicalEmail('jeandupont@googlemail.com')).toBe('jeandupont@gmail.com')
  })

  it('ne touche pas aux points sur un domaine d’entreprise', () => {
    // Chez OVH, `jean.dupont@` et `jeandupont@` sont deux boîtes distinctes.
    expect(canonicalEmail('jean.dupont@garage.fr')).toBe('jean.dupont@garage.fr')
  })

  it('retire le suffixe + chez les providers qui l’ignorent', () => {
    expect(canonicalEmail('contact+crm@outlook.fr')).toBe('contact@outlook.fr')
  })
})
