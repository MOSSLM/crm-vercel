/**
 * LE BARÈME, ET CE QU'IL A LE DROIT D'ÉCRASER — c'est-à-dire rien.
 *
 * Ces chiffres s'affichent sur un site qu'on vend. Les tests portent donc moins
 * sur l'arithmétique, qui est triviale, que sur les trois refus qui la rendent
 * défendable : ne jamais écrire par-dessus un chiffre humain, ne jamais toucher
 * aux colonnes confirmées, et ne rien rendre du tout quand le registre est muet
 * — plutôt qu'une valeur par défaut qui aurait l'air d'une mesure.
 */
import { ancienneteDouteuse, deduireChiffres, patchChiffresCles } from '../chiffres-cles'

const LE_20_AOUT = new Date('2026-08-20T10:00:00Z')

const rien = {
  annees: null,
  clients: null,
  installations: null,
  anneesOfficiel: null,
  clientsOfficiel: null,
  installationsOfficiel: null,
}

describe('deduireChiffres', () => {
  it('compte les années au registre, puis applique le barème', () => {
    // 2011 → 15 ans ; 15 × 40 = 600 chantiers ; 600 × 0,75 = 450 clients.
    expect(deduireChiffres({ dateCreation: '2011-03-01', nombreAvis: 0 }, LE_20_AOUT)).toEqual({
      annees: 15,
      installations: 600,
      clients: 450,
    })
  })

  // LE SECOND TERME DU BARÈME. Une entreprise de deux ans avec 120 avis a
  // manifestement fait plus de 80 chantiers : les avis le disent mieux que son
  // immatriculation.
  it('laisse les avis relever le chiffre d’une jeune entreprise', () => {
    const d = deduireChiffres({ dateCreation: '2024-01-10', nombreAvis: 120 }, LE_20_AOUT)
    expect(d).toEqual({ annees: 2, installations: 480, clients: 360 })
  })

  it('n’affiche jamais « 0 an d’expérience »', () => {
    expect(deduireChiffres({ dateCreation: '2026-06-01', nombreAvis: 0 }, LE_20_AOUT)?.annees).toBe(1)
  })

  // LE REFUS QUI COMPTE : sans date, il n'y a pas d'ancienneté. Un défaut
  // inventé mettrait un chiffre faux sur un site vendu.
  it('ne déduit RIEN sans date de création', () => {
    expect(deduireChiffres({ dateCreation: null, nombreAvis: 300 }, LE_20_AOUT)).toBeNull()
    expect(deduireChiffres({ dateCreation: 'jamais', nombreAvis: 0 }, LE_20_AOUT)).toBeNull()
  })
})

describe('patchChiffresCles', () => {
  const matiere = { dateCreation: '2011-03-01', nombreAvis: 0 }

  it('remplit les trois cases d’un dossier vide', () => {
    expect(patchChiffresCles(matiere, rien, LE_20_AOUT)).toEqual({
      stat_years_experience: '15',
      stat_installations_completed: '600',
      stat_satisfied_clients: '450',
    })
  })

  // ON MONTE, ON NE DESCEND JAMAIS. Un chiffre au-dessus du barème peut être une
  // revendication vraie du site ; l'écraser sous-estimerait le prospect, ce que
  // le barème interdit dans l'autre sens.
  it('respecte une estimation SUPÉRIEURE au barème', () => {
    const patch = patchChiffresCles(matiere, { ...rien, annees: '22' }, LE_20_AOUT)
    expect(patch).not.toHaveProperty('stat_years_experience')
    expect(patch).toHaveProperty('stat_installations_completed')
  })

  // UN CHIFFRE CONFIRMÉ PAR LE CLIENT COMPTE COMME REMPLI, même si l'estimation
  // est vide : c'est lui qui s'affiche. Sans ce « ou », on écrirait une
  // estimation sous un chiffre vrai — invisible au rendu, faux en base.
  it('respecte un chiffre confirmé, et ne touche jamais aux colonnes officielles', () => {
    const patch = patchChiffresCles(matiere, { ...rien, anneesOfficiel: '30' }, LE_20_AOUT)
    expect(patch).not.toHaveProperty('stat_years_experience')
    expect(Object.keys(patch ?? {}).some((k) => k.endsWith('_official'))).toBe(false)
  })

  // « 0 », « - » et « — » n'affichent rien sur le site : les traiter comme
  // remplis laisserait une ligne rouge que le barème pouvait combler.
  it('traite « 0 », « - » et « — » comme vides, exactement comme le rendu', () => {
    const patch = patchChiffresCles(
      matiere,
      { ...rien, annees: '0', clients: '—', installations: ' - ' },
      LE_20_AOUT,
    )
    expect(patch).toEqual({
      stat_years_experience: '15',
      stat_installations_completed: '600',
      stat_satisfied_clients: '450',
    })
  })

  it('ne rend rien à écrire quand tout est déjà AU-DESSUS du barème', () => {
    expect(
      patchChiffresCles(
        matiere,
        { ...rien, annees: '20', clients: '900', installations: '1200' },
        LE_20_AOUT,
      ),
    ).toBeNull()
  })

  it('ne rend rien à écrire quand le registre est muet', () => {
    expect(patchChiffresCles({ dateCreation: null, nombreAvis: 9 }, rien, LE_20_AOUT)).toBeNull()
  })
})

/**
 * LA SENTINELLE — trouvée en base, pas en relisant le code.
 *
 * `1900-01-01` est ce que SIRENE écrit quand il ne connaît pas la date de
 * création : 4 fiches la portent au 20/08/2026. Prise au mot, elle affichait
 * « 126 ans d'expérience » sur un site vendu à un artisan — exactement le
 * chiffre surestimé que le barème interdit.
 */
describe('les dates qui n’en sont pas', () => {
  it('refuse la sentinelle SIRENE plutôt que d’annoncer 126 ans', () => {
    expect(deduireChiffres({ dateCreation: '1900-01-01', nombreAvis: 0 }, LE_20_AOUT)).toBeNull()
    expect(patchChiffresCles({ dateCreation: '1900-01-01', nombreAvis: 0 }, rien, LE_20_AOUT)).toBeNull()
  })

  it('garde les entreprises réellement anciennes', () => {
    expect(deduireChiffres({ dateCreation: '1957-06-01', nombreAvis: 0 }, LE_20_AOUT)?.annees).toBe(69)
  })
})

/**
 * REMONTER AU BARÈME — le défaut vu à l'autre bout.
 *
 * Mesuré le 20/08 : 146 dossiers sur 326 portent des installations inférieures
 * au barème, dont 29 massivement — une estimation antérieure les tirait des
 * seuls avis Google. « ENTREPRISE DEJOURS » affichait 40 ans d'expérience et
 * **14 chantiers**. Remplir l'ancienneté sans toucher au reste ne corrigeait
 * pas cette contradiction : ça la FABRIQUAIT.
 */
describe('remonter au barème ce qui est en dessous', () => {
  it('relève des installations tirées des seuls avis', () => {
    // Le cas réel d'ENTREPRISE DEJOURS : 1986 au registre, 5 avis, 14 chantiers.
    const patch = patchChiffresCles(
      { dateCreation: '1986-01-01', nombreAvis: 5 },
      { ...rien, annees: '40', installations: '14', clients: '7' },
      LE_20_AOUT,
    )
    expect(patch).toEqual({
      stat_installations_completed: '1600',
      stat_satisfied_clients: '1200',
    })
  })

  // LA GARDE QUI COMPTE. « Ocean Clim Plomberie » affiche 100 ans pour une
  // entreprise immatriculée en 2024 : partir de l'année AFFICHÉE donnerait
  // 4 000 chantiers — un chiffre faux rendu quarante fois plus faux.
  it('calcule sur le registre et jamais sur l’année affichée', () => {
    const patch = patchChiffresCles(
      { dateCreation: '2024-09-10', nombreAvis: 4 },
      { ...rien, annees: '100', installations: '100', clients: '100' },
      LE_20_AOUT,
    )
    // 1 an au registre → barème 40 ; les 100 déjà posés sont au-dessus, on ne
    // descend pas. Et surtout : jamais 100 × 40.
    expect(patch).toBeNull()
  })

  it('ne remonte jamais un chiffre confirmé par le client', () => {
    const patch = patchChiffresCles(
      { dateCreation: '1986-01-01', nombreAvis: 5 },
      { ...rien, annees: '40', installationsOfficiel: '14', clients: '7' },
      LE_20_AOUT,
    )
    expect(patch).not.toHaveProperty('stat_installations_completed')
    expect(patch).toHaveProperty('stat_satisfied_clients')
  })
})

describe('ancienneteDouteuse', () => {
  it('signale les cent ans d’une entreprise de 2024', () => {
    expect(
      ancienneteDouteuse(
        { dateCreation: '2024-09-10', nombreAvis: 4 },
        { ...rien, annees: '100' },
        LE_20_AOUT,
      ),
    ).toBe(true)
  })

  // Un écart de dix ans reste une REVENDICATION légitime — « c'est l'expérience
  // métier du dirigeant », et la règle est de la retenir.
  it('laisse passer une revendication crédible du site', () => {
    expect(
      ancienneteDouteuse(
        { dateCreation: '2011-03-01', nombreAvis: 0 },
        { ...rien, annees: '25' },
        LE_20_AOUT,
      ),
    ).toBe(false)
  })

  it('ne signale rien quand le registre est muet', () => {
    expect(
      ancienneteDouteuse({ dateCreation: null, nombreAvis: 0 }, { ...rien, annees: '100' }, LE_20_AOUT),
    ).toBe(false)
  })
})
