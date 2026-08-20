/**
 * Le SMS comme nature d'étape — ce qui doit rester vrai de bout en bout.
 *
 * Le fil rouge : une étape SMS pose une TÂCHE, elle n'envoie rien. Un
 * fournisseur existe côté téléphonie mais n'a jamais envoyé un seul message ;
 * cf. `sql/20260820_canal_sms.sql`.
 */
import { CAPACITES, analyserMessage, capaciteDuCanal } from '@/lib/automations/redaction'
import { lienSms } from '@/lib/prospects/canal'
import type { SeqStepKind } from '@/components/automations/types'
import type { ProspectionKind } from '@/components/automations/types'

describe('le SMS est une nature d’étape ET une nature de tâche', () => {
  it('existe des deux côtés — sinon l’INSERT échoue et l’inscription entière cale', () => {
    const etape: SeqStepKind = 'sms'
    const tache: ProspectionKind = 'sms'
    expect(etape).toBe('sms')
    expect(tache).toBe('sms')
  })
})

describe('ce que l’éditeur dit d’un SMS', () => {
  it('n’a ni objet, ni pièce jointe, ni texte riche', () => {
    const c = capaciteDuCanal('sms')
    expect(c).toMatchObject({ objet: false, texteRiche: false, piecesJointes: false })
  })

  it('n’impose AUCUNE limite dure — le SMS long part, il coûte juste plus cher', () => {
    expect(CAPACITES.sms.limite).toBeNull()
    const a = analyserMessage('a'.repeat(500), {}, CAPACITES.sms)
    expect(a.depassement).toBeNull()
    expect(a.valide).toBe(true)
  })

  it('compte les segments sur le RENDU, donc sur ce que ce prospect recevra', () => {
    // « Établissements » ne bascule PAS : É et é sont tous deux dans la table
    // GSM (0x1F et 0x05). Ce qui bascule, c'est l'apostrophe typographique —
    // et c'est le cas le plus fréquent d'un fichier français.
    const sobre = { 'company.name': 'Établissements Léonard' }
    const apostrophe = { 'company.name': 'Toiture d’Anjou' }
    expect(analyserMessage('Bonjour {{company.name}}', sobre, CAPACITES.sms).sms).toMatchObject({
      alphabet: 'gsm',
      segments: 1,
    })
    const long = analyserMessage(`Bonjour {{company.name}}, ${'a'.repeat(60)}`, apostrophe, CAPACITES.sms)
    expect(long.sms?.alphabet).toBe('ucs2')
    expect(long.sms?.coupable).toBe('’')
    // 85 caractères en UCS-2 : le segment tombe à 67, donc deux SMS.
    expect(long.sms?.segments).toBe(2)
  })
})

describe('le geste : ouvrir, pas envoyer', () => {
  it('prépare un lien que le téléphone ouvre, avec le texte déjà écrit', () => {
    expect(lienSms('06 12 34 56 78', 'Bonjour Toiture Martin')).toBe(
      'sms:+33612345678?&body=Bonjour%20Toiture%20Martin',
    )
  })

  it('refuse un numéro inexploitable au lieu d’ouvrir dans le vide', () => {
    expect(lienSms('1234', 'x')).toBeNull()
  })
})
