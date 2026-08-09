import fs from 'fs'
import path from 'path'

import {
  ARCHIVE_REASONS,
  ARCHIVE_REASON_VALUES,
  archiveReasonLabel,
  isPlausibleDomain,
  reasonNeedsConcurrent,
  STATUT_CONCURRENT_VALUES,
} from '../reasons'

const MIGRATION = path.join(process.cwd(), 'sql/20260809_archivage_motive_et_concurrents.sql')

/** Extrait la liste de valeurs d'un `check (… in ('a','b',…))` du fichier SQL. */
const valuesOfCheck = (sql: string, marker: string): string[][] => {
  const found: string[][] = []
  const re = new RegExp(`${marker}[^)]*in\\s*\\(([^)]*)\\)`, 'g')
  for (const m of sql.matchAll(re)) {
    found.push([...m[1].matchAll(/'([^']+)'/g)].map((q) => q[1]))
  }
  return found
}

describe('vocabulaire des motifs d’archivage', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')

  // La garde qui compte : si quelqu'un ajoute un motif côté TS sans toucher au
  // SQL, la contrainte `check` rejettera l'archivage en 23514 à l'exécution.
  it('est exactement la liste de la contrainte SQL, sur les deux tables', () => {
    const lists = valuesOfCheck(sql, 'archive_reason is null or archive_reason')
    expect(lists).toHaveLength(2) // entreprises + opportunites
    for (const list of lists) {
      expect([...list].sort()).toEqual([...ARCHIVE_REASON_VALUES].sort())
    }
  })

  it('déclare les statuts de concurrent que la contrainte SQL accepte', () => {
    const [list] = valuesOfCheck(sql, 'statut')
    expect([...list].sort()).toEqual([...STATUT_CONCURRENT_VALUES].sort())
  })

  it('n’exige un concurrent que pour « refait par un concurrent »', () => {
    expect(reasonNeedsConcurrent('refait_par_concurrent')).toBe(true)
    expect(reasonNeedsConcurrent('pas_de_budget')).toBe(false)
    expect(reasonNeedsConcurrent(null)).toBe(false)
    expect(ARCHIVE_REASONS.filter((r) => reasonNeedsConcurrent(r.value))).toHaveLength(1)
  })

  it('affiche un libellé, et se rabat sur la valeur brute si la base a dérivé', () => {
    expect(archiveReasonLabel('pas_de_budget')).toBe('Pas de budget')
    expect(archiveReasonLabel('motif_inconnu')).toBe('motif_inconnu')
    expect(archiveReasonLabel(null)).toBe('')
  })

  // `canonicalizeDomain('pas une url')` renvoie « pas une url » : sans ce
  // filtre, le registre se remplirait de saisies libres.
  it('refuse ce qui n’est pas un domaine plausible', () => {
    expect(isPlausibleDomain('agence-web.fr')).toBe(true)
    expect(isPlausibleDomain('sub.agence.co.uk')).toBe(true)
    expect(isPlausibleDomain('pas une url')).toBe(false)
    expect(isPlausibleDomain('hello')).toBe(false)
    expect(isPlausibleDomain('')).toBe(false)
    expect(isPlausibleDomain('-agence.fr')).toBe(false)
    expect(isPlausibleDomain('agence..fr')).toBe(false)
  })
})
