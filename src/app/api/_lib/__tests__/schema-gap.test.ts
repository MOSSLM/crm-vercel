import { isMissingColumn, isMissingTable, isSchemaGap, migrationMessage } from '../schema-gap'

describe('détection des migrations manquantes', () => {
  it('reconnaît une colonne absente, par code ou par message', () => {
    expect(isMissingColumn({ code: '42703' })).toBe(true)
    expect(isMissingColumn({ code: 'PGRST204' })).toBe(true)
    expect(
      isMissingColumn({
        message: "Could not find the 'test_mode' column of 'regulator_settings' in the schema cache",
      }),
    ).toBe(true)
    expect(isMissingColumn({ code: '23514', message: 'violates check constraint' })).toBe(false)
    expect(isMissingColumn(null)).toBe(false)
  })

  it('reconnaît une table absente', () => {
    expect(isMissingTable({ code: '42P01' })).toBe(true)
    expect(isMissingTable({ code: 'PGRST205' })).toBe(true)
    expect(isMissingTable({ message: 'Could not find the table public.test_email_addresses' })).toBe(true)
    expect(isMissingTable({ code: '42703' })).toBe(false)
  })

  it('regroupe les deux cas sous « trou de schéma »', () => {
    expect(isSchemaGap({ code: '42703' })).toBe(true)
    expect(isSchemaGap({ code: '42P01' })).toBe(true)
    expect(isSchemaGap({ code: '23505', message: 'duplicate key' })).toBe(false)
  })

  it('nomme le fichier SQL à jouer', () => {
    const msg = migrationMessage('sql/20260802_test_phase_guard.sql', 'Ce réglage n’existe pas encore en base')
    expect(msg).toContain('sql/20260802_test_phase_guard.sql')
    expect(msg).toContain('Ce réglage n’existe pas encore en base')
  })
})
