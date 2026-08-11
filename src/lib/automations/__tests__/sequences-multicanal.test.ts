/**
 * @jest-environment node
 *
 * Les trois séquences sont semées en SQL (`sql/20260813_sequences_multicanal.sql`),
 * donc rien côté TypeScript ne les vérifie au moment de l'écriture. Ce test lit
 * le fichier de migration et contrôle ce qui rendrait une séquence muette ou
 * bloquée en production — les fautes qu'on ne découvrirait qu'après l'envoi.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { correspondAuPublic, type Canal } from '@/lib/prospects/canal'
import { usedVariables, VARIABLES } from '../variables'

const SQL = readFileSync(join(process.cwd(), 'sql/20260813_sequences_multicanal.sql'), 'utf8')

/** Les publics déclarés, tels que la migration les écrit. */
const PUBLICS: Record<string, { requireCanaux: Canal[]; excludeCanaux?: Canal[] }> = {
  'WhatsApp seul': { requireCanaux: ['mobile'], excludeCanaux: ['email'] },
  'E-mail + fixe': { requireCanaux: ['email', 'fixe'] },
  Mix: { requireCanaux: ['email', 'mobile'] },
}

describe('séquences multicanal — publics visés', () => {
  const canaux = (...c: Canal[]) => new Set(c)

  it('couvrent les trois segments sans se chevaucher', () => {
    const segments: Array<[string, Set<Canal>]> = [
      ['WhatsApp seul', canaux('mobile')],
      ['E-mail + fixe', canaux('email', 'fixe')],
      ['Mix', canaux('email', 'mobile')],
    ]

    for (const [attendu, cx] of segments) {
      const eligibles = Object.entries(PUBLICS)
        .filter(([, p]) => correspondAuPublic(cx, p))
        .map(([nom]) => nom)
      // Un segment qui déclencherait deux séquences ferait recevoir au prospect
      // deux campagnes en parallèle.
      expect(eligibles).toEqual([attendu])
    }
  })

  it('n’attrapent pas un prospect joignable par le fixe seul', () => {
    // Ces 17 fiches n'ont aucune séquence : c'est assumé, pas un oubli
    // silencieux. Les faire entrer dans « e-mail + fixe » gèlerait leur étape
    // e-mail faute d'adresse.
    const eligibles = Object.values(PUBLICS).filter((p) => correspondAuPublic(canaux('fixe'), p))
    expect(eligibles).toHaveLength(0)
  })
})

describe('séquences multicanal — la migration', () => {
  it('déclare un public sur chaque séquence, sinon aucune ne serait suggérée', () => {
    expect(SQL.match(/'requireCanaux'/g) ?? []).toHaveLength(3)
  })

  it('n’active aucune séquence sans relecture', () => {
    // Trois `'draft'`, un par séquence : rien ne part avant qu'on l'active.
    expect(SQL.match(/'draft',/g) ?? []).toHaveLength(3)
    expect(SQL).not.toContain("'on',")
  })

  it('ne coche pas la pièce jointe d’audit, qui partirait vide', () => {
    // `audits.pdf_url` n'est écrit par aucun code du dépôt : cocher la case
    // ferait croire à une pièce jointe qui n'existe pas.
    expect(SQL).toContain("'attachAudit', false")
    expect(SQL).not.toContain("'attachAudit', true")
  })

  it('n’utilise que des variables que le moteur sait remplir', () => {
    const connues = new Set(VARIABLES.map((v) => v.key))
    // Toutes les `{{…}}` du fichier, alias résolus par `usedVariables`.
    for (const key of usedVariables(SQL)) {
      expect(connues.has(key)).toBe(true)
    }
  })

  it('ne laisse aucune attente-réponse sans issue après l’envoi de la démo', () => {
    // Une attente à `replyTimeoutDays: 0` n'avance QUE sur clic humain. C'est
    // voulu après l'accroche — insister sans réponse fait bloquer le numéro —
    // mais après la démo il en faut une qui se relance seule, sinon un prospect
    // silencieux reste garé pour toujours.
    const sansRelance = SQL.match(/'replyTimeoutDays', 0/g) ?? []
    const avecRelance = SQL.match(/'replyTimeoutDays', [1-9]/g) ?? []
    expect(sansRelance).toHaveLength(2) // les deux accroches
    expect(avecRelance).toHaveLength(2) // les deux après-démo
  })

  it('espace l’e-mail et le WhatsApp de la séquence mixte', () => {
    // Les deux le même jour se lisent comme du harcèlement automatisé.
    const mix = SQL.slice(SQL.indexOf('E-mail + WhatsApp — mix'))
    const whatsapp = mix.slice(mix.indexOf("'id', 's2'"))
    expect(whatsapp).toContain("'day', 1")
  })
})
