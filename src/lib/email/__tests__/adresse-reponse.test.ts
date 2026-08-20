import { adresseDeReponse, inscriptionDepuisAdresse } from '../adresse-reponse'

const INSCRIPTION = '0e7a1f20-0000-4000-8000-000000000001'

describe('adresseDeReponse', () => {
  it('sous-adresse la base avec l’inscription', () => {
    expect(adresseDeReponse('reponses@sama.fr', INSCRIPTION)).toBe(`reponses+${INSCRIPTION}@sama.fr`)
  })

  it('rend l’adresse nue quand aucune inscription n’est fournie', () => {
    expect(adresseDeReponse('reponses@sama.fr')).toBe('reponses@sama.fr')
    expect(adresseDeReponse('reponses@sama.fr', null)).toBe('reponses@sama.fr')
  })

  it('ne double pas le suffixe si la base est déjà sous-adressée', () => {
    expect(adresseDeReponse('reponses+ancien@sama.fr', INSCRIPTION)).toBe(
      `reponses+${INSCRIPTION}@sama.fr`,
    )
  })

  it('normalise la casse et les espaces', () => {
    expect(adresseDeReponse('  Reponses@SAMA.fr  ', INSCRIPTION)).toBe(
      `reponses+${INSCRIPTION}@sama.fr`,
    )
  })

  // Sans base configurée, on ne doit RIEN poser : un `Reply-To` inventé
  // enverrait les réponses dans une boîte qui n'existe pas.
  it('rend null sans base exploitable', () => {
    expect(adresseDeReponse(null, INSCRIPTION)).toBeNull()
    expect(adresseDeReponse('', INSCRIPTION)).toBeNull()
    expect(adresseDeReponse('pas-une-adresse', INSCRIPTION)).toBeNull()
  })

  // Un identifiant qui n'est pas un UUID est ignoré plutôt qu'assaini :
  // mieux vaut une réponse non appariée qu'une réponse mal appariée.
  it('ignore un identifiant qui n’est pas un UUID', () => {
    expect(adresseDeReponse('reponses@sama.fr', 'truc')).toBe('reponses@sama.fr')
    expect(adresseDeReponse('reponses@sama.fr', '../../etc/passwd')).toBe('reponses@sama.fr')
  })
})

describe('inscriptionDepuisAdresse', () => {
  it('relit ce qu’adresseDeReponse a écrit', () => {
    const ecrite = adresseDeReponse('reponses@sama.fr', INSCRIPTION)
    expect(inscriptionDepuisAdresse(ecrite)).toBe(INSCRIPTION)
  })

  it('rend null sur une adresse sans sous-adressage', () => {
    expect(inscriptionDepuisAdresse('reponses@sama.fr')).toBeNull()
    expect(inscriptionDepuisAdresse('contact@artisan.fr')).toBeNull()
  })

  it('rend null quand le jeton n’est pas un UUID', () => {
    expect(inscriptionDepuisAdresse('reponses+bonjour@sama.fr')).toBeNull()
    expect(inscriptionDepuisAdresse('reponses+@sama.fr')).toBeNull()
  })

  it('supporte la casse et les espaces du message reçu', () => {
    expect(inscriptionDepuisAdresse(` Reponses+${INSCRIPTION.toUpperCase()}@Sama.fr `)).toBe(
      INSCRIPTION,
    )
  })

  it('rend null sur une entrée absente', () => {
    expect(inscriptionDepuisAdresse(null)).toBeNull()
    expect(inscriptionDepuisAdresse(undefined)).toBeNull()
  })
})
