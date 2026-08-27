import React from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TachesTableau } from '../TachesTableau'
import type { LigneTache } from '@/lib/prospection/vue-taches'

/**
 * LE TABLEAU DES TÂCHES, ET LES QUATRE CHOSES QU'IL DOIT TENIR.
 *
 * 1. IL DESSINE DES LIGNES. L'écran ne se vérifiait jusqu'ici qu'à l'œil, et
 *    encore : la route est réservée aux admins, donc un navigateur sans session
 *    ne montre qu'un état d'erreur. Ces tests sont le seul endroit où l'on voit
 *    le tableau plein.
 * 2. UNE LECTURE QUI ÉCHOUE N'EST PAS UNE FILE VIDE — la faute que l'écran a
 *    réellement commise avant d'être corrigée : il annonçait « aucune tâche ne
 *    répond à ce filtre » alors que l'API rendait `unauthorized`.
 * 3. « NON ATTRIBUÉE » ET « AGENT INCONNU » SONT DEUX ÉTATS. 72 tâches
 *    appartiennent à un compte sans `full_name` ; les confondre avec du stock
 *    libre serait la même faute que « zéro » à la place de « non mesuré ».
 * 4. « TERMINER » N'EST PAS DANS LA BARRE DE MASSE, et ce n'est pas un oubli :
 *    boucler une tâche date la première touche de l'entreprise, et les deux
 *    cohortes se comparent à l'âge depuis cette date.
 * 5. SOUS 768 px, LE TABLEAU DEVIENT DES CARTES — et ce sont les MÊMES
 *    colonnes. Deux définitions de « ce qu'on montre » divergeraient à la
 *    première colonne ajoutée : c'est ce que le dernier test empêche.
 */

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const fetchMock = jest.fn()
jest.mock('@/utils/authedFetch', () => ({
  authedFetch: (...args: unknown[]) => fetchMock(...args),
}))

function ligne(p: Partial<LigneTache> & { id: string }): LigneTache {
  return {
    canal: 'call',
    statut: 'pending',
    titre: 'Appel 1',
    echeance: '2026-08-14T09:00:00.000Z',
    faiteLe: null,
    entrepriseId: 1,
    entreprise: 'SARL Martin',
    ville: 'Écully',
    cohorte: 'B_sans_site',
    agentId: 'a1',
    agent: 'Bilal Cacan',
    campagneId: null,
    campagne: null,
    etapeId: null,
    inscriptionId: null,
    motif: null,
    premiereTouche: null,
    aRepondu: false,
    ...p,
  }
}

/** Ce que la route rend, et ce que le composant appelle — dans cet ordre. */
function repondre(lignes: LigneTache[], vues: unknown[] = []) {
  fetchMock.mockImplementation((url: string) => {
    if (String(url).startsWith('/api/prospection/taches')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ lignes, total: lignes.length, tronque: false }),
      })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ vues }) })
  })
}

beforeEach(() => fetchMock.mockReset())

describe('le tableau', () => {
  it('dessine une ligne par tâche, avec les colonnes par défaut', async () => {
    repondre([
      ligne({ id: 'T1', entreprise: 'SARL Martin' }),
      ligne({ id: 'T2', entreprise: 'Toiture Dupont', canal: 'whatsapp' }),
    ])
    render(<TachesTableau />)

    await screen.findByText('SARL Martin')
    expect(screen.getByText('Toiture Dupont')).toBeInTheDocument()
    // Les colonnes par défaut, pas les onze : on n'ouvre pas un écran sur tout.
    expect(screen.getByRole('columnheader', { name: /Entreprise/ })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /^Ville$/ })).toBeNull()
    // Toutes échues au 20/08 — la pastille le dit sur chaque ligne.
    expect(screen.getAllByText('échue')).toHaveLength(2)
  })

  it('filtre par pastille, et le OU dans la pastille additionne', async () => {
    repondre([
      ligne({ id: 'T1', canal: 'call', entreprise: 'Appel SARL' }),
      ligne({ id: 'T2', canal: 'whatsapp', entreprise: 'Whats SARL' }),
      ligne({ id: 'T3', canal: 'email', entreprise: 'Mail SARL' }),
    ])
    render(<TachesTableau />)
    await screen.findByText('Appel SARL')

    fireEvent.click(screen.getByRole('button', { name: /Filtre/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Canal' }))
    // La pastille est vide : elle ne retire rien tant qu'on ne l'a pas remplie.
    expect(screen.getByText('Mail SARL')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /^Appel \d+$/ }))
    await waitFor(() => expect(screen.queryByText('Mail SARL')).toBeNull())
    expect(screen.getByText('Appel SARL')).toBeInTheDocument()

    // Deuxième valeur DANS la même pastille : c'est un OU, les deux reviennent.
    // Le panneau reste ouvert après une coche — on en choisit plusieurs d'affilée,
    // c'est tout l'intérêt d'une pastille multi-valeurs.
    fireEvent.click(screen.getByRole('checkbox', { name: /^WhatsApp \d+$/ }))
    await waitFor(() => expect(screen.getByText('Whats SARL')).toBeInTheDocument())
    expect(screen.getByText('Appel SARL')).toBeInTheDocument()
    expect(screen.queryByText('Mail SARL')).toBeNull()
  })

  it('dit que la lecture a échoué, et n’accuse pas le filtre', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'unauthorized' }) }),
    )
    render(<TachesTableau />)

    await screen.findByText(/La file n’a pas pu être lue/)
    // La phrase qui compte : ce n'est pas un tableau vide.
    expect(screen.getByText(/on ne sait pas ce qu’il contient/)).toBeInTheDocument()
    expect(screen.queryByText(/Aucune tâche ne répond à ce filtre/)).toBeNull()
  })

  it('distingue « non attribuée » d’« agent inconnu »', async () => {
    repondre([
      ligne({ id: 'T1', entreprise: 'Sans agent', agentId: null, agent: null }),
      ligne({ id: 'T2', entreprise: 'Agent sans nom', agentId: 'a9', agent: null }),
    ])
    render(<TachesTableau />)
    await screen.findByText('Sans agent')

    // La colonne agent n'est pas au défaut : on l'ajoute, comme le ferait un humain.
    fireEvent.click(screen.getByRole('button', { name: /Colonnes/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Agent' }))

    await waitFor(() => expect(screen.getByText('non attribuée')).toBeInTheDocument())
    expect(screen.getByText('agent inconnu')).toBeInTheDocument()
  })

  it('ouvre une vue enregistrée et applique ses critères', async () => {
    repondre(
      [
        ligne({ id: 'T1', canal: 'call', entreprise: 'Appel SARL' }),
        ligne({ id: 'T2', canal: 'whatsapp', entreprise: 'Whats SARL' }),
      ],
      [
        {
          id: 'v1',
          nom: 'Appels à passer',
          agentId: null,
          utiliseLe: null,
          criteres: { mode: 'et', filtres: [{ champ: 'canal', operateur: 'est', valeurs: ['call'] }] },
        },
      ],
    )
    render(<TachesTableau />)
    const onglet = await screen.findByRole('button', { name: /Appels à passer/ })
    // Le compteur de l'onglet est le nombre de LIGNES que sa question rend —
    // pas un signal additionné. C'est le grief n° 2.
    expect(within(onglet).getByText('1')).toBeInTheDocument()

    fireEvent.click(onglet)
    await waitFor(() => expect(screen.queryByText('Whats SARL')).toBeNull())
    expect(screen.getByText('Appel SARL')).toBeInTheDocument()
  })

  it('n’offre jamais « Terminer » en masse', async () => {
    repondre([ligne({ id: 'T1' })])
    render(<TachesTableau />)
    await screen.findByText('SARL Martin')

    fireEvent.click(screen.getByRole('checkbox', { name: /Sélectionner SARL Martin/ }))
    await screen.findByText('1 sélectionnée')

    expect(screen.getByRole('button', { name: /Reporter/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Changer d’agent/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ignorer/ })).toBeInTheDocument()
    // Et surtout pas celui-là.
    expect(screen.queryByRole('button', { name: /^Terminer/ })).toBeNull()
  })
})

/**
 * jsdom part à 1 024 px. On règle `innerWidth` AVANT le rendu : `useIsMobile`
 * lit la largeur dans son premier effet, et aucun redimensionnement n'est
 * simulé ensuite (voir le repli `matchMedia` de `setupTests.ts`).
 */
const largeurDe = (px: number) => {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: px })
}

describe('au téléphone', () => {
  afterEach(() => largeurDe(1024))

  it('remplace le tableau par des cartes sous 768 px', async () => {
    largeurDe(390)
    repondre([ligne({ id: 'T1', entreprise: 'SARL Martin' })])
    render(<TachesTableau />)

    await screen.findByText('SARL Martin')
    // Plus aucun tableau : neuf colonnes sur 390 px ne se lisent pas, et un
    // défilement horizontal ne montre jamais la ligne entière.
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('columnheader')).toBeNull()
    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  it('rend les MÊMES colonnes que le tableau, en intitulés', async () => {
    largeurDe(390)
    repondre([ligne({ id: 'T1', entreprise: 'SARL Martin', agent: 'Bilal Cacan' })])
    render(<TachesTableau />)
    await screen.findByText('SARL Martin')

    // Les six colonnes par défaut moins « Entreprise », qui sert de titre à la
    // carte. Si l'une d'elles n'apparaît pas, les deux rendus ont divergé.
    for (const intitule of ['Canal', 'Tâche', 'Échéance', 'Campagne', 'Statut']) {
      expect(screen.getByText(intitule)).toBeInTheDocument()
    }
    // Et RIEN de plus : la carte ne s'autorise pas des colonnes que le tableau
    // ne montre pas. C'est la moitié qui compte de ce test — l'autre sens de la
    // divergence.
    expect(screen.queryByText('Ville')).toBeNull()
    expect(screen.queryByText('Agent')).toBeNull()
    expect(screen.queryByText('Cohorte')).toBeNull()
  })

  it('garde la sélection en masse, avec l\'intitulé pour cible', async () => {
    largeurDe(390)
    repondre([ligne({ id: 'T1', entreprise: 'SARL Martin' })])
    render(<TachesTableau />)
    await screen.findByText('SARL Martin')

    fireEvent.click(screen.getByRole('checkbox', { name: /Sélectionner SARL Martin/ }))
    // La barre de masse apparaît : cocher depuis une carte vaut cocher depuis
    // une ligne, sinon le téléphone perdrait le report en série.
    await waitFor(() => expect(screen.getByText(/1 sélectionnée/)).toBeInTheDocument())
  })

  it('garde le tableau au-dessus du seuil', async () => {
    largeurDe(1024)
    repondre([ligne({ id: 'T1', entreprise: 'SARL Martin' })])
    render(<TachesTableau />)
    await screen.findByText('SARL Martin')
    expect(screen.getByRole('table')).toBeInTheDocument()
  })
})
