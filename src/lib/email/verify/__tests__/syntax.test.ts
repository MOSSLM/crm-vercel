import { normalizeEmail } from '../normalize'
import { checkSyntax } from '../syntax'

const check = (raw: string) => checkSyntax(normalizeEmail(raw))

describe('checkSyntax — ce qui doit passer', () => {
  it.each([
    'contact@garage-dupont.fr',
    'jean.dupont@garage.fr',
    'j+crm@gmail.com',
    "o'brien@garage.fr",
    'contact@sous.domaine.garage.fr',
    'a@b.co',
  ])('accepte %s', (email) => {
    expect(check(email).ok).toBe(true)
  })
})

describe('checkSyntax — les déchets du scraping', () => {
  it('rejette un nom de fichier image pris pour une adresse', () => {
    // Cas réellement produit par l'extraction LLM sur des pages responsive.
    const result = check('contact@2x.png')
    expect(result.ok).toBe(false)
    expect(result.failure).toBe('extension_fichier')
  })

  it('rejette une adresse noyée dans un nom de fichier', () => {
    expect(check('info@garage.com.jpg').failure).toBe('extension_fichier')
  })

  it('rejette un domaine sans extension', () => {
    expect(check('contact@garage').failure).toBe('domaine_sans_point')
  })

  it('rejette un double point dans le domaine', () => {
    expect(check('contact@garage..fr').failure).toBe('domaine_invalide')
  })

  it('rejette un TLD numérique', () => {
    expect(check('contact@192.168.1.1').failure).toBe('tld_invalide')
  })

  it('rejette un tiret en bord de label', () => {
    expect(check('contact@-garage.fr').failure).toBe('domaine_invalide')
    expect(check('contact@garage-.fr').failure).toBe('domaine_invalide')
  })

  it('rejette un point en bord de partie locale', () => {
    expect(check('.contact@garage.fr').failure).toBe('local_invalide')
    expect(check('contact.@garage.fr').failure).toBe('local_invalide')
    expect(check('con..tact@garage.fr').failure).toBe('local_invalide')
  })

  it('rejette une partie locale de plus de 64 caractères', () => {
    expect(check(`${'a'.repeat(65)}@garage.fr`).failure).toBe('local_trop_long')
  })

  it('rejette ce qui n’est plus rien après normalisation', () => {
    expect(checkSyntax(normalizeEmail('n/a')).ok).toBe(false)
    expect(checkSyntax(null).failure).toBe('vide')
  })

  it('accepte un TLD internationalisé', () => {
    expect(checkSyntax('contact@xn--80akhbyknj4f.xn--p1ai').ok).toBe(true)
  })

  it('rend un message lisible, pas un code', () => {
    expect(check('contact@2x.png').message).toBe('ce n’est pas une adresse mais un nom de fichier')
  })
})
