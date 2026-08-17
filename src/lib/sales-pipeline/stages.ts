// stages.ts — le modèle de colonnes du pipeline commercial.
//
// Les colonnes ne sont plus inventées : elles viennent de sources réelles,
// mises bout à bout sur une seule ligne.
//
//   ┌ À DÉMARCHER ┐ ╔═══ SÉQUENCE · Artisans ══════════╗ ┌ PIPELINE · Agent SAMA ┐
//   │  en attente │ ║ J+0 Email │ J+1 WhatsApp │ J+5 ☎ ║ │ RDV calé │ Client signé│
//   └─────────────┘ ╚══════════════════════════════════╝ └───────────────────────┘
//
// La première colonne est le stock : tout ce qui n'est pas encore en séquence
// s'y gare, avec ce qu'il faut pour décider (audit prêt ? démo prête ? contact
// identifié ?). La séquence pousse ensuite le prospect jusqu'à sa dernière
// étape, puis le PIPELINE reprend la main à l'étape de reprise (« RDV calé »
// par défaut). Le groupe séquence est encadré et teinté pour qu'on voie d'un
// coup d'œil ce qui est piloté par l'automatisation.
//
// UNE SEULE SÉQUENCE À LA FOIS. Les étapes du milieu appartiennent à UNE
// séquence : afficher côte à côte des prospects inscrits sur des séquences
// différentes revient à les mesurer avec la règle du voisin — l'accroche
// WhatsApp de l'une n'est pas la troisième relance de l'autre. Le tableau se
// lit donc partie par partie (cf. `SequencePart`) : une séquence choisie, ou
// bien la vue d'ensemble, qui remplace les étapes par une seule colonne « en
// séquence » — le seul repère commun à tout le monde.
//
// Partagé serveur/client : l'API dérive l'état des cellules, l'interface s'en
// sert pour le rendu. Une seule définition, donc pas de dérive entre les deux.

import type { SeqStepKind } from '@/components/automations/types'
import { roleTint, stageRole, type StageRole } from '@/lib/opportunites/stage-roles'

/** Ce qui pilote une colonne. */
export type ColumnGroup = 'entry' | 'sequence' | 'pipeline'

/**
 * `auto`   : le moteur agit seul (le régulateur envoie l'email).
 * `manual` : la séquence crée une tâche, un humain la fait.
 * `deal`   : décision commerciale, jamais automatisée.
 */
export type ColumnMode = 'auto' | 'manual' | 'deal'

export interface SalesColumn {
  /** `step:<id d'étape>` ou `stage:<id d'étape de pipeline>`. */
  id: string
  group: ColumnGroup
  /** Libellé affiché en en-tête. */
  label: string
  /** Sous-titre : « J+3 » pour une étape de séquence, rien pour un stage. */
  hint: string | null
  mode: ColumnMode
  color: string
  /** Canal, pour les colonnes de séquence uniquement. */
  kind: SeqStepKind | null
  /** Libellé du bouton d'action de la carte active. */
  cta: string
  /** Rang absolu dans la matrice — sert au pointeur monotone. */
  index: number
}

/* ── Quelle partie du tableau on regarde ─────────────────────────────────── */

/**
 * La partie affichée : une séquence (son identifiant), la vue d'ensemble, ou
 * le stock de ceux qui n'ont encore été mis sur aucune séquence.
 *
 * Les deux valeurs réservées ne peuvent pas entrer en collision avec un
 * identifiant de séquence : `automations.id` est un UUID.
 */
export const ALL_SEQUENCES = 'all'
export const NO_SEQUENCE = 'none'
export type SequencePart = string

export const partKind = (part: string): 'all' | 'none' | 'one' =>
  part === ALL_SEQUENCES ? 'all' : part === NO_SEQUENCE ? 'none' : 'one'

/* ── Identifiants de colonne ─────────────────────────────────────────────── */

/** La colonne d'entrée est unique : un seul stock, un seul identifiant. */
export const ENTRY_COLUMN_ID = 'entry:start'

/**
 * La colonne « en séquence » de la vue d'ensemble.
 *
 * Elle n'appartient à aucune séquence : c'est le repère commun quand plusieurs
 * séquences sont mélangées, là où on ne peut pas montrer d'étape sans mentir.
 * Elle n'est jamais envoyée au serveur comme étape sautée — elle ne correspond
 * à aucune étape réelle.
 */
export const SEQ_ANY_COLUMN_ID = 'seq:any'

/**
 * Cette étape mérite-t-elle une colonne ?
 *
 * TOUTES les attentes en étaient exclues, et c'était trop large. Une attente de
 * délai pur n'a rien à décider : elle s'écoule seule, une colonne n'y offrirait
 * aucun geste. Une attente-RÉPONSE, si — c'est même le seul endroit du tableau
 * où l'on dise « il a répondu », « il a pris rendez-vous », « toujours rien ».
 *
 * Sans sa colonne, un prospect garé après son accroche WhatsApp restait affiché
 * sous le message DÉJÀ ENVOYÉ, avec un bouton « Étape faite » qui ne faisait
 * rien — normal, la séquence attend une réponse — et aucun endroit pour dire
 * qu'elle était arrivée. On croyait à une panne.
 */
export const estColonneVisible = (step: { kind: string; waitMode?: string | null }): boolean =>
  step.kind !== 'wait' || step.waitMode === 'reply'

export const stepColumnId = (stepId: string) => `step:${stepId}`
export const stageColumnId = (stageId: number | string) => `stage:${stageId}`

/**
 * « Tous les pipelines » — la valeur du sélecteur qui fond les pipelines en un
 * seul tableau. Sentinelle et non `null` : `null` veut déjà dire « le serveur
 * choisit pour moi », et les deux ne donnent pas le même écran.
 */
export const ALL_PIPELINES = 'all'

/**
 * Une colonne de phase commerciale, désignée par son RÔLE et non par une étape.
 *
 * POURQUOI ELLE EXISTE
 * Les colonnes de droite étaient les étapes d'UN pipeline. Or une affaire
 * attribuée reste dans son pipeline d'origine : le parc en compte plusieurs, et
 * regarder « Streak Mars/Avril » cachait purement et simplement les prospects
 * d'« Agent SAMA ». Il fallait changer de pipeline pour les voir, sans jamais
 * pouvoir comparer.
 *
 * Un « RDV calé » de Streak et un « RDV calé » d'Agent SAMA sont pourtant la
 * même chose. `stageRole` sait déjà le dire — c'est la classification par motif
 * introduite pour le portail agent, exactement pour ce problème un cran plus
 * bas. On la remonte ici : en vue fondue, une colonne = un rôle, et chaque
 * affaire s'y range quel que soit le nom que son pipeline donne à l'étape.
 */
export const roleColumnId = (role: StageRole) => `role:${role}`
export const isRoleColumn = (id: string) => id.startsWith('role:')

/**
 * L'ordre des phases, du plus tôt au plus tard. « Perdu » n'y est pas : comme
 * pour les étapes nommées, une affaire perdue sort du tableau plutôt que
 * d'occuper une colonne que personne ne vise.
 */
const ORDRE_ROLES: StageRole[] = [
  'nouveau',
  'approche',
  'contacte',
  'interesse',
  'rdv',
  'propo',
  'signe',
]

const LIBELLE_ROLE: Record<StageRole, string> = {
  nouveau: 'Nouveau',
  approche: 'Première approche',
  contacte: 'Contacté',
  interesse: 'Intéressé',
  rdv: 'RDV calé',
  propo: 'Proposition',
  signe: 'Signé',
  perdu: 'Perdu',
  autre: 'Autre étape',
}

/** Une vraie étape de séquence, par opposition à la colonne d'ensemble. */
export const isStepColumn = (id: string) => id.startsWith('step:')

export function parseColumnId(id: string): { group: ColumnGroup; ref: string } | null {
  const i = id.indexOf(':')
  if (i < 0) return null
  const prefix = id.slice(0, i)
  const ref = id.slice(i + 1)
  if (!ref) return null
  if (prefix === 'entry') return { group: 'entry', ref }
  if (prefix === 'step' || prefix === 'seq') return { group: 'sequence', ref }
  // `stage` porte un identifiant d'étape, `role` un rôle : les deux désignent
  // une phase commerciale, mais la seconde doit être résolue dans le pipeline de
  // l'affaire avant d'être écrite.
  if (prefix === 'stage' || prefix === 'role') return { group: 'pipeline', ref }
  return null
}

/* ── Canaux ──────────────────────────────────────────────────────────────── */

const CHANNEL: Record<string, { label: string; color: string; mode: ColumnMode; cta: string }> = {
  // L'email prend la sarcelle et non l'azur : le canal LinkedIn porte déjà sa
  // couleur de marque (#0A66C2), qui est à la teinte de l'azur Sama.
  email: { label: 'Email', color: '#0E93A6', mode: 'auto', cta: 'Voir la file d’envoi' },
  whatsapp: { label: 'WhatsApp', color: '#1F8A5B', mode: 'manual', cta: 'Ouvrir WhatsApp' },
  linkedin: { label: 'LinkedIn', color: '#0A66C2', mode: 'manual', cta: 'Ouvrir LinkedIn' },
  call: { label: 'Appel', color: '#C8881F', mode: 'manual', cta: 'Ouvrir le cockpit d’appel' },
  task: { label: 'Tâche', color: '#8AA0C0', mode: 'manual', cta: 'Traiter la tâche' },
  wait: { label: 'Attente', color: '#8AA0C0', mode: 'auto', cta: 'Voir la file d’envoi' },
}

export const channelOf = (kind: string | null | undefined) => CHANNEL[kind ?? ''] ?? CHANNEL.task

/** Teinte du groupe séquence — la même partout (bandeau, en-têtes, encadré). */
export const SEQUENCE_TINT = '#7A5AE0'

/**
 * Couleur d'une étape de pipeline. `etapes_pipeline` n'a pas de colonne
 * couleur : on en dérive une stable à partir du rang, dans la palette du
 * Marketing Pipeline, pour que deux étapes voisines restent distinguables.
 *
 * L'étape de reprise (rang 0) prend l'azur Sama ; le bleu acier, lui, recule
 * au rang 5 — voisin du rang 0, il n'aurait été qu'un second bleu.
 */
// Huit teintes qui doivent rester distinctes À L'ŒIL sur un même Kanban :
// écart minimum ΔE2000 = 17. Pas de second bleu (il se confondrait avec
// l'azur de marque) ni de #4A648C (c'est la couleur du texte courant : une
// pastille de cette teinte se lit comme un mot, pas comme une étape).
const STAGE_PALETTE = ['#2F7AE0', '#0E93A6', '#A24E86', '#1F8A5B', '#C8881F', '#7A5AE0', '#B5322F', '#0A1B33']
export const stageColor = (rank: number) => STAGE_PALETTE[rank % STAGE_PALETTE.length]

/** CTA d'une étape de pipeline, deviné d'après son nom. */
export function stageCta(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('rdv') || n.includes('rendez')) return 'Caler le RDV'
  if (n.includes('propo') || n.includes('devis')) return 'Envoyer la proposition'
  if (n.includes('nego') || n.includes('négo')) return 'Relancer la négociation'
  if (n.includes('sign') || n.includes('gagn') || n.includes('client')) return 'Marquer comme signé'
  if (n.includes('échange') || n.includes('echange')) return 'Reprendre l’échange'
  return 'Faire avancer'
}

/**
 * Une étape « Perdu » n'est pas une colonne : c'est un état de ligne.
 *
 * UN SEUL MOTIF, ET IL VIT DANS `stageRole`. Il y en avait deux — `/perdu|abandon/`
 * ici, `/perdu|abandon|refus|annul/` là-bas — et ils ont dérivé : ni l'un ni
 * l'autre ne reconnaissait « Lost », le nom réel de l'étape dans la plupart des
 * pipelines. Une perte se rangeait alors en colonne d'avancement, tout à droite
 * du tableau, comme si l'affaire était en train d'aboutir. Deux définitions du
 * même mot, c'est deux occasions d'oublier le même cas : il n'en reste qu'une.
 */
export const isLostStage = (name: string) => stageRole(name) === 'perdu'

/* ── Construction des colonnes ───────────────────────────────────────────── */

export interface SequenceStepRef {
  id: string
  kind: SeqStepKind
  day: number
  label: string | null
  /** `reply` = l'étape attend qu'un humain déclare la réponse. */
  waitMode?: 'days' | 'reply' | null
  /** Attente-réponse : au bout de combien de jours la relance part quand même. */
  replyTimeoutDays?: number | null
  /**
   * L'étape n'appartient qu'à l'une des deux suites d'une attente-réponse.
   *
   * La colonne le DIT dans son sous-titre : sans ça, un prospect passé par la
   * relance se lisait comme ayant sauté la colonne « il a répondu », alors qu'il
   * n'a jamais été censé la traverser.
   */
  branch?: { waitId: string; on: 'reply' | 'timeout' } | null
}

export interface PipelineStageRef {
  id: number
  nom: string
  ordre: number
}

/**
 * Les colonnes de la matrice : les étapes de la séquence choisie, puis les
 * étapes du pipeline à partir de l'étape de reprise.
 *
 * `handoffOrdre` est l'`ordre` de l'étape où la séquence rend la main. Les
 * étapes de pipeline situées avant sont traversées PENDANT la séquence — elles
 * n'ont pas leur propre colonne, elles s'affichent en badge sur la ligne.
 *
 * `overview` : aucune séquence n'est choisie, on regarde tout le monde en même
 * temps. Les étapes disparaissent au profit d'une colonne unique « en
 * séquence » — deux séquences n'ont pas les mêmes étapes, les aligner
 * afficherait chaque prospect sous une colonne qui n'est pas la sienne.
 */
export function buildColumns(opts: {
  steps: SequenceStepRef[]
  sequenceName: string | null
  stages: PipelineStageRef[]
  handoffOrdre: number
  overview?: boolean
  /** Vue fondue : les colonnes de droite sont des rôles, pas des étapes. */
  parRole?: boolean
}): SalesColumn[] {
  // Le stock de départ : tout ce qui n'a pas encore été mis en séquence. C'est
  // la colonne où se fait le geste le plus fréquent du tableau, et la seule qui
  // dise si le prospect est PRÊT à être démarché (audit, démo, contact).
  const columns: SalesColumn[] = [
    {
      id: ENTRY_COLUMN_ID,
      group: 'entry',
      label: 'À démarcher',
      hint: null,
      mode: 'deal',
      color: '#4A648C',
      kind: null,
      cta: 'Mettre en séquence',
      index: 0,
    },
  ]

  if (opts.overview) {
    columns.push({
      id: SEQ_ANY_COLUMN_ID,
      group: 'sequence',
      label: 'En séquence',
      hint: null,
      mode: 'auto',
      color: SEQUENCE_TINT,
      kind: null,
      // Le geste attendu ici n'est pas d'agir sur l'étape — on ne sait pas
      // laquelle — mais d'aller voir la séquence du prospect, où les étapes
      // sont enfin comparables.
      cta: 'Ouvrir sa séquence',
      index: columns.length,
    })
  } else {
    for (const step of opts.steps) {
      const attente = step.kind === 'wait'
      const channel = channelOf(step.kind)
      const quand = step.day > 0 ? `J+${step.day}` : 'immédiat'
      // L'attente-réponse n'est pas un canal : rien n'en part. Ce qu'elle
      // annonce, c'est le délai au bout duquel la séquence relancera SANS
      // réponse — l'information qui décide s'il faut intervenir maintenant.
      if (attente) {
        const jours = Number(step.replyTimeoutDays) || 0
        columns.push({
          id: stepColumnId(step.id),
          group: 'sequence',
          label: step.label?.trim() || 'En attente de réponse',
          hint: jours > 0 ? `relance auto à J+${jours}` : 'jusqu’à réponse',
          mode: 'manual',
          color: '#A24E86',
          kind: 'wait',
          cta: 'Noter la réponse',
          index: columns.length,
        })
        continue
      }
      columns.push({
        id: stepColumnId(step.id),
        group: 'sequence',
        label: step.label?.trim() || channel.label,
        // Une colonne de voie n'est traversée que par la moitié des prospects.
        // Le dire dans le sous-titre évite de lire une case vide comme une étape
        // ratée alors qu'elle appartient à l'autre chemin.
        hint: step.branch ? `${quand} · ${step.branch.on === 'reply' ? 'si réponse' : 'si silence'}` : quand,
        mode: channel.mode,
        color: channel.color,
        kind: step.kind,
        cta: channel.cta,
        index: columns.length,
      })
    }
  }

  // Vue fondue : une colonne par RÔLE, et seulement pour les rôles réellement
  // présents dans le parc. Afficher les sept en permanence donnerait trois
  // colonnes vides à tout le monde — on montre les phases qui existent.
  if (opts.parRole) {
    const presents = new Set(
      opts.stages.filter((s) => !isLostStage(s.nom)).map((s) => stageRole(s.nom)),
    )
    const roles = ORDRE_ROLES.filter((r) => presents.has(r))
    // `autre` ferme la marche quand des étapes ne rentrent dans aucun motif :
    // sans elle, les affaires qui s'y trouvent n'auraient aucune colonne.
    if (presents.has('autre')) roles.push('autre')

    for (const role of roles) {
      columns.push({
        id: roleColumnId(role),
        group: 'pipeline',
        label: LIBELLE_ROLE[role],
        hint: 'tous pipelines',
        mode: 'deal',
        color: roleTint(LIBELLE_ROLE[role]),
        kind: null,
        cta: stageCta(LIBELLE_ROLE[role]),
        index: columns.length,
      })
    }
    return columns
  }

  const tail = opts.stages
    .filter((s) => s.ordre >= opts.handoffOrdre && !isLostStage(s.nom))
    .sort((a, b) => a.ordre - b.ordre)

  tail.forEach((stage, rank) => {
    columns.push({
      id: stageColumnId(stage.id),
      group: 'pipeline',
      label: stage.nom,
      hint: null,
      mode: 'deal',
      color: stageColor(rank),
      kind: null,
      cta: stageCta(stage.nom),
      index: columns.length,
    })
  })

  return columns
}

/**
 * La colonne de phase où se range une étape donnée.
 *
 * Le seul endroit qui sait traduire un `stage_id` en identifiant de colonne, et
 * il connaît les deux modes. Sans lui, `derivePosition` composerait toujours
 * `stage:<id>` et rangerait toutes les lignes de la vue fondue au mauvais
 * endroit — une colonne `stage:47` qui n'existe pas.
 */
export function colonneDeLEtape(
  stageId: number | null,
  stages: PipelineStageRef[],
  parRole: boolean,
): string | null {
  if (stageId == null) return null
  if (!parRole) return stageColumnId(stageId)
  const stage = stages.find((s) => s.id === stageId)
  return stage ? roleColumnId(stageRole(stage.nom)) : null
}

/**
 * Étape de reprise par défaut : celle qui parle de rendez-vous. À défaut, celle
 * qui suit immédiatement l'étape d'entrée de la séquence. À défaut, la seconde
 * moitié du pipeline.
 */
export function defaultHandoffOrdre(stages: PipelineStageRef[], entryStageId?: number | null): number {
  const usable = stages.filter((s) => !isLostStage(s.nom)).sort((a, b) => a.ordre - b.ordre)
  if (usable.length === 0) return 0

  const rdv = usable.find((s) => /rdv|rendez/i.test(s.nom))
  if (rdv) return rdv.ordre

  if (entryStageId != null) {
    const i = usable.findIndex((s) => s.id === entryStageId)
    if (i >= 0 && i + 1 < usable.length) return usable[i + 1].ordre
  }

  return usable[Math.floor(usable.length / 2)].ordre
}

/* ── État d'une ligne ────────────────────────────────────────────────────── */

export type SalesRowState = 'progress' | 'nurt' | 'lost' | 'black' | 'won'

export type CellStatus = 'done' | 'active' | 'locked' | 'skip' | 'lost' | 'black' | 'nurt'

export interface SalesStateRow {
  /** Étapes explicitement sautées, par id de colonne. */
  skipped: string[]
  skipReason: string | null
  state: SalesRowState
  stateReason: string | null
  nurtureAt: string | null
  replied: boolean
  rdvAt: string | null
  propoAmount: number | null
  objection: string | null
  stageDates: Record<string, string>
}

export const EMPTY_STATE: SalesStateRow = {
  skipped: [],
  skipReason: null,
  state: 'progress',
  stateReason: null,
  nurtureAt: null,
  replied: false,
  rdvAt: null,
  propoAmount: null,
  objection: null,
  stageDates: {},
}

/**
 * Statut de chaque cellule d'une ligne.
 *
 * Le pointeur est naturellement MONOTONE : la position est l'index de colonne
 * atteint, et les index croissent avec les étapes de séquence puis avec
 * l'`ordre` du pipeline. Une séquence qui repasse par un email après un
 * WhatsApp ne re-verrouille donc rien — c'est une colonne différente.
 */
export function cellStatuses(
  columns: SalesColumn[],
  positionId: string | null,
  state: SalesStateRow,
): Record<string, CellStatus> {
  const out: Record<string, CellStatus> = {}
  const position = columns.findIndex((c) => c.id === positionId)
  const reachedIdx = position >= 0 ? position : 0

  for (const column of columns) {
    if (state.skipped.includes(column.id)) {
      out[column.id] = 'skip'
      continue
    }
    if (state.state === 'won') {
      out[column.id] = 'done'
      continue
    }
    if (column.index < reachedIdx) {
      out[column.id] = 'done'
      continue
    }
    if (column.index === reachedIdx) {
      out[column.id] = state.state === 'progress' ? 'active' : state.state
      continue
    }
    out[column.id] = 'locked'
  }
  return out
}

/**
 * Le prospect a déjà montré un signe de vie : insister par WhatsApp ou par
 * téléphone n'a plus de sens, on passe à la suite.
 */
export const hasInterest = (state: SalesStateRow): boolean => state.replied

/** La cellule attend une action humaine aujourd'hui. */
export function isPendingTask(
  columns: SalesColumn[],
  positionId: string | null,
  state: SalesStateRow,
  columnId: string,
): boolean {
  const column = columns.find((c) => c.id === columnId)
  if (!column || column.mode !== 'manual') return false
  if (state.state !== 'progress') return false
  return cellStatuses(columns, positionId, state)[columnId] === 'active' && !hasInterest(state)
}

/* ── Les issues d'une étape de démarchage ────────────────────────────────── */
//
// CE QUE ÇA RÉSOUT
// Une étape manuelle n'avait que deux sorties : « Fait » (on avance) ou l'une
// des cinq réactions, qui STOPPENT toutes la séquence. Entre les deux, rien —
// or c'est là que se passe l'essentiel du démarchage : personne n'a décroché,
// la personne a répondu mollement, ce n'est pas le bon moment. Faute de pouvoir
// l'exprimer, ces cas se rangeaient soit en « Fait » (et on perdait ce qui
// s'était dit), soit en « Pas intéressé » (et on perdait le prospect).
//
// DEUX FAMILLES, ET C'EST TOUTE LA DISTINCTION QUI COMPTE
// `continue` — la ligne reste vivante, la séquence garde son cours.
// `stop`     — on arrête d'insister, et TOUS les envois encore planifiés sont
//              annulés (cf. `applyReaction`). Sans cette annulation, un e-mail
//              partirait après que le prospect a dit non.

export type OutcomeFlow = 'continue' | 'stop'

export interface StepOutcome {
  id: string
  label: string
  flow: OutcomeFlow
  tone: 'ok' | 'info' | 'warn' | 'danger' | 'muted'
  /** L'effet, dit en clair sous le libellé — l'opérateur ne doit pas le deviner. */
  note: string
  /**
   * L'issue « le prospect a réagi » à appliquer derrière, quand celle-ci change
   * l'état de la ligne. Absente = on enregistre, et rien d'autre ne bouge.
   */
  reaction?: SalesReactionId
  /** Libère une attente-réponse : la séquence repart sans attendre. */
  releasesWait?: boolean
  /** Sans description, l'issue ne dit rien d'exploitable — on l'exige. */
  needsNote?: boolean
  /** Demande une date de relance. */
  needsDate?: boolean
}

export const STEP_OUTCOMES: readonly StepOutcome[] = [
  {
    id: 'answered',
    label: 'A répondu',
    flow: 'continue',
    tone: 'ok',
    note: '→ on enchaîne l’étape suivante',
    // Le cas de l'accroche WhatsApp : « oui c'est bien nous » n'est pas de
    // l'intérêt pour l'offre, c'est l'autorisation d'envoyer la suite.
    releasesWait: true,
  },
  {
    id: 'no_answer',
    label: 'Pas de réponse',
    flow: 'continue',
    tone: 'muted',
    note: '→ la séquence suit son cours',
  },
  {
    id: 'lukewarm',
    label: 'A répondu, peu intéressé',
    flow: 'continue',
    tone: 'warn',
    note: '→ on continue, mais c’est noté',
    releasesWait: true,
  },
  {
    // L'identifiant ne bouge pas : il est écrit dans `email_logs.outcome` sur
    // toutes les notes déjà prises. Seul le LIBELLÉ change — « pas le bon
    // moment » se lisait comme un refus poli, alors que c'est l'inverse : on
    // range le prospect et il revient de lui-même à la date choisie.
    id: 'later',
    label: 'Mettre de côté',
    flow: 'continue',
    tone: 'warn',
    note: '→ sort de la file et revient à la date choisie',
    reaction: 'later',
    needsDate: true,
  },
  {
    id: 'not_interested',
    label: 'Pas intéressé',
    flow: 'stop',
    tone: 'danger',
    note: '→ Perdu · plus rien ne part',
    reaction: 'no',
    needsNote: true,
  },
  {
    id: 'blocked',
    label: 'Bloqué / mauvais numéro',
    flow: 'stop',
    tone: 'danger',
    note: '→ Blacklist · numéro exclu',
    reaction: 'bad',
  },
  {
    id: 'other',
    label: 'Autre',
    flow: 'continue',
    tone: 'info',
    // Le fourre-tout est délibéré : une issue qu'on ne sait pas nommer se note
    // en clair plutôt que d'être forcée dans la case la moins fausse.
    note: '→ noté au fil, rien ne change',
    needsNote: true,
  },
] as const

export type StepOutcomeId = (typeof STEP_OUTCOMES)[number]['id']

export const stepOutcome = (id: string): StepOutcome | null =>
  STEP_OUTCOMES.find((o) => o.id === id) ?? null

/** Une note déjà enregistrée, telle que la carte la relit. */
export interface StepNote {
  id: string
  outcome: string
  note: string
  at: string
  /** Étape d'où elle vient — `null` pour une note prise hors séquence. */
  stepId: string | null
}

/** Les cinq issues du bouton « le prospect a réagi ». */
export const SALES_REACTIONS = [
  { id: 'rdv', label: 'A pris RDV lui-même', tone: 'ok', note: '→ RDV · séquence stoppée' },
  { id: 'reply', label: 'M’a rappelé / a répondu', tone: 'info', note: '→ RDV · séquence en pause' },
  { id: 'later', label: 'Intéressé, mais plus tard', tone: 'warn', note: '→ Nurturing · relance datée' },
  { id: 'no', label: 'Pas intéressé', tone: 'danger', note: '→ Perdu + motif' },
  { id: 'bad', label: 'Mauvais numéro / fermé', tone: 'danger', note: '→ Blacklist' },
] as const

export type SalesReactionId = (typeof SALES_REACTIONS)[number]['id']
