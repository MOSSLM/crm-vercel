// canvas.ts — la séquence posée en deux dimensions.
//
// CE QUI NE TENAIT PLUS, ET DEUX FOIS PLUTÔT QU'UNE
//
// D'abord, les attentes à délai : elles ouvrent deux suites, et l'éditeur les
// empilait l'une SOUS l'autre dans une colonne. « Il a répondu » et « sans
// réponse » se lisaient l'une après l'autre, comme une chronologie ; on croyait
// lire « puis », on lisait « ou bien ». Deux alternatives, ça se met CÔTE À
// CÔTE. D'où ce module.
//
// Ensuite, l'imbrication. Le plan ne dessinait qu'UN niveau de fourche : une
// attente placée dans la voie « sans réponse » d'une première attente
// fonctionnait très bien côté moteur — la règle d'atteignabilité est récursive
// depuis le premier jour — mais ses étapes ressortaient sur le tronc, marquées
// orphelines. On croyait à une erreur, et on n'écrivait pas la séquence dont on
// avait besoin. La mise en page est donc récursive elle aussi : une voie qui
// porte une fourche s'élargit d'autant, et le tronc reste au milieu.
//
// TROIS CHOSES QUE LE PLAN DIT, ET QU'IL EST SEUL À DIRE
//   · combien de voies une fourche ouvre — deux pour une attente, autant que de
//     cas pour un aiguillage, plus « sinon » ;
//   · quelles voies REVIENNENT au tronc, et lesquelles s'arrêtent ou repartent
//     ailleurs (`suite`) ;
//   · quelles cartes se renvoient l'une vers l'autre — les traits en pointillé,
//     qui font la JONCTION sans qu'il faille un type de carte pour ça.
//
// AUCUNE COORDONNÉE N'EST STOCKÉE, ET C'EST VOULU
// `definition.steps` reste un tableau plat dont l'ORDRE fait foi : c'est lui
// que le moteur parcourt. Laisser poser les cartes n'importe où obligerait à
// écrire un x/y en base, et rien n'empêcherait alors de dessiner une carte
// au-dessus de sa fourche pendant que le moteur, lui, l'exécute après. Le
// dessin mentirait. Ici la position se DÉDUIT du tableau ; déplacer une carte
// n'est donc pas un déplacement visuel mais un vrai geste d'édition —
// `deplacerVers` réécrit l'ordre et la voie.
//
// Module PUR : ni base, ni React. Les constantes de géométrie vivent ici pour
// que le composant et les tests placent les cartes au même endroit.

import type { SequenceStep } from '@/components/automations/types'
import {
  arbreEditeur,
  estFourche,
  estSortie,
  etapesDeBranche,
  indexDeLAttente,
  positionDInsertion,
  sortiesDeLaFourche,
  suiteDeLEtape,
  type BrancheEtape,
  type Issue,
  type NoeudPlan,
  type VoiePlan,
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

/**
 * LA COLONNE EST UNE DEMI-COLONNE, et c'est ce qui permet aux fourches à trois
 * ou quatre voies de rester centrées sur le tronc.
 *
 * Le tronc est en 0, les voies d'une fourche à N sorties en `2·k − (N−1)` :
 * −1 / +1 à deux voies (la disposition de toujours), −2 / 0 / +2 à trois,
 * −3 / −1 / +1 / +3 à quatre. Toujours symétrique, toujours un écart constant
 * d'une `COLONNE_L` entre deux voies voisines.
 */
export const xDeColonne = (col: number, colMin: number): number =>
  MARGE + ((col - colMin) * COLONNE_L) / 2

export type TypeNoeud = 'entree' | 'etape' | 'voie' | 'reprise' | 'fin'

export interface NoeudCanvas {
  /** Identité stable entre deux rendus — sert de clé React et de bout de lien. */
  key: string
  type: TypeNoeud
  /** `etape` : son rang dans `steps`. */
  index?: number
  /** `voie` / `reprise` : l'attente concernée. */
  waitId?: string
  /** `voie` : laquelle des sorties de la fourche. */
  on?: Issue
  /** `voie` : sa sortie n'existe plus sur la fourche — rien n'en partira. */
  voieOrpheline?: boolean
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
  /** Posé sur les traits qui sortent d'une fourche : ils se colorent. */
  on?: Issue
  /**
   * Trait de REDIRECTION — « après cette carte, va là ». En pointillé, parce
   * qu'il ne suit pas la descente : il la court-circuite, en avant pour couper
   * court, en arrière pour reboucler.
   */
  redirection?: boolean
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

const cleEtape = (step: SequenceStep) => `s:${step.id}`
const cleVoie = (waitId: string, on: Issue) => `v:${waitId}:${on}`
const cleReprise = (waitId: string) => `r:${waitId}`

/* ── Mesurer avant de placer ──────────────────────────────────────────────
 *
 * Une fourche imbriquée dans une voie élargit la voie qui la porte, qui élargit
 * la fourche au-dessus, jusqu'au tronc. On mesure donc de bas en haut, puis on
 * place de haut en bas — sinon il faudrait décaler ce qui est déjà posé chaque
 * fois qu'on découvre un niveau de plus.
 *
 * L'unité est la DEMI-COLONNE : une carte en occupe deux, et c'est ce qui
 * permet à une fourche à trois voies de rester centrée sur le tronc sans que
 * personne ne tombe sur une position fractionnaire.
 */

const LARGEUR_CARTE = 2

const largeurListe = (noeuds: NoeudPlan[]): number =>
  noeuds.length === 0 ? LARGEUR_CARTE : Math.max(...noeuds.map(largeurNoeud))

const largeurVoie = (voie: VoiePlan): number => Math.max(LARGEUR_CARTE, largeurListe(voie.contenu))

function largeurNoeud(n: NoeudPlan): number {
  if (n.type === 'etape') return LARGEUR_CARTE
  const total = n.voies.reduce((a, v) => a + largeurVoie(v), 0)
  return Math.max(LARGEUR_CARTE, total)
}

const hauteurListe = (noeuds: NoeudPlan[]): number =>
  noeuds.reduce((a, n) => a + hauteurNoeud(n), 0)

const hauteurContenuVoie = (voie: VoiePlan): number =>
  Math.max(LIGNE_H, hauteurListe(voie.contenu))

/** La hauteur d'un cadre de voie, bandes comprises. */
export function hauteurDeVoie(nbEtapes: number): number {
  return EN_TETE_VOIE + Math.max(1, nbEtapes) * LIGNE_H - GOUTTIERE + PIED_VOIE
}

const hauteurCadreVoie = (voie: VoiePlan): number =>
  EN_TETE_VOIE + hauteurContenuVoie(voie) - GOUTTIERE + PIED_VOIE

function hauteurNoeud(n: NoeudPlan): number {
  if (n.type === 'etape') return LIGNE_H
  const voies = Math.max(...n.voies.map(hauteurCadreVoie))
  return LIGNE_H + voies + GOUTTIERE + PASTILLE_H + GOUTTIERE
}

/**
 * Cette voie rejoint-elle le tronc ?
 *
 * Une voie qui se termine sur « finir ici » ou qui repart ailleurs ne revient
 * pas. Dessiner le trait quand même serait le seul endroit du plan qui mentirait
 * sur ce que le moteur fait. Une voie VIDE, elle, rejoint : il n'y a rien
 * dedans pour en décider autrement.
 */
function voieRejoint(steps: SequenceStep[], voie: VoiePlan): boolean {
  const dernier = voie.contenu[voie.contenu.length - 1]
  if (!dernier) return true
  if (dernier.type === 'fourche') return true
  if (estSortie(steps[dernier.index])) return false
  return suiteDeLEtape(steps[dernier.index]).type === 'suivre'
}

/**
 * Le plan complet : entrée, tronc, fourches, voies, reprises, fin.
 *
 * Le tronc descend au centre ; chaque fourche écarte ses voies symétriquement,
 * autant qu'elle a de sorties, et une voie qui porte elle-même une fourche
 * s'élargit d'autant. C'est ce qui manquait : une attente placée dans la voie
 * « sans réponse » d'une première attente fonctionnait côté moteur mais ne se
 * dessinait pas — ses étapes ressortaient sur le tronc, marquées orphelines,
 * et on croyait à une erreur.
 */
export function planCanvas(steps: SequenceStep[]): PlanCanvas {
  type Brut = Omit<NoeudCanvas, 'x'> & { col: number; colCadre?: number }
  const brut: Brut[] = []
  const liens: LienCanvas[] = []

  const lien = (de: string, vers: string, on?: Issue) => {
    liens.push({ key: `${de}→${vers}`, de, vers, ...(on ? { on } : {}) })
  }

  /**
   * Pose une liste de nœuds sous `y`, centrée sur `centre`.
   *
   * `precedent` est la carte à relier à la première : `null` dans une voie, où
   * les cartes ne sont chaînées QU'ENTRE ELLES. Relier le cadre à sa première
   * carte tracerait un trait depuis le bas du cadre vers un point situé plus
   * haut — un trait qui remonte, masqué par les cartes sauf dans leurs
   * interstices, où il se ferait passer pour un connecteur normal.
   */
  function placer(
    noeuds: NoeudPlan[],
    centre: number,
    depart: number,
    precedent: string | null,
  ): { y: number; precedent: string | null } {
    let y = depart
    let prec = precedent

    for (const n of noeuds) {
      const step = steps[n.index]
      const key = cleEtape(step)
      brut.push({
        key,
        type: 'etape',
        index: n.index,
        col: centre,
        y,
        l: CARTE_L,
        h: CARTE_H,
        // Une carte rendue sur le tronc alors qu'elle déclare une voie n'a pas
        // trouvé sa fourche : celle-ci a été supprimée, ou elle est déclarée
        // plus bas qu'elle. On la signale plutôt que de la masquer — mais rien
        // n'en partira.
        ...(n.perdue ? { orpheline: true } : {}),
      })
      if (prec) lien(prec, key)
      prec = key
      y += LIGNE_H

      if (n.type === 'etape') continue

      const largeurs = n.voies.map(largeurVoie)
      const totale = largeurs.reduce((a, w) => a + w, 0)
      let curseur = centre - totale / 2
      const departY = y
      let bas = departY

      n.voies.forEach((voie, k) => {
        const w = largeurs[k]
        const centreVoie = curseur + w / 2
        curseur += w
        const h = hauteurCadreVoie(voie)
        const keyVoie = cleVoie(step.id, voie.on)
        brut.push({
          key: keyVoie,
          type: 'voie',
          waitId: step.id,
          on: voie.on,
          etapes: voie.contenu.filter((x) => x.type === 'etape').map((x) => x.index),
          ...(voie.orpheline ? { voieOrpheline: true } : {}),
          col: centreVoie,
          // Le cadre déborde la carte dès qu'il contient une sous-fourche : sa
          // largeur suit celle de son contenu, pas celle d'une carte.
          colCadre: centreVoie - w / 2 + 1,
          y: departY,
          l: ((w - LARGEUR_CARTE) * COLONNE_L) / 2 + CARTE_L,
          h,
        })
        lien(key, keyVoie, voie.on)
        placer(voie.contenu, centreVoie, departY + EN_TETE_VOIE, null)
        bas = Math.max(bas, departY + h)
        if (voieRejoint(steps, voie)) lien(keyVoie, cleReprise(step.id), voie.on)
      })

      y = bas + GOUTTIERE
      brut.push({
        key: cleReprise(step.id),
        type: 'reprise',
        waitId: step.id,
        col: centre,
        y,
        l: CARTE_L,
        h: PASTILLE_H,
      })
      prec = cleReprise(step.id)
      y += PASTILLE_H + GOUTTIERE
    }

    return { y, precedent: prec }
  }

  const arbre = arbreEditeur(steps)
  brut.push({ key: 'entree', type: 'entree', col: 0, y: MARGE, l: CARTE_L, h: PASTILLE_H })
  const { y: basDuTronc } = placer(arbre, 0, MARGE + LIGNE_H, 'entree')

  brut.push({ key: 'fin', type: 'fin', col: 0, y: basDuTronc, l: CARTE_L, h: PASTILLE_H })
  // La dernière carte du tronc mène à la fin — sauf si elle s'arrête ou repart.
  const dernier = arbre[arbre.length - 1]
  const clotureLibre =
    !dernier ||
    dernier.type === 'fourche' ||
    (!estSortie(steps[dernier.index]) && suiteDeLEtape(steps[dernier.index]).type === 'suivre')
  if (clotureLibre) {
    const avant = dernier
      ? avantLaFin(dernier, steps)
      : 'entree'
    lien(avant, 'fin')
  }

  // ── LES REDIRECTIONS, EN DERNIER ─────────────────────────────────────────
  //
  // Elles ne participent pas à la mise en page : une carte qui en vise une
  // autre ne la déplace pas, elle tire un trait par-dessus. C'est ce qui rend
  // la JONCTION possible sans nouveau type de carte — trois voies qui pointent
  // toutes vers la même étape SONT un point de rendez-vous, et le plan le
  // montre en trois traits qui convergent.
  for (const step of steps) {
    const suite = suiteDeLEtape(step)
    if (suite.type !== 'aller_a') continue
    const cible = steps.find((x) => x.id === suite.cible)
    if (!cible) continue
    liens.push({
      key: `red:${step.id}→${cible.id}`,
      de: cleEtape(step),
      vers: cleEtape(cible),
      redirection: true,
    })
  }

  const cols = brut.map((n) => n.colCadre ?? n.col)
  const colMin = Math.min(0, ...cols)
  const colMax = Math.max(0, ...brut.map((n) => n.col))
  const noeuds: NoeudCanvas[] = brut.map(({ colCadre, ...n }) => ({
    ...n,
    x: xDeColonne(colCadre ?? n.col, colMin),
  }))

  return {
    noeuds,
    liens,
    colMin,
    colMax,
    largeur: MARGE * 2 + CARTE_L + ((colMax - colMin) * COLONNE_L) / 2,
    hauteur: basDuTronc + PASTILLE_H + MARGE,
  }
}

/** La clé du nœud qui précède la pastille de fin : la dernière carte, ou la reprise. */
function avantLaFin(dernier: NoeudPlan, steps: SequenceStep[]): string {
  return dernier.type === 'fourche'
    ? cleReprise(steps[dernier.index].id)
    : cleEtape(steps[dernier.index])
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
  const rang = new Map(steps.map((s, i) => [s.id, i]))

  // ── Une place au-dessus de CHAQUE carte, où qu'elle soit ────────────────
  //
  // Les positions viennent du plan, jamais d'un calcul refait ici : depuis que
  // les fourches s'imbriquent, les cartes d'une voie ne sont plus espacées
  // d'une ligne pleine — une sous-fourche en occupe plusieurs. Recalculer
  // aurait posé les marqueurs à côté des cartes qu'ils désignent.
  for (const n of plan.noeuds) {
    if (n.type !== 'etape' || n.index == null) continue
    const step = steps[n.index]
    cibles.push({
      key: `a:${step.id}`,
      index: n.index,
      branch: step.branch ?? null,
      col: n.col,
      x: n.x,
      y: n.y - GOUTTIERE / 2,
    })
  }

  const fin = plan.noeuds.find((n) => n.type === 'fin')
  if (fin) {
    cibles.push({
      key: 't:fin',
      index: steps.length,
      branch: null,
      col: fin.col,
      x: fin.x,
      y: fin.y - GOUTTIERE / 2,
    })
  }

  // ── Et une à la SUITE de chaque voie, sous sa dernière carte ────────────
  for (const voie of plan.noeuds) {
    if (voie.type !== 'voie' || !voie.waitId || voie.on == null) continue
    const branch: BrancheEtape = { waitId: voie.waitId, on: voie.on }
    // La colonne des cartes de la voie, pas le bord gauche de son cadre : les
    // deux ne coïncident que sur une voie qui ne porte aucune sous-fourche.
    const xCartes = xDeColonne(voie.col, plan.colMin)
    cibles.push({
      key: `v:${voie.waitId}:${voie.on}:fin`,
      index: positionDInsertion(steps, voie.waitId, voie.on),
      branch,
      col: voie.col,
      x: xCartes,
      y: voie.y + voie.h - PIED_VOIE - GOUTTIERE / 2,
    })
  }

  // Une place au-dessus d'une carte n'a de sens que si la carte existe encore.
  return cibles.filter((c) => c.index <= steps.length && (c.branch == null || rang.has(c.branch.waitId)))
}

/**
 * Ce qui part avec la carte que l'on tire.
 *
 * Une fourche emmène TOUTES ses voies. Pour toute autre étape, le bloc se
 * réduit à elle.
 */
export function blocDeplace(steps: SequenceStep[], from: number): number[] {
  const step = steps[from]
  if (!step || !estFourche(step)) return [from]
  // TOUT CE QUI PEND SOUS ELLE, sur autant de niveaux qu'il y en a. Toutes ses
  // sorties d'abord — en laisser une derrière ferait d'un coup une poignée
  // d'orphelines qui déclarent une voie qui n'est plus au-dessus d'elles — puis
  // les sous-fourches de ces voies, récursivement, pour la même raison.
  const pris = new Set<number>([from])
  const aVisiter = [step.id]
  while (aVisiter.length > 0) {
    const id = aVisiter.pop() as string
    const fourche = steps.find((s) => s.id === id)
    for (const sortie of sortiesDeLaFourche(fourche)) {
      for (const i of etapesDeBranche(steps, id, sortie.cle)) {
        if (pris.has(i)) continue
        pris.add(i)
        if (estFourche(steps[i])) aVisiter.push(steps[i].id)
      }
    }
    // Les voies orphelines partent aussi : elles pointent sur cette fourche.
    steps.forEach((s, i) => {
      if (s.branch?.waitId === id && !pris.has(i)) {
        pris.add(i)
        if (estFourche(s)) aVisiter.push(s.id)
      }
    })
  }
  return [...pris].sort((a, b) => a - b)
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
