import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { CampagnesListe } from '../CampagnesListe'
import { CampagneDetail } from '../CampagneDetail'

/**
 * LES VIDES DES DEUX ÉCRANS DE CAMPAGNE, ET CE QU'ILS DISENT VRAIMENT.
 *
 * C'est la septième fois que ce projet pose le même piège : un résultat vide
 * qui ne dit pas de quoi il est fait. Ici il se posait deux fois, et la seconde
 * était la pire.
 *
 * 1. LA LISTE. Un 503 « migration non appliquée » ou une session expirée
 *    laissait `campagnes` à `[]`, et l'écran répondait « Aucune campagne » en
 *    invitant à en créer une — alors que la campagne WhatsApp et ses 153 leads
 *    existent. Le toast s'efface ; la phrase reste. Et la bannière des
 *    inscriptions garées se calcule SUR cette liste : les 59 que toute la
 *    couche existe pour rendre visibles redevenaient silencieuses.
 *
 * 2. LE DÉTAIL. Un seul rendu vide couvrait trois situations : le filtre de
 *    statut ne trouve personne, la lecture a échoué, ou la campagne n'a
 *    réellement pas de liste. Il affirmait toujours la troisième, et invitait à
 *    verser un segment dans une campagne déjà peuplée.
 */

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const fetchMock = jest.fn()
jest.mock('@/utils/authedFetch', () => ({
  authedFetch: (...args: unknown[]) => fetchMock(...args),
}))

const reponse = (ok: boolean, corps: unknown) => ({
  ok,
  json: async () => corps,
})

beforeEach(() => fetchMock.mockReset())

describe('CampagnesListe — une lecture qui échoue n’est pas « aucune campagne »', () => {
  it('dit qu’elle n’a pas pu lire, et nomme le fichier de migration', async () => {
    fetchMock.mockResolvedValue(
      reponse(false, { error: 'migration_non_appliquee', message: 'sql/20260819_campagne_leads_compte.sql' }),
    )
    render(<CampagnesListe />)

    await waitFor(() => expect(screen.getByText(/n’ont pas pu être lues/i)).toBeInTheDocument())
    expect(screen.getByText(/sql\/20260819_campagne_leads_compte\.sql/)).toBeInTheDocument()
    expect(screen.queryByText('Aucune campagne')).not.toBeInTheDocument()
  })

  // « On n'a pas pu compter » n'est pas « zéro ». Sans cette phrase, l'absence
  // de bannière se lit comme une absence de problème.
  it('ne laisse pas croire que zéro inscription est garée', async () => {
    fetchMock.mockResolvedValue(reponse(false, { error: 'boom' }))
    render(<CampagnesListe />)

    await waitFor(() => expect(screen.getByText(/n’ont pas pu être comptées/i)).toBeInTheDocument())
  })

  it('garde « Aucune campagne » quand la lecture réussit et ne rend rien', async () => {
    fetchMock.mockResolvedValue(reponse(true, { campagnes: [] }))
    render(<CampagnesListe />)

    await waitFor(() => expect(screen.getByText('Aucune campagne')).toBeInTheDocument())
    expect(screen.queryByText(/n’ont pas pu être lues/i)).not.toBeInTheDocument()
  })
})

describe('CampagneDetail — trois vides, trois phrases', () => {
  /** La revue, réduite à ce que l'écran lit. La campagne EXISTE. */
  const revueVide = {
    campagne: { id: 'c1', nom: 'Cohorte B', statut: 'draft', etapes: 5, canaux: ['whatsapp'] },
    controles: [],
    peutLancer: false,
    decompte: { total: 153, aLancer: 153, parMotif: [] },
    prochains: [],
  }

  const brancher = (leads: { ok: boolean; corps: unknown }) => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/leads')) return Promise.resolve(reponse(leads.ok, leads.corps))
      if (url.includes('/revue')) return Promise.resolve(reponse(true, revueVide))
      return Promise.resolve(reponse(true, { segments: [], lots: [] }))
    })
  }

  it('dit que la LECTURE a échoué, au lieu d’affirmer qu’il n’y a pas de liste', async () => {
    brancher({ ok: false, corps: { message: 'session expirée' } })
    render(<CampagneDetail id="c1" />)

    await waitFor(() => expect(screen.getByText(/n’a pas pu être lue/i)).toBeInTheDocument())
    expect(screen.queryByText(/pas encore de liste/i)).not.toBeInTheDocument()
  })

  // LE CAS QUI ARRIVE EN USAGE NORMAL : 153 leads, aucun écarté, on filtre sur
  // « Écarté » — et l'écran invitait à verser un segment.
  it('distingue « ce filtre ne trouve personne » de « pas de liste »', async () => {
    brancher({ ok: true, corps: { items: [], total: 0 } })
    const { container } = render(<CampagneDetail id="c1" />)

    await waitFor(() => expect(screen.getByText(/pas encore de liste/i)).toBeInTheDocument())

    const select = container.querySelector('select') as HTMLSelectElement
    expect(select).toBeTruthy()
    const { fireEvent } = await import('@testing-library/react')
    fireEvent.change(select, { target: { value: 'ecarte' } })

    await waitFor(() => expect(screen.getByText(/Aucun lead/i)).toBeInTheDocument())
    expect(screen.queryByText(/pas encore de liste/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Voir tous les statuts/i })).toBeInTheDocument()
  })
})
