import {
  adresseNue,
  apparier,
  natureDuMessage,
  peutDebloquer,
  premiereReference,
  texteUtile,
  type MessageEntrant,
} from '../reception'

const INSCRIPTION = '11111111-2222-4333-8444-555555555555'

const msg = (over: Partial<MessageEntrant> = {}): MessageEntrant => ({
  de: 'Cédric Martin <cedric@sarl-martin.fr>',
  pour: ['contact@samadigitalstudio.fr'],
  objet: 'Re: Votre site en 72 h',
  texte: 'Bonjour, ça m’intéresse. Rappelez-moi.',
  ...over,
})

describe('adresseNue', () => {
  it('sort l’adresse d’un « Nom <a@b> » et la met en minuscules', () => {
    expect(adresseNue('Cédric MARTIN <Cedric@Sarl-Martin.FR>')).toBe('cedric@sarl-martin.fr')
  })

  it('rend null sur ce qui n’est pas une adresse', () => {
    expect(adresseNue('Cédric Martin')).toBeNull()
    expect(adresseNue(null)).toBeNull()
  })
})

describe('natureDuMessage', () => {
  it('reconnaît un humain quand rien ne dit le contraire', () => {
    expect(natureDuMessage(msg()).nature).toBe('reponse')
  })

  // LE TEST QUI COMPTE. `declarerReponse` débloque une attente ET réancre la
  // suite : un « je suis en congés » traité comme une réponse enverrait l'étape
  // suivante — écrite pour quelqu'un qui vient de parler — à un répondeur.
  it('ne prend pas une absence pour une réponse', () => {
    const n = natureDuMessage(msg({ entetes: { 'Auto-Submitted': 'auto-replied' } }))
    expect(n.nature).toBe('automatique')
    expect(n.motif).toContain('auto-replied')
  })

  it('reconnaît une absence à son objet quand aucun en-tête ne la déclare', () => {
    expect(natureDuMessage(msg({ objet: 'Réponse automatique : absent jusqu’au 25 août' })).nature)
      .toBe('automatique')
  })

  it('reconnaît une absence en anglais et en allemand', () => {
    expect(natureDuMessage(msg({ objet: 'Out of Office: back on Monday' })).nature).toBe('automatique')
    expect(natureDuMessage(msg({ objet: 'Automatische Antwort: Urlaub' })).nature).toBe('automatique')
  })

  it('range `precedence: bulk` avec les automates', () => {
    expect(natureDuMessage(msg({ entetes: { Precedence: 'bulk' } })).nature).toBe('automatique')
  })

  it('reconnaît un rebond à son rapport normalisé', () => {
    const n = natureDuMessage(
      msg({ entetes: { 'Content-Type': 'multipart/report; report-type=delivery-status; boundary=x' } }),
    )
    expect(n.nature).toBe('rebond')
  })

  // Un rapport de non-remise porte SOUVENT aussi les marqueurs d'automate. Les
  // deux ne se traitent pas pareil : l'un dit que l'adresse est morte, l'autre
  // qu'elle est vivante et lit. L'ordre de reconnaissance est donc un choix.
  it('appelle rebond, pas automate, un rapport qui porte les deux marqueurs', () => {
    const n = natureDuMessage(
      msg({
        de: 'MAILER-DAEMON@lws-hosting.com',
        entetes: { 'Auto-Submitted': 'auto-replied', 'Content-Type': 'multipart/report; report-type=delivery-status' },
      }),
    )
    expect(n.nature).toBe('rebond')
  })

  it('range une adresse « no-reply » avec les automates', () => {
    expect(natureDuMessage(msg({ de: 'no-reply@fournisseur.fr' })).nature).toBe('automatique')
  })
})

describe('apparier', () => {
  it('lit l’inscription dans le sous-adressage du destinataire', () => {
    const a = apparier(msg({ pour: ['contact+' + INSCRIPTION + '@samadigitalstudio.fr'] }))
    expect(a).toEqual({ inscriptionId: INSCRIPTION, reference: null, moyen: 'sous_adressage' })
  })

  it('trouve le sous-adressage même quand il est en copie', () => {
    const a = apparier(
      msg({ pour: ['bilal@samadigitalstudio.fr', `contact+${INSCRIPTION}@samadigitalstudio.fr`] }),
    )
    expect(a.moyen).toBe('sous_adressage')
  })

  // Un jeton tronqué apparierait la réponse à la MAUVAISE inscription, ce qui
  // est pire que de ne pas l'apparier : on refuse au lieu d'assainir.
  it('refuse un jeton qui n’est pas un UUID et retombe plus bas', () => {
    const a = apparier(msg({ pour: ['contact+1111@samadigitalstudio.fr'], enReponseA: '<abc@resend.dev>' }))
    expect(a.moyen).toBe('reference')
    expect(a.reference).toBe('abc@resend.dev')
  })

  it('retombe sur l’adresse quand il n’y a ni sous-adressage ni référence', () => {
    expect(apparier(msg()).moyen).toBe('adresse')
  })

  it('ne rend « aucun » que si même l’expéditeur est illisible', () => {
    expect(apparier(msg({ de: 'sans arobase' })).moyen).toBe('aucun')
  })
})

describe('premiereReference', () => {
  // `References` empile le fil ; le message auquel on répond est le DERNIER.
  it('prend le dernier des References, pas le premier', () => {
    expect(premiereReference('<racine@x> <milieu@x> <dernier@x>')).toBe('dernier@x')
  })

  it('accepte une valeur sans chevrons', () => {
    expect(premiereReference('abc@resend.dev')).toBe('abc@resend.dev')
  })
})

describe('peutDebloquer', () => {
  // LA RÈGLE DE LA COUCHE, en un tableau : il faut un humain ET un appariement
  // exact. Chacun des deux seul ne suffit pas.
  it.each([
    ['reponse', 'sous_adressage', true],
    ['reponse', 'reference', true],
    ['reponse', 'adresse', false],
    ['reponse', 'aucun', false],
    ['automatique', 'sous_adressage', false],
    ['rebond', 'sous_adressage', false],
  ] as const)('%s + %s → %s', (nature, moyen, attendu) => {
    expect(peutDebloquer(nature, moyen)).toBe(attendu)
  })
})

describe('texteUtile', () => {
  it('coupe l’historique recopié sous la réponse', () => {
    const t = texteUtile(
      ['Ça m’intéresse, rappelez-moi.', '', 'Le 19 août 2026 à 14:32, Sama a écrit :', '> Bonjour,', '> votre site…'].join('\n'),
    )
    expect(t).toBe('Ça m’intéresse, rappelez-moi.')
  })

  it('coupe aussi sur le trait d’Outlook et sur l’en-tête recopié', () => {
    expect(texteUtile('Merci.\n________________________________\nDe : Sama <contact@sama.fr>')).toBe('Merci.')
  })

  // UNE DÉCOUPE TROP GOURMANDE EFFACERAIT LA RÉPONSE ELLE-MÊME. Une réponse
  // trop longue se lit ; une réponse perdue, non.
  it('rend le texte entier plutôt que rien quand la citation commence à la ligne 1', () => {
    expect(texteUtile('> tout est cité')).toBe('> tout est cité')
  })

  it('rend une chaîne vide sur un message sans texte', () => {
    expect(texteUtile(null)).toBe('')
  })
})
