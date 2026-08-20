import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Conversations } from '../Conversations'
import { assemblerFils, type Message } from '@/lib/prospection/conversation'

/**
 * LA CONVERSATION, ET LES CINQ CHOSES QU'ELLE DOIT TENIR.
 *
 * 1. LE FIL SE LIT DANS L'ORDRE, tous canaux mêlés — c'est tout l'objet.
 * 2. « AUTEUR NON ENREGISTRÉ » N'EST PAS « PERSONNE ». Les 29 notes d'avant le
 *    20/08 ont bien été écrites par un humain ; la colonne n'existait pas.
 * 3. UNE NOTE INTERNE NE RÉPOND À PERSONNE — le fil reste « à répondre ».
 *    C'est le fil qu'on risque le plus d'oublier : il a l'air d'avoir bougé.
 * 4. UNE LECTURE QUI ÉCHOUE N'EST PAS UNE MESSAGERIE VIDE, et les deux volets
 *    doivent dire la MÊME chose — la gauche accusait le filtre pendant que le
 *    centre disait la panne.
 * 5. L'ÉTAT DE DÉPART EST DIT FRANCHEMENT : rien n'est jamais entré dans ce
 *    CRM, et aucun mécanisme ne captera une réponse WhatsApp sans l'API
 *    Business.
 */

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const fetchMock = jest.fn()
jest.mock('@/utils/authedFetch', () => ({
  authedFetch: (...args: unknown[]) => fetchMock(...args),
}))

type Brute = Message & {
  entrepriseId: number | null
  entreprise: string
  ville: string | null
  cohorte: string | null
  contact: string | null
}

function msg(p: Partial<Brute> & { id: string }): Brute {
  return {
    canal: 'whatsapp',
    sens: 'sortant',
    quand: '2026-08-18T09:00:00.000Z',
    objet: 'Message WhatsApp',
    texte: 'Bonjour, votre site…',
    issue: null,
    etapeId: null,
    auteurId: 'a1',
    auteur: 'Bilal Cacan',
    remise: null,
    bloquePar: null,
    entrepriseId: 1,
    entreprise: 'SARL Martin',
    ville: 'Écully',
    cohorte: 'B_sans_site',
    contact: 'Cédric Martin',
    ...p,
  }
}

function repondre(lignes: Brute[]) {
  fetchMock.mockImplementation((_url: string, init?: { method?: string }) => {
    if (init?.method === 'POST') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ message: { id: 'neuf' } }) })
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ fils: assemblerFils(lignes), tronque: false }),
    })
  })
}

beforeEach(() => fetchMock.mockReset())

describe('la conversation', () => {
  it('lit le fil dans l’ordre, tous canaux mêlés', async () => {
    repondre([
      msg({ id: 'm1', canal: 'whatsapp', texte: 'Bonjour, votre site est daté' }),
      msg({ id: 'm2', canal: 'note', sens: 'interne', texte: 'rappeler en septembre', quand: '2026-08-19T09:00:00Z' }),
    ])
    render(<Conversations />)

    await screen.findByText('Bonjour, votre site est daté')
    // Le texte apparaît DEUX fois, et c'est voulu : en aperçu dans la liste de
    // gauche, et dans la bulle du fil. On vise la bulle.
    const bulles = screen.getAllByText('rappeler en septembre')
    expect(bulles.some((el) => el.classList.contains('lem-bulle'))).toBe(true)
    // La note d'équipe garde sa forme propre : ni envoi, ni réception.
    const bulle = bulles.find((el) => el.classList.contains('lem-bulle'))!
    expect(bulle.closest('.lem-msg')).toHaveAttribute('data-sens', 'interne')
    // Le dossier de droite montre à qui on parle sans quitter le fil.
    expect(screen.getByText('Cédric Martin')).toBeInTheDocument()
    // JSX découpe ce décompte en plusieurs nœuds de texte : on l'assemble avant
    // de comparer, sinon l'assertion échoue sur la forme et pas sur le fond.
    expect(
      screen.getByText((_, el) => el?.textContent?.trim() === '1 envoyé · 0 reçu · 1 note'),
    ).toBeInTheDocument()
  })

  it('dit « auteur non enregistré » plutôt que « personne »', async () => {
    repondre([
      msg({ id: 'vieux', auteurId: null, auteur: null, quand: '2026-08-18T09:00:00Z' }),
      msg({ id: 'moteur', auteurId: null, auteur: null, quand: '2026-08-21T09:00:00Z' }),
    ])
    render(<Conversations />)

    await screen.findByText('auteur non enregistré')
    // Après le 20/08 la colonne existe : un auteur nul veut dire « le CRM ».
    expect(screen.getByText('le CRM')).toBeInTheDocument()
  })

  it('sépare « à répondre » d’« ont parlé », et une note ne répond à personne', async () => {
    repondre([
      msg({ id: 'a1', entrepriseId: 1, entreprise: 'A répondre', sens: 'sortant' }),
      msg({ id: 'a2', entrepriseId: 1, sens: 'entrant', quand: '2026-08-19T09:00:00Z', texte: 'ça m’intéresse' }),
      // Une note POSTÉRIEURE à l'entrant : le fil doit rester « à répondre ».
      msg({ id: 'a3', entrepriseId: 1, sens: 'interne', quand: '2026-08-19T11:00:00Z', texte: 'à rappeler' }),
      msg({ id: 'b1', entrepriseId: 2, entreprise: 'Jamais parlé', sens: 'sortant' }),
    ])
    render(<Conversations />)

    // ATTENDRE LA DONNÉE AVANT DE COMPTER. Les pastilles de filtre existent dès
    // le premier rendu, avec des compteurs à zéro : `findByRole` les trouve
    // AVANT que le chargement ait rendu quoi que ce soit, et l'assertion
    // porterait sur l'écran vide.
    await screen.findByText('ça m’intéresse')

    const aRepondre = screen.getByRole('button', { name: /^À répondre/ })
    expect(within(aRepondre).getByText('1')).toBeInTheDocument()
    const sansReponse = screen.getByRole('button', { name: /^Sans réponse/ })
    expect(within(sansReponse).getByText('1')).toBeInTheDocument()

    fireEvent.click(aRepondre)
    await waitFor(() => expect(screen.queryByText(/Jamais parlé/)).toBeNull())
    // Le fil retenu est bien celui qui attend une réponse — et il l'attend
    // toujours malgré la note interne postérieure.
    expect(screen.getByText('à répondre')).toBeInTheDocument()
  })

  it('annonce franchement que rien n’est jamais entré', async () => {
    repondre([msg({ id: 'm1' })])
    render(<Conversations />)

    await screen.findByText(/Rien n’est jamais entré dans ce CRM/)
    expect(screen.getByText(/aucun mécanisme ne captera jamais une réponse/i)).toBeInTheDocument()
  })

  it('consigne ce que le prospect a dit, sans le déclarer intéressé', async () => {
    repondre([msg({ id: 'm1' })])
    render(<Conversations />)
    await screen.findByText('Bonjour, votre site…')

    // La phrase qui porte la distinction déjà payée une fois.
    expect(
      screen.getByText(/ne déclare pas le prospect intéressé/),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/Recopier ce que le prospect/), {
      target: { value: 'Rappelez-moi lundi' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Consigner' }))

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')
      expect(post).toBeDefined()
      const corps = JSON.parse(post![1].body as string)
      expect(corps).toMatchObject({
        entrepriseId: 1,
        texte: 'Rappelez-moi lundi',
        sens: 'entrant',
        canal: 'whatsapp',
      })
    })
  })

  it('bascule en note d’équipe, et le dit', async () => {
    repondre([msg({ id: 'm1' })])
    render(<Conversations />)
    await screen.findByText('Bonjour, votre site…')

    fireEvent.click(screen.getByRole('button', { name: 'Note d’équipe' }))
    expect(screen.getByText(/ne répond à personne/)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Ce que l’équipe doit savoir/)).toBeInTheDocument()
  })

  it('n’accuse pas le filtre quand la lecture a échoué', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'unauthorized' }) }),
    )
    render(<Conversations />)

    await screen.findByText(/Les fils n’ont pas pu être lus/)
    // Les deux volets disent la même chose.
    expect(screen.getByText('Liste indisponible.')).toBeInTheDocument()
    expect(screen.queryByText(/Aucun fil ne répond à ce filtre/)).toBeNull()
  })
})
