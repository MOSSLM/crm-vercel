/**
 * Le tableau « Tâches à la main » répond à une question que la file en 3 volets
 * n'aborde pas : qui croule, qui n'a rien, et qu'est-ce que personne n'a pris.
 */
import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { TaskBoard, buildColumns } from '../TaskBoard'
import type { ProspectionTaskFull } from '../prospection-db'
import type { UserRef } from '../types'

const USERS: UserRef[] = [
  { id: 'u-lea', name: 'Léa Fournier', role: 'freelance' },
  { id: 'u-nadia', name: 'Nadia Belkacem', role: 'freelance' },
  { id: 'u-admin', name: 'Yacine Moss', role: 'admin' },
]

let seq = 0
const task = (over: Partial<ProspectionTaskFull> = {}): ProspectionTaskFull =>
  ({
    id: `t${++seq}`,
    kind: 'whatsapp',
    status: 'pending',
    contact_id: 'c1',
    entreprise_id: 1,
    opportunite_id: null,
    automation_id: 'seq-1',
    enrollment_id: 'e1',
    step_id: 's2',
    assignee_id: 'u-lea',
    title: 'Relance',
    payload: { message: 'Bonjour Marc, vous avez vu l’audit ?' },
    due_at: '2026-08-03T09:00:00.000Z',
    done_at: null,
    created_at: '2026-08-01T08:00:00.000Z',
    updated_at: '2026-08-01T08:00:00.000Z',
    contacts: { id: 'c1', first_name: 'Marc', last_name: 'Ferrand', email: null, tel: '0612345678', role_title: null, linkedin_url: null },
    entreprises: { id: 1, name: 'Garage Ferrand', site_web_canonique: null },
    ...over,
  }) as ProspectionTaskFull

describe('buildColumns', () => {
  it('donne une colonne à chaque agent, l’admin en dernier', () => {
    const cols = buildColumns([task({ assignee_id: 'u-admin' }), task({ assignee_id: 'u-lea' })], USERS)
    expect(cols.map((c) => c.id)).toEqual(['u-lea', 'u-nadia', 'u-admin'])
  })

  it('garde visibles les tâches que personne n’a', () => {
    const cols = buildColumns([task({ assignee_id: null })], USERS)
    const orphans = cols.find((c) => c.id === '')
    expect(orphans?.tasks).toHaveLength(1)
    // Elle passe en dernier : c'est un reste à traiter, pas un point de départ.
    expect(cols[cols.length - 1].id).toBe('')
  })

  it('n’escamote pas les tâches d’un destinataire absent du référentiel', () => {
    const cols = buildColumns([task({ assignee_id: 'u-parti' })], USERS)
    const unknown = cols.find((c) => c.id === 'u-parti')
    expect(unknown?.tasks).toHaveLength(1)
    expect(unknown?.name).toBe('Agent inconnu')
  })

  it('masque un admin sans tâche, mais jamais un agent', () => {
    const cols = buildColumns([task({ assignee_id: 'u-lea' })], USERS)
    expect(cols.map((c) => c.id)).toContain('u-nadia')
    expect(cols.map((c) => c.id)).not.toContain('u-admin')
  })
})

describe('TaskBoard', () => {
  const render0 = (over: Partial<React.ComponentProps<typeof TaskBoard>> = {}) => {
    const props = {
      tasks: [task({ assignee_id: 'u-lea' })],
      users: USERS,
      sequenceNames: { 'seq-1': 'Artisans — audit' },
      canReassign: true,
      onComplete: jest.fn(),
      onReassign: jest.fn(),
      ...over,
    }
    render(<TaskBoard {...props} />)
    return props
  }

  it('montre le message déjà rédigé et la séquence d’origine', () => {
    render0()
    expect(screen.getByText(/vous avez vu l’audit/)).toBeInTheDocument()
    expect(screen.getByText(/Artisans — audit/)).toBeInTheDocument()
  })

  it('marque une tâche faite', () => {
    const props = render0()
    fireEvent.click(screen.getByTitle('Marquer comme fait'))
    expect(props.onComplete).toHaveBeenCalledTimes(1)
  })

  it('confie la tâche à quelqu’un d’autre', () => {
    const props = render0()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'u-admin' } })
    expect(props.onReassign).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String) }), 'u-admin')
  })

  it('« Personne » retire la tâche de toutes les files sans la supprimer', () => {
    const props = render0()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    expect(props.onReassign).toHaveBeenCalledWith(expect.anything(), null)
  })

  it('cache la réattribution à qui n’est pas admin', () => {
    render0({ canReassign: false })
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('signale une tâche en retard', () => {
    render0({ tasks: [task({ assignee_id: 'u-lea', due_at: '2020-01-01T09:00:00.000Z' })] })
    expect(screen.getByText('en retard')).toBeInTheDocument()
  })

  it('dit ce qui manque quand il n’y a rien à faire', () => {
    render0({ tasks: [] })
    expect(screen.getByText('Aucune tâche à la main')).toBeInTheDocument()
  })

  it('compte les tâches par colonne', () => {
    render0({
      tasks: [task({ assignee_id: 'u-lea' }), task({ assignee_id: 'u-lea' }), task({ assignee_id: 'u-nadia' })],
    })
    // « Léa Fournier » figure aussi dans chaque liste de réattribution : on
    // vise l'en-tête de colonne, pas une option de <select>.
    const header = screen.getAllByText('Léa Fournier').find((el) => el.classList.contains('nm'))
    const lea = header?.closest('.tb-col') as HTMLElement
    expect(within(lea).getByText('2')).toBeInTheDocument()
  })
})
