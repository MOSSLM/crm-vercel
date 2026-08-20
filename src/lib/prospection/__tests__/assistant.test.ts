/**
 * L'ASSISTANT DE CAMPAGNE, ET CE QU'IL DOIT REFUSER DE FAIRE.
 *
 * Un assistant qui propose toujours quelque chose de plausible est pire qu'un
 * assistant absent : on lui fait confiance. Les tests ci-dessous portent donc
 * moins sur ce qu'il propose que sur ce qu'il AVOUE —
 *
 *   · les mots qu'il n'a pas compris, listés plutôt qu'avalés ;
 *   · les fiches que le canal choisi laisse dehors, chiffrées ;
 *   · le fait qu'une adresse générique ne se traite pas comme un contact
 *     nominatif : 75 sur 908, et c'est ce chiffre qui interdit de proposer
 *     « 30 jours équilibré » en tête du catalogue.
 *
 * Et une garantie de forme : la proposition ne pose JAMAIS une attente sans
 * délai. C'est ce qui a gelé 59 inscriptions ; le reproduire dans chaque
 * nouvelle campagne recréerait le problème à l'échelle.
 */
import { lireLObjectif, proposer, type Densites } from '../assistant'

/** Les effectifs relevés le 20/08/2026 sur les 908 attribuées. */
const REEL: Densites = {
  total: 908,
  avecEmail: 478,
  avecMobile: 394,
  avecFixe: 466,
  contactNominatif: 75,
  cohorteA: 282,
  cohorteB: 297,
  jamaisTouches: 784,
}

describe('lire l’objectif', () => {
  it('reconnaît la cohorte, le canal et l’état du contact', () => {
    const i = lireLObjectif('relancer en WhatsApp les artisans sans site jamais touchés')
    expect(i.cohorte).toBe('B_sans_site')
    expect(i.canal).toBe('whatsapp')
    expect(i.jamaisTouches).toBe(true)
    expect(i.sansReponse).toBe(true)
  })

  it('lit malgré les accents et la casse', () => {
    expect(lireLObjectif('APPELER ceux à qui on n’a PAS RÉPONDU').canal).toBe('call')
    expect(lireLObjectif('Séquence e-mail pour la cohorte A').cohorte).toBe('A_site_faible')
  })

  // LE TEST QUI REND L'ANALYSEUR ACCEPTABLE. « en Gironde » n'existe pas comme
  // critère : l'avaler construirait une campagne nationale en ayant l'air
  // d'avoir obéi. Il doit ressortir dans `ignorees`.
  it('rend les mots qu’il n’a pas compris, au lieu de les avaler', () => {
    const i = lireLObjectif('les plombiers en Gironde sans site')
    expect(i.cohorte).toBe('B_sans_site')
    expect(i.ignorees).toEqual(expect.arrayContaining(['plombiers', 'gironde']))
  })

  it('ne liste pas les mots vides comme incompris — sinon on cesse de lire la liste', () => {
    const i = lireLObjectif('je veux lancer une campagne pour les entreprises sans site')
    expect(i.ignorees).not.toEqual(expect.arrayContaining(['veux', 'pour', 'campagne']))
  })

  it('une phrase vide ne comprend rien, et le dit', () => {
    expect(lireLObjectif('').comprises).toEqual([])
  })
})

describe('proposer une campagne', () => {
  it('borne la cible à l’intersection de tous les filtres', () => {
    const p = proposer(lireLObjectif('WhatsApp aux sans site jamais touchés'), REEL)
    // min(297 cohorte B, 784 jamais touchés, 394 joignables en WhatsApp)
    expect(p.cible).toBe(297)
    expect(p.filtres).toEqual(expect.arrayContaining(['cohorte B — sans site', 'jamais touchés']))
  })

  // CHIFFRER CE QUI RESTE DEHORS. Demander l'e-mail sur ce fichier laisse 430
  // fiches de côté — un lancement qui ne le dit pas se découvre au premier
  // envoi, quand le compteur affiche moins que la liste.
  it('dit combien de fiches le canal demandé laisse dehors', () => {
    const p = proposer(lireLObjectif('campagne e-mail'), REEL)
    expect(p.reserves.some((r) => /430 fiches sur 908/.test(r))).toBe(true)
  })

  // LA RÉSERVE QUI GOUVERNE LE CATALOGUE : 75 adresses nominatives sur 478.
  it('avertit qu’une adresse générique ne se traite pas comme un contact nommé', () => {
    const p = proposer(lireLObjectif('campagne e-mail'), REEL)
    expect(p.reserves.some((r) => /75 adresses sur 478/.test(r) && /16 %/.test(r))).toBe(true)
  })

  it('choisit le canal sur la densité quand rien n’est demandé', () => {
    expect(proposer(lireLObjectif('les sans site'), REEL).canal).toBe('whatsapp')
    // Un fichier sans mobile bascule sur l'e-mail plutôt que d'insister.
    expect(proposer(lireLObjectif('les sans site'), { ...REEL, avecMobile: 0 }).canal).toBe('email')
  })

  // LA GARANTIE DE FORME. Une attente sans délai est ce qui a gelé 59
  // inscriptions : aucune proposition ne doit en poser une, jamais.
  it('propose toujours une attente AVEC délai, et deux voies distinctes', () => {
    const p = proposer(lireLObjectif('WhatsApp aux sans site'), REEL)
    const attente = p.etapes.find((e) => /attente/i.test(e.quoi))
    expect(attente?.quoi).toMatch(/3 jours/)
    expect(attente?.quoi).toMatch(/jamais sans limite/)
    expect(p.etapes.some((e) => /a répondu/i.test(e.quoi))).toBe(true)
    expect(p.etapes.some((e) => /sans réponse/i.test(e.quoi))).toBe(true)
  })

  // UNE FIN EXPLICITE : c'est ce que le plan reproche aux six séquences
  // existantes de ne pas toujours avoir.
  it('finit sur une clôture datée', () => {
    const p = proposer(lireLObjectif('appeler les sans site'), REEL)
    expect(p.etapes[p.etapes.length - 1].quoi).toMatch(/Clôture/)
  })

  it('n’invente pas une campagne quand rien n’a été compris — il le dit', () => {
    const p = proposer(lireLObjectif('bonjour'), REEL)
    expect(p.reserves.some((r) => /Rien n’a été compris/.test(r))).toBe(true)
  })

  it('renvoie le RGE vers les veilles plutôt que d’en faire une liste figée', () => {
    const p = proposer(lireLObjectif('les RGE qui expirent'), REEL)
    expect(p.reserves.some((r) => /VEILLE/.test(r) && /Signaux/.test(r))).toBe(true)
  })
})
