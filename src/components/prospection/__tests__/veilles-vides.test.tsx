import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { Veilles } from '../Veilles'

/**
 * LE PIÈGE, POSÉ POUR LA NEUVIÈME FOIS — et ici il est plus vicieux qu'ailleurs.
 *
 * Sur les huit écrans précédents, un vide ambigu faisait croire à une absence.
 * Sur une veille, il fait croire à une SURVEILLANCE : « aucun signal » se lit
 * « je surveille, et tout va bien ». Une veille qui n'a jamais tourné dit
 * exactement le contraire — personne ne regarde. Et une lecture qui échoue dit
 * une troisième chose encore.
 *
 * S'y ajoute le piège propre aux signaux : la PREMIÈRE PASSE ramasse un
 * arriéré. 220 sites injoignables affichés le lendemain de la création ne sont
 * pas 220 sites tombés dans la nuit. L'écran doit le dire, et le dire LIGNE À
 * LIGNE — un avertissement en en-tête ne se relit pas.
 */

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const fetchMock = jest.fn()
jest.mock('@/utils/authedFetch', () => ({
  authedFetch: (...args: unknown[]) => fetchMock(...args),
}))

const reponse = (ok: boolean, corps: unknown) => ({ ok, json: async () => corps })

const CATALOGUE = {
  declencheurs: [
    {
      cle: 'rge_perime',
      libelle: 'RGE périmé',
      nature: 'signal',
      source: 'entreprise_rge_qualifications.date_fin',
      accroche: 'Son site affiche peut-être encore un logo qui n’est plus valable.',
      densite: { attribuees: 2, parc: null },
      evenementNatif: false,
    },
    {
      cle: 'audit_faible',
      libelle: 'Note d’audit sous 50',
      nature: 'segment',
      source: 'entreprises_audit_site.note_globale',
      accroche: 'Le site existe et il est mauvais : c’est la cohorte A.',
      densite: { attribuees: 305, parc: null },
      evenementNatif: false,
    },
  ],
  horsPortee: [
    {
      cle: 'note_audit_chute',
      libelle: 'La note d’audit qui chute',
      raison: 'entreprises_audit_site n’a qu’une ligne par entreprise : aucune note d’avant.',
      ceQuIlFaudrait: 'Une table d’historique des notes.',
    },
  ],
}

beforeEach(() => fetchMock.mockReset())

describe('la liste des veilles — un échec de lecture n’est pas « aucune veille »', () => {
  it('dit qu’elle n’a pas pu lire, et ne prétend pas que rien n’est surveillé', async () => {
    fetchMock.mockResolvedValue(reponse(false, { message: 'session expirée' }))
    render(<Veilles />)

    await waitFor(() => expect(screen.getByText(/n’ont pas pu être lues/i)).toBeInTheDocument())
    expect(screen.queryByText('Aucune veille en service.')).not.toBeInTheDocument()
  })

  it('garde « aucune veille » quand la lecture réussit et ne rend rien', async () => {
    fetchMock.mockResolvedValue(reponse(true, { veilles: [], ...CATALOGUE }))
    render(<Veilles />)

    await waitFor(() => expect(screen.getByText('Aucune veille en service.')).toBeInTheDocument())
    expect(screen.getByText(/La lecture a réussi/i)).toBeInTheDocument()
  })

  // LE CATALOGUE DOIT RESTER LISIBLE MÊME SANS VEILLE : c'est lui qui dit ce
  // qu'on peut surveiller, et il porte la densité mesurée. Un déclencheur qui
  // vise 305 fiches sur 908 n'est pas un signal — l'écran le nomme « segment »
  // plutôt que de le mélanger aux autres.
  it('affiche la densité mesurée, et distingue un segment d’un signal', async () => {
    fetchMock.mockResolvedValue(reponse(true, { veilles: [], ...CATALOGUE }))
    render(<Veilles />)

    await waitFor(() => expect(screen.getByText('RGE périmé')).toBeInTheDocument())
    expect(screen.getByText(/2 attribuée/)).toBeInTheDocument()
    expect(screen.getByText(/segment — à verser dans une campagne/i)).toBeInTheDocument()
  })

  /**
   * CE QU'ON NE SAIT PAS VOIR EST À L'ÉCRAN. Sans ce bloc, « la note d'audit
   * qui chute » serait redemandée tous les trimestres, et il faudrait re-mesurer
   * à chaque fois pour redire non.
   */
  it('montre ce qui est hors de portée, avec sa raison', async () => {
    fetchMock.mockResolvedValue(reponse(true, { veilles: [], ...CATALOGUE }))
    render(<Veilles />)

    await waitFor(() => expect(screen.getByText('La note d’audit qui chute')).toBeInTheDocument())
    expect(screen.getByText(/qu’une ligne par entreprise/i)).toBeInTheDocument()
  })
})

describe('une veille et ses lignes', () => {
  const veille = {
    id: 'v1',
    nom: 'RGE périmé',
    declencheur: 'rge_perime',
    perimetre: 'attribuees',
    actif: true,
    premierePasseLe: '2026-08-20T09:00:00Z',
    dernierePasseLe: '2026-08-20T09:00:00Z',
    bilan: { examinees: 2, nouvelles: 2, connues: 0, reprise: true },
    etat: 'reprise_faite',
    phrase: 'Première passe : 2 entreprises d’arriéré, pas des événements du jour.',
    aTraiter: 2,
  }

  const brancher = (detail: { ok: boolean; corps: unknown }) => {
    fetchMock.mockImplementation((url: string) => {
      if (/\/veilles\/v1$/.test(url)) return Promise.resolve(reponse(detail.ok, detail.corps))
      return Promise.resolve(reponse(true, { veilles: [veille], ...CATALOGUE }))
    })
  }

  // LE TEST QUI COMPTE : une reprise ne se présente jamais comme une veille.
  //
  // ⚠️ On attend sur l'ÉTAT, pas sur le mot « arriéré » : l'en-tête de la page
  // le contient déjà en dur (« Sa première passe ramasse l'arriéré »), donc un
  // `waitFor` là-dessus passe avant même que le serveur ait répondu — et le
  // test verdit sur une page vide. C'est exactement le genre de faux positif
  // qui laisse passer la régression qu'on croyait couvrir.
  it('annonce que la première passe est un arriéré, pas des événements du jour', async () => {
    brancher({ ok: true, corps: { veille, fiche: null, lignes: [], tronque: false } })
    render(<Veilles />)

    await waitFor(() => expect(screen.getByText('reprise faite')).toBeInTheDocument())
    expect(screen.getByText(/2 entreprises d’arriéré/)).toBeInTheDocument()
    expect(screen.queryByText(/nouvelles depuis la dernière passe/i)).not.toBeInTheDocument()
  })

  it('nomme la panne d’une veille plutôt que de la dire « à jour »', async () => {
    const enPanne = {
      ...veille,
      etat: 'panne',
      bilan: { examinees: 0, nouvelles: 0, connues: 0, reprise: false, panne: 'lecture tronquée' },
      phrase: 'La lecture a échoué — lecture tronquée. Ce n’est pas « rien trouvé ».',
    }
    fetchMock.mockResolvedValue(reponse(true, { veilles: [enPanne], ...CATALOGUE }))
    render(<Veilles />)

    await waitFor(() => expect(screen.getByText('en panne')).toBeInTheDocument())
    expect(screen.getByText(/Ce n’est pas « rien trouvé »/)).toBeInTheDocument()
  })
})
