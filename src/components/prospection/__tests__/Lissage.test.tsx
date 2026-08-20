/**
 * Ce qui se vérifie ici, c'est la distinction que tout l'écran existe pour
 * porter : « vérifié absent » et « jamais regardé » ne se peignent pas pareil,
 * ne se comptent pas ensemble, et ne se confondent surtout pas avec une panne
 * de lecture.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { Lissage } from '../Lissage'

jest.mock('@/utils/authedFetch', () => ({ authedFetch: jest.fn() }))
import { authedFetch } from '@/utils/authedFetch'
const mockFetch = authedFetch as jest.MockedFunction<typeof authedFetch>

const reponse = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)

const PASSE = {
  id: 'p1',
  nom: 'Cohorte B — combler la fiche Google',
  criteres: { flags: ['vivantes'] },
  plan: { sujets: ['identite', 'site_web'], exigence: 'moyenne', facture: true, local: true },
  statut: 'brouillon',
  creeLe: '2026-08-20T09:00:00Z',
  avancement: { a_faire: 40, en_cours: 0, complet: 50, sans_prise: 10, erreur: 0, total: 100 },
}

const DETAIL = {
  passe: PASSE,
  avancement: PASSE.avancement,
  couvertures: [
    {
      sujet: 'site_web',
      label: 'Site web',
      present: 20,
      absent: 30,
      inconnu: 10,
      jamais_regarde: 40,
    },
  ],
  items: [
    {
      ligneId: 1,
      entrepriseId: 7,
      nom: 'SARL Martin',
      ville: 'Dijon',
      statut: 'a_faire',
      outil: 'dossier-web',
      outilNom: 'Dossier web',
      lieu: 'local',
      motif: null,
      constats: { site_web: { etat: 'absent', confiance: 'certaine', source: 'verifier-sites' } },
    },
    {
      ligneId: 2,
      entrepriseId: 8,
      nom: 'Toiture Dupont',
      ville: 'Beaune',
      statut: 'sans_prise',
      outil: null,
      outilNom: null,
      lieu: null,
      motif: 'rien ne peut prendre identite — il manque siret',
      constats: {},
    },
  ],
  plafonne: false,
}

const listeEtDetail = () => {
  mockFetch.mockImplementation((url: string) =>
    String(url).includes('/passes/p1') ? reponse(DETAIL) : reponse({ items: [PASSE] }),
  )
}

beforeEach(() => mockFetch.mockReset())

describe('Lissage — les quatre colonnes', () => {
  it('sépare « vérifié absent » de « jamais regardé », et affiche les quatre', async () => {
    listeEtDetail()
    render(<Lissage />)
    ;(await screen.findByText('Cohorte B — combler la fiche Google')).click()

    const absent = (await screen.findByText('Vérifié absent')).closest('li')!
    const jamais = screen.getByText('Jamais regardé').closest('li')!
    // Les deux existent, distincts, avec leurs chiffres propres. Les fondre
    // donnerait « 70 sans site » — dont 40 que personne n'a jamais regardés.
    expect(absent).toHaveTextContent('30')
    expect(jamais).toHaveTextContent('40')
    // Et ils ne portent pas la même teinte : c'est ce qui les rend lisibles
    // d'un coup d'œil, pas seulement comptables.
    expect(absent.querySelector('.puce')).toHaveAttribute('data-ton', 'neutre')
    expect(jamais.querySelector('.puce')).toHaveAttribute('data-ton', 'vide')
  })

  it('dit en toutes lettres pourquoi une ligne n’avance plus', async () => {
    listeEtDetail()
    render(<Lissage />)
    ;(await screen.findByText('Cohorte B — combler la fiche Google')).click()
    // Une ligne qui sort sans motif est celle qui dort trois semaines.
    expect(
      await screen.findByText('rien ne peut prendre identite — il manque siret'),
    ).toBeInTheDocument()
  })

  it('dit qu’une étape attend le poste local, au lieu de la peindre en erreur', async () => {
    listeEtDetail()
    render(<Lissage />)
    ;(await screen.findByText('Cohorte B — combler la fiche Google')).click()
    expect(await screen.findByText('attend le poste local')).toBeInTheDocument()
    expect(screen.getByText(/se lance depuis localhost/)).toBeInTheDocument()
  })

  // LE PIÈGE DÉJÀ POSÉ QUATRE FOIS DANS CE PROJET.
  it('n’annonce pas « aucune passe » quand c’est la lecture qui a échoué', async () => {
    mockFetch.mockReturnValue(reponse({ message: 'Base injoignable.' }, false))
    render(<Lissage />)
    await screen.findByText('Base injoignable.')
    expect(screen.queryByText('Aucune passe')).not.toBeInTheDocument()
  })

  it('dit « aucune passe » quand il n’y en a vraiment aucune', async () => {
    mockFetch.mockReturnValue(reponse({ items: [] }))
    render(<Lissage />)
    expect(await screen.findByText('Aucune passe')).toBeInTheDocument()
  })

  it('prévient que la couverture affichée n’est qu’un échantillon', async () => {
    mockFetch.mockImplementation((url: string) =>
      String(url).includes('/passes/p1')
        ? reponse({ ...DETAIL, plafonne: true })
        : reponse({ items: [PASSE] }),
    )
    render(<Lissage />)
    ;(await screen.findByText('Cohorte B — combler la fiche Google')).click()
    await waitFor(() => expect(screen.getByText(/échantillon/)).toBeInTheDocument())
  })
})
