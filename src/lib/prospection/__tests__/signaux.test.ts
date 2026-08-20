/**
 * LES VEILLES, ET LA SEULE CHOSE QUI LES REND HONNÊTES.
 *
 * Une veille lit des ÉTATS et doit rendre des ÉVÉNEMENTS. Tout ce fichier
 * tourne autour de cette conversion, parce que c'est là que se joue la
 * crédibilité de l'écran :
 *
 *   · si la première passe se présente comme une veille, on lit « 220 signaux »
 *     et on croit que 220 sites sont tombés cette nuit ;
 *   · si les passes suivantes rendent l'état complet, on relit les mêmes 98
 *     entreprises tous les jours et on cesse d'ouvrir l'écran ;
 *   · si « jamais passée » s'affiche comme « rien trouvé », une veille en
 *     panne a l'air d'une veille qui travaille.
 *
 * C'est la neuvième fois que ce projet pose ce dernier piège. Il a un test à
 * chaque fois, et c'est pour ça qu'il ne revient jamais deux fois au même
 * endroit.
 */
import {
  DECLENCHEURS,
  FICHES,
  HORS_PORTEE,
  classer,
  delta,
  estDeclencheur,
  etatDe,
  phraseDe,
  type BilanPasse,
} from '../signaux'

const bilan = (p: Partial<BilanPasse> = {}): BilanPasse => ({
  examinees: 0,
  nouvelles: 0,
  connues: 0,
  reprise: false,
  ...p,
})

describe('le catalogue dit ce qu’il lit et ce qu’il vaut', () => {
  it('chaque déclencheur nomme sa source et porte une accroche', () => {
    for (const cle of DECLENCHEURS) {
      const f = FICHES[cle]
      expect(f.cle).toBe(cle)
      // Une source vide obligerait à relire le code pour savoir d'où vient un
      // signal — et personne ne le fait avant d'appeler un prospect.
      expect(f.source.length).toBeGreaterThan(10)
      // Sans accroche, un signal est une ligne de plus sur un écran.
      expect(f.accroche.length).toBeGreaterThan(20)
    }
  })

  // AUCUN DÉCLENCHEUR N'EST UN ÉVÉNEMENT NATIF, et c'est exactement pourquoi
  // `veille_constats` existe. Le jour où l'un le deviendra, ce test rougira et
  // obligera à se demander s'il a encore besoin de la mémoire.
  it('aucune de nos sources ne rend un événement — toutes rendent un état', () => {
    expect(DECLENCHEURS.every((c) => FICHES[c].evenementNatif === false)).toBe(true)
  })

  // Un déclencheur qui vise un tiers du parc n'est pas un signal : c'est un
  // stock à verser dans une campagne. Les mélanger noierait le rapport ouvert
  // (3 sur tout le parc) dans la note d'audit (305 sur 908).
  it('range les signaux avant les segments, et le plus rare devant', () => {
    const ordre = classer([...DECLENCHEURS])
    const premierSegment = ordre.findIndex((c) => FICHES[c].nature === 'segment')
    const dernierSignal = ordre.map((c) => FICHES[c].nature).lastIndexOf('signal')
    expect(premierSegment).toBeGreaterThan(dernierSignal)

    // La règle est la RARETÉ, et pas une chaleur devinée à la main. Elle ne met
    // donc pas « rapport ouvert » (3) en tête mais « RGE périmé » (2) — et
    // c'est le bon arbitrage : un ordre écrit à la main serait un classement
    // que personne ne saurait défendre six mois plus tard.
    const signaux = ordre.filter((c) => FICHES[c].nature === 'signal')
    const densites = signaux.map((c) => FICHES[c].densite.attribuees)
    expect(densites).toEqual([...densites].sort((a, b) => a - b))
    expect(FICHES[ordre[ordre.length - 1]].nature).toBe('segment')
  })

  it('reconnaît une clé du catalogue, et refuse ce qui n’y est pas', () => {
    expect(estDeclencheur('rge_expire_bientot')).toBe(true)
    expect(estDeclencheur('note_audit_chute')).toBe(false)
    expect(estDeclencheur('')).toBe(false)
  })

  /**
   * CE QU'ON NE SAIT PAS VOIR EST ÉCRIT, PAS OMIS. Les quatre veilles du plan
   * qui sont hors de portée gardent leur entrée, avec la RAISON mesurée et ce
   * qu'il faudrait construire. Un catalogue qui les tairait aurait l'air
   * complet, et on redemanderait « la note d'audit qui chute » tous les
   * trimestres.
   */
  it('déclare ce qui n’est pas mesurable, avec sa raison et son remède', () => {
    expect(HORS_PORTEE.map((h) => h.cle)).toEqual([
      'note_audit_chute',
      'site_tombe',
      'intention_ga4',
      'concurrent_detecte',
    ])
    for (const h of HORS_PORTEE) {
      expect(h.raison.length).toBeGreaterThan(40)
      expect(h.ceQuIlFaudrait.length).toBeGreaterThan(20)
    }
    // Aucune n'est dans le catalogue actif : les proposer serait promettre une
    // veille qui ne trouverait jamais rien.
    for (const h of HORS_PORTEE) expect(estDeclencheur(h.cle)).toBe(false)
  })
})

describe('le delta — une veille ne redit jamais ce qu’elle a déjà dit', () => {
  it('ne rend que ce qui n’a jamais été vu', () => {
    expect(delta([1, 2, 3], new Set([2]))).toEqual([1, 3])
  })

  // Une entreprise porte plusieurs qualifications RGE (trois en moyenne) : la
  // même peut donc sortir plusieurs fois d'une seule lecture.
  it('ne rend pas deux fois la même entreprise dans une seule passe', () => {
    expect(delta([7, 7, 7], new Set())).toEqual([7])
  })

  it('rend une liste vide quand tout est connu — et c’est un résultat, pas une panne', () => {
    expect(delta([1, 2], new Set([1, 2]))).toEqual([])
  })

  it('garde l’ordre de la lecture — le RGE le plus proche vient en premier', () => {
    expect(delta([9, 4, 6], new Set([4]))).toEqual([9, 6])
  })
})

describe('l’état d’une veille — quatre vides, quatre phrases', () => {
  it('« jamais passée » n’est pas « rien trouvé »', () => {
    const e = etatDe({ premierePasseLe: null, derniereBilan: null })
    expect(e).toBe('jamais_passee')
    expect(phraseDe(e, null)).toMatch(/ne surveille encore rien/i)
  })

  // LE TEST QUI COMPTE. 220 sites injoignables ramassés le premier jour sont un
  // arriéré. Les présenter comme des signaux du jour serait un mensonge par
  // présentation — le même que « Aucune campagne » sur une lecture ratée.
  it('la première passe se présente comme une reprise, jamais comme une veille', () => {
    const b = bilan({ reprise: true, nouvelles: 220, examinees: 220 })
    const e = etatDe({ premierePasseLe: '2026-08-20T10:00:00Z', derniereBilan: b })
    expect(e).toBe('reprise_faite')
    expect(phraseDe(e, b)).toMatch(/arriéré/i)
    expect(phraseDe(e, b)).not.toMatch(/nouvelle[s]? depuis/i)
  })

  it('une reprise vide le dit aussi — la veille part de zéro', () => {
    const b = bilan({ reprise: true, nouvelles: 0 })
    expect(phraseDe('reprise_faite', b)).toMatch(/aucun arriéré/i)
  })

  it('une passe ordinaire qui ne trouve rien dit qu’elle a cherché', () => {
    const b = bilan({ examinees: 98, connues: 98 })
    const e = etatDe({ premierePasseLe: '2026-08-20T10:00:00Z', derniereBilan: b })
    expect(e).toBe('a_jour')
    expect(phraseDe(e, b)).toMatch(/rien de nouveau/i)
  })

  // Une lecture qui échoue ne vaut JAMAIS zéro : zéro veut dire « cherché, rien
  // trouvé », et les deux mènent à des décisions opposées.
  it('une panne ne se lit jamais comme un zéro', () => {
    const b = bilan({ panne: 'relation « veille_constats » introuvable' })
    const e = etatDe({ premierePasseLe: '2026-08-20T10:00:00Z', derniereBilan: b })
    expect(e).toBe('panne')
    expect(phraseDe(e, b)).toMatch(/n’est pas « rien trouvé »/)
  })

  // Une panne survenue à la PREMIÈRE passe reste une panne : sans ça, une
  // veille née cassée se présenterait comme une veille qui a fait sa reprise.
  it('la panne l’emporte sur la reprise', () => {
    const b = bilan({ reprise: true, panne: 'lecture tronquée' })
    expect(etatDe({ premierePasseLe: null, derniereBilan: b })).toBe('panne')
  })

  it('accorde le pluriel — un écran qui écrit « 1 nouvelles » se fait relire deux fois', () => {
    expect(phraseDe('a_jour', bilan({ nouvelles: 1 }))).toMatch(/1 nouvelle depuis/)
    expect(phraseDe('a_jour', bilan({ nouvelles: 4 }))).toMatch(/4 nouvelles depuis/)
  })
})
