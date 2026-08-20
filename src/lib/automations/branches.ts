// branches.ts — LE CHEMIN. Le seul module qui sait où va un prospect.
//
// LE PROBLÈME D'ORIGINE
// Une attente-réponse avec délai (« relancer au bout de 3 jours ») a DEUX
// issues, et jusqu'ici les deux menaient à la même étape suivante. Le texte
// écrit là devait donc convenir à quelqu'un qui vient de répondre comme à
// quelqu'un qui n'a rien dit depuis trois jours — deux situations qui ne se
// travaillent pas pareil. En pratique, on écrivait pour l'une et on mentait à
// l'autre : « merci pour votre réponse ! » à un silence, ou « je me permets de
// revenir vers vous » à quelqu'un qui vient d'écrire.
//
// CE QUI A ÉTÉ AJOUTÉ ENSUITE, ET POURQUOI
//
//   · **Les conditions** — une fourche qui TESTE au lieu d'attendre. Même
//     mécanique de branche, autre façon de lire l'issue.
//   · **L'aiguillage** — une fourche à N voies. Deux voies obligeaient à
//     empiler les questions : « a-t-il un mobile ? » puis, dans la voie non,
//     « a-t-il une adresse ? » puis, dans la voie non de celle-là… Trois
//     fourches imbriquées pour un seul aiguillage, dont l'éditeur ne dessinait
//     que la première. Une cascade de cas dit la même chose sur une ligne, et
//     c'est elle qui permet à UNE séquence de porter tout le portefeuille au
//     lieu de quatre.
//   · **La suite** — ce qui se passe après une étape. Sans elle, une voie ne
//     savait que rejoindre le tronc : aucune ne pouvait s'arrêter pour de bon,
//     aucune ne pouvait reboucler. C'est le « après le premier contact et
//     l'appel, c'est le flou » : le flou était dans les séquences, qui n'ont
//     jamais eu de fin écrite.
//
// LE MODÈLE, ET POURQUOI IL RESTE UN TABLEAU PLAT
// `definition.steps` demeure une liste ordonnée. Une étape peut simplement
// déclarer qu'elle appartient à la voie d'une fourche :
//
//     { id: 's3', kind: 'whatsapp', branch: { waitId: 's2', on: 'reply' } }
//
// Un arbre aurait obligé à réécrire tout ce qui parcourt les étapes — le
// moteur, la vue semaine, les colonnes du pipeline commercial, l'ancrage des
// J+n — pour un besoin que l'ordre du tableau exprime déjà : les étapes d'une
// voie se suivent, et le tronc reprend après.
//
// `on` EST UNE CLÉ DE SORTIE, ET C'EST CE QUI A TOUT PERMIS
// `'reply'` et `'timeout'` ne sont plus deux valeurs d'énumération mais les
// NOMS des deux premières sorties. Sur une attente elles se lisent « il a
// répondu / sans réponse », sur une condition simple « oui / non », et un
// aiguillage en déclare autant qu'il a de cas, plus `'sinon'`. Les six
// séquences existantes et les 92 `vars.replies` restent valides à l'octet près.
//
// LA RÈGLE D'ATTEIGNABILITÉ, EN UNE PHRASE
// Une étape sans `branch` est toujours atteignable ; une étape de voie ne l'est
// que si SA fourche a réellement rendu cette sortie-là — et que la fourche
// elle-même était atteignable. La récursion est ce qui permet d'imbriquer une
// seconde fourche dans une voie sans que ses propres voies deviennent
// accessibles depuis un chemin qui n'est jamais passé par elle.
//
// AUCUN ÉTAT SUPPLÉMENTAIRE
// L'issue d'une attente se déduit de `vars.replies`, celle d'une condition de
// `vars.conditions`. Rien à stocker sur l'inscription au-delà de ces deux sacs,
// donc rien qui puisse se désynchroniser de la définition quand celle-ci est
// modifiée en cours de route.
//
// Module PUR : ni base, ni React. Le moteur décide avec, l'éditeur dessine
// avec, les tests le tiennent.

import type { SequenceStep } from '@/components/automations/types'
import {
  libelleCas,
  libelleCondition,
  SORTIE_SINON,
  type CasAiguillage,
} from './conditions'

/**
 * La sortie d'une fourche — une clé, pas une énumération.
 *
 * `'reply'` = sortie 1, `'timeout'` = sortie 2 (les deux noms historiques),
 * `'sinon'` = la voie de repli d'un aiguillage, et n'importe quelle clé de cas
 * pour les autres.
 */
export type Issue = string
/** @deprecated Le nom d'avant les aiguillages. `Issue` dit la même chose. */
export type IssueAttente = Issue

/** Les deux sorties que toute fourche à deux voies porte, quelle que soit sa nature. */
export const SORTIE_1: Issue = 'reply'
export const SORTIE_2: Issue = 'timeout'
export { SORTIE_SINON }

export interface BrancheEtape {
  /** `id` de l'étape de fourche dont cette voie dépend. */
  waitId: string
  on: Issue
}

export interface SortieFourche {
  cle: Issue
  titre: string
  court: string
  aide: string
}

export const ISSUE_LABEL: Readonly<Record<'reply' | 'timeout', SortieFourche>> = {
  reply: {
    cle: SORTIE_1,
    titre: 'Il a répondu',
    court: 'réponse',
    aide: 'Ce qui part une fois la conversation ouverte. On peut nommer la personne et enchaîner.',
  },
  timeout: {
    cle: SORTIE_2,
    titre: 'Sans réponse',
    court: 'silence',
    aide: 'Ce qui part quand le délai s’écoule sans un mot. Ne jamais y remercier de la réponse.',
  },
}

/* ── Ce qui est une fourche, et combien de voies elle ouvre ──────────────── */

/** Cette étape ouvre-t-elle deux chemins ? */
export function estAttenteReponse(step: SequenceStep | undefined): boolean {
  return !!step && step.kind === 'wait' && step.waitMode === 'reply'
}

/**
 * Une attente n'a de voie « sans réponse » que si elle relance vraiment.
 *
 * Sans délai, l'inscription reste garée indéfiniment : l'issue n'arrive jamais,
 * et proposer d'y écrire quelque chose promettrait un envoi qui ne partira pas.
 */
export function aUneBrancheSilence(step: SequenceStep | undefined): boolean {
  return estAttenteReponse(step) && (Number(step?.replyTimeoutDays) || 0) > 0
}

/**
 * Cette étape est-elle une CONDITION — une fourche qui teste au lieu d'attendre ?
 *
 * Le vocabulaire de ce qu'elle teste vit dans
 * `src/lib/automations/conditions.ts` ; ici on ne regarde que la forme.
 */
/**
 * Cette étape FAIT SORTIR de la séquence — rien ne la suit, jamais.
 *
 * Un passage de relais ferme l'inscription ici et en ouvre une ailleurs
 * (`processTransitionStep`). Le moteur le sait ; le chemin devait le savoir
 * aussi. Sans ça l'aperçu continuait tranquillement après la carte et montrait
 * à l'auteur des étapes que le prospect ne recevra jamais — le genre de
 * mensonge qu'on ne découvre qu'en production.
 */
export function estSortie(step: SequenceStep | undefined): boolean {
  return step?.kind === 'transition'
}

export function estCondition(step: SequenceStep | undefined): boolean {
  return !!step && step.kind === 'condition'
}

/** Les cas d'un aiguillage, ou une liste vide si la condition n'en porte pas. */
export function casDeLaCondition(step: SequenceStep | undefined): CasAiguillage[] {
  const cas = step?.condition?.cas
  return Array.isArray(cas) ? (cas as unknown as CasAiguillage[]) : []
}

/** Cette condition aiguille-t-elle vers plus de deux voies ? */
export function estAiguillage(step: SequenceStep | undefined): boolean {
  return estCondition(step) && casDeLaCondition(step).length > 0
}

/**
 * Les sorties de cette fourche, dans l'ordre où l'éditeur les dessine.
 *
 * UN SEUL ENDROIT SAIT COMBIEN DE VOIES UNE ÉTAPE OUVRE, et c'est ce qui
 * permet au canvas, au sélecteur de voie, au moteur et à la prévision de ne
 * jamais se contredire. Une étape qui n'est pas une fourche rend une liste
 * vide — c'est la définition même de `estFourche`.
 */
export function sortiesDeLaFourche(step: SequenceStep | undefined): SortieFourche[] {
  if (estAiguillage(step)) {
    return [
      ...casDeLaCondition(step).map((c) => ({
        cle: c.cle,
        titre: libelleCas(c),
        court: libelleCas(c),
        aide: 'Ce qui part pour les prospects que ce cas retient. Le premier cas vrai gagne.',
      })),
      {
        cle: SORTIE_SINON,
        titre: 'Sinon',
        court: 'sinon',
        aide:
          'Ce qui part pour tous les autres — y compris ceux dont on n’a pas pu mesurer les cas précédents. À écrire pour quelqu’un dont on ne sait rien.',
      },
    ]
  }
  if (estCondition(step)) {
    return [
      { cle: SORTIE_1, titre: 'Oui', court: 'oui', aide: 'Ce qui part quand la condition est vraie.' },
      {
        cle: SORTIE_2,
        titre: 'Non',
        court: 'non',
        aide:
          'Ce qui part quand elle est fausse — et aussi quand on n’a pas pu la mesurer, sauf réglage contraire.',
      },
    ]
  }
  if (aUneBrancheSilence(step)) return [ISSUE_LABEL.reply, ISSUE_LABEL.timeout]
  return []
}

/** Cette étape ouvre-t-elle des voies ? */
export function estFourche(step: SequenceStep | undefined): boolean {
  return sortiesDeLaFourche(step).length > 0
}

/**
 * La sortie prise quand on ne sait encore rien — toujours la DERNIÈRE.
 *
 * « Sans réponse », « non », « sinon » : c'est la voie qu'on écrit pour
 * quelqu'un dont on n'a rien appris, et c'est le bon côté de l'erreur. Faire
 * partir par défaut le message réservé à ceux qui ont répondu serait le mauvais.
 */
export function issueParDefaut(step: SequenceStep | undefined): Issue {
  const sorties = sortiesDeLaFourche(step)
  return sorties.length > 0 ? sorties[sorties.length - 1].cle : SORTIE_2
}

/**
 * Comment s'appelle cette sortie de cette fourche.
 *
 * MÊME STOCKAGE, PLUSIEURS LECTURES : sur une attente ça se lit « il a répondu /
 * sans réponse », sur une condition « oui / non », sur un aiguillage le libellé
 * du cas. L'éditeur n'a donc qu'un endroit à interroger.
 *
 * Une clé qui ne correspond à AUCUNE sortie n'est pas une erreur à taire : un
 * cas supprimé laisse derrière lui des étapes qui pointent dans le vide, et
 * elles ne partiront jamais. On le dit, plutôt que de les dessiner comme les
 * autres.
 */
export function libelleIssue(step: SequenceStep | undefined, on: Issue): SortieFourche {
  const trouvee = sortiesDeLaFourche(step).find((s) => s.cle === on)
  if (trouvee) return trouvee
  return {
    cle: on,
    titre: 'Voie orpheline',
    court: on,
    aide:
      'Cette voie ne correspond à aucune sortie de la fourche — le cas a dû être supprimé. Rien de ce qu’elle contient ne partira jamais.',
  }
}

/* ── La suite d'une étape : continuer, sauter, ou finir ──────────────────── */

export type Suite =
  | { type: 'suivre' }
  | { type: 'aller_a'; cible: string }
  | { type: 'fin'; motif?: string }

/** Au-delà, on arrête : une redirection en arrière sans issue tournerait sans fin. */
export const MAX_TOURS = 12

const SUIVRE: Suite = { type: 'suivre' }

/**
 * Ce que cette étape a déclaré pour la suite. Absent = on descend au suivant.
 *
 * Tolérant à une définition écrite par une version plus récente : une suite
 * qu'on ne comprend pas se lit « continuer », jamais « finir ». Interrompre une
 * séquence sur un mot inconnu serait la pire des lectures.
 */
export function suiteDeLEtape(step: SequenceStep | undefined): Suite {
  const s = step?.suite
  if (!s || typeof s !== 'object') return SUIVRE
  if (s.type === 'fin') return { type: 'fin', ...(s.motif ? { motif: s.motif } : {}) }
  if (s.type === 'aller_a' && typeof s.cible === 'string' && s.cible) {
    return { type: 'aller_a', cible: s.cible }
  }
  return SUIVRE
}

/* ── Lire l'issue d'une fourche ──────────────────────────────────────────── */

/** Index de l'étape de fourche que cette voie désigne, ou -1. */
export function indexDeLAttente(steps: SequenceStep[], waitId: string): number {
  return steps.findIndex((s) => s.id === waitId)
}

/**
 * L'issue rendue par l'attente d'index `waitIdx`.
 *
 * `aRepondu` lit `vars.replies` : une réponse déclarée à la main fait basculer
 * l'inscription du silence vers la conversation, même après coup.
 */
export function issueDeLAttente(waitIdx: number, aRepondu: (idx: number) => boolean): Issue {
  return aRepondu(waitIdx) ? SORTIE_1 : SORTIE_2
}

/**
 * La clé sous laquelle se note ce qu'une fourche a rendu.
 *
 * ⚠️ L'IDENTIFIANT, PLUS L'INDEX — ET ÇA S'EST PAYÉ EN PRODUCTION.
 * `vars.replies` et `vars.conditions` étaient rangés par RANG dans le tableau.
 * Insérer une étape au milieu d'une séquence en cours décale donc tout ce qui
 * suit : le 20/08/2026, l'ajout de `s2b` dans « WhatsApp seul » a fait pointer
 * 34 inscriptions garées sur la deuxième attente vers une carte WhatsApp d'une
 * voie qu'elles n'avaient jamais prise, et rendu muettes les 9 réponses notées
 * au rang 3. Rien à l'écran ne le disait.
 *
 * On écrit donc l'`id`, qui ne bouge pas quand on édite. La lecture accepte
 * encore le rang, pour les sacs écrits avant ce jour-là : c'est une compatibilité
 * qui ne coûte rien, et la retirer aurait effacé ce que 92 inscriptions savent
 * d'elles-mêmes.
 */
export function cleDeFourche(steps: SequenceStep[], idx: number): string {
  return steps[idx]?.id ?? String(idx)
}

/** Ce qu'un sac dit de la fourche `idx` — par identifiant, à défaut par rang. */
export function lireLeSac<T>(
  sac: Record<string, T>,
  steps: SequenceStep[],
  idx: number,
): T | undefined {
  const id = steps[idx]?.id
  if (id != null && Object.prototype.hasOwnProperty.call(sac, id)) return sac[id]
  return sac[String(idx)]
}

/**
 * Le lecteur d'issue, construit sur les DEUX sacs.
 *
 * POURQUOI IL VIT ICI ET PAS DANS LE MOTEUR
 * Le moteur, l'éditeur et la prévision doivent répondre la même chose à « quel
 * chemin ce prospect a-t-il pris ». Écrire la lecture trois fois, c'est trois
 * occasions de diverger — et la première divergence serait invisible : un
 * prospect verrait dans l'aperçu un message qu'il ne recevra pas.
 *
 * Une fourche pas encore tranchée rend `issueParDefaut` — la dernière voie,
 * celle qu'on écrit pour quelqu'un dont on ne sait rien.
 */
export function lecteurDIssue(
  steps: SequenceStep[],
  replies: Record<string, unknown>,
  conditions: Record<string, string>,
): (idx: number) => Issue {
  return (idx: number) => {
    const step = steps[idx]
    if (estCondition(step)) {
      const verdict = lireLeSac(conditions, steps, idx)
      if (estAiguillage(step)) {
        // AIGUILLAGE : la valeur stockée EST la clé de sortie. Une clé qui ne
        // correspond plus à aucun cas (le cas a été supprimé sous les pieds de
        // l'inscription) retombe sur « sinon » plutôt que de rendre le prospect
        // inatteignable partout.
        const connue = sortiesDeLaFourche(step).some((s) => s.cle === verdict)
        return connue ? (verdict as Issue) : SORTIE_SINON
      }
      if (verdict === 'oui') return SORTIE_1
      if (verdict === 'non') return SORTIE_2
      // NON MESURÉ : c'est ICI, et nulle part ailleurs, que `siInconnu`
      // s'applique. Le sac garde le verdict HONNÊTE (« on n'a pas su »), la
      // voie prise se déduit du réglage de l'étape. Écrire la voie dans le sac
      // à la place aurait perdu la distinction — et on n'aurait jamais pu
      // compter combien de prospects sont partis dans une voie devinée.
      //
      // Conséquence voulue : changer `siInconnu` sur une séquence en cours
      // change le chemin des inscriptions déjà passées par là. C'est la même
      // règle que pour les voies d'attente — aucun état figé sur l'inscription,
      // donc rien qui puisse diverger de la définition.
      if (verdict === 'non_mesure') {
        return (step?.condition?.siInconnu ?? 'non') === 'oui' ? SORTIE_1 : SORTIE_2
      }
      return issueParDefaut(step)
    }
    return lireLeSac(replies, steps, idx) ? SORTIE_1 : SORTIE_2
  }
}

/* ── Atteignabilité et parcours ──────────────────────────────────────────── */

/**
 * Cette étape est-elle sur le chemin que l'inscription a réellement pris ?
 *
 * Une voie orpheline (sa fourche a été supprimée) ou mal placée (déclarée avant
 * sa fourche) est INATTEIGNABLE plutôt que traitée comme du tronc : on ne
 * devine pas ce qu'une définition à moitié éditée voulait dire, et faire partir
 * un message par défaut est le mauvais côté de l'erreur.
 */
export function etapeAtteignable(
  steps: SequenceStep[],
  idx: number,
  issueDe: (idx: number) => Issue,
): boolean {
  const b = steps[idx]?.branch
  if (!b) return true
  const waitIdx = indexDeLAttente(steps, b.waitId)
  if (waitIdx < 0 || waitIdx >= idx) return false
  if (!etapeAtteignable(steps, waitIdx, issueDe)) return false
  return issueDe(waitIdx) === b.on
}

/**
 * L'étape à exécuter après celle d'index `fromIdx`.
 *
 * Rend `steps.length` quand il n'y a plus rien — la séquence se termine, comme
 * avant l'existence des voies.
 *
 * LA SUITE DÉCLARÉE PASSE AVANT LA DESCENTE. « Finir ici » rend directement la
 * fin ; « aller à » rend la cible, en avant comme en arrière. Une cible
 * disparue rend la fin, et surtout PAS la descente : reprendre le fil comme si
 * de rien n'était ferait partir chez le prospect les messages d'un chemin que
 * personne n'a choisi pour lui.
 */
export function etapeSuivante(
  steps: SequenceStep[],
  fromIdx: number,
  issueDe: (idx: number) => Issue,
): number {
  if (estSortie(steps[fromIdx])) return steps.length
  const suite = suiteDeLEtape(steps[fromIdx])
  if (suite.type === 'fin') return steps.length
  if (suite.type === 'aller_a') {
    const cible = steps.findIndex((s) => s.id === suite.cible)
    return cible >= 0 ? cible : steps.length
  }
  for (let j = Math.max(-1, fromIdx) + 1; j < steps.length; j++) {
    if (etapeAtteignable(steps, j, issueDe)) return j
  }
  return steps.length
}

/** Première étape de la voie `on` de la fourche `waitId`, ou -1. */
export function debutDeBranche(steps: SequenceStep[], waitId: string, on: Issue): number {
  return steps.findIndex((s) => s.branch?.waitId === waitId && s.branch.on === on)
}

/** Les index des étapes d'une voie, dans l'ordre. */
export function etapesDeBranche(steps: SequenceStep[], waitId: string, on: Issue): number[] {
  const out: number[] = []
  steps.forEach((s, i) => {
    if (s.branch?.waitId === waitId && s.branch.on === on) out.push(i)
  })
  return out
}

/**
 * La fourche dont dépend l'étape d'index `idx`, ou -1 si elle est sur le tronc.
 *
 * Sert au geste « finalement, il a répondu » : l'inscription est quelque part
 * dans la voie silence, et il faut savoir quelle attente rejuger.
 */
export function attenteGouvernante(steps: SequenceStep[], idx: number): number {
  const b = steps[idx]?.branch
  if (!b) return -1
  const waitIdx = indexDeLAttente(steps, b.waitId)
  return waitIdx >= 0 && waitIdx < idx ? waitIdx : -1
}

/**
 * Où repartir quand on déclare une réponse alors que l'inscription a déjà
 * basculé dans la voie silence.
 *
 * C'EST LA MOITIÉ QUI MANQUAIT
 * Un prospect qui répond le quatrième jour est le cas le plus fréquent, pas un
 * cas limite : la relance vient justement de le réveiller. Sans ce rattrapage,
 * la seule issue était de laisser la séquence dérouler des relances à quelqu'un
 * qui a déjà répondu, ou de la sortir à la main.
 *
 * ⚠️ SEULE UNE ATTENTE SE RATTRAPE. Une inscription posée dans la voie « non »
 * d'une CONDITION porte le même `on: 'timeout'` — la clé est la même, la
 * signification n'a rien à voir. La renvoyer vers la voie « oui » parce qu'un
 * humain a déclaré une réponse ferait basculer un prospect sur un chemin
 * réservé à ceux dont la condition est vraie, sans que rien ne l'ait mesurée.
 *
 * Rend `null` quand il n'y a rien à rattraper.
 */
export function retourVersLaReponse(
  steps: SequenceStep[],
  idx: number,
): { waitIdx: number; cible: number } | null {
  const waitIdx = attenteGouvernante(steps, idx)
  if (waitIdx < 0) return null
  if (!estAttenteReponse(steps[waitIdx])) return null
  if (steps[idx]?.branch?.on !== SORTIE_2) return null
  const cible = debutDeBranche(steps, steps[waitIdx].id, SORTIE_1)
  return cible < 0 ? null : { waitIdx, cible }
}

/* ── Ce que l'éditeur dessine ────────────────────────────────────────────── */

export type LigneEditeur =
  | { type: 'etape'; index: number }
  | { type: 'branche'; waitId: string; on: Issue; etapes: number[]; orpheline?: boolean }
  /** La reprise du tronc, après les voies — les chemins s'y rejoignent. */
  | { type: 'reprise'; waitId: string }

/* ── L'ARBRE ─────────────────────────────────────────────────────────────── */

/**
 * Une étape simple, ou une fourche avec le contenu de chacune de ses voies.
 *
 * POURQUOI UN ARBRE ALORS QUE LE STOCKAGE RESTE PLAT. Le tableau dit l'ORDRE —
 * c'est lui que le moteur parcourt, et c'est ce qui empêche le dessin de mentir
 * sur ce qui partira. Mais le dessin, lui, a besoin de la FORME : une attente
 * placée dans la voie « sans réponse » d'une première attente est une fourche
 * dans une fourche, et l'éditeur ne savait pas la montrer. Ses étapes
 * ressortaient sur le tronc, marquées « orphelines », alors que le moteur les
 * exécutait très bien.
 *
 * Deux vues d'une même liste, donc, et une seule source : l'arbre se DÉDUIT du
 * tableau à chaque rendu. Rien à synchroniser.
 */
export type NoeudPlan =
  | { type: 'etape'; index: number; perdue?: boolean }
  | { type: 'fourche'; index: number; voies: VoiePlan[]; perdue?: boolean }

export interface VoiePlan {
  on: Issue
  /** Sa sortie n'existe plus sur la fourche — rien n'en partira. */
  orpheline?: boolean
  contenu: NoeudPlan[]
}

/**
 * L'arbre d'un niveau : les étapes qui appartiennent à cette voie (ou au tronc),
 * chacune dépliée si c'est une fourche.
 *
 * `vus` est partagé par toute la descente : une étape appartient à UNE place et
 * une seule. C'est ce qui garantit qu'on ne la dessine pas deux fois et,
 * accessoirement, qu'une définition circulaire (une fourche déclarée dans sa
 * propre voie) ne fasse pas tourner la récursion — elle est déjà vue.
 */
function contenuDe(
  steps: SequenceStep[],
  appartient: (s: SequenceStep) => boolean,
  vus: Set<number>,
): NoeudPlan[] {
  const out: NoeudPlan[] = []
  for (let i = 0; i < steps.length; i++) {
    if (vus.has(i) || !appartient(steps[i])) continue
    const s = steps[i]
    vus.add(i)
    const sorties = sortiesDeLaFourche(s)
    if (sorties.length === 0) {
      out.push({ type: 'etape', index: i })
      continue
    }
    const voies: VoiePlan[] = sorties.map((sortie) => ({
      on: sortie.cle,
      contenu: contenuDe(steps, (x) => x.branch?.waitId === s.id && x.branch.on === sortie.cle, vus),
    }))
    // Les voies dont la sortie n'existe plus : un cas supprimé laisse derrière
    // lui des étapes qui pointent dans le vide. Les taire les rendrait
    // invisibles tout en les gardant en base.
    const connues = new Set(sorties.map((x) => x.cle))
    const orphelines: Issue[] = []
    steps.forEach((autre, j) => {
      const on = autre.branch?.on
      if (autre.branch?.waitId !== s.id || on == null) return
      if (connues.has(on) || orphelines.includes(on) || vus.has(j)) return
      orphelines.push(on)
    })
    for (const on of orphelines) {
      voies.push({
        on,
        orpheline: true,
        contenu: contenuDe(steps, (x) => x.branch?.waitId === s.id && x.branch.on === on, vus),
      })
    }
    out.push({ type: 'fourche', index: i, voies })
  }
  return out
}

/**
 * La séquence en arbre : le tronc, et sous chaque fourche toutes ses voies,
 * y compris vides, y compris imbriquées.
 *
 * MONTRER LA VOIE VIDE EST LE POINT. Une fourche a ses sorties, qu'on ait écrit
 * quelque chose pour elles ou non. Ne dessiner que ce qui existe laissait croire
 * qu'un seul chemin partait, alors que le silence menait au même message que la
 * réponse.
 */
export function arbreEditeur(steps: SequenceStep[]): NoeudPlan[] {
  const vus = new Set<number>()
  const racine = contenuDe(steps, (s) => !s.branch, vus)
  // Ce qui reste n'a trouvé aucune place : sa fourche a été supprimée, ou elle
  // est déclarée plus bas qu'elle. Plutôt que de le masquer, on le remet à la
  // suite du tronc, MARQUÉ — mieux vaut une carte mal placée qu'une carte qu'on
  // ne voit plus, mais il faut dire qu'elle ne partira pas.
  const perdues = contenuDe(steps, () => true, vus).map((n) => ({ ...n, perdue: true }))
  return [...racine, ...perdues]
}

/**
 * Le même arbre, aplati en lignes — la vue d'avant, conservée telle quelle.
 *
 * Elle reste juste, et elle reste utile là où l'on veut lire une séquence de
 * haut en bas sans se soucier des niveaux. Elle se DÉDUIT de l'arbre plutôt que
 * de le recalculer : deux lectures de la même liste finissent toujours par ne
 * plus dire la même chose.
 */
export function planEditeur(steps: SequenceStep[]): LigneEditeur[] {
  const out: LigneEditeur[] = []
  const parcourir = (noeuds: NoeudPlan[]) => {
    for (const n of noeuds) {
      if (n.type === 'etape') {
        out.push({ type: 'etape', index: n.index })
        continue
      }
      out.push({ type: 'etape', index: n.index })
      for (const voie of n.voies) {
        out.push({
          type: 'branche',
          waitId: steps[n.index].id,
          on: voie.on,
          etapes: voie.contenu.filter((x) => x.type === 'etape').map((x) => x.index),
          ...(voie.orpheline ? { orpheline: true } : {}),
        })
        // Les fourches imbriquées se dessinent APRÈS la voie qui les porte :
        // la vue à plat n'a pas de niveaux, elle ne peut que les mettre à la
        // suite. Le canvas, lui, les emboîte.
        parcourir(voie.contenu.filter((x) => x.type === 'fourche'))
      }
      out.push({ type: 'reprise', waitId: steps[n.index].id })
    }
  }
  parcourir(arbreEditeur(steps))
  return out
}

/**
 * Où insérer une étape que l'on ajoute à une voie.
 *
 * Juste après la dernière étape de cette voie, ou à défaut après la dernière
 * étape des voies PRÉCÉDENTES — de sorte que les voies restent rangées dans le
 * tableau dans l'ordre où l'éditeur les dessine. Sans ça la fourche se dessine
 * à l'envers et l'insertion suivante tombe au mauvais endroit.
 */
export function positionDInsertion(steps: SequenceStep[], waitId: string, on: Issue): number {
  const dansLaVoie = etapesDeBranche(steps, waitId, on)
  if (dansLaVoie.length > 0) return dansLaVoie[dansLaVoie.length - 1] + 1

  const waitIdx = indexDeLAttente(steps, waitId)
  const sorties = sortiesDeLaFourche(steps[waitIdx])
  const rang = sorties.findIndex((s) => s.cle === on)
  for (let k = rang - 1; k >= 0; k--) {
    const precedente = etapesDeBranche(steps, waitId, sorties[k].cle)
    if (precedente.length > 0) return precedente[precedente.length - 1] + 1
  }
  return waitIdx >= 0 ? waitIdx + 1 : steps.length
}

/**
 * Les fourches qui précèdent l'étape `idx` — celles dont elle peut dépendre.
 * Sert au sélecteur de voie de l'inspecteur.
 */
export function attentesEnAmont(steps: SequenceStep[], idx: number): number[] {
  const out: number[] = []
  for (let i = 0; i < idx && i < steps.length; i++) {
    if (estFourche(steps[i])) out.push(i)
  }
  return out
}

/* ── Rediriger : où une étape a le droit d'envoyer ───────────────────────── */

/**
 * Les étapes que `from` peut viser, et pourquoi les autres sont refusées.
 *
 * DEUX FAMILLES SEULEMENT, ET LA RAISON EST DE FOND. Une redirection ne
 * réécrit pas l'histoire du prospect : elle le pose sur une étape, et la
 * descente reprend ensuite normalement. Viser une étape d'une voie SŒUR la
 * ferait exécuter, puis la descente sauterait tout le reste de cette voie —
 * l'atteignabilité, elle, dit toujours que la fourche a rendu l'autre sortie.
 * Le prospect recevrait donc la première carte d'un chemin et rien de la suite,
 * sans que rien ne le dise. On refuse plutôt que d'offrir ça.
 *
 * Restent : le tronc (toujours atteignable) et sa propre voie (la fourche a
 * déjà rendu cette sortie-là, puisqu'on y est). Ce qui couvre les deux gestes
 * réels — reboucler sur une relance, et sauter à la clôture.
 */
export function ciblesDeRedirection(steps: SequenceStep[], from: number): number[] {
  const source = steps[from]
  if (!source) return []
  const voie = source.branch ?? null
  const out: number[] = []
  steps.forEach((s, i) => {
    if (i === from) return
    if (!s.branch) {
      out.push(i)
      return
    }
    if (voie && s.branch.waitId === voie.waitId && s.branch.on === voie.on) out.push(i)
  })
  return out
}

/**
 * Ce qui, dans les suites déclarées, ne tient pas debout.
 *
 * DIT À L'ÉCRAN PLUTÔT QUE DÉCOUVERT AU PREMIER PROSPECT. Une cible supprimée
 * arrête la séquence au lieu de la continuer (c'est le bon côté de l'erreur),
 * mais l'auteur doit le savoir avant, pas après.
 */
export function incoherencesDeSuite(steps: SequenceStep[]): { stepId: string; phrase: string }[] {
  const out: { stepId: string; phrase: string }[] = []
  steps.forEach((s, i) => {
    const suite = suiteDeLEtape(s)
    if (suite.type !== 'aller_a') return
    const cible = steps.findIndex((x) => x.id === suite.cible)
    if (cible < 0) {
      out.push({
        stepId: s.id,
        phrase: `Étape ${i + 1} renvoie vers une étape qui n’existe plus : la séquence s’arrêtera là.`,
      })
      return
    }
    if (!ciblesDeRedirection(steps, i).includes(cible)) {
      out.push({
        stepId: s.id,
        phrase: `Étape ${i + 1} renvoie vers l’étape ${cible + 1}, qui est sur une autre voie : le prospect la recevrait sans la suite.`,
      })
      return
    }
    if (cible <= i) {
      const sortie = steps
        .slice(cible, i + 1)
        .some((x) => estFourche(x) || suiteDeLEtape(x).type === 'fin')
      if (!sortie) {
        out.push({
          stepId: s.id,
          phrase: `Étape ${i + 1} reboucle sur l’étape ${cible + 1} sans qu’aucune fourche ni aucune fin ne permette d’en sortir : le moteur arrêtera au bout de ${MAX_TOURS} tours.`,
        })
      }
    }
  })
  return out
}

/**
 * Les étapes telles qu'un prospect les traversera si l'on suppose telle issue à
 * chaque fourche. Sert à l'éditeur, pour dire ce que « ce chemin » donne.
 *
 * LES REBOUCLAGES SONT RENDUS TELS QUELS — une étape traversée deux fois
 * apparaît deux fois, parce que le prospect la reçoit deux fois. On s'arrête au
 * même plafond que le moteur, pour que l'aperçu ne promette pas plus de tours
 * que ce qui partira.
 */
export function cheminSuppose(steps: SequenceStep[], issues: Record<string, Issue>): number[] {
  const issueDe = (idx: number): Issue =>
    issues[steps[idx]?.id ?? ''] ?? issueParDefaut(steps[idx])
  const tours = new Map<number, number>()
  const out: number[] = []
  let i = etapeAtteignable(steps, 0, issueDe) ? 0 : etapeSuivante(steps, -1, issueDe)
  while (i < steps.length) {
    const passages = (tours.get(i) ?? 0) + 1
    if (passages > MAX_TOURS) break
    tours.set(i, passages)
    out.push(i)
    i = etapeSuivante(steps, i, issueDe)
  }
  return out
}
