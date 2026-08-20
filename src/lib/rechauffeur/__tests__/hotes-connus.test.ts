import { HOTES_CONNUS, reglagesDeviness } from '../hotes-connus'

describe('reglagesDeviness', () => {
  it('reconnaît les cinq fournisseurs qu\'on recommande', () => {
    for (const email of ['a@gmail.com', 'a@outlook.fr', 'a@yahoo.fr', 'a@free.fr', 'a@orange.fr']) {
      expect(reglagesDeviness(email)).not.toBeNull()
    }
  })

  it('wanadoo.fr utilise les mêmes serveurs qu\'orange.fr — même opérateur', () => {
    expect(reglagesDeviness('a@wanadoo.fr')).toEqual(reglagesDeviness('a@orange.fr'))
  })

  it('rend null pour un domaine inconnu, sans deviner un hôte au hasard', () => {
    expect(reglagesDeviness('contact@samadigitalstudio.fr')).toBeNull()
    expect(reglagesDeviness('pas-une-adresse')).toBeNull()
  })

  it('ignore la casse de l\'adresse', () => {
    expect(reglagesDeviness('A@GMAIL.COM')).toEqual(HOTES_CONNUS['gmail.com'])
  })

  it('chaque entrée porte des ports plausibles (25/465/587/993)', () => {
    for (const r of Object.values(HOTES_CONNUS)) {
      expect([465, 587]).toContain(r.smtpPort)
      expect(r.imapPort).toBe(993)
    }
  })
})
