/**
 * Les commandes que la maquette rend « manipulables » : un curseur qu'on
 * glisse, un segmenté qu'on clique. La règle qui compte : glisser prévisualise,
 * relâcher enregistre — sinon chaque pixel parcouru déclencherait un PATCH.
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { JitterPreview, RangeSlider, Segmented } from '../parts'

describe('RangeSlider', () => {
  it('prévisualise à chaque mouvement mais n’enregistre qu’au relâchement', () => {
    const onPreview = jest.fn()
    const onCommit = jest.fn()
    render(
      <RangeSlider value={7} min={1} max={60} ariaLabel="écart minimum" onPreview={onPreview} onCommit={onCommit} />,
    )

    const slider = screen.getByLabelText('écart minimum')
    fireEvent.change(slider, { target: { value: '12' } })
    fireEvent.change(slider, { target: { value: '18' } })

    expect(onPreview).toHaveBeenCalledTimes(2)
    expect(onPreview).toHaveBeenLastCalledWith(18)
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.pointerUp(slider)
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith(18)
  })

  it('n’enregistre rien si on relâche sur la valeur d’origine', () => {
    const onCommit = jest.fn()
    render(<RangeSlider value={7} min={1} max={60} ariaLabel="écart" onPreview={() => {}} onCommit={onCommit} />)

    const slider = screen.getByLabelText('écart')
    fireEvent.change(slider, { target: { value: '7' } })
    fireEvent.pointerUp(slider)

    expect(onCommit).not.toHaveBeenCalled()
  })

  it('enregistre aussi au clavier, flèche par flèche', () => {
    const onCommit = jest.fn()
    render(<RangeSlider value={7} min={1} max={60} ariaLabel="écart" onPreview={() => {}} onCommit={onCommit} />)

    const slider = screen.getByLabelText('écart')
    fireEvent.change(slider, { target: { value: '8' } })
    fireEvent.keyUp(slider, { key: 'ArrowRight' })

    expect(onCommit).toHaveBeenCalledWith(8)
  })
})

describe('Segmented', () => {
  it('marque le choix courant et ne rejoue pas un clic identique', () => {
    const onChange = jest.fn()
    render(
      <Segmented
        value={2}
        ariaLabel="priorité"
        options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
        onChange={onChange}
      />,
    )

    expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(onChange).toHaveBeenCalledWith(3)
  })
})

describe('JitterPreview', () => {
  it('dessine des écarts qui restent dans la fourchette annoncée', () => {
    const { container } = render(<JitterPreview min={7} max={14} seed="s" count={12} />)
    const bars = container.querySelectorAll('.rg-jit i')

    expect(bars).toHaveLength(12)
    for (const bar of bars) {
      const minutes = Number((bar.getAttribute('title') ?? '').replace(' min', ''))
      expect(minutes).toBeGreaterThanOrEqual(7)
      expect(minutes).toBeLessThanOrEqual(14)
    }
  })

  it('change de série quand on re-tire l’aléatoire', () => {
    const titles = (seed: string) => {
      const { container, unmount } = render(<JitterPreview min={5} max={40} seed={seed} count={16} />)
      const out = [...container.querySelectorAll('.rg-jit i')].map((i) => i.getAttribute('title'))
      unmount()
      return out.join(',')
    }
    expect(titles('a')).not.toEqual(titles('b'))
  })
})
