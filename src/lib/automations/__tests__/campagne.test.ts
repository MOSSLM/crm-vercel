import {
  controlesAvantLancement,
  lancementPermis,
  motifEcart,
  leadEligible,
  statutInitial,
  revue,
  ecartRattrapable,
  motifEcartLabel,
  MOTIFS_ECART,
  type FaitsDuLead,
} from '../campagne'
import type { Canal, PublicVise } from '@/lib/prospects/canal'

const canaux = (...c: Canal[]) => new Set<Canal>(c)

/** Un prospect sain : joignable, actif, sans histoire. */
const sain = (over: Partial<FaitsDuLead> = {}): FaitsDuLead => ({
  canaux: canaux('mobile', 'email'),
  aUneAffaire: true,
  ...over,
})

const TOUS_CANAUX: PublicVise = {}
const EXIGE_MOBILE: PublicVise = { requireCanaux: ['mobile'] }
const SANS_EMAIL: PublicVise = { excludeCanaux: ['email'] }

describe('motifEcart', () => {
  it('laisse passer un prospect joignable et sans histoire', () => {
    expect(motifEcart(sain(), TOUS_CANAUX)).toBeNull()
    expect(leadEligible(sain(), TOUS_CANAUX)).toBe(true)
  })

  it('écarte qui n’a aucun canal', () => {
    expect(motifEcart(sain({ canaux: canaux() }), TOUS_CANAUX)).toBe('sans_canal')
  })

  it('écarte qui n’a pas le canal exigé par la campagne', () => {
    const fixeSeul = sain({ canaux: canaux('fixe') })
    expect(motifEcart(fixeSeul, EXIGE_MOBILE)).toBe('public_non_atteint')
    // …mais il part très bien dans une campagne qui ne l'exige pas.
    expect(motifEcart(fixeSeul, TOUS_CANAUX)).toBeNull()
  })

  it('respecte les canaux disqualifiants', () => {
    expect(motifEcart(sain({ canaux: canaux('email') }), SANS_EMAIL)).toBe('public_non_atteint')
  })

  it('écarte un désabonné, un archivé, un déjà inscrit', () => {
    expect(motifEcart(sain({ desabonne: true }), TOUS_CANAUX)).toBe('desabonne')
    expect(motifEcart(sain({ archive: true }), TOUS_CANAUX)).toBe('archive')
    expect(motifEcart(sain({ inscriptionVivanteAilleurs: true }), TOUS_CANAUX)).toBe('deja_inscrit')
  })

  it('écarte qui a déjà réagi — au commercial, pas à une séquence', () => {
    expect(motifEcart(sain({ aDejaReagi: true }), TOUS_CANAUX)).toBe('a_deja_reagi')
  })

  it('écarte qui n’a aucune affaire : aucun tableau ne le montrerait', () => {
    expect(motifEcart(sain({ aUneAffaire: false }), TOUS_CANAUX)).toBe('sans_affaire')
    // Absence d'information ≠ absence d'affaire : on ne bloque que sur un `false`.
    expect(motifEcart({ canaux: canaux('mobile') }, TOUS_CANAUX)).toBeNull()
  })

  it('écarte à la main quoi qu’il arrive', () => {
    expect(motifEcart(sain({ ecarteALaMain: true }), TOUS_CANAUX)).toBe('manuel')
  })

  // L'ordre est la règle : le définitif prime sur le réparable, sinon on envoie
  // quelqu'un enrichir une fiche archivée.
  describe('ordre de priorité', () => {
    it('archivé prime sur sans canal', () => {
      expect(motifEcart({ canaux: canaux(), archive: true }, TOUS_CANAUX)).toBe('archive')
    })

    it('a réagi prime sur désabonné', () => {
      expect(motifEcart(sain({ aDejaReagi: true, desabonne: true }), TOUS_CANAUX)).toBe('a_deja_reagi')
    })

    it('sans canal prime sur sans affaire — inutile de parler dossier à qui est injoignable', () => {
      expect(motifEcart({ canaux: canaux(), aUneAffaire: false }, TOUS_CANAUX)).toBe('sans_canal')
    })

    it('la main prime sur tout', () => {
      expect(
        motifEcart(sain({ ecarteALaMain: true, archive: true, desabonne: true }), TOUS_CANAUX),
      ).toBe('manuel')
    })
  })
})

describe('ecartRattrapable', () => {
  it('sépare ce qui se corrige de ce qui est définitif', () => {
    expect(ecartRattrapable('sans_canal')).toBe(true)
    expect(ecartRattrapable('public_non_atteint')).toBe(true)
    expect(ecartRattrapable('deja_inscrit')).toBe(true)
    expect(ecartRattrapable('sans_affaire')).toBe(true)

    expect(ecartRattrapable('desabonne')).toBe(false)
    expect(ecartRattrapable('a_deja_reagi')).toBe(false)
    expect(ecartRattrapable('archive')).toBe(false)
    expect(ecartRattrapable('manuel')).toBe(false)
  })

  it('ne se prononce pas sur une absence de motif', () => {
    expect(ecartRattrapable(null)).toBe(false)
    expect(ecartRattrapable(undefined)).toBe(false)
  })
})

describe('libellés', () => {
  // Un motif sans libellé s'afficherait vide dans la revue : la liste et la
  // table doivent rester solidaires.
  it('chaque motif a un libellé non vide', () => {
    for (const m of MOTIFS_ECART) expect(motifEcartLabel(m).length).toBeGreaterThan(0)
  })

  it('rend une chaîne vide sans motif', () => {
    expect(motifEcartLabel(null)).toBe('')
  })
})

describe('statutInitial', () => {
  it('range en « à lancer » un lead éligible, sans motif', () => {
    expect(statutInitial(sain(), TOUS_CANAUX)).toEqual({ statut: 'a_lancer', motif: null })
  })

  // Le miroir exact de la contrainte SQL `campagne_leads_motif_coherent` :
  // un écart porte toujours un motif, un non-écart n'en porte jamais.
  it('range en « écarté » avec son motif', () => {
    expect(statutInitial(sain({ canaux: canaux() }), TOUS_CANAUX)).toEqual({
      statut: 'ecarte',
      motif: 'sans_canal',
    })
  })
})

describe('revue', () => {
  const cible = EXIGE_MOBILE
  const leads = [
    { faits: sain() }, // part
    { faits: sain() }, // part
    { faits: sain({ canaux: canaux('fixe') }) }, // public_non_atteint
    { faits: sain({ canaux: canaux() }) }, // sans_canal
    { faits: sain({ canaux: canaux() }) }, // sans_canal
    { faits: sain({ desabonne: true }) }, // desabonne
  ]

  it('compte ce qui part et ce qui reste', () => {
    const r = revue(leads, cible)
    expect(r.total).toBe(6)
    expect(r.aLancer).toBe(2)
    expect(r.ecartes).toBe(4)
  })

  it('la somme des motifs égale le nombre d’écartés — aucun lead ne se perd', () => {
    const r = revue(leads, cible)
    expect(r.parMotif.reduce((n, m) => n + m.n, 0)).toBe(r.ecartes)
    expect(r.aLancer + r.ecartes).toBe(r.total)
  })

  it('n’affiche pas les motifs à zéro', () => {
    const r = revue(leads, cible)
    expect(r.parMotif.map((m) => m.motif)).toEqual(['sans_canal', 'public_non_atteint', 'desabonne'])
    expect(r.parMotif.find((m) => m.motif === 'sans_canal')?.n).toBe(2)
  })

  it('dit lesquels se rattrapent', () => {
    const r = revue(leads, cible)
    expect(r.parMotif.find((m) => m.motif === 'sans_canal')?.rattrapable).toBe(true)
    expect(r.parMotif.find((m) => m.motif === 'desabonne')?.rattrapable).toBe(false)
  })

  it('tient sur une liste vide', () => {
    expect(revue([], cible)).toEqual({ total: 0, aLancer: 0, ecartes: 0, parMotif: [] })
  })
})

describe('controlesAvantLancement', () => {
  const etape = (over: Record<string, unknown> = {}) => ({
    id: 's1',
    kind: 'whatsapp',
    message: 'Bonjour {{prenom}}',
    ...over,
  })

  it('laisse passer une séquence active dont les messages sont écrits', () => {
    const c = controlesAvantLancement([etape()], 'on')
    expect(c).toEqual([])
    expect(lancementPermis(c)).toBe(true)
  })

  it('refuse une campagne sans étape — elle range des prospects, elle ne démarche pas', () => {
    const c = controlesAvantLancement([], 'on')
    expect(c.map((x) => x.code)).toEqual(['sequence_vide'])
    expect(lancementPermis(c)).toBe(false)
  })

  it('refuse une séquence qui n’est pas active : les inscriptions gèleraient aussitôt', () => {
    for (const statut of ['draft', 'off', 'paused']) {
      const c = controlesAvantLancement([etape()], statut)
      expect(c.map((x) => x.code)).toContain('sequence_inactive')
      expect(lancementPermis(c)).toBe(false)
    }
  })

  it('refuse une étape au message vide, sauf si elle porte un modèle', () => {
    const vide = controlesAvantLancement([etape({ message: '   ' })], 'on')
    expect(vide.map((x) => x.code)).toEqual(['message_vide'])

    const parModele = controlesAvantLancement([etape({ message: '', template: 'tpl-1' })], 'on')
    expect(parModele).toEqual([])
  })

  it('ne réclame pas de message à une étape qui n’en porte pas', () => {
    expect(controlesAvantLancement([etape({ kind: 'call', message: '' })], 'on')).toEqual([])
    expect(controlesAvantLancement([etape({ kind: 'wait', message: '' })], 'on')).toEqual([])
  })

  // LE CONTRÔLE QUI EXISTE À CAUSE DE 59 INSCRIPTIONS. Une attente-réponse sans
  // délai écrit `next_run_at = null` : plus rien ne réveille l'inscription.
  describe('l’attente de réponse sans délai', () => {
    const attente = (over: Record<string, unknown> = {}) => ({
      id: 'w1',
      kind: 'wait',
      waitMode: 'reply' as const,
      ...over,
    })

    it('bloque quand le délai est absent ou nul', () => {
      for (const step of [attente(), attente({ replyTimeoutDays: 0 })]) {
        const c = controlesAvantLancement([etape(), step], 'on')
        expect(c.map((x) => x.code)).toEqual(['attente_sans_delai'])
        expect(c[0].etapeId).toBe('w1')
        expect(lancementPermis(c)).toBe(false)
      }
    })

    it('ne bloque pas une attente en jours — elle a toujours une fin', () => {
      const c = controlesAvantLancement([etape(), attente({ waitMode: 'days' })], 'on')
      expect(c).toEqual([])
    })

    // L'autre bout du même accident : poser le délai rend atteignable l'étape
    // de tronc suivante, écrite pour quelqu'un qui VIENT DE RÉPONDRE.
    it('avertit quand le délai est posé mais que personne n’a écrit la voie silence', () => {
      const c = controlesAvantLancement([etape(), attente({ replyTimeoutDays: 3 }), etape({ id: 's2' })], 'on')
      expect(c.map((x) => x.code)).toEqual(['voie_silence_vide'])
      expect(c[0].gravite).toBe('avertissement')
      // Un avertissement n'empêche pas de lancer : il se dit, il ne barre pas.
      expect(lancementPermis(c)).toBe(true)
    })

    it('se tait quand la voie silence existe', () => {
      const c = controlesAvantLancement(
        [
          etape(),
          attente({ replyTimeoutDays: 3 }),
          etape({ id: 's2', branch: { waitId: 'w1', on: 'timeout' } }),
        ],
        'on',
      )
      expect(c).toEqual([])
    })

    it('ne prend pas la voie « réponse » pour la voie « silence »', () => {
      const c = controlesAvantLancement(
        [
          etape(),
          attente({ replyTimeoutDays: 3 }),
          etape({ id: 's2', branch: { waitId: 'w1', on: 'reply' } }),
        ],
        'on',
      )
      expect(c.map((x) => x.code)).toEqual(['voie_silence_vide'])
    })

    it('juge chaque attente séparément', () => {
      const c = controlesAvantLancement(
        [etape(), attente({ id: 'w1', replyTimeoutDays: 3 }), attente({ id: 'w2' })],
        'on',
      )
      expect(c.map((x) => [x.code, x.etapeId])).toEqual([
        ['voie_silence_vide', 'w1'],
        ['attente_sans_delai', 'w2'],
      ])
    })
  })
})
