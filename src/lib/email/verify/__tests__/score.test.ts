import type { DnsAnswer } from '../dns'
import { normalizeEmail } from '../normalize'
import {
  EMPTY_DOMAIN_HISTORY,
  EMPTY_HISTORY,
  FOREVER_DAYS,
  judge,
  ttlDaysFor,
  type AddressHistory,
  type DomainHistory,
  type VerifyFacts,
} from '../score'
import { checkSyntax } from '../syntax'

const dns = (over: Partial<DnsAnswer> = {}): DnsAnswer => ({
  exists: true,
  mxHosts: ['mx1.ovh.net'],
  hasAddress: true,
  unresolved: false,
  ...over,
})

const facts = (email: string, over: Partial<VerifyFacts> = {}): VerifyFacts => {
  const normalized = normalizeEmail(email) ?? email
  return {
    email: normalized,
    syntax: checkSyntax(normalized),
    dns: dns(),
    history: EMPTY_HISTORY,
    domainHistory: EMPTY_DOMAIN_HISTORY,
    ...over,
  }
}

const history = (over: Partial<AddressHistory>): AddressHistory => ({ ...EMPTY_HISTORY, ...over })
const domainHistory = (over: Partial<DomainHistory>): DomainHistory => ({ ...EMPTY_DOMAIN_HISTORY, ...over })

describe('judge — preuves de mort (invalid)', () => {
  it('condamne une syntaxe cassée', () => {
    const v = judge(facts('contact@2x.png'))
    expect(v.status).toBe('invalid')
    expect(v.subStatus).toBe('syntaxe')
  })

  it('condamne un domaine jetable', () => {
    const v = judge(facts('test@yopmail.com'))
    expect(v.status).toBe('invalid')
    expect(v.subStatus).toBe('jetable')
  })

  it('condamne une boîte automatique', () => {
    expect(judge(facts('noreply@garage.fr')).subStatus).toBe('boite_automatique')
    expect(judge(facts('ne-pas-repondre@garage.fr')).subStatus).toBe('boite_automatique')
  })

  it('condamne un domaine inexistant', () => {
    const v = judge(facts('contact@garage.fr', { dns: dns({ exists: false, mxHosts: [], hasAddress: false }) }))
    expect(v.status).toBe('invalid')
    expect(v.subStatus).toBe('domaine_mort')
  })

  it('condamne un domaine sans le moindre enregistrement', () => {
    const v = judge(facts('contact@garage.fr', { dns: dns({ mxHosts: [], hasAddress: false }) }))
    expect(v.subStatus).toBe('sans_mx')
    expect(v.status).toBe('invalid')
  })

  it('condamne une adresse qui a déjà rebondi dur', () => {
    const v = judge(facts('contact@garage.fr', { history: history({ hardBounceCount: 1 }) }))
    expect(v.status).toBe('invalid')
    expect(v.subStatus).toBe('bounce_dur')
  })

  it('condamne une adresse supprimée, avant tout autre contrôle', () => {
    const v = judge(facts('contact@garage.fr', { suppressed: { reason: 'complaint' } }))
    expect(v.status).toBe('invalid')
    expect(v.subStatus).toBe('plainte')
  })
})

describe('judge — signaux négatifs concrets (risky)', () => {
  it('signale un domaine vivant mais sans serveur mail', () => {
    const v = judge(facts('contact@garage.fr', { dns: dns({ mxHosts: [], hasAddress: true }) }))
    expect(v.status).toBe('risky')
    expect(v.subStatus).toBe('sans_mx')
  })

  it('signale un domaine en parking', () => {
    const v = judge(facts('contact@garage.fr', { dns: dns({ mxHosts: ['mx.parkingcrew.net'] }) }))
    expect(v.status).toBe('risky')
    expect(v.subStatus).toBe('parking')
  })

  it('contamine les autres adresses d’un domaine d’entreprise qui a rebondi', () => {
    const v = judge(facts('contact@garage.fr', { domainHistory: domainHistory({ hardBounceCount: 1 }) }))
    expect(v.status).toBe('risky')
    expect(v.subStatus).toBe('domaine_suspect')
  })

  it('n’étend JAMAIS un rebond aux autres adresses d’un provider grand public', () => {
    // Qu'une adresse @gmail.com ait rebondi ne dit rien de la suivante.
    const v = judge(
      facts('marie@gmail.com', {
        dns: dns({ mxHosts: ['aspmx.l.google.com'] }),
        domainHistory: domainHistory({ hardBounceCount: 12 }),
      }),
    )
    expect(v.status).toBe('valid')
  })

  it('signale une accumulation de rebonds temporaires', () => {
    const v = judge(facts('contact@garage.fr', { history: history({ softBounceCount: 3 }) }))
    expect(v.status).toBe('risky')
    expect(v.subStatus).toBe('bounce_doux')
  })

  it('laisse passer un ou deux rebonds temporaires', () => {
    expect(judge(facts('contact@garage.fr', { history: history({ softBounceCount: 2 }) })).status).toBe('valid')
  })
})

describe('judge — rien à signaler (valid)', () => {
  it('laisse passer une adresse ordinaire sur un domaine joignable', () => {
    const v = judge(facts('contact@garage-dupont.fr'))
    expect(v.status).toBe('valid')
    expect(v.subStatus).toBe('mx_ok')
  })

  it('ne pénalise PAS un domaine catch-all', () => {
    // C'est l'état normal de la moitié de nos prospects (OVH, Ionos, o2switch).
    // Le pénaliser mettrait la base au compte-gouttes sans le moindre fait.
    const v = judge(facts('contact@garage.fr', { dns: dns({ mxHosts: ['mx1.mail.ovh.net'] }) }))
    expect(v.status).toBe('valid')
    expect(v.details.catchAll).toBe(true)
  })

  it('ne pénalise PAS une adresse générique d’entreprise', () => {
    // `contact@` est la cible normale sur un garage, pas un défaut.
    const v = judge(facts('contact@garage-dupont.fr'))
    expect(v.status).toBe('valid')
    expect(v.details.roleAddress).toBe(true)
  })

  it('marque « prouvée » une adresse qui a déjà reçu', () => {
    const v = judge(facts('contact@garage.fr', { history: history({ deliveredCount: 2 }) }))
    expect(v.status).toBe('valid')
    expect(v.subStatus).toBe('prouvee')
    expect(v.score).toBe(100)
  })
})

describe('judge — impossible de trancher (unknown)', () => {
  it('ne condamne personne quand le DNS n’a pas répondu', () => {
    const v = judge(facts('contact@garage.fr', { dns: dns({ unresolved: true }) }))
    expect(v.status).toBe('unknown')
    expect(v.subStatus).toBe('dns_muet')
  })

  it('rend « unknown » tant que la vérification n’a pas eu lieu', () => {
    expect(judge(facts('contact@garage.fr', { dns: null })).status).toBe('unknown')
  })
})

describe('ttlDaysFor', () => {
  it('applique la fraîcheur réglée aux adresses valides', () => {
    expect(ttlDaysFor({ status: 'valid', subStatus: 'mx_ok' }, 120)).toBe(120)
  })

  it('réexamine plus souvent un signal négatif', () => {
    expect(ttlDaysFor({ status: 'risky', subStatus: 'sans_mx' }, 120)).toBe(30)
  })

  it('retente vite après un DNS muet', () => {
    expect(ttlDaysFor({ status: 'unknown', subStatus: 'dns_muet' }, 120)).toBe(3)
  })

  it('ne rejoue jamais un verdict définitif', () => {
    expect(ttlDaysFor({ status: 'invalid', subStatus: 'jetable' }, 120)).toBe(FOREVER_DAYS)
    expect(ttlDaysFor({ status: 'invalid', subStatus: 'bounce_dur' }, 120)).toBe(FOREVER_DAYS)
    expect(ttlDaysFor({ status: 'invalid', subStatus: 'syntaxe' }, 120)).toBe(FOREVER_DAYS)
  })

  it('laisse une chance à un domaine mort de renaître, mais pas demain', () => {
    expect(ttlDaysFor({ status: 'invalid', subStatus: 'domaine_mort' }, 120)).toBe(365)
  })
})
