import {
  canauxDisponibles,
  collecterCanaux,
  correspondAuPublic,
  estFixeFr,
  estMobileFr,
  lienSms,
  lienWhatsApp,
  premierMobile,
  sequenceSuggeree,
  type Canal,
} from '../canal'

describe('estMobileFr', () => {
  it('reconnaît 06 et 07 quelle que soit la mise en forme', () => {
    for (const n of ['0646042876', '06 46 04 28 76', '06.46.04.28.76', '+33646042876', '0033646042876']) {
      expect(estMobileFr(n)).toBe(true)
    }
    expect(estMobileFr('07 12 34 56 78')).toBe(true)
  })

  it('refuse les fixes', () => {
    for (const n of ['0241887766', '01 42 00 00 00', '+33241887766', '09 70 00 00 00']) {
      expect(estMobileFr(n)).toBe(false)
    }
  })

  it('refuse le vide et l’étranger', () => {
    expect(estMobileFr(null)).toBe(false)
    expect(estMobileFr('')).toBe(false)
    expect(estMobileFr('+32470123456')).toBe(false) // mobile belge — on ne devine pas
  })
})

describe('estFixeFr', () => {
  it('reconnaît le géographique et le VoIP', () => {
    expect(estFixeFr('0241887766')).toBe(true)
    expect(estFixeFr('01 42 00 00 00')).toBe(true)
    expect(estFixeFr('09 70 00 00 00')).toBe(true)
  })

  it('n’est pas « tout ce qui n’est pas mobile »', () => {
    // Une saisie tronquée ne doit pas basculer en fixe par défaut.
    expect(estFixeFr('06 46')).toBe(false)
    expect(estFixeFr('0241')).toBe(false)
    expect(estFixeFr('+32470123456')).toBe(false)
    expect(estFixeFr(null)).toBe(false)
  })
})

describe('canauxDisponibles', () => {
  it('cumule les canaux — le plus gros segment est « e-mail + mobile »', () => {
    const c = canauxDisponibles({ email: 'contact@x.fr', telephones: ['0646042876'] })
    expect([...c].sort()).toEqual(['email', 'mobile'])
  })

  it('classe le segment WhatsApp seul : pas d’e-mail, un mobile', () => {
    const c = canauxDisponibles({ email: null, telephones: ['06 46 04 28 76'] })
    expect([...c]).toEqual(['mobile'])
  })

  it('classe le segment e-mail + fixe', () => {
    const c = canauxDisponibles({ email: 'contact@x.fr', telephones: ['02 41 88 77 66'] })
    expect([...c].sort()).toEqual(['email', 'fixe'])
  })

  it('ignore les e-mails vides ou en blancs', () => {
    expect(canauxDisponibles({ email: '   ', telephones: [] }).has('email')).toBe(false)
  })

  it('accepte plusieurs numéros et retient les deux natures', () => {
    const c = canauxDisponibles({ telephones: ['0241887766', null, '0646042876'] })
    expect([...c].sort()).toEqual(['fixe', 'mobile'])
  })

  it('ne plante pas sans aucune donnée', () => {
    expect(canauxDisponibles({}).size).toBe(0)
  })
})

describe('premierMobile', () => {
  it('retient le premier mobile, normalisé', () => {
    expect(premierMobile(['0241887766', '06 46 04 28 76'])).toBe('+33646042876')
  })

  it('renvoie null quand il n’y a que du fixe', () => {
    expect(premierMobile(['0241887766'])).toBeNull()
    expect(premierMobile(null)).toBeNull()
  })
})

describe('collecterCanaux', () => {
  // Le cas qui a motivé la fonction : le standard est en 02, mais le gérant a un
  // 06 sur sa fiche. L'entreprise SEULE dirait « fixe » et perdrait WhatsApp.
  it('compte le mobile du gérant comme un mobile joignable', () => {
    const r = collecterCanaux({
      entrepriseTelephones: ['02 41 88 77 66'],
      contacts: [{ tel: '06 46 04 28 76', isDecisionMaker: true }],
    })
    expect([...r.canaux].sort()).toEqual(['fixe', 'mobile'])
    expect(r.mobile).toBe('+33646042876')
    expect(r.fixe).toBe('+33241887766')
  })

  it('préfère le mobile du décideur à celui d’un autre contact', () => {
    const r = collecterCanaux({
      contacts: [
        { tel: '06 11 11 11 11' },
        { tel: '07 22 22 22 22', isDecisionMaker: true },
      ],
    })
    expect(r.mobile).toBe('+33722222222')
  })

  it('préfère un mobile de contact au mobile de la fiche entreprise', () => {
    const r = collecterCanaux({
      entrepriseTelephones: ['06 99 99 99 99'],
      contacts: [{ tel: '06 46 04 28 76' }],
    })
    // On cherche le téléphone d'une personne, pas celui d'un lieu.
    expect(r.mobile).toBe('+33646042876')
  })

  it('garde la ligne pro de l’établissement comme fixe à appeler', () => {
    const r = collecterCanaux({
      entrepriseTelephones: ['02 41 88 77 66'],
      contacts: [{ tel: '01 42 00 00 00' }],
    })
    expect(r.fixe).toBe('+33241887766')
  })

  it('prend l’adresse du contact avant celle de l’entreprise', () => {
    // Même règle que `resolveEntities` : le tableau et l'envoi ne doivent
    // jamais désigner deux destinataires différents.
    const r = collecterCanaux({
      entrepriseEmail: 'contact@x.fr',
      contacts: [{ email: 'gerant@x.fr' }],
    })
    expect(r.email).toBe('gerant@x.fr')
  })

  it('retombe sur l’adresse de l’entreprise quand aucun contact n’en a', () => {
    const r = collecterCanaux({
      entrepriseEmail: 'contact@x.fr',
      contacts: [{ tel: '0646042876' }],
    })
    expect(r.email).toBe('contact@x.fr')
    expect([...r.canaux].sort()).toEqual(['email', 'mobile'])
  })

  it('reste muet sur un prospect sans rien', () => {
    const r = collecterCanaux({ entrepriseEmail: '  ', contacts: [] })
    expect(r.canaux.size).toBe(0)
    expect(r.mobile).toBeNull()
    expect(r.fixe).toBeNull()
    expect(r.email).toBeNull()
  })

  it('ne plante pas sans aucune donnée', () => {
    expect(collecterCanaux({}).canaux.size).toBe(0)
  })
})

describe('public visé', () => {
  // Les trois séquences réelles, déclarées comme elles le seront en base.
  const WHATSAPP_SEUL = { id: 'wa', requireCanaux: ['mobile' as Canal], excludeCanaux: ['email' as Canal] }
  const EMAIL_FIXE = { id: 'ef', requireCanaux: ['email' as Canal, 'fixe' as Canal] }
  const MIX = { id: 'mix', requireCanaux: ['email' as Canal, 'mobile' as Canal] }
  const TOUTES = [WHATSAPP_SEUL, EMAIL_FIXE, MIX]

  const canaux = (...c: Canal[]) => new Set(c)

  it('exclut un prospect qui porte un canal disqualifiant', () => {
    expect(correspondAuPublic(canaux('email', 'mobile'), WHATSAPP_SEUL)).toBe(false)
    expect(correspondAuPublic(canaux('mobile'), WHATSAPP_SEUL)).toBe(true)
  })

  it('exige TOUS les canaux requis, pas un seul', () => {
    expect(correspondAuPublic(canaux('email'), MIX)).toBe(false)
    expect(correspondAuPublic(canaux('email', 'mobile'), MIX)).toBe(true)
  })

  it('accepte tout le monde quand rien n’est déclaré', () => {
    expect(correspondAuPublic(canaux(), {})).toBe(true)
  })

  it('suggère la bonne séquence pour chacun des trois segments réels', () => {
    expect(sequenceSuggeree(canaux('mobile'), TOUTES)?.id).toBe('wa')
    expect(sequenceSuggeree(canaux('email', 'fixe'), TOUTES)?.id).toBe('ef')
    expect(sequenceSuggeree(canaux('email', 'mobile'), TOUTES)?.id).toBe('mix')
  })

  it('donne la main à la séquence la plus exigeante', () => {
    const large = { id: 'large', requireCanaux: ['email' as Canal] }
    // « e-mail ET mobile » décrit mieux le prospect que « e-mail ».
    expect(sequenceSuggeree(canaux('email', 'mobile'), [large, MIX])?.id).toBe('mix')
    expect(sequenceSuggeree(canaux('email', 'mobile'), [MIX, large])?.id).toBe('mix')
  })

  it('ne suggère jamais une séquence sans public déclaré', () => {
    // Sinon une séquence oubliée sans règle s'imposerait à tout le parc.
    expect(sequenceSuggeree(canaux('email', 'mobile'), [{ id: 'vide' }])).toBeNull()
  })

  it('ne suggère rien plutôt que n’importe quoi', () => {
    expect(sequenceSuggeree(canaux('fixe'), TOUTES)).toBeNull()
  })

  // Deux séquences sur le même public, c'est la forme d'un test d'accroche :
  // « WhatsApp seul » et sa jumelle « site direct » visent exactement les mêmes
  // fiches. La précision ne les départage plus — il faut une autre règle.
  describe('deux séquences sur le même public', () => {
    const JUMELLE = { id: 'wa-direct', requireCanaux: ['mobile' as Canal], excludeCanaux: ['email' as Canal] }

    it('propose celle qui tourne, pas le brouillon, quel que soit l’ordre', () => {
      const active = { ...WHATSAPP_SEUL, status: 'on' }
      const brouillon = { ...JUMELLE, status: 'draft' }
      expect(sequenceSuggeree(canaux('mobile'), [brouillon, active])?.id).toBe('wa')
      expect(sequenceSuggeree(canaux('mobile'), [active, brouillon])?.id).toBe('wa')
    })

    it('à égalité complète, la première déclarée l’emporte', () => {
      const a = { ...WHATSAPP_SEUL, status: 'on' }
      const b = { ...JUMELLE, status: 'on' }
      expect(sequenceSuggeree(canaux('mobile'), [a, b])?.id).toBe('wa')
      expect(sequenceSuggeree(canaux('mobile'), [b, a])?.id).toBe('wa-direct')
    })

    it('la précision passe avant l’activité — une cible plus juste vaut mieux', () => {
      const large = { id: 'large', requireCanaux: ['mobile' as Canal], status: 'on' }
      const precise = { ...JUMELLE, status: 'draft' }
      expect(sequenceSuggeree(canaux('mobile'), [large, precise])?.id).toBe('wa-direct')
    })

    it('reste stable quand aucune séquence ne porte de statut', () => {
      expect(sequenceSuggeree(canaux('mobile'), [WHATSAPP_SEUL, JUMELLE])?.id).toBe('wa')
    })
  })
})

describe('lienWhatsApp', () => {
  // La régression : la file de démarchage recopiait les chiffres tels quels,
  // donc `wa.me/0646042876` — que WhatsApp ne résout pas.
  it('convertit un 06 en international sans +', () => {
    expect(lienWhatsApp('06 46 04 28 76')).toBe('https://wa.me/33646042876')
  })

  it('encode le message pré-rempli', () => {
    const url = lienWhatsApp('+33646042876', 'Bonjour, je suis bien avec Toiture Martin ?')
    expect(url).toBe(
      'https://wa.me/33646042876?text=Bonjour%2C%20je%20suis%20bien%20avec%20Toiture%20Martin%20%3F',
    )
  })

  it('renvoie null plutôt que d’ouvrir dans le vide', () => {
    expect(lienWhatsApp(null)).toBeNull()
    expect(lienWhatsApp('')).toBeNull()
    expect(lienWhatsApp('1234')).toBeNull() // extension de standard interne
  })
})

describe('lienSms — le CRM prépare, le téléphone envoie', () => {
  it('compose un numéro français en international, et GARDE le +', () => {
    // C'est la différence avec `wa.me`, qui le refuse : l'application de
    // messagerie compose le numéro tel quel.
    expect(lienSms('06 12 34 56 78', 'Bonjour')).toBe('sms:+33612345678?&body=Bonjour')
    expect(lienWhatsApp('06 12 34 56 78', 'Bonjour')).toBe('https://wa.me/33612345678?text=Bonjour')
  })

  it('écrit `?&body=`, la seule forme qu’iOS ET Android acceptent', () => {
    expect(lienSms('0612345678', 'x')).toContain('?&body=')
  })

  it('encode le texte, accents et retours à la ligne compris', () => {
    expect(lienSms('0612345678', 'Été & co\nsuite')).toBe(
      'sms:+33612345678?&body=%C3%89t%C3%A9%20%26%20co%0Asuite',
    )
  })

  it('omet le paramètre quand il n’y a pas de message', () => {
    expect(lienSms('0612345678')).toBe('sms:+33612345678')
  })

  it('rend null plutôt qu’un lien mort', () => {
    expect(lienSms(null, 'x')).toBeNull()
    // Une extension de standard interne n'est pas un mobile.
    expect(lienSms('1234', 'x')).toBeNull()
  })
})
