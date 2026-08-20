import {
  CAPACITES,
  analyserMessage,
  capaciteDuCanal,
  coutSms,
  insertConditionnel,
  rendreConditionnels,
  rendreMessage,
} from '@/lib/automations/redaction'
import type { VarBag } from '@/lib/automations/variables'

const AVEC_SITE: VarBag = {
  'company.name': 'Toiture Martin',
  'company.website': 'toituremartin.fr',
  'company.city': 'Angers',
}
const SANS_SITE: VarBag = { 'company.name': 'Plomberie Dupont', 'company.website': '' }

describe('rendreConditionnels — la phrase qui change', () => {
  const texte = '{% si company.website %}une refonte{% sinon %}une création{% fin %} de site'

  it('prend la branche « si » quand la variable est remplie', () => {
    expect(rendreConditionnels(texte, AVEC_SITE).rendu).toBe('une refonte de site')
  })

  it('prend la branche « sinon » quand elle est vide', () => {
    expect(rendreConditionnels(texte, SANS_SITE).rendu).toBe('une création de site')
  })

  it('traite une variable ABSENTE du sac comme vide — c’est le cas des deux cohortes', () => {
    // La cohorte B n'a pas de site : le sac ne porte pas la clé du tout.
    expect(rendreConditionnels(texte, { 'company.name': 'X' }).rendu).toBe('une création de site')
  })

  it('accepte un bloc sans « sinon »', () => {
    const t = 'Bonjour{% si company.city %}, à {{company.city}}{% fin %} !'
    expect(rendreMessage(t, AVEC_SITE)).toBe('Bonjour, à Angers !')
    expect(rendreMessage(t, SANS_SITE)).toBe('Bonjour !')
  })

  it('résout les alias dans la condition comme ailleurs', () => {
    expect(rendreConditionnels('{% si ville %}ok{% fin %}', AVEC_SITE).rendu).toBe('ok')
  })

  it('accepte les mots-clés anglais d’un modèle copié d’ailleurs', () => {
    const t = '{% if company.website %}A{% else %}B{% endif %}'
    expect(rendreConditionnels(t, AVEC_SITE).rendu).toBe('A')
    expect(rendreConditionnels(t, SANS_SITE).rendu).toBe('B')
  })

  it('gère l’imbrication', () => {
    const t = '{% si company.website %}site{% si company.city %} à {{company.city}}{% fin %}{% sinon %}rien{% fin %}'
    expect(rendreMessage(t, AVEC_SITE)).toBe('site à Angers')
    expect(rendreMessage(t, SANS_SITE)).toBe('rien')
  })
})

describe('rendreConditionnels — ce qui est mal écrit ne part jamais brut', () => {
  it('signale une clé qui n’existe pas, au lieu de toujours répondre non', () => {
    const { fautes, rendu } = rendreConditionnels('{% si compagny.website %}A{% sinon %}B{% fin %}', AVEC_SITE)
    expect(fautes.map((f) => f.code)).toEqual(['cle_inconnue'])
    expect(fautes[0].sujet).toBe('compagny.website')
    // Elle serait toujours fausse — et c'est précisément pourquoi on le dit.
    expect(rendu).toBe('B')
  })

  it('lit un « si » non fermé comme s’il se fermait à la fin, et le dit', () => {
    const { fautes, rendu } = rendreConditionnels('avant {% si company.website %}dedans', AVEC_SITE)
    expect(fautes.map((f) => f.code)).toEqual(['si_non_ferme'])
    expect(rendu).toBe('avant dedans')
  })

  it('ignore un « fin » orphelin sans manger de texte', () => {
    const { fautes, rendu } = rendreConditionnels('a{% fin %}b', AVEC_SITE)
    expect(fautes.map((f) => f.code)).toEqual(['fin_orpheline'])
    expect(rendu).toBe('ab')
  })

  it('ignore un « sinon » orphelin', () => {
    expect(rendreConditionnels('a{% sinon %}b', AVEC_SITE).fautes[0].code).toBe('sinon_orphelin')
  })

  it('refuse un « si » sans variable', () => {
    expect(rendreConditionnels('{% si %}A{% fin %}', AVEC_SITE).fautes[0].code).toBe('si_sans_cle')
  })

  it('laisse au texte ce qui ressemble à une balise sans en être une', () => {
    expect(rendreConditionnels('coût {% tva %} incluse', AVEC_SITE).rendu).toBe('coût {% tva %} incluse')
  })

  it('ne laisse JAMAIS une balise reconnue dans le rendu', () => {
    for (const t of ['{% si x %}', '{% sinon %}', '{% fin %}', '{% si company.website %}a']) {
      expect(rendreConditionnels(t, AVEC_SITE).rendu).not.toMatch(/\{%/)
    }
  })
})

describe('rendreMessage — l’ordre des deux passes', () => {
  it('déplie AVANT d’interpoler, pour qu’un nom d’entreprise ne devienne pas une balise', () => {
    const vars: VarBag = { 'company.name': 'SARL {% fin %} & Fils', 'company.website': 'x.fr' }
    const rendu = rendreMessage('{% si company.website %}Bonjour {{company.name}}{% sinon %}rien{% fin %}', vars)
    // La balise venue de la raison sociale reste du texte : elle n'a pas fermé le bloc.
    expect(rendu).toBe('Bonjour SARL {% fin %} & Fils')
  })

  it('nettoie les lignes vides laissées par une balise seule sur sa ligne', () => {
    const t = 'Bonjour,\n{% si company.website %}\nVotre site actuel.\n{% sinon %}\nVous n’avez pas de site.\n{% fin %}\nÀ bientôt.'
    expect(rendreMessage(t, SANS_SITE)).toBe('Bonjour,\n\nVous n’avez pas de site.\n\nÀ bientôt.')
  })

  it('ne touche pas au blanc d’un message sans aucune balise', () => {
    const t = '  Bonjour,\n\n\n\nÀ bientôt.  '
    expect(rendreMessage(t, AVEC_SITE)).toBe(t)
  })
})

describe('coutSms — un caractère change la facture', () => {
  it('compte un segment jusqu’à 160 caractères en GSM', () => {
    const c = coutSms('a'.repeat(160))
    expect(c).toMatchObject({ alphabet: 'gsm', segments: 1, unites: 160, coupable: null })
  })

  it('passe à 153 par segment au-delà', () => {
    expect(coutSms('a'.repeat(161)).segments).toBe(2)
    expect(coutSms('a'.repeat(306)).segments).toBe(2)
    expect(coutSms('a'.repeat(307)).segments).toBe(3)
  })

  it('accepte les accents que le GSM porte vraiment', () => {
    expect(coutSms('éàèùìòÉÄÖÜ').alphabet).toBe('gsm')
  })

  it('bascule sur le ç MINUSCULE — le GSM ne porte que le Ç majuscule', () => {
    // Vérifié contre la table GSM 03.38 : 0x09 = Ç, et il n'y a pas de ç.
    // Conséquence directe pour nous : « français », « reçu », « ça » font
    // tomber le segment de 160 à 70.
    expect(coutSms('Ç').alphabet).toBe('gsm')
    expect(coutSms('reçu').coupable).toBe('ç')
  })

  it('bascule en UCS-2 sur l’apostrophe typographique — celle que tout le CRM écrit', () => {
    const c = coutSms('l’essentiel')
    expect(c.alphabet).toBe('ucs2')
    expect(c.coupable).toBe('’')
    expect(c.segments).toBe(1)
  })

  it('bascule sur ê, que le GSM ne porte pas', () => {
    expect(coutSms('vous êtes').coupable).toBe('ê')
  })

  it('tombe à 70 caractères par segment en UCS-2', () => {
    expect(coutSms('ê' + 'a'.repeat(69)).segments).toBe(1)
    expect(coutSms('ê' + 'a'.repeat(70)).segments).toBe(2)
  })

  it('compte double les caractères de l’alphabet étendu', () => {
    expect(coutSms('€').unites).toBe(2)
    expect(coutSms('a'.repeat(159) + '€').segments).toBe(2)
  })

  it('compte un emoji une fois, pas deux', () => {
    expect(coutSms('👍').unites).toBe(1)
  })

  it('rend zéro segment pour un texte vide', () => {
    expect(coutSms('').segments).toBe(0)
  })
})

describe('capaciteDuCanal', () => {
  it('rend la capacité de la nature d’étape', () => {
    expect(capaciteDuCanal('email').objet).toBe(true)
    expect(capaciteDuCanal('whatsapp').objet).toBe(false)
    expect(capaciteDuCanal('sms').segmente).toBe(true)
  })

  it('retombe sur la consigne — qui n’envoie rien — pour une nature inconnue', () => {
    expect(capaciteDuCanal('teleportation').canal).toBe('task')
    expect(capaciteDuCanal(null).piecesJointes).toBe(false)
  })

  it('n’impose qu’une seule limite DURE dans tout le catalogue : la note LinkedIn', () => {
    const durs = Object.values(CAPACITES).filter((c) => c.limite !== null)
    expect(durs.map((c) => c.canal)).toEqual(['linkedin_invitation'])
    expect(durs[0].limite).toBe(200)
  })
})

describe('analyserMessage', () => {
  const email = CAPACITES.email

  it('mesure la longueur sur le RENDU, pas sur la source', () => {
    const a = analyserMessage('Bonjour {{company.name}}', AVEC_SITE, email)
    expect(a.rendu).toBe('Bonjour Toiture Martin')
    expect(a.longueur).toBe('Bonjour Toiture Martin'.length)
  })

  it('ne signale pas un trou dans une branche que ce prospect ne prendra pas', () => {
    const t = '{% si company.website %}votre site {{company.website}}{% sinon %}pas de site{% fin %}'
    expect(analyserMessage(t, SANS_SITE, email).manquantes).toEqual([])
    expect(analyserMessage(t, { 'company.name': 'X' }, email).manquantes).toEqual([])
  })

  it('signale un trou dans la branche RÉELLEMENT prise', () => {
    const t = '{% si company.name %}Bonjour {{contact.first_name}}{% fin %}'
    expect(analyserMessage(t, AVEC_SITE, email).manquantes).toEqual(['contact.first_name'])
  })

  it('ne signale pas une variable couverte par un repli', () => {
    const a = analyserMessage('{{contact.first_name | "bonjour"}}', AVEC_SITE, email)
    expect(a.manquantes).toEqual([])
    expect(a.rendu).toBe('bonjour')
  })

  it('refuse une note LinkedIn trop longue, et dit de combien', () => {
    const a = analyserMessage('a'.repeat(210), {}, CAPACITES.linkedin_invitation)
    expect(a.depassement).toEqual({ limite: 200, de: 10 })
    expect(a.valide).toBe(false)
  })

  it('distingue l’avis du refus : au-delà du confort, ça reste valide', () => {
    const a = analyserMessage('a'.repeat(1000), {}, CAPACITES.whatsapp)
    expect(a.auDelaDuConfort).toEqual({ confort: 900, de: 100 })
    expect(a.depassement).toBeNull()
    expect(a.valide).toBe(true)
  })

  it('rend le coût SMS pour le SMS seul', () => {
    expect(analyserMessage('bonjour', {}, CAPACITES.sms).sms?.segments).toBe(1)
    expect(analyserMessage('bonjour', {}, email).sms).toBeNull()
  })

  it('invalide un message dont la structure est fautive', () => {
    expect(analyserMessage('{% si inconnue.cle %}A{% fin %}', {}, email).valide).toBe(false)
  })
})

describe('insertConditionnel', () => {
  it('enveloppe la sélection et pose le curseur en fin de branche « si »', () => {
    const { text, cursor } = insertConditionnel('avant refonte après', 'company.website', 6, 13)
    expect(text).toBe('avant {% si company.website %}\nrefonte\n{% sinon %}\n\n{% fin %} après')
    expect(text.slice(cursor)).toBe('\n{% sinon %}\n\n{% fin %} après')
  })

  it('pose un bloc vide quand rien n’est sélectionné', () => {
    expect(insertConditionnel('', 'company.website', 0).text).toBe(
      '{% si company.website %}\n\n{% sinon %}\n\n{% fin %}',
    )
  })
})
