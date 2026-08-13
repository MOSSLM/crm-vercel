/**
 * Dupliquer deux fois de suite est le cas NORMAL quand on essaie des variantes
 * d'une même séquence — c'est même à ça que sert le bouton. Trois lignes nommées
 * à l'identique dans la liste seraient indistinguables, et le menu « … » de
 * chacune agirait sur une séquence qu'on ne saurait pas nommer.
 */
import { nomDeCopie } from '../automations-db'

describe('nomDeCopie', () => {
  it('suffixe une première copie', () => {
    expect(nomDeCopie('WhatsApp seul — sans e-mail')).toBe('WhatsApp seul — sans e-mail (copie)')
  })

  it('numérote à partir de la deuxième, sans empiler les suffixes', () => {
    expect(nomDeCopie('Ma séquence (copie)')).toBe('Ma séquence (copie 2)')
    expect(nomDeCopie('Ma séquence (copie 2)')).toBe('Ma séquence (copie 3)')
    expect(nomDeCopie('Ma séquence (copie 9)')).toBe('Ma séquence (copie 10)')
  })

  it('ne prend pas une parenthèse quelconque pour un suffixe de copie', () => {
    expect(nomDeCopie('Relance (été 2026)')).toBe('Relance (été 2026) (copie)')
  })

  it('tolère l’espace de fin que laisse une saisie à la main', () => {
    expect(nomDeCopie('Ma séquence (copie) ')).toBe('Ma séquence (copie 2)')
  })
})
