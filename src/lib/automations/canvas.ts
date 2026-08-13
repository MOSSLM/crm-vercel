// canvas.ts — la séquence posée en deux dimensions.
//
// CE QUI NE TENAIT PLUS
// Depuis que les attentes ouvrent deux suites, l'éditeur empilait les voies
// l'une SOUS l'autre dans une colonne de 720 px. Deux conséquences :
//
//   · « il a répondu » et « sans réponse » se lisaient l'une après l'autre,
//     comme une suite chronologique, alors que ce sont deux alternatives. Il
//     fallait relire les en-têtes pour comprendre qu'on ne les traverse jamais
//     toutes les deux ;
//   · une séquence à deux fourches descendait sur trois écrans. On ne voyait
//     jamais la forme de ce qu'on éditait, seulement un fragment.
//
// Deux alternatives, ça se met CÔTE À CÔTE. D'où ce module : il calcule, pour
// une liste d'étapes, une grille où le tronc descend au centre et où chaque
// fourche écarte ses deux voies à gauche et à droite.
//
// AUCUNE COORDONNÉE N'EST STOCKÉE, ET C'EST VOULU
// `definition.steps` reste un tableau plat dont l'ORDRE fait foi : c'est lui
// que le moteur parcourt. Laisser poser les cartes n'importe où obligerait à
// écrire un x/y en base, et rien n'empêcherait alors de dessiner une carte
// au-dessus de son attente pendant que le moteur, lui, l'exécute après. Le
// dessin mentirait. Ici la position se DÉDUIT du tableau ; déplacer une carte
// n'est donc pas un déplacement visuel mais un vrai geste d'édition —
// `deplacerVers` réécrit l'ordre et la voie.
//
// Module PUR : ni base, ni React. Les constantes de géométrie vivent ici pour
// que le composant et les tests placent les cartes au même endroit.

import type { SequenceStep } from '@/components/automations/types'
import {
  aUneBrancheSilence,
  etapesDeBranche,
  indexDeLAttente,
  planEditeur,
  positionDInsertion,
  type BrancheEtape,
  type IssueAttente,
} from './branches'

/* ── Géométrie ────────────────────────────────────────────────────────────
 *
 * Une carte fait `CARTE_L` de large et occupe une ligne de `LIGNE_H`. Le pas
 * horizontal est plus large que la carte : c'est la gouttière où passent les
 * traits de la fourche, qui autrement chevaucheraient les cartes voisines.
 */
export const CARTE_L = 288
export const COLONNE_L = 336
export const LIGNE_H = 104
/** Hauteur d'une carte d'étape, et celle des pastilles (entrée, reprise, fin). */
export const CARTE_H = 84
export const PASTILLE_H = 44
/** L'espace entre deux cartes — c'est là que passent les traits. */
export const GOUTTIERE = LIGNE_H - CARTE_H
/**
 * Les deux bandes d'un cadre de voie : son titre en haut, son bouton d'ajout en
 * bas. Sans elles, le bouton se retrouvait SOUS la dernière carte de la voie,
 * invisible — on ne pouvait plus ajouter d'étape à une branche qui en avait
 * déjà une.
 */
export const EN_TETE_VOIE = 34
export const PIED_VOIE = 34
/** Marge autour du plan, pour que la première carte ne colle pas au bord. */
export const MARGE = 40

export const xDeColonne = (col: number, colMin: number): number =>
  MARGE + (col - colMin) * COLONNE_L

export type TypeNoeud = 'entree' | 'etape' | 'voie' | 'reprise' | 'fin'

export interface NoeudCanvas {
  /** Identité stable entre deux rendus — sert de clé React et de bout de lien. */
  key: string
  type: TypeNoeud
  /** `etape` : son rang dans `steps`. */
  index?: number
  /** `voie` / `reprise` : l'attente concernée. */
  waitId?: string
  /** `voie` : laquelle des deux. */
  on?: IssueAttente
  /** `voie` : les étapes qu'elle contient, dans l'ordre. */
  etapes?: number[]
  /** `etape` : elle déclare une voie qu'aucune fourche dessinée ne porte. */
  orpheline?: boolean
  /** `-1` voie gauche, `0` tronc, `1` voie droite. Sert à viser un dépôt. */
  col: number
  /**
   * Position et taille en PIXELS. Une grille de lignes entières ne suffisait
   * pas : le cadre d'une voie porte deux bandes (titre, bouton) qui ne font pas
   * une ligne, et arrondir les faisait chevaucher les cartes.
   */
  x: number
  y: number
  l: number
  h: number
}

export interface LienCanvas {
  key: string
  de: string
  vers: string
  /** Posé sur les deux traits qui sortent d'une fourche : ils se colorent. */
  on?: IssueAttente
}

export interface PlanCanvas {
  noeuds: NoeudCanvas[]
  liens: LienCanvas[]
  colMin: number
  colMax: number
  /** Taille du plan en pixels, marges comprises. */
  largeur: number
  hauteur: number
}

/** La hauteur d'un cadre de voie, bandes comprises. */
export function hauteurDeVoie(nbEtapes: number): number {
  return EN_TETE_VOIE + Math.max(1, nbEtapes) * LIGNE_H - GOUTTIERE + PIED_VOIE
}

const cleEtape = (step: SequenceStep) => `s:${step.id}`
const cleVoie = (waitId: string, on: IssueAttente) => `v:${waitId}:${on}`
const cleReprise = (waitId: string) => `r:${waitId}`

/**
 * Le plan complet : entrée, tronc, fourches, voies, reprises, fin.
 *
 * L'ordre de `planEditeur` est repris tel quel — c'est la même lecture du
 * tableau plat, simplement projetée sur deux axes au lieu d'un. Les deux voies
 * d'une même attente partent donc de la même ligne, et la reprise attend la
 * plus longue des deux.
 */
export function planCanvas(steps: SequenceStep[]): PlanCanvas {
  const brut: (Omit<NoeudCanvas, 'x'> & { col: number })[] = []
  const liens: LienCanvas[] = []
  let y = MARGE
  let precedent = 'entree'

  brut.push({ key: 'entree', type: 'entree', col: 0, y, l: CARTE_L, h: PASTILLE_H })
  y += LIGNE_H

  const lien = (de: string, vers: string, on?: IssueAttente) => {
    liens.push({ key: `${de}→${vers}`, de, vers, ...(on ? { on } : {}) })
  }

  const plan = planEditeur(steps)
  for (let p = 0; p < plan.length; p++) {
    const ligne = plan[p]

    if (ligne.type === 'etape') {
      const step = steps[ligne.index]
      const key = cleEtape(step)
      brut.push({
        key,
        type: 'etape',
        index: ligne.index,
        col: 0,
        y,
        l: CARTE_L,
        h: CARTE_H,
        // Une étape rendue sur le tronc alors qu'elle déclare une voie n'a pas
        // trouvé sa fourche : attente supprimée, ou fourche imbriquée que
        // l'éditeur ne dessine pas. On la signale plutôt que de la masquer.
        orpheline: !!step.branch,
      })
      lien(precedent, key)
      precedent = key
      y += LIGNE_H
      continue
    }

    if (ligne.type !== 'branche') continue

    // Les voies d'une même attente arrivent groupées, suivies de leur reprise.
    // On les consomme ensemble : elles partagent leur hauteur de départ.
    const waitId = ligne.waitId
    const voies = []
    while (p < plan.length && plan[p].type === 'branche') {
      const l = plan[p] as { type: 'branche'; waitId: string; on: IssueAttente; etapes: number[] }
      if (l.waitId !== waitId) break
      voies.push(l)
      p++
    }
    // `p` pointe maintenant sur la reprise (ou sur autre chose si le plan est
    // tronqué) ; la boucle for l'incrémentera, d'où le recul d'un cran.
    if (plan[p]?.type !== 'reprise') p--

    const departY = y
    let bas = departY
    for (const voie of voies) {
      // `reply` à gauche, `timeout` à droite : l'ordre de lecture d'un « si /
      // sinon », et il ne change jamais d'une séquence à l'autre.
      const col = voie.on === 'reply' ? -1 : 1
      const h = hauteurDeVoie(voie.etapes.length)
      const keyVoie = cleVoie(waitId, voie.on)
      brut.push({
        key: keyVoie,
        type: 'voie',
        waitId,
        on: voie.on,
        etapes: voie.etapes,
        col,
        y: departY,
        l: CARTE_L,
        h,
      })
      lien(precedent, keyVoie, voie.on)

      // Les cartes de la voie ne sont chaînées QU'ENTRE ELLES. Relier le cadre
      // à sa première carte tracerait un trait depuis le bas du cadre vers un
      // point situé plus haut — un trait qui remonte, masqué par les cartes
      // sauf dans leurs interstices, où il se faisait passer pour un connecteur
      // normal. L'appartenance au cadre se voit déjà : la carte est dedans.
      let precedentDansLaVoie: string | null = null
      voie.etapes.forEach((idx, k) => {
        const key = cleEtape(steps[idx])
        brut.push({
          key,
          type: 'etape',
          index: idx,
          col,
          y: departY + EN_TETE_VOIE + k * LIGNE_H,
          l: CARTE_L,
          h: CARTE_H,
        })
        if (precedentDansLaVoie) lien(precedentDansLaVoie, key)
        precedentDansLaVoie = key
      })
      bas = Math.max(bas, departY + h)
      // Chaque voie rejoint la reprise : c'est ce qui dit que les deux chemins
      // se retrouvent, et que ce qui suit part quoi qu'il arrive. Le trait part
      // du CADRE et non de la dernière carte, car sous celle-ci il reste la
      // bande du bouton « Ajouter ici », que le trait traversait de biais.
      lien(keyVoie, cleReprise(waitId), voie.on)
    }

    y = bas + GOUTTIERE
    brut.push({ key: cleReprise(waitId), type: 'reprise', waitId, col: 0, y, l: CARTE_L, h: PASTILLE_H })
    precedent = cleReprise(waitId)
    y += PASTILLE_H + GOUTTIERE
  }

  brut.push({ key: 'fin', type: 'fin', col: 0, y, l: CARTE_L, h: PASTILLE_H })
  lien(precedent, 'fin')

  const cols = brut.map((n) => n.col)
  const colMin = Math.min(0, ...cols)
  const colMax = Math.max(0, ...cols)
  const noeuds: NoeudCanvas[] = brut.map((n) => ({ ...n, x: xDeColonne(n.col, colMin) }))

  return {
    noeuds,
    liens,
    colMin,
    colMax,
    largeur: MARGE * 2 + (colMax - colMin + 1) * COLONNE_L,
    hauteur: y + PASTILLE_H + MARGE,
  }
}

/**
 * Où un trait se raccroche : le milieu du haut et le milieu du bas.
 *
 * Calculé ici et pas dans le composant, pour que les traits SVG et les cartes
 * en HTML absolu ne puissent pas dériver l'un de l'autre — c'est exactement le
 * genre de décalage d'un pixel qu'on passe une heure à chercher.
 */
export function ancrage(n: NoeudCanvas): { x: number; haut: number; bas: number } {
  return { x: n.x + n.l / 2, haut: n.y, bas: n.y + n.h }
}

/* ── Déplacer une carte ───────────────────────────────────────────────────── */

/** Un point d'accueil : une place entre deux cartes, sur le tronc ou dans une voie. */
export interface CibleDepot {
  key: string
  /** Rang visé dans le tableau plat. */
  index: number
  /** Voie d'accueil, `null` pour le tronc. */
  branch: BrancheEtape | null
  col: number
  /** Où poser le marqueur, en pixels — au milieu de la gouttière. */
  x: number
  y: number
}

/**
 * Toutes les places où une carte peut atterrir.
 *
 * Une par interligne du tronc, une par interligne de chaque voie, plus une en
 * fin de voie et une en fin de séquence. Le composant n'a plus qu'à chercher la
 * plus proche du curseur — c'est ce module qui sait où elles sont.
 */
export function ciblesDeDepot(steps: SequenceStep[], plan: PlanCanvas): CibleDepot[] {
  const cibles: CibleDepot[] = []
  /** Le marqueur se pose au milieu de la gouttière, au-dessus du nœud. */
  const auDessusDe = (n: NoeudCanvas) => ({ x: n.x, y: n.y - GOUTTIERE / 2 })

  // Tronc : au-dessus de chaque étape de tronc, puis tout à la fin.
  for (const n of plan.noeuds) {
    if (n.type !== 'etape' || n.col !== 0 || n.index == null) continue
    cibles.push({ key: `t:${n.index}`, index: n.index, branch: null, col: 0, ...auDessusDe(n) })
  }
  const fin = plan.noeuds.find((n) => n.type === 'fin')
  if (fin) {
    cibles.push({ key: 't:fin', index: steps.length, branch: null, col: 0, ...auDessusDe(fin) })
  }

  // Voies : au-dessus de chaque étape, puis à la suite de la dernière.
  for (const voie of plan.noeuds) {
    if (voie.type !== 'voie' || !voie.waitId || !voie.on) continue
    const branch: BrancheEtape = { waitId: voie.waitId, on: voie.on }
    const etapes = voie.etapes ?? []
    etapes.forEach((idx, k) => {
      cibles.push({
        key: `v:${voie.waitId}:${voie.on}:${k}`,
        index: idx,
        branch,
        col: voie.col,
        x: voie.x,
        y: voie.y + EN_TETE_VOIE + k * LIGNE_H - GOUTTIERE / 2,
      })
    })
    cibles.push({
      key: `v:${voie.waitId}:${voie.on}:fin`,
      index: positionDInsertion(steps, voie.waitId, voie.on),
      branch,
      col: voie.col,
      x: voie.x,
      y: voie.y + EN_TETE_VOIE + Math.max(1, etapes.length) * LIGNE_H - GOUTTIERE / 2,
    })
  }

  return cibles
}

/**
 * Ce qui part avec la carte que l'on tire.
 *
 * Une attente à fourche emmène ses deux voies : les laisser derrière ferait
 * d'un coup de quatre étapes des orphelines qui déclarent une voie qui n'est
 * plus au-dessus d'elles. Pour toute autre étape, le bloc se réduit à elle.
 */
export function blocDeplace(steps: SequenceStep[], from: number): number[] {
  const step = steps[from]
  if (!step || !aUneBrancheSilence(step)) return [from]
  const suite = [
    ...etapesDeBranche(steps, step.id, 'reply'),
    ...etapesDeBranche(steps, step.id, 'timeout'),
  ]
  return [from, ...suite].sort((a, b) => a - b)
}

/**
 * Ce dépôt a-t-il un sens ?
 *
 * On refuse les trois cas qui produiraient une définition incohérente ou un
 * geste sans effet — plutôt que de les accepter et de laisser l'utilisateur
 * découvrir après coup que sa séquence ne part plus.
 */
export function depotValide(steps: SequenceStep[], stepId: string, cible: CibleDepot): boolean {
  const from = steps.findIndex((s) => s.id === stepId)
  if (from < 0) return false
  const bloc = blocDeplace(steps, from)

  // 1. Une attente ne peut pas entrer dans sa propre voie, ni dans celle d'une
  //    attente qu'elle emmène avec elle : la fourche se contiendrait elle-même.
  if (cible.branch && bloc.some((i) => steps[i].id === cible.branch?.waitId)) return false

  // 2. Elle ne peut pas non plus se poser au milieu du bloc qu'elle emmène.
  if (cible.index > bloc[0] && cible.index <= bloc[bloc.length - 1]) return false

  // 3. Rien à faire si la carte est déjà exactement là.
  const memeVoie =
    (steps[from].branch?.waitId ?? null) === (cible.branch?.waitId ?? null) &&
    (steps[from].branch?.on ?? null) === (cible.branch?.on ?? null)
  if (memeVoie && (cible.index === from || cible.index === from + 1)) return false

  return true
}

/**
 * La carte posée : nouvel ordre, nouvelle voie.
 *
 * Renvoie le tableau d'origine quand le dépôt n'a pas de sens — l'appelant
 * n'a donc rien de spécial à faire du refus, l'état ne bouge simplement pas.
 */
export function deplacerVers(
  steps: SequenceStep[],
  stepId: string,
  cible: CibleDepot,
): SequenceStep[] {
  if (!depotValide(steps, stepId, cible)) return steps
  const from = steps.findIndex((s) => s.id === stepId)
  const bloc = blocDeplace(steps, from)
  const dansLeBloc = new Set(bloc)

  const deplacees = bloc.map((i) =>
    i === from ? { ...steps[i], branch: cible.branch ?? null } : steps[i],
  )
  const restants = steps.filter((_, i) => !dansLeBloc.has(i))
  // Le rang visé compte les cartes qu'on vient de retirer : sans ce recul, une
  // carte tirée vers le bas atterrit systématiquement une place trop loin.
  const at = cible.index - bloc.filter((i) => i < cible.index).length

  return [...restants.slice(0, at), ...deplacees, ...restants.slice(at)]
}

/**
 * L'attente qui gouverne une voie, pour l'afficher — `-1` si elle a disparu.
 * Le plan la porte toujours en amont, mais un rendu partiel peut la manquer.
 */
export function attenteDeLaVoie(steps: SequenceStep[], waitId: string): number {
  return indexDeLAttente(steps, waitId)
}
