/**
 * L'éditeur est UNIQUE et se décline par canal. Ce qui se vérifie ici, ce sont
 * les trois choses qu'il doit dire différemment : un trou, une faute de
 * structure, un dépassement — et le fait que le compteur mesure ce qui PART,
 * pas ce qui est écrit.
 */
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MessageEditor } from '../MessageEditor'
import type { VarBag } from '@/lib/automations/variables'

const AVEC_SITE: VarBag = {
  'company.name': 'Toiture Martin',
  'company.website': 'toituremartin.fr',
}
const SANS_SITE: VarBag = { 'company.name': 'Plomberie Dupont' }

const poser = (props: Partial<React.ComponentProps<typeof MessageEditor>> = {}) =>
  render(<MessageEditor value="" onChange={() => {}} vars={AVEC_SITE} {...props} />)

describe('MessageEditor — le compteur mesure le rendu', () => {
  it('compte les caractères du message RENDU, pas de la source', () => {
    // La source fait 8 + 22 = 30 signes ; ce qui part en fait 22.
    poser({ value: 'Bonjour {{company.name}}' })
    expect(screen.getByText('22 caractères')).toBeInTheDocument()
  })

  it('sur l’e-mail, ne montre aucune limite — il n’y en a pas', () => {
    poser({ value: 'a'.repeat(400), canal: 'email' })
    expect(screen.getByText('400 caractères')).toBeInTheDocument()
  })
})

describe('MessageEditor — chaque canal compte à sa façon', () => {
  it('la note d’invitation LinkedIn affiche la limite RÉELLE de 200', () => {
    poser({ value: 'a'.repeat(150), canal: 'linkedin_invitation' })
    expect(screen.getByText('150 / 200 caractères')).toBeInTheDocument()
  })

  it('refuse la note trop longue et dit de combien', () => {
    poser({ value: 'a'.repeat(212), canal: 'linkedin_invitation' })
    expect(screen.getByText(/12 caractères de trop/)).toBeInTheDocument()
  })

  it('le SMS annonce ses segments et désigne le caractère coupable', () => {
    poser({ value: 'l’essentiel', canal: 'sms' })
    expect(screen.getByText(/1 SMS/)).toBeInTheDocument()
    expect(screen.getByText(/« ’ » coûte cher/)).toBeInTheDocument()
  })

  it('WhatsApp donne un AVIS de longueur, pas un refus', () => {
    poser({ value: 'a'.repeat(950), canal: 'whatsapp' })
    expect(screen.getByText(/long pour un téléphone/)).toBeInTheDocument()
    expect(screen.queryByText(/caractères de trop/)).not.toBeInTheDocument()
  })

  it('un canal inconnu retombe sur le plus prudent, sans limite inventée', () => {
    poser({ value: 'a'.repeat(300), canal: 'teleportation' })
    expect(screen.getByText('300 caractères')).toBeInTheDocument()
  })
})

describe('MessageEditor — trou, faute, et branche non prise', () => {
  it('signale une variable qui partira vide', () => {
    poser({ value: 'Bonjour {{contact.first_name}}', vars: AVEC_SITE })
    expect(screen.getByText(/partira vide/)).toBeInTheDocument()
  })

  it('ne la signale plus quand un repli la couvre', () => {
    poser({ value: 'Bonjour {{contact.first_name | "à vous"}}', vars: AVEC_SITE })
    expect(screen.queryByText(/partira vide/)).not.toBeInTheDocument()
    expect(screen.getByText('Bonjour à vous')).toBeInTheDocument()
  })

  it('n’alerte pas sur une variable enfermée dans une branche que ce prospect ne prendra pas', () => {
    poser({
      value: '{% si company.website %}votre site {{company.website}}{% sinon %}pas de site{% fin %}',
      vars: SANS_SITE,
    })
    expect(screen.getByText('pas de site')).toBeInTheDocument()
    expect(screen.queryByText(/partira vide/)).not.toBeInTheDocument()
  })

  it('montre la branche prise dans l’aperçu, et elle change avec le prospect', () => {
    const { unmount } = poser({ value: '{% si company.website %}refonte{% sinon %}création{% fin %}' })
    expect(screen.getByText('refonte')).toBeInTheDocument()
    unmount()
    poser({ value: '{% si company.website %}refonte{% sinon %}création{% fin %}', vars: SANS_SITE })
    expect(screen.getByText('création')).toBeInTheDocument()
  })

  it('signale une faute de structure, distincte d’un trou', () => {
    poser({ value: '{% si company.website %}refonte' })
    expect(screen.getByText(/jamais refermé/)).toBeInTheDocument()
  })

  it('signale une clé inventée, qui enverrait tout le monde du même côté', () => {
    poser({ value: '{% si compagny.website %}A{% sinon %}B{% fin %}' })
    expect(screen.getByText(/n’est pas une variable connue/)).toBeInTheDocument()
  })

  it('remonte la validité à l’appelant, pour qu’il puisse refuser d’enregistrer', () => {
    const vues: boolean[] = []
    render(
      <MessageEditor
        value="{% si company.website %}oups"
        onChange={() => {}}
        vars={AVEC_SITE}
        onAnalyse={(a) => vues.push(a.valide)}
      />,
    )
    expect(vues.at(-1)).toBe(false)
  })
})

describe('MessageEditor — les outils d’écriture', () => {
  it('insère une variable au clic', () => {
    const onChange = jest.fn()
    poser({ value: '', onChange })
    fireEvent.click(screen.getByRole('button', { name: 'Entreprise' }))
    expect(onChange).toHaveBeenCalledWith('{{company.name}}')
  })

  it('insère un repli prêt à remplir', () => {
    const onChange = jest.fn()
    poser({ value: '', onChange })
    fireEvent.change(screen.getByLabelText(/quand elle est vide/), {
      target: { value: 'contact.first_name' },
    })
    expect(onChange).toHaveBeenCalledWith('{{contact.first_name | ""}}')
  })

  it('enveloppe la sélection dans un bloc conditionnel', () => {
    const onChange = jest.fn()
    poser({ value: 'refonte', onChange })
    fireEvent.change(screen.getByLabelText(/n’en envoyer qu’une/), {
      target: { value: 'company.website' },
    })
    expect(onChange).toHaveBeenCalledWith(
      '{% si company.website %}\n\n{% sinon %}\n\n{% fin %}refonte',
    )
  })
})
