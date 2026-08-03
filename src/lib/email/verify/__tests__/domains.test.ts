import { guessCatchAll, providerFromMx } from '../domains'

// Empreintes vérifiées sur des MX réels relevés dans la base : artisans du
// chauffage et de la climatisation, très majoritairement chez OVH et Ionos.
describe('providerFromMx', () => {
  it.each([
    [['aspmx.l.google.com', 'alt1.aspmx.l.google.com'], 'google'],
    [['garage-fr.mail.protection.outlook.com'], 'microsoft'],
    [['mx1.mail.ovh.net', 'mx2.mail.ovh.net'], 'ovh'],
    [['mx00.ionos.fr', 'mx01.ionos.fr'], 'ionos'],
    [['spool.mail.gandi.net'], 'gandi'],
    [['mx1.free.fr'], 'free'],
    [['smtp-in.orange.fr'], 'orange'],
    [['mta5.am0.yahoodns.net'], 'yahoo'],
    [['mx01.mail.icloud.com'], 'apple'],
    [['mx.mailinblack.com'], 'passerelle'],
    [['mx.parkingcrew.net'], 'parking'],
    [['mail.serveur-inconnu.tld'], 'autre'],
  ])('reconnaît %s', (hosts, expected) => {
    expect(providerFromMx(hosts)).toBe(expected)
  })

  it('rend « autre » sans le moindre MX', () => {
    expect(providerFromMx([])).toBe('autre')
  })
})

describe('guessCatchAll', () => {
  it('ne suppose pas de catch-all chez les providers qui rejettent vraiment', () => {
    // Ceux-là refusent franchement une boîte inexistante : leur verdict est
    // fiable, et le pénaliser reviendrait à se méfier sans raison.
    for (const p of ['google', 'microsoft', 'orange', 'free', 'yahoo', 'apple', 'laposte'] as const) {
      expect(guessCatchAll(p)).toBe(false)
    }
  })

  it('suppose un catch-all chez les mutualisés et derrière une passerelle', () => {
    // Le serveur accepte tout puis trie : son « oui » ne prouve rien.
    for (const p of ['ovh', 'ionos', 'o2switch', 'passerelle', 'parking', 'autre'] as const) {
      expect(guessCatchAll(p)).toBe(true)
    }
  })
})
