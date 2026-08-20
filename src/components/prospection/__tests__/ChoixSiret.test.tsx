/**
 * Ce qui se vérifie ici :
 *
 * 1. les QUATRE critères du registre s'affichent un par un, et celui qui ne
 *    concorde pas se distingue de celui qui concorde — un score composite ne se
 *    conteste pas, « nom oui, code postal non » se conteste tout seul ;
 * 2. une panne de lecture ne s'affiche PAS comme une file vide. Le piège a déjà
 *    été posé quatre fois dans ce projet, et ici il coûterait le plus cher :
 *    « rien à trancher » ferait croire le travail fini.
 */
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { ChoixSiret } from '../ChoixSiret'

jest.mock('@/utils/authedFetch', () => ({ authedFetch: jest.fn() }))
import { authedFetch } from '@/utils/authedFetch'
const mockFetch = authedFetch as jest.MockedFunction<typeof authedFetch>

const reponse = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response)

const CANDIDAT = {
  id: 'c1',
  entrepriseId: 7,
  siret: '12345678900012',
  denomination: 'TOP CLIMATISATION',
  enseignes: ['CLIMIZ'],
  adresse: '12 rue des Lilas',
  codePostal: '21000',
  ville: 'Dijon',
  etatAdministratif: 'A',
  nafCode: '43.22A',
  score: 80,
  detail: { nom: 45, codePostal: 10, ville: 15, activite: 10, alertes: [] },
  // Le code postal ne concorde pas : même département, ce qui vaut 10 sur 25.
  concordance: {
    nom: true,
    codePostal: false,
    adresse: true,
    metier: true,
    compte: 3,
    lesQuatre: false,
    bareme: 'proeco',
    libelleAdresse: 'adresse exacte',
  },
  alertes: ['Département différent (fiche 21000, registre 21200)'],
}

const CHARGE = {
  resume: { fiches: 186, entreprises: 240, etablissements: 506, evidentes: 40, serrees: 12 },
  fiches: [
    {
      fiche: { entrepriseId: 7, nom: 'CLIMIZ', ville: 'Dijon', codePostal: '21000' },
      entreprises: [
        { siren: '123456789', retenu: CANDIDAT, autres: [], etablissements: 1 },
      ],
      meilleurScore: 80,
      evidente: false,
      serree: false,
      memeEntreprise: false,
      siren: null,
      etablissements: 1,
    },
  ],
  plafonne: true,
}

/** Le cas signalé par Matteo : un SIREN, deux établissements, aucun enjeu. */
const DEUX_ETABLISSEMENTS = {
  ...CHARGE,
  fiches: [
    {
      ...CHARGE.fiches[0],
      entreprises: [
        {
          siren: '508616026',
          retenu: CANDIDAT,
          autres: [{ ...CANDIDAT, siret: '50861602600011', score: 78 }],
          etablissements: 2,
        },
      ],
      memeEntreprise: true,
      siren: '508616026',
      etablissements: 2,
    },
  ],
}

describe('ChoixSiret — les quatre critères, un par un', () => {
  beforeEach(() => mockFetch.mockReset())

  it('affiche chaque critère, et distingue celui qui ne concorde pas', async () => {
    mockFetch.mockReturnValue(reponse(CHARGE))
    render(<ChoixSiret />)

    // On attend le candidat lui-même : « code postal » figure aussi dans le
    // chapeau de l'écran, qui s'affiche AVANT la réponse du serveur.
    await screen.findByText('12345678900012')
    const cp = screen.getByText('✕ code postal')
    const nom = screen.getByText('✓ nom')
    // Le ton porte la différence : « ok » pour ce qui concorde, « neutre » pour
    // ce qui ne concorde pas. Une pastille muette laisserait croire à quatre
    // critères tenus.
    expect(cp).toHaveAttribute('data-ton', 'neutre')
    expect(nom).toHaveAttribute('data-ton', 'ok')
    expect(screen.getByText('3/4 critères · score 80')).toBeInTheDocument()
  })

  it('montre l’alerte au lieu de la fondre dans le score', async () => {
    mockFetch.mockReturnValue(reponse(CHARGE))
    render(<ChoixSiret />)
    expect(
      await screen.findByText(/Département différent \(fiche 21000, registre 21200\)/),
    ).toBeInTheDocument()
  })

  it('compte la file ENTIÈRE, pas la page affichée', async () => {
    // « 1 fiche » quand il en reste 186 est exactement le chiffre qui fait
    // croire le travail fini.
    mockFetch.mockReturnValue(reponse(CHARGE))
    render(<ChoixSiret />)
    expect(await screen.findByText('186')).toBeInTheDocument()
    expect(screen.getByText('240')).toBeInTheDocument()
    expect(screen.getByText('506')).toBeInTheDocument()
  })

  it('nomme ce qu’on a vraiment comparé, au lieu d’écrire « commune » en dur', async () => {
    // Deux barèmes coexistent en base : celui de `score.ts` ne compare que la
    // commune, celui du versement `proeco` compare la VOIE — et il pèse 48
    // candidats sur 54. Écrire « commune » en dur mentait dans 89 % des cas, et
    // sur le critère qui pèse le plus dans le rapprochement.
    mockFetch.mockReturnValue(reponse(CHARGE))
    render(<ChoixSiret />)
    await screen.findByText('12345678900012')
    expect(screen.getByText('✓ adresse exacte')).toBeInTheDocument()
    expect(screen.queryByText('✓ commune')).not.toBeInTheDocument()
  })

  it('prévient quand deux candidats se tiennent', async () => {
    mockFetch.mockReturnValue(
      reponse({
        ...CHARGE,
        fiches: [{ ...CHARGE.fiches[0], serree: true }],
      }),
    )
    render(<ChoixSiret />)
    expect(await screen.findByText(/moins de huit points/i)).toBeInTheDocument()
  })
})

describe('deux établissements du même SIREN : on tranche pour lui, on le dit', () => {
  beforeEach(() => mockFetch.mockReset())

  it('retient le mieux rapproché et l’annonce, au lieu de faire choisir', async () => {
    mockFetch.mockReturnValue(reponse(DEUX_ETABLISSEMENTS))
    render(<ChoixSiret />)
    expect(
      await screen.findByText(/2 établissements pour ce SIREN — celui-ci est le mieux rapproché/),
    ).toBeInTheDocument()
    expect(screen.getByText(/Voir les 1 autre établissement/)).toBeInTheDocument()
  })

  it('explique que le choix ne change QUE l’adresse, et ne crie pas au danger', async () => {
    mockFetch.mockReturnValue(reponse(DEUX_ETABLISSEMENTS))
    render(<ChoixSiret />)
    // Chaîne exacte : la regex matchait aussi le parent, et deux résultats font
    // échouer `findByText` — l'échec accuse alors le composant à tort.
    expect(await screen.findByText('la même entreprise')).toBeInTheDocument()
    expect(screen.getByText(/SIREN 508616026/)).toBeInTheDocument()
    // L'avertissement anxiogène est réservé aux entreprises DISTINCTES.
    expect(screen.queryByText(/lisez l’adresse et le métier/)).not.toBeInTheDocument()
  })
})

describe('une panne de lecture n’est pas une file vide', () => {
  beforeEach(() => mockFetch.mockReset())

  it('dit la panne, et ne dit PAS « rien à trancher »', async () => {
    mockFetch.mockRejectedValue(new Error('réseau'))
    render(<ChoixSiret />)
    await waitFor(() => expect(screen.getByText(/la lecture de la file a échoué/i)).toBeInTheDocument())
    expect(screen.queryByText(/rien à trancher/i)).not.toBeInTheDocument()
  })

  it('dit « rien à trancher » quand la file est VRAIMENT vide', async () => {
    mockFetch.mockReturnValue(
      reponse({ resume: { fiches: 0, candidats: 0, evidentes: 0, serrees: 0 }, fiches: [], plafonne: false }),
    )
    render(<ChoixSiret />)
    expect(await screen.findByText(/rien à trancher/i)).toBeInTheDocument()
    expect(screen.queryByText(/a échoué/i)).not.toBeInTheDocument()
  })
})
