/**
 * Le grief n° 2 : « les chiffres du haut comptent deux fois le même prospect ».
 * Ce qui se vérifie ici, c'est que l'écran affiche une PARTITION — la somme des
 * étages égale le nombre de prospects — et qu'il distingue une panne de lecture
 * d'un entonnoir vide.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { Rapports } from '../Rapports'

jest.mock('@/utils/authedFetch', () => ({ authedFetch: jest.fn() }))
import { authedFetch } from '@/utils/authedFetch'
const mockFetch = authedFetch as jest.MockedFunction<typeof authedFetch>

const reponse = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)

const RAPPORT = {
  total: 153,
  tronque: false,
  entonnoir: [
    { etage: 'contacte', n: 94, label: 'Contactés' },
    { etage: 'repondu', n: 38, label: 'Ont répondu' },
    { etage: 'refuse', n: 21, label: 'Ont refusé' },
  ],
  parCohorte: [
    { cohorte: 'A_site_faible', label: 'Cohorte A — site faible', total: 80, etages: [{ etage: 'contacte', n: 80, label: 'Contactés' }] },
    { cohorte: 'B_sans_site', label: 'Cohorte B — sans site', total: 73, etages: [{ etage: 'contacte', n: 73, label: 'Contactés' }] },
  ],
  campagnes: [{ id: 'a1', name: 'WhatsApp seul', status: 'on' }],
  campagne: null,
}

beforeEach(() => mockFetch.mockReset())

describe('Rapports — l’entonnoir est une partition', () => {
  it('affiche chaque étage une fois, et le total qui se vérifie', async () => {
    mockFetch.mockReturnValue(reponse(RAPPORT))
    render(<Rapports />)
    await screen.findByText('153 prospects')
    expect(screen.getAllByText('Contactés').length).toBeGreaterThan(0)
    // La ligne de contrôle : on peut additionner et retomber sur ses pieds.
    expect(screen.getByText(/94 \+ 38 \+ 21 = 153/)).toBeInTheDocument()
  })

  it('donne le pourcentage de chaque étage sur le total', async () => {
    mockFetch.mockReturnValue(reponse(RAPPORT))
    render(<Rapports />)
    await screen.findByText('153 prospects')
    expect(screen.getByText('61 %')).toBeInTheDocument()
  })

  it('compare les cohortes avec la même règle, et le dit', async () => {
    mockFetch.mockReturnValue(reponse(RAPPORT))
    render(<Rapports />)
    expect(await screen.findByText(/Cohorte A — site faible · 80/)).toBeInTheDocument()
    expect(screen.getByText(/à âge égal/i)).toBeInTheDocument()
  })

  it('prévient quand la lecture a été tronquée — ce n’est plus une partition', async () => {
    mockFetch.mockReturnValue(reponse({ ...RAPPORT, tronque: true }))
    render(<Rapports />)
    expect(await screen.findByText(/plus une partition/)).toBeInTheDocument()
  })
})

describe('Rapports — une panne n’est pas un entonnoir vide', () => {
  it('dit que la lecture a échoué plutôt que d’annoncer zéro prospect', async () => {
    mockFetch.mockReturnValue(reponse({ message: 'sql/20260819_campagne_leads.sql n’est pas appliquée.' }, false))
    render(<Rapports />)
    expect(await screen.findByText(/n’est pas appliquée/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucune liste à mesurer/)).not.toBeInTheDocument()
  })

  it('reste debout quand le réseau tombe', async () => {
    mockFetch.mockReturnValue(Promise.reject(new Error('réseau')))
    render(<Rapports />)
    expect(await screen.findByText('La lecture a échoué.')).toBeInTheDocument()
  })

  it('propose le geste suivant quand il n’y a vraiment aucune liste', async () => {
    mockFetch.mockReturnValue(reponse({ ...RAPPORT, total: 0, entonnoir: [], parCohorte: [] }))
    render(<Rapports />)
    await waitFor(() => expect(screen.getByText('Aucune liste à mesurer')).toBeInTheDocument())
  })
})
