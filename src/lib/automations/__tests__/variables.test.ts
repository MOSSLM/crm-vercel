import {
  ALIASES,
  VARIABLES,
  VARIANT_LABELS,
  canonicalKey,
  insertVariable,
  interpolateVars,
  missingContactVariables,
  missingVariables,
  pickVariant,
  sampleVars,
  usedVariables,
  variantText,
  varsForVariant,
} from '../variables'

describe('canonicalKey', () => {
  it('laisse une clé déjà canonique tranquille', () => {
    expect(canonicalKey('company.name')).toBe('company.name')
  })

  it('traduit les anciennes écritures des modèles e-mail', () => {
    expect(canonicalKey('company_name')).toBe('company.name')
    expect(canonicalKey('contact_name')).toBe('contact.first_name')
  })

  it('traduit les écritures accentuées de l’onglet WhatsApp', () => {
    expect(canonicalKey('prénom')).toBe('contact.first_name')
    expect(canonicalKey('entreprise')).toBe('company.name')
    expect(canonicalKey('lien_site')).toBe('company.demo_url')
  })

  it('tolère les espaces et la casse', () => {
    expect(canonicalKey('  Prenom  ')).toBe('contact.first_name')
  })
})

describe('interpolateVars', () => {
  const vars = { 'company.name': 'Toiture Martin', 'contact.first_name': 'Julien' }

  it('remplace les clés canoniques', () => {
    expect(interpolateVars('Bonjour {{contact.first_name}}', vars)).toBe('Bonjour Julien')
  })

  it('tolère les espaces dans les accolades', () => {
    expect(interpolateVars('{{ company.name }}', vars)).toBe('Toiture Martin')
  })

  // La régression qui a motivé le module : un modèle rédigé dans la messagerie
  // partait avec ses variables vidées dès qu'une séquence le choisissait.
  it('rend les anciennes écritures au lieu de les vider', () => {
    expect(interpolateVars('Bonjour, je suis bien avec {{company_name}} ?', vars)).toBe(
      'Bonjour, je suis bien avec Toiture Martin ?',
    )
    expect(interpolateVars('Bonjour {{prénom}}, ici {{entreprise}}', vars)).toBe(
      'Bonjour Julien, ici Toiture Martin',
    )
  })

  it('ne laisse jamais une accolade brute partir au prospect', () => {
    // Même une clé inconnue disparaît : un `{{truc}}` dans un WhatsApp envoyé
    // est plus embarrassant qu'un blanc.
    expect(interpolateVars('Bonjour {{inconnue}} !', vars)).toBe('Bonjour  !')
    expect(interpolateVars('Bonjour {{prénom}} !', {})).toBe('Bonjour  !')
  })

  it('accepte un texte vide ou nul', () => {
    expect(interpolateVars(null, vars)).toBe('')
    expect(interpolateVars(undefined, vars)).toBe('')
  })
})

describe('usedVariables / missingVariables', () => {
  it('dédoublonne après résolution des alias', () => {
    // `{{entreprise}}` et `{{company.name}}` sont la même variable : la barre
    // d'insertion ne doit pas en proposer deux.
    expect(usedVariables('{{entreprise}} et {{company.name}}')).toEqual(['company.name'])
  })

  it('signale ce qui partira en blanc', () => {
    const vars = { 'company.name': 'Toiture Martin' }
    expect(missingVariables('{{company.name}} — {{company.demo_url}}', vars)).toEqual([
      'company.demo_url',
    ])
  })

  it('compte une valeur vide comme manquante', () => {
    expect(missingVariables('{{company.demo_url}}', { 'company.demo_url': '' })).toEqual([
      'company.demo_url',
    ])
  })
})

describe('insertVariable', () => {
  it('insère au curseur et rend la position de sortie', () => {
    const { text, cursor } = insertVariable('Bonjour , ça va ?', 'contact.first_name', 8)
    expect(text).toBe('Bonjour {{contact.first_name}}, ça va ?')
    expect(cursor).toBe(8 + '{{contact.first_name}}'.length)
    // Le curseur doit tomber juste après le jeton, sinon deux clics de suite
    // empilent les variables au même endroit, dans l'ordre inverse.
    expect(text.slice(cursor)).toBe(', ça va ?')
  })

  it('remplace la sélection', () => {
    const { text } = insertVariable('Bonjour NOM !', 'contact.last_name', 8, 11)
    expect(text).toBe('Bonjour {{contact.last_name}} !')
  })

  it('borne une position hors du texte', () => {
    const { text } = insertVariable('abc', 'company.name', 99)
    expect(text).toBe('abc{{company.name}}')
  })
})

describe('deux variations — pickVariant', () => {
  const ENTREPRISE = 'Bonjour, je suis bien avec {{company.name}} ?'
  const CONTACT = 'Bonjour, je suis bien avec {{contact.first_name}} de {{company.name}} ?'

  const avecContact = { 'company.name': 'Toiture Martin', 'contact.first_name': 'Julien' }
  const sansContact = { 'company.name': 'Toiture Martin' }

  it('prend la version contact quand on connaît la personne', () => {
    expect(pickVariant([{ company: ENTREPRISE, contact: CONTACT }], avecContact)).toBe('contact')
  })

  // LE DÉFAUT QUI A MOTIVÉ LA BASCULE : 70 des 275 entreprises qualifiées n'ont
  // aucune ligne `contacts`. Sans ce repli, elles recevaient « je suis bien
  // avec  de Toiture Martin ? ».
  it('retombe sur l’entreprise dès qu’une variable du contact manque', () => {
    expect(pickVariant([{ company: ENTREPRISE, contact: CONTACT }], sansContact)).toBe('company')
    expect(pickVariant([{ company: ENTREPRISE, contact: CONTACT }], { ...avecContact, 'contact.first_name': '' })).toBe(
      'company',
    )
  })

  it('retombe sur l’entreprise quand aucune version contact n’est écrite', () => {
    // Le cas de TOUS les modèles antérieurs à la migration : comportement
    // strictement inchangé, même quand le prénom est connu.
    expect(pickVariant([{ company: ENTREPRISE, contact: null }], avecContact)).toBe('company')
    expect(pickVariant([{ company: ENTREPRISE, contact: '   ' }], avecContact)).toBe('company')
  })

  it('résout les alias avant de juger', () => {
    // Un modèle écrit dans la messagerie utilise `{{prénom}}` : la version
    // contact doit être jugée sur la clé canonique, pas sur l'écriture.
    expect(pickVariant([{ company: ENTREPRISE, contact: 'Bonjour {{prénom}}' }], sansContact)).toBe('company')
    expect(pickVariant([{ company: ENTREPRISE, contact: 'Bonjour {{prénom}}' }], avecContact)).toBe('contact')
  })

  it('ne regarde que les variables du contact', () => {
    // Un lien de démo manquant ne doit pas faire basculer de version : c'est le
    // garde-fou de la démo qui gèle l'étape, pas le choix du texte.
    expect(
      pickVariant([{ company: ENTREPRISE, contact: 'Bonjour {{contact.first_name}}, {{company.demo_url}}' }], avecContact),
    ).toBe('contact')
  })

  it('juge l’objet et le corps ensemble — ils partent dans la même enveloppe', () => {
    const sujet = { company: 'Votre site', contact: '{{contact.first_name}}, votre site' }
    const corps = { company: 'Bonjour,', contact: 'Bonjour {{contact.last_name}},' }
    // Le nom de famille manque : les DEUX champs repassent en version
    // entreprise, plutôt que d'envoyer un objet nommé sur un corps anonyme.
    expect(pickVariant([sujet, corps], avecContact)).toBe('company')
    expect(pickVariant([sujet, corps], { ...avecContact, 'contact.last_name': 'Martin' })).toBe('contact')
  })
})

describe('deux variations — variantText', () => {
  it('rend la version demandée', () => {
    expect(variantText({ company: 'A', contact: 'B' }, 'contact')).toBe('B')
    expect(variantText({ company: 'A', contact: 'B' }, 'company')).toBe('A')
  })

  it('replie un champ sans version contact sur l’entreprise', () => {
    // C'est ce qui permet de n'écrire QUE le corps en version contact et de
    // laisser l'objet tel quel.
    expect(variantText({ company: 'A', contact: null }, 'contact')).toBe('A')
    expect(variantText({ company: 'A', contact: '  ' }, 'contact')).toBe('A')
  })

  it('ne rend jamais null', () => {
    expect(variantText({ company: null, contact: null }, 'company')).toBe('')
  })
})

describe('deux variations — varsForVariant', () => {
  const vars = { 'company.name': 'Toiture Martin', 'contact.first_name': 'Julien' }

  it('vide le contact pour la version entreprise', () => {
    // L'aperçu de cette version doit montrer le cas qu'elle a pour mission de
    // tenir : personne de nommé en face.
    const vu = varsForVariant(vars, 'company')
    expect(vu['contact.first_name']).toBe('')
    expect(vu['company.name']).toBe('Toiture Martin')
    // Le sac d'origine n'est pas modifié — le moteur interpole avec, lui.
    expect(vars['contact.first_name']).toBe('Julien')
  })

  it('laisse le sac intact pour la version contact', () => {
    expect(varsForVariant(vars, 'contact')).toBe(vars)
  })

  it('fait dire à l’éditeur ce qui partira vide', () => {
    // Le lien entre les deux : sur la version entreprise, un `{{prénom}}` resté
    // dans le texte est signalé au lieu de partir en blanc chez le prospect.
    expect(missingVariables('Bonjour {{contact.first_name}}', varsForVariant(vars, 'company'))).toEqual([
      'contact.first_name',
    ])
  })
})

describe('deux variations — missingContactVariables', () => {
  it('ne retient que les clés du contact', () => {
    expect(
      missingContactVariables('{{contact.first_name}} {{contact.role}} {{company.demo_url}}', {
        'contact.role': 'Gérant',
      }),
    ).toEqual(['contact.first_name'])
  })
})

describe('catalogue', () => {
  it('nomme les deux versions dans les deux sens', () => {
    // Les libellés sont lus par la bibliothèque, le builder ET la vue semaine :
    // un vocabulaire qui diverge ferait croire à trois notions différentes.
    for (const v of ['company', 'contact'] as const) {
      expect(VARIANT_LABELS[v].tab).toBeTruthy()
      expect(VARIANT_LABELS[v].short).toBeTruthy()
      expect(VARIANT_LABELS[v].hint).toBeTruthy()
    }
  })

  it('a des exemples pour toutes les variables — l’aperçu ne doit jamais être vide', () => {
    for (const v of VARIABLES) expect(sampleVars()[v.key]).toBeTruthy()
  })

  it('ne fait pointer aucun alias vers une clé absente du catalogue', () => {
    const known = new Set(VARIABLES.map((v) => v.key))
    for (const [alias, target] of Object.entries(ALIASES)) {
      expect(known.has(target)).toBe(true)
      // Un alias qui serait aussi une clé canonique créerait une boucle de sens.
      expect(known.has(alias)).toBe(false)
    }
  })
})
