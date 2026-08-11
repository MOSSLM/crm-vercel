/**
 * Les onglets de partie du pipeline commercial.
 *
 * Ce que ce fichier protège : avec deux séquences, le tableau ne peut pas les
 * afficher ensemble — les colonnes du milieu sont les étapes d'UNE séquence,
 * et un prospect de l'autre séquence tomberait sous des colonnes qui ne sont
 * pas les siennes. On vérifie donc qu'on passe bien d'une partie à l'autre, et
 * que chaque changement d'onglet redemande au serveur la bonne partie.
 */
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SalesPipeline } from '../SalesPipeline'
import { buildColumns } from '@/lib/sales-pipeline/stages'
import type { SalesBoardData } from '../types'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }))

const authedFetch = jest.fn()
jest.mock('@/utils/authedFetch', () => ({ authedFetch: (...args: unknown[]) => authedFetch(...args) }))

const STAGES = [
  { id: 1, nom: 'Nouveau lead', ordre: 10 },
  { id: 6, nom: 'RDV calé', ordre: 50 },
  { id: 7, nom: 'Client signé', ordre: 60 },
]

const SEQUENCES = [
  {
    id: 'artisans',
    name: 'Artisans',
    status: 'on',
    steps: [{ id: 's1', kind: 'email', day: 0, label: 'Accroche' }],
    windows: [],
    activeEnrollments: 4,
  },
  {
    id: 'restos',
    name: 'Restaurants',
    status: 'on',
    steps: [{ id: 'r1', kind: 'whatsapp', day: 0, label: 'Bonjour' }],
    windows: [],
    activeEnrollments: 9,
  },
]

/** Le board tel que l'API le rend pour la partie demandée. */
function board(part: string): SalesBoardData {
  const one = SEQUENCES.find((s) => s.id === part) ?? null
  return {
    rows: [],
    total: 0,
    page: 0,
    perPage: 8,
    counts: { actifs: 0, rdvPlus: 0, won: 0, todo: 0, value: 0, missingEmail: 0 },
    columns: buildColumns({
      steps: (one?.steps ?? []).map((s) => ({ id: s.id, kind: s.kind as 'email', day: s.day, label: s.label })),
      sequenceName: one?.name ?? null,
      stages: STAGES,
      handoffOrdre: 50,
      overview: part === 'all',
    }),
    columnCounts: {},
    missingEmail: [],
    sequenceHasEmailStep: part === 'artisans',
    pipelines: [{ id: 'p1', nom: 'Agent SAMA', isDefault: true }],
    selectedPipelineId: 'p1',
    selectedSequenceId: one?.id ?? null,
    selectedPart: part,
    partCounts: { sequences: { artisans: 4, restos: 9 }, noSequence: 12, all: 25 },
    agents: [],
    sequences: SEQUENCES,
    regulator: {
      paused: false,
      testMode: false,
      gapMinMinutes: 8,
      gapMaxMinutes: 20,
      dailyCap: 40,
      sentToday: 0,
      timezone: 'Europe/Paris',
      openWindows: [],
      queued: 0,
      blocked: 0,
      nextSendAt: null,
    },
    queue: [],
  }
}

/** L'URL de chaque `GET .../board?…` reçu, dans l'ordre. */
const boardCalls = () =>
  authedFetch.mock.calls.map((c) => String(c[0])).filter((url) => url.includes('/board?'))

const partOf = (url: string) => new URL(url, 'https://crm.test').searchParams.get('sequence')

beforeEach(() => {
  window.localStorage.clear()
  authedFetch.mockReset()
  authedFetch.mockImplementation((url: string) => {
    const part = partOf(url) ?? 'artisans'
    return Promise.resolve({ ok: true, json: () => Promise.resolve(board(part)) })
  })
})

describe('onglets de séquence', () => {
  it('propose chaque séquence, le stock et la vue d’ensemble, avec leur nombre', async () => {
    render(<SalesPipeline />)

    const artisans = await screen.findByRole('button', { name: /Artisans/ })
    expect(artisans).toHaveTextContent('4')
    expect(screen.getByRole('button', { name: /Restaurants/ })).toHaveTextContent('9')
    // Rien n'est perdu : le stock et l'ensemble annoncent aussi leur compte.
    expect(screen.getByRole('button', { name: /À démarcher/ })).toHaveTextContent('12')
    expect(screen.getByRole('button', { name: /Vue d’ensemble/ })).toHaveTextContent('25')
  })

  it('recharge la partie demandée quand on clique une autre séquence', async () => {
    render(<SalesPipeline />)
    await screen.findByRole('button', { name: /Restaurants/ })

    fireEvent.click(screen.getByRole('button', { name: /Restaurants/ }))
    await waitFor(() => expect(boardCalls().some((url) => partOf(url) === 'restos')).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: /À démarcher/ }))
    await waitFor(() => expect(boardCalls().some((url) => partOf(url) === 'none')).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: /Vue d’ensemble/ }))
    await waitFor(() => expect(boardCalls().some((url) => partOf(url) === 'all')).toBe(true))
  })

  it('n’affiche que les étapes de la séquence regardée', async () => {
    render(<SalesPipeline />)
    await screen.findByText('Accroche')
    expect(screen.queryByText('Bonjour')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Restaurants/ }))
    await screen.findByText('Bonjour')
    expect(screen.queryByText('Accroche')).toBeNull()
  })

  // La vue d'ensemble est la seule qui mélange les séquences : elle n'a donc le
  // droit de montrer aucune étape, sous peine de mesurer chacun à la règle du
  // voisin — exactement le défaut qu'on corrige.
  it('remplace les étapes par une colonne unique en vue d’ensemble', async () => {
    render(<SalesPipeline />)
    await screen.findByText('Accroche')

    fireEvent.click(screen.getByRole('button', { name: /Vue d’ensemble/ }))
    await screen.findByText('En séquence')
    expect(screen.queryByText('Accroche')).toBeNull()
    expect(screen.queryByText('Bonjour')).toBeNull()
  })

  it('rouvre la page sur la dernière partie regardée', async () => {
    const first = render(<SalesPipeline />)
    await screen.findByRole('button', { name: /Restaurants/ })
    fireEvent.click(screen.getByRole('button', { name: /Restaurants/ }))
    await waitFor(() => expect(window.localStorage.getItem('sp:admin:sequence')).toBe('restos'))
    first.unmount()

    authedFetch.mockClear()
    render(<SalesPipeline />)
    await waitFor(() => expect(boardCalls().length).toBeGreaterThan(0))
    expect(partOf(boardCalls()[0])).toBe('restos')
  })
})
