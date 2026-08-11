import {
  cartesDuProspect,
  compterExport,
  construireVCards,
  echapper,
  plier,
  poidsOctets,
} from '../vcard'

const AMI_ELEC = {
  entreprise: { id: 1, name: 'AMI ELEC', telephone: '06 46 43 43 15' },
  contacts: [
    {
      id: 10,
      first_name: 'Jean-Michel',
      last_name: 'Pinto Ferreira',
      tel: '06 30 07 97 23',
      role_title: 'Responsable de publication',
      is_decision_maker: true,
    },
    { id: 11, first_name: 'Paméla', last_name: null, tel: '06 19 89 10 74' },
  ],
}

describe('echapper', () => {
  it('protège les caractères réservés de la RFC', () => {
    // « Gérant, directeur de publication » existe en base : sans échappement, la
    // virgule couperait la valeur en deux.
    expect(echapper('Gérant, directeur de publication')).toBe('Gérant\\, directeur de publication')
    expect(echapper('a;b')).toBe('a\\;b')
    expect(echapper('a\\b')).toBe('a\\\\b')
    expect(echapper('a\nb')).toBe('a\\nb')
  })
})

describe('plier', () => {
  it('laisse une ligne courte intacte', () => {
    expect(plier('FN:AMI ELEC')).toBe('FN:AMI ELEC')
  })

  it('plie au-delà de 75 octets, la suite préfixée d’une espace', () => {
    const longue = `FN:${'a'.repeat(200)}`
    const plie = plier(longue)
    expect(plie).toContain('\r\n ')
    for (const ligne of plie.split('\r\n')) {
      expect(poidsOctets(ligne)).toBeLessThanOrEqual(75)
    }
  })

  it('compte en octets et ne coupe jamais un caractère accentué en deux', () => {
    // La raison sociale la plus longue du parc fait 99 caractères et contient
    // des accents — elle doit passer sans casser l'encodage.
    const nom = 'Cousin Éco Énergie Poitiers : Photovoltaïque - Climatisations - Pompes à chaleur - Bornes de recharge'
    const plie = plier(`FN:${nom}`)
    expect(plie.split('\r\n').map((l) => l.replace(/^ /, '')).join('')).toBe(`FN:${nom}`)
    for (const ligne of plie.split('\r\n')) {
      expect(poidsOctets(ligne)).toBeLessThanOrEqual(75)
    }
  })
})

describe('cartesDuProspect', () => {
  it('met le numéro du contact ET celui de l’entreprise sur la même fiche', () => {
    const [premiere] = cartesDuProspect(AMI_ELEC)
    expect(premiere).toContain('TEL;TYPE=CELL:+33630079723') // le sien
    expect(premiere).toContain('TEL;TYPE=CELL:+33646434315') // celui de l'entreprise
  })

  it('porte le rôle du contact en TITLE', () => {
    const [premiere] = cartesDuProspect(AMI_ELEC)
    expect(premiere).toContain('TITLE:Responsable de publication')
  })

  it('nomme la fiche par l’entreprise d’abord', () => {
    const [premiere] = cartesDuProspect(AMI_ELEC)
    expect(premiere).toContain('FN:AMI ELEC — Jean-Michel')
    expect(premiere).toContain('ORG:AMI ELEC')
  })

  it('émet une fiche par contact joignable, plus celle de l’entreprise', () => {
    const cartes = cartesDuProspect(AMI_ELEC)
    expect(cartes).toHaveLength(3)
    expect(cartes[cartes.length - 1]).toContain('FN:AMI ELEC\r\n')
  })

  it('garde la fiche entreprise même quand le gérant porte le même numéro', () => {
    // 60 fiches du parc sont dans ce cas : `contacts.tel` recopie
    // `entreprises.telephone`.
    const cartes = cartesDuProspect({
      entreprise: { id: 2, name: 'Acticlimat', telephone: '06 42 82 69 63' },
      contacts: [{ id: 20, first_name: 'Florian', last_name: 'PERRET', tel: '+33642826963' }],
    })
    expect(cartes).toHaveLength(2)
    expect(cartes.some((c) => c.includes('FN:Acticlimat\r\n'))).toBe(true)
  })

  it('n’écrit pas deux fois la même ligne sur une fiche', () => {
    const [premiere] = cartesDuProspect({
      entreprise: { id: 2, name: 'Acticlimat', telephone: '06 42 82 69 63' },
      contacts: [{ id: 20, first_name: 'Florian', last_name: 'PERRET', tel: '+33642826963' }],
    })
    expect(premiere.match(/TEL;/g)).toHaveLength(1)
  })

  it('émet la fiche entreprise seule quand aucun contact n’a de numéro', () => {
    // 218 entreprises du parc qualifié sont dans ce cas.
    const cartes = cartesDuProspect({
      entreprise: { id: 3, name: 'Toiture Martin', telephone: '05 46 52 19 23' },
      contacts: [{ id: 30, first_name: 'Julien', last_name: 'Martin', tel: null, role_title: 'Gérant' }],
    })
    expect(cartes).toHaveLength(1)
    expect(cartes[0]).toContain('TEL;TYPE=WORK,VOICE:+33546521923')
  })

  it('ne rend rien sans raison sociale ni sans numéro', () => {
    expect(cartesDuProspect({ entreprise: { name: null, telephone: '05 46 52 19 23' } })).toEqual([])
    expect(cartesDuProspect({ entreprise: { name: 'Sans numéro' } })).toEqual([])
  })

  it('écrit la séquence en cours en NOTE', () => {
    const [premiere] = cartesDuProspect({ ...AMI_ELEC, sequence: 'WhatsApp seul' })
    expect(premiere).toContain('NOTE:Responsable de publication · Séquence : WhatsApp seul')
  })
})

describe('construireVCards', () => {
  it('enchaîne les fiches et termine par un saut de ligne', () => {
    const out = construireVCards([AMI_ELEC])
    expect(out.startsWith('BEGIN:VCARD\r\nVERSION:3.0')).toBe(true)
    expect(out.endsWith('END:VCARD\r\n')).toBe(true)
    expect(out.match(/BEGIN:VCARD/g)).toHaveLength(3)
  })

  it('rend une chaîne vide plutôt qu’un fichier sans fiche', () => {
    expect(construireVCards([])).toBe('')
    expect(construireVCards([{ entreprise: { name: 'Sans numéro' } }])).toBe('')
  })
})

describe('compterExport', () => {
  it('annonce les fiches et les numéros distincts', () => {
    expect(compterExport([AMI_ELEC])).toEqual({ cartes: 3, numeros: 3 })
  })

  it('ne compte qu’une fois une ligne écrite dans deux formats', () => {
    const { numeros } = compterExport([
      {
        entreprise: { id: 2, name: 'Acticlimat', telephone: '06 42 82 69 63' },
        contacts: [{ id: 20, first_name: 'Florian', last_name: 'PERRET', tel: '+33642826963' }],
      },
    ])
    expect(numeros).toBe(1)
  })
})
