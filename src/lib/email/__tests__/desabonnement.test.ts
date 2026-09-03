import {
  cleDisponible,
  inscriptionDepuisJeton,
  jetonDeDesabonnement,
  urlDeDesabonnement,
} from '../desabonnement'

const INSCRIPTION = '0e7a1f20-0000-4000-8000-000000000001'
const AUTRE = '0e7a1f20-0000-4000-8000-000000000002'

const CLE = process.env.DESABONNEMENT_CLE

beforeEach(() => {
  process.env.DESABONNEMENT_CLE = 'cle-de-test'
})

afterAll(() => {
  if (CLE === undefined) delete process.env.DESABONNEMENT_CLE
  else process.env.DESABONNEMENT_CLE = CLE
})

describe('jetonDeDesabonnement / inscriptionDepuisJeton', () => {
  it('fait l’aller-retour', () => {
    const jeton = jetonDeDesabonnement(INSCRIPTION)
    expect(jeton).not.toBeNull()
    expect(inscriptionDepuisJeton(jeton)).toBe(INSCRIPTION)
  })

  it('normalise la casse et les espaces', () => {
    const jeton = jetonDeDesabonnement(`  ${INSCRIPTION.toUpperCase()}  `)
    expect(inscriptionDepuisJeton(jeton)).toBe(INSCRIPTION)
  })

  it('rend un jeton stable — un lien parti hier doit marcher demain', () => {
    expect(jetonDeDesabonnement(INSCRIPTION)).toBe(jetonDeDesabonnement(INSCRIPTION))
  })

  it('donne des jetons différents à deux inscriptions', () => {
    expect(jetonDeDesabonnement(INSCRIPTION)).not.toBe(jetonDeDesabonnement(AUTRE))
  })

  it('refuse ce qui n’est pas un UUID', () => {
    expect(jetonDeDesabonnement('pas-un-uuid')).toBeNull()
    expect(jetonDeDesabonnement('')).toBeNull()
    expect(jetonDeDesabonnement(null)).toBeNull()
    expect(jetonDeDesabonnement(undefined)).toBeNull()
  })
})

describe('inscriptionDepuisJeton — ce qu’il refuse', () => {
  it('refuse une signature fausse', () => {
    expect(inscriptionDepuisJeton(`${INSCRIPTION}.signaturebidon`)).toBeNull()
  })

  it('refuse un jeton sans signature', () => {
    expect(inscriptionDepuisJeton(INSCRIPTION)).toBeNull()
    expect(inscriptionDepuisJeton(`${INSCRIPTION}.`)).toBeNull()
  })

  it('refuse la signature d’une AUTRE inscription — le point qui compte', () => {
    // Sans cette garde, recoller la signature de A sur l’identifiant de B
    // désabonnerait B à la demande de A.
    const jetonA = jetonDeDesabonnement(INSCRIPTION)!
    const signatureA = jetonA.slice(jetonA.indexOf('.') + 1)
    expect(inscriptionDepuisJeton(`${AUTRE}.${signatureA}`)).toBeNull()
  })

  it('refuse une signature tronquée plutôt que de l’assainir', () => {
    const jeton = jetonDeDesabonnement(INSCRIPTION)!
    expect(inscriptionDepuisJeton(jeton.slice(0, -1))).toBeNull()
  })

  it('refuse un jeton signé avec une autre clé', () => {
    const jeton = jetonDeDesabonnement(INSCRIPTION)
    process.env.DESABONNEMENT_CLE = 'une-autre-cle'
    expect(inscriptionDepuisJeton(jeton)).toBeNull()
  })

  it('refuse le vide', () => {
    expect(inscriptionDepuisJeton('')).toBeNull()
    expect(inscriptionDepuisJeton(null)).toBeNull()
    expect(inscriptionDepuisJeton(undefined)).toBeNull()
  })
})

describe('sans clé, on ne rend rien', () => {
  beforeEach(() => {
    delete process.env.DESABONNEMENT_CLE
  })

  it('ne fabrique aucun jeton', () => {
    expect(cleDisponible()).toBe(false)
    expect(jetonDeDesabonnement(INSCRIPTION)).toBeNull()
    expect(urlDeDesabonnement('https://getsama.fr', INSCRIPTION)).toBeNull()
  })

  it('n’accepte aucun jeton — surtout pas en le croyant valide', () => {
    expect(inscriptionDepuisJeton(`${INSCRIPTION}.nimporte`)).toBeNull()
  })
})

describe('urlDeDesabonnement', () => {
  it('colle la base et le jeton', () => {
    const url = urlDeDesabonnement('https://getsama.fr', INSCRIPTION)!
    expect(url.startsWith('https://getsama.fr/desabonnement/')).toBe(true)
    expect(inscriptionDepuisJeton(url.split('/desabonnement/')[1])).toBe(INSCRIPTION)
  })

  it('supporte une base terminée par des barres obliques', () => {
    expect(urlDeDesabonnement('https://getsama.fr///', INSCRIPTION)).toBe(
      urlDeDesabonnement('https://getsama.fr', INSCRIPTION),
    )
  })

  it('rend null sans base ou sans inscription', () => {
    expect(urlDeDesabonnement('', INSCRIPTION)).toBeNull()
    expect(urlDeDesabonnement('   ', INSCRIPTION)).toBeNull()
    expect(urlDeDesabonnement('https://getsama.fr', null)).toBeNull()
  })
})
