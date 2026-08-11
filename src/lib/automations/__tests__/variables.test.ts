import {
  ALIASES,
  VARIABLES,
  canonicalKey,
  insertVariable,
  interpolateVars,
  missingVariables,
  sampleVars,
  usedVariables,
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

describe('catalogue', () => {
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
