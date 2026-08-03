/**
 * « Enregistrement impossible » pour tout et n'importe quoi ne dit rien de ce
 * qu'il faut corriger. Chaque échec doit nommer sa cause.
 */
import { failureMessage } from '../RegulatorPage'

describe('failureMessage', () => {
  it('préfère toujours le message du serveur', () => {
    expect(failureMessage(503, { message: 'Jouez sql/20260802_test_phase_guard.sql' })).toBe(
      'Jouez sql/20260802_test_phase_guard.sql',
    )
  })

  it('distingue session expirée et droits insuffisants', () => {
    expect(failureMessage(401, null)).toMatch(/Session expirée/)
    expect(failureMessage(403, { error: 'forbidden' })).toMatch(/administrateurs/)
  })

  it('signale une valeur refusée par la validation', () => {
    expect(failureMessage(400, { error: 'invalid_body' })).toMatch(/Valeur refusée/)
  })

  it('reporte le code serveur plutôt qu’un message vague', () => {
    expect(failureMessage(500, { error: 'column_missing' })).toContain('column_missing')
    expect(failureMessage(409, { error: 'conflit' })).toContain('conflit')
  })
})
