// branches.ts — les deux suites possibles d'une attente-réponse.
//
// LE PROBLÈME
// Une attente-réponse avec délai (« relancer au bout de 3 jours ») a DEUX
// issues, et jusqu'ici les deux menaient à la même étape suivante. Le texte
// écrit là devait donc convenir à quelqu'un qui vient de répondre comme à
// quelqu'un qui n'a rien dit depuis trois jours — deux situations qui ne se
// travaillent pas pareil. En pratique, on écrivait pour l'une et on mentait à
// l'autre : « merci pour votre réponse ! » à un silence, ou « je me permets de
// revenir vers vous » à quelqu'un qui vient d'écrire.
//
// LE MODÈLE, ET POURQUOI IL RESTE UN TABLEAU PLAT
// `definition.steps` demeure une liste ordonnée. Une étape peut simplement
// déclarer qu'elle appartient à la branche d'une attente :
//
//     { id: 's3', kind: 'whatsapp', branch: { waitId: 's2', on: 'reply' } }
//
// Un arbre aurait obligé à réécrire tout ce qui parcourt les étapes — le
// moteur, la vue semaine, les colonnes du pipeline commercial, l'ancrage des
// J+n — pour un besoin que l'ordre du tableau exprime déjà : les étapes d'une
// branche se suivent, et le tronc reprend après.
//
// LA RÈGLE D'ATTEIGNABILITÉ, EN UNE PHRASE
// Une étape sans `branch` est toujours atteignable ; une étape de branche ne
// l'est que si SON attente a réellement rendu cette issue-là — et que l'attente
// elle-même était atteignable. La récursion est ce qui permet d'imbriquer une
// seconde attente dans une branche sans que ses propres branches deviennent
// accessibles depuis un chemin qui n'est jamais passé par elle.
//
// AUCUN ÉTAT SUPPLÉMENTAIRE
// L'issue d'une attente se déduit de `vars.replies` : une réponse déclarée à
// cette étape = branche « il a répondu », sinon = branche « sans réponse ».
// Rien à stocker sur l'inscription, donc rien qui puisse se désynchroniser de
// la définition quand celle-ci est modifiée en cours de route.
//
// Module PUR : ni base, ni React. Le moteur décide avec, l'éditeur dessine
// avec, les tests le tiennent.

import type { SequenceStep } from '@/components/automations/types'

/** Ce qu'une attente-réponse peut rendre. */
export type IssueAttente = 'reply' | 'timeout'

export interface BrancheEtape {
  /** `id` de l'étape d'attente dont cette branche dépend. */
  waitId: string
  on: IssueAttente
}

export const ISSUE_LABEL: Readonly<Record<IssueAttente, { titre: string; court: string; aide: string }>> = {
  reply: {
    titre: 'Il a répondu',
    court: 'réponse',
    aide: 'Ce qui part une fois la conversation ouverte. On peut nommer la personne et enchaîner.',
  },
  timeout: {
    titre: 'Sans réponse',
    court: 'silence',
    aide: 'Ce qui part quand le délai s’écoule sans un mot. Ne jamais y remercier de la réponse.',
  },
}

/** Cette étape ouvre-t-elle deux chemins ? */
export function estAttenteReponse(step: SequenceStep | undefined): boolean {
  return !!step && step.kind === 'wait' && step.waitMode === 'reply'
}

/**
 * Une attente n'a de branche « sans réponse » que si elle relance vraiment.
 *
 * Sans délai, l'inscription reste garée indéfiniment : l'issue n'arrive jamais,
 * et proposer d'y écrire quelque chose promettrait un envoi qui ne partira pas.
 */
export function aUneBrancheSilence(step: SequenceStep | undefined): boolean {
  return estAttenteReponse(step) && (Number(step?.replyTimeoutDays) || 0) > 0
}

/** Index de l'étape d'attente que cette branche désigne, ou -1. */
export function indexDeLAttente(steps: SequenceStep[], waitId: string): number {
  return steps.findIndex((s) => s.id === waitId)
}

/**
 * L'issue rendue par l'attente d'index `waitIdx`.
 *
 * `aRepondu` lit `vars.replies` : une réponse déclarée à la main fait basculer
 * l'inscription du silence vers la conversation, même après coup.
 */
export function issueDeLAttente(waitIdx: number, aRepondu: (idx: number) => boolean): IssueAttente {
  return aRepondu(waitIdx) ? 'reply' : 'timeout'
}

/**
 * Cette étape est-elle sur le chemin que l'inscription a réellement pris ?
 *
 * Une branche orpheline (son attente a été supprimée) ou mal placée (déclarée
 * avant son attente) est INATTEIGNABLE plutôt que traitée comme du tronc : on
 * ne devine pas ce qu'une définition à moitié éditée voulait dire, et faire
 * partir un message par défaut est le mauvais côté de l'erreur.
 */
export function etapeAtteignable(
  steps: SequenceStep[],
  idx: number,
  aRepondu: (idx: number) => boolean,
): boolean {
  const b = steps[idx]?.branch
  if (!b) return true
  const waitIdx = indexDeLAttente(steps, b.waitId)
  if (waitIdx < 0 || waitIdx >= idx) return false
  if (!etapeAtteignable(steps, waitIdx, aRepondu)) return false
  return issueDeLAttente(waitIdx, aRepondu) === b.on
}

/**
 * L'étape à exécuter après celle d'index `fromIdx`.
 *
 * Rend `steps.length` quand il n'y a plus rien — la séquence se termine, comme
 * avant l'existence des branches.
 */
export function etapeSuivante(
  steps: SequenceStep[],
  fromIdx: number,
  aRepondu: (idx: number) => boolean,
): number {
  for (let j = Math.max(0, fromIdx) + 1; j < steps.length; j++) {
    if (etapeAtteignable(steps, j, aRepondu)) return j
  }
  return steps.length
}

/** Première étape de la branche `on` de l'attente `waitId`, ou -1. */
export function debutDeBranche(steps: SequenceStep[], waitId: string, on: IssueAttente): number {
  return steps.findIndex((s) => s.branch?.waitId === waitId && s.branch.on === on)
}

/** Les index des étapes d'une branche, dans l'ordre. */
export function etapesDeBranche(steps: SequenceStep[], waitId: string, on: IssueAttente): number[] {
  const out: number[] = []
  steps.forEach((s, i) => {
    if (s.branch?.waitId === waitId && s.branch.on === on) out.push(i)
  })
  return out
}

/**
 * L'attente dont dépend l'étape d'index `idx`, ou -1 si elle est sur le tronc.
 *
 * Sert au geste « finalement, il a répondu » : l'inscription est quelque part
 * dans la branche silence, et il faut savoir quelle attente rejuger.
 */
export function attenteGouvernante(steps: SequenceStep[], idx: number): number {
  const b = steps[idx]?.branch
  if (!b) return -1
  const waitIdx = indexDeLAttente(steps, b.waitId)
  return waitIdx >= 0 && waitIdx < idx ? waitIdx : -1
}

/**
 * Où repartir quand on déclare une réponse alors que l'inscription a déjà
 * basculé dans la branche silence.
 *
 * C'EST LA MOITIÉ QUI MANQUAIT
 * Un prospect qui répond le quatrième jour est le cas le plus fréquent, pas un
 * cas limite : la relance vient justement de le réveiller. Sans ce rattrapage,
 * la seule issue était de laisser la séquence dérouler des relances à quelqu'un
 * qui a déjà répondu, ou de la sortir à la main.
 *
 * Rend `null` quand il n'y a rien à rattraper — étape de tronc, ou attente sans
 * branche « réponse » écrite.
 */
export function retourVersLaReponse(
  steps: SequenceStep[],
  idx: number,
): { waitIdx: number; cible: number } | null {
  const waitIdx = attenteGouvernante(steps, idx)
  if (waitIdx < 0) return null
  if (steps[idx]?.branch?.on !== 'timeout') return null
  const cible = debutDeBranche(steps, steps[waitIdx].id, 'reply')
  return cible < 0 ? null : { waitIdx, cible }
}

/* ── Ce que l'éditeur dessine ────────────────────────────────────────────── */

export type LigneEditeur =
  | { type: 'etape'; index: number }
  | { type: 'branche'; waitId: string; on: IssueAttente; etapes: number[] }
  /** La reprise du tronc, après les deux suites — les deux chemins s'y rejoignent. */
  | { type: 'reprise'; waitId: string }

/**
 * Le plan de la colonne centrale : les étapes du tronc, et sous chaque attente
 * à délai les deux voies, y compris quand l'une est encore vide.
 *
 * MONTRER LA VOIE VIDE EST LE POINT
 * Une attente à délai a deux issues, qu'on ait écrit quelque chose pour elles ou
 * non. Ne dessiner que ce qui existe laissait croire qu'un seul chemin partait,
 * alors que le silence menait au même message que la réponse. La voie vide est
 * donc affichée, avec son bouton : c'est ce qui rend le trou visible.
 *
 * UN NIVEAU DE FOURCHE
 * Une attente placée DANS une voie continue de fonctionner côté moteur — la
 * règle d'atteignabilité est récursive — mais l'éditeur ne dessine pas de
 * sous-fourche. Les étapes qui en dépendent restent visibles dans le flux
 * principal plutôt que d'être escamotées : mieux vaut une ligne mal placée
 * qu'une étape qu'on ne voit plus.
 */
export function planEditeur(steps: SequenceStep[]): LigneEditeur[] {
  const vus = new Set<number>()
  const out: LigneEditeur[] = []
  for (let i = 0; i < steps.length; i++) {
    if (vus.has(i)) continue
    const s = steps[i]
    out.push({ type: 'etape', index: i })
    vus.add(i)
    if (!aUneBrancheSilence(s)) continue
    for (const on of ['reply', 'timeout'] as const) {
      const etapes = etapesDeBranche(steps, s.id, on).filter((j) => !vus.has(j))
      etapes.forEach((j) => vus.add(j))
      out.push({ type: 'branche', waitId: s.id, on, etapes })
    }
    out.push({ type: 'reprise', waitId: s.id })
  }
  return out
}

/**
 * Où insérer une étape que l'on ajoute à une voie.
 *
 * Juste après la dernière étape de cette voie, ou à défaut après l'attente
 * elle-même — de sorte que la voie « il a répondu » reste avant la voie
 * « sans réponse », comme l'éditeur les dessine.
 */
export function positionDInsertion(steps: SequenceStep[], waitId: string, on: IssueAttente): number {
  const dansLaVoie = etapesDeBranche(steps, waitId, on)
  if (dansLaVoie.length > 0) return dansLaVoie[dansLaVoie.length - 1] + 1
  if (on === 'timeout') {
    const reponse = etapesDeBranche(steps, waitId, 'reply')
    if (reponse.length > 0) return reponse[reponse.length - 1] + 1
  }
  const waitIdx = indexDeLAttente(steps, waitId)
  return waitIdx >= 0 ? waitIdx + 1 : steps.length
}

/**
 * Les attentes à délai qui précèdent l'étape `idx` — celles dont elle peut
 * dépendre. Sert au sélecteur de voie de l'inspecteur.
 */
export function attentesEnAmont(steps: SequenceStep[], idx: number): number[] {
  const out: number[] = []
  for (let i = 0; i < idx && i < steps.length; i++) {
    if (aUneBrancheSilence(steps[i])) out.push(i)
  }
  return out
}

/**
 * Les étapes telles qu'un prospect les traversera si l'on suppose telle issue à
 * chaque attente. Sert à l'éditeur, pour dire ce que « ce chemin » donne.
 */
export function cheminSuppose(steps: SequenceStep[], issues: Record<string, IssueAttente>): number[] {
  const aRepondu = (waitIdx: number) => issues[steps[waitIdx]?.id ?? ''] === 'reply'
  const out: number[] = []
  let i = etapeAtteignable(steps, 0, aRepondu) ? 0 : etapeSuivante(steps, -1, aRepondu)
  while (i < steps.length) {
    out.push(i)
    i = etapeSuivante(steps, i, aRepondu)
  }
  return out
}
