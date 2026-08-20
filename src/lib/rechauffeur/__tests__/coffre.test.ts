import { randomBytes } from 'node:crypto'

const CLE = randomBytes(32).toString('base64')

/**
 * IMPORT DYNAMIQUE, ET PAS PAR COQUETTERIE : `coffre` lit `RECHAUFFEUR_CLE` au
 * moment où il est chargé. Un import statique figerait la clé pour tout le
 * fichier, et le dernier test — « ne se déchiffre pas avec une autre clé » —
 * ne prouverait plus rien, puisqu'il n'y aurait jamais eu deux clés.
 */
describe('coffre', () => {
  const original = process.env.RECHAUFFEUR_CLE

  beforeEach(() => { process.env.RECHAUFFEUR_CLE = CLE })
  afterAll(() => {
    if (original === undefined) delete process.env.RECHAUFFEUR_CLE
    else process.env.RECHAUFFEUR_CLE = original
  })

  it('rend ce qu\'on lui a confié', async () => {
    const { sceller, ouvrir } = await import('../coffre')
    const secret = { motDePasse: 'un mot de passe à moi', hote: 'mail84.lwspanel.com' }
    expect(ouvrir(sceller(secret))).toEqual(secret)
  })

  it('ne produit jamais deux fois le même chiffré', async () => {
    const { sceller } = await import('../coffre')
    const vus = new Set<string>()
    for (let i = 0; i < 200; i++) vus.add(sceller({ m: 'identique' }))
    expect(vus.size).toBe(200)
  })

  it('LÈVE si le chiffré a été modifié — c\'est tout l\'intérêt de GCM', async () => {
    const { sceller, ouvrir } = await import('../coffre')
    const scelle = Buffer.from(sceller({ m: 'secret' }), 'base64')
    scelle[scelle.length - 1] ^= 0xff // un octet retourné
    expect(() => ouvrir(scelle.toString('base64'))).toThrow()
  })

  it('refuse une clé absente ou de mauvaise taille, sans deviner', async () => {
    const { disponible, sceller } = await import('../coffre')
    delete process.env.RECHAUFFEUR_CLE
    expect(disponible()).toBe(false)
    expect(() => sceller({ m: 'x' })).toThrow(/RECHAUFFEUR_CLE/)

    process.env.RECHAUFFEUR_CLE = randomBytes(16).toString('base64')
    expect(disponible()).toBe(false)
  })

  it('ne se déchiffre pas avec une autre clé', async () => {
    const { sceller } = await import('../coffre')
    const scelle = sceller({ m: 'secret' })
    jest.resetModules()
    process.env.RECHAUFFEUR_CLE = randomBytes(32).toString('base64')
    const { ouvrir } = await import('../coffre')
    expect(() => ouvrir(scelle)).toThrow()
  })
})
