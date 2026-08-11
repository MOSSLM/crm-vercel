import {
  afficherNumero,
  nomDuContact,
  numeroParDefaut,
  numerosDuProspect,
} from '../numeros'

describe('afficherNumero', () => {
  it('rend un français en forme française', () => {
    expect(afficherNumero('+33642826963')).toBe('06 42 82 69 63')
    expect(afficherNumero('+33146520000')).toBe('01 46 52 00 00')
  })

  it('laisse intact ce qui n’est pas un français complet', () => {
    expect(afficherNumero('+32470123456')).toBe('+32470123456')
    expect(afficherNumero('4512')).toBe('4512')
  })
})

describe('nomDuContact', () => {
  it('accepte un prénom seul', () => {
    expect(nomDuContact({ first_name: 'Paméla', last_name: null })).toBe('Paméla')
  })

  it('ne rend rien quand il n’y a rien', () => {
    expect(nomDuContact({ first_name: null, last_name: null })).toBeNull()
    expect(nomDuContact({ first_name: '  ', last_name: '' })).toBeNull()
  })
})

describe('numerosDuProspect — dédoublonnage', () => {
  it('fusionne la même ligne écrite dans deux formats (cas Acticlimat)', () => {
    // En base : `06 42 82 69 63` côté entreprise, `+33642826963` côté contact.
    const out = numerosDuProspect({
      entreprise: { name: 'Acticlimat', telephone: '06 42 82 69 63' },
      contacts: [{ first_name: 'Florian', last_name: 'PERRET', tel: '+33642826963' }],
    })
    expect(out).toHaveLength(1)
    expect(out[0].e164).toBe('+33642826963')
  })

  it('laisse le contact l’emporter sur l’entreprise à numéro égal', () => {
    const out = numerosDuProspect({
      entreprise: { telephone: '06 42 82 69 63' },
      contacts: [{ first_name: 'Florian', last_name: 'PERRET', tel: '+33642826963', role_title: 'Gérant' }],
    })
    expect(out[0].origine.kind).toBe('contact')
    expect(out[0].libelleOrigine).toBe('Florian PERRET · Gérant')
  })

  it('fusionne telephones[] avec telephone quand c’est le même numéro', () => {
    const out = numerosDuProspect({
      entreprise: { telephone: '05 49 46 57 94', telephones: ['+33549465794', '0549465794'] },
    })
    expect(out).toHaveLength(1)
  })

  it('garde les numéros réellement distincts', () => {
    // Cas AMI ELEC : un numéro d'entreprise et deux contacts distincts.
    const out = numerosDuProspect({
      entreprise: { name: 'AMI ELEC', telephone: '06 46 43 43 15' },
      contacts: [
        { first_name: 'Jean-Michel', last_name: 'Pinto Ferreira', tel: '06 30 07 97 23', is_decision_maker: true },
        { first_name: 'Paméla', tel: '06 19 89 10 74' },
      ],
    })
    expect(out.map((n) => n.e164)).toEqual(
      expect.arrayContaining(['+33646434315', '+33630079723', '+33619891074']),
    )
    expect(out).toHaveLength(3)
  })
})

describe('numerosDuProspect — ordre', () => {
  it('WhatsApp : les mobiles d’abord, décideur en tête', () => {
    const out = numerosDuProspect(
      {
        entreprise: { telephone: '05 46 52 19 23' },
        contacts: [
          { first_name: 'Standard', last_name: 'Accueil', tel: '06 11 11 11 11' },
          { first_name: 'Jérôme', last_name: 'Morandini', tel: '06 61 48 03 42', is_decision_maker: true },
        ],
      },
      'whatsapp',
    )
    expect(out[0].e164).toBe('+33661480342') // le décideur
    expect(out[out.length - 1].type).toBe('fixe') // le fixe en dernier
  })

  it('appel : la ligne de l’établissement d’abord', () => {
    const out = numerosDuProspect(
      {
        entreprise: { telephone: '05 46 52 19 23' },
        contacts: [{ first_name: 'Jérôme', last_name: 'Morandini', tel: '06 61 48 03 42', is_decision_maker: true }],
      },
      'appel',
    )
    expect(out[0].e164).toBe('+33546521923')
  })
})

describe('numerosDuProspect — ce qu’on écarte', () => {
  it('écarte les extensions internes, qu’on ne peut pas composer de l’extérieur', () => {
    expect(numerosDuProspect({ entreprise: { telephone: '4512' } })).toHaveLength(0)
  })

  it('écarte un contact sans nom, faute de pouvoir dire d’où vient le numéro', () => {
    const out = numerosDuProspect({ contacts: [{ first_name: null, tel: '06 61 48 03 42' }] })
    expect(out).toHaveLength(0)
  })

  it('ne rend rien quand le prospect n’a aucun numéro', () => {
    expect(numerosDuProspect({ entreprise: { name: 'Sans numéro' } })).toEqual([])
    expect(numeroParDefaut({})).toBeNull()
  })

  it('garde un numéro étranger, sans lui inventer un type', () => {
    const out = numerosDuProspect({ entreprise: { telephone: '+32470123456' } })
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('autre')
  })
})

describe('libelleOrigine', () => {
  it('nomme la fiche entreprise', () => {
    const out = numerosDuProspect({ entreprise: { telephone: '05 46 52 19 23' } })
    expect(out[0].libelleOrigine).toBe('fiche entreprise')
  })

  it('se passe du rôle quand il manque', () => {
    const out = numerosDuProspect({ contacts: [{ first_name: 'Paméla', tel: '06 19 89 10 74' }] })
    expect(out[0].libelleOrigine).toBe('Paméla')
  })
})
