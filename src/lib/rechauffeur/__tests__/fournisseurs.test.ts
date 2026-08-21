import { HOTES_CONNUS } from '../hotes-connus'
import { FAMILLES } from '../sante'
import {
  HOTE_LWS,
  MODES_OPERATOIRES,
  modeOperatoire,
  suggestionHote,
} from '../fournisseurs'

describe('MODES_OPERATOIRES', () => {
  it('couvre toutes les familles, sans trou ni doublon', () => {
    const couvertes = MODES_OPERATOIRES.map((m) => m.famille)
    expect([...couvertes].sort()).toEqual([...FAMILLES].sort())
  })

  it('lit ses hôtes dans le catalogue plutôt que de les recopier', () => {
    // Le jour où un fournisseur change de serveur, il ne doit y avoir qu'un
    // seul endroit à corriger — sinon l'écran affiche l'ancien et le moteur
    // se connecte au nouveau.
    for (const m of MODES_OPERATOIRES) {
      if (m.famille === 'autre') continue
      const domaine = m.domaines[0]
      expect(m.imap).toBe(HOTES_CONNUS[domaine].imapHote)
    }
  })

  it('ne réserve l’hôte de l’hébergeur qu’aux boîtes de l’hébergeur', () => {
    const avecLws = MODES_OPERATOIRES.filter((m) => m.imap === HOTE_LWS)
    expect(avecLws.map((m) => m.famille)).toEqual(['autre'])
  })

  it('donne à chaque famille des gestes, pas une phrase', () => {
    for (const m of MODES_OPERATOIRES) {
      expect(m.etapes.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('dit lesquelles ne se créent pas — Orange et Free demandent un abonnement', () => {
    const empruntees = MODES_OPERATOIRES.filter((m) => m.creation === 'abonnement')
    expect(empruntees.map((m) => m.famille).sort()).toEqual(['free', 'orange'])
  })
})

describe('modeOperatoire', () => {
  it('rend le mode de la famille demandée', () => {
    expect(modeOperatoire('orange').libelle).toMatch(/Orange/)
    expect(modeOperatoire('google').imap).toBe('imap.gmail.com')
  })
})

describe('suggestionHote', () => {
  it('remplit serveur et port pour un fournisseur connu', () => {
    expect(suggestionHote('claire.petit@gmail.com')).toEqual({
      hote: 'imap.gmail.com',
      port: 993,
      libelle: 'Gmail',
    })
  })

  it('range wanadoo avec orange', () => {
    expect(suggestionHote('a@wanadoo.fr')?.hote).toBe('imap.orange.fr')
    expect(suggestionHote('a@wanadoo.fr')?.libelle).toMatch(/Orange/)
  })

  it('rend null sur nos propres domaines : l’hôte LWS ne se devine pas', () => {
    // C'est le cœur du défaut corrigé : le formulaire proposait
    // `mail84.lwspanel.com` à TOUT LE MONDE. Il ne vaut que là où on ne
    // devine rien — et c'est à l'humain de le taper, pas au champ de le
    // suggérer pour une boîte Gmail.
    expect(suggestionHote('contact@samadigitalstudio.fr')).toBeNull()
    expect(suggestionHote('pas-une-adresse')).toBeNull()
  })
})
