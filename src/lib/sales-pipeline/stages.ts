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
// Partagé serveur/client : l'API dérive l'état des cellules, l'interface s'en
// sert pour le rendu. Une seule définition, donc pas de dérive entre les deux.

import type { SeqStepKind } from '@/components/automations/types'

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

/* ── Identifiants de colonne ─────────────────────────────────────────────── */

/** La colonne d'entrée est unique : un seul stock, un seul identifiant. */
export const ENTRY_COLUMN_ID = 'entry:start'

export const stepColumnId = (stepId: string) => `step:${stepId}`
export const stageColumnId = (stageId: number | string) => `stage:${stageId}`

export function parseColumnId(id: string): { group: ColumnGroup; ref: string } | null {
  const i = id.indexOf(':')
  if (i < 0) return null
  const prefix = id.slice(0, i)
  const ref = id.slice(i + 1)
  if (!ref) return null
  if (prefix === 'entry') return { group: 'entry', ref }
  if (prefix === 'step') return { group: 'sequence', ref }
  if (prefix === 'stage') return { group: 'pipeline', ref }
  return null
}

/* ── Canaux ──────────────────────────────────────────────────────────────── */

const CHANNEL: Record<string, { label: string; color: string; mode: ColumnMode; cta: string }> = {
  email: { label: 'Email', color: '#2A6FDB', mode: 'auto', cta: 'Voir la file d’envoi' },
  whatsapp: { label: 'WhatsApp', color: '#1F8A5B', mode: 'manual', cta: 'Ouvrir WhatsApp' },
  linkedin: { label: 'LinkedIn', color: '#0A66C2', mode: 'manual', cta: 'Ouvrir LinkedIn' },
  call: { label: 'Appel', color: '#C8881F', mode: 'manual', cta: 'Ouvrir le cockpit d’appel' },
  task: { label: 'Tâche', color: '#8A877F', mode: 'manual', cta: 'Traiter la tâche' },
  wait: { label: 'Attente', color: '#8A877F', mode: 'auto', cta: 'Voir la file d’envoi' },
}

export const channelOf = (kind: string | null | undefined) => CHANNEL[kind ?? ''] ?? CHANNEL.task

/** Teinte du groupe séquence — la même partout (bandeau, en-têtes, encadré). */
export const SEQUENCE_TINT = '#7A5AE0'

/**
 * Couleur d'une étape de pipeline. `etapes_pipeline` n'a pas de colonne
 * couleur : on en dérive une stable à partir du rang, dans la palette du
 * Marketing Pipeline, pour que deux étapes voisines restent distinguables.
 */
const STAGE_PALETTE = ['#E2552B', '#2B7FB8', '#A24E86', '#1F8A5B', '#C8881F', '#2A6FDB', '#B5322F', '#5C5953']
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

/** Une étape « Perdu » n'est pas une colonne : c'est un état de ligne. */
export const isLostStage = (name: string) => /perdu|abandon/i.test(name)

/* ── Construction des colonnes ───────────────────────────────────────────── */

export interface SequenceStepRef {
  id: string
  kind: SeqStepKind
  day: number
  label: string | null
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
 */
export function buildColumns(opts: {
  steps: SequenceStepRef[]
  sequenceName: string | null
  stages: PipelineStageRef[]
  handoffOrdre: number
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
      color: '#5C5953',
      kind: null,
      cta: 'Mettre en séquence',
      index: 0,
    },
  ]

  for (const step of opts.steps) {
    const channel = channelOf(step.kind)
    columns.push({
      id: stepColumnId(step.id),
      group: 'sequence',
      label: step.label?.trim() || channel.label,
      hint: step.day > 0 ? `J+${step.day}` : 'immédiat',
      mode: channel.mode,
      color: channel.color,
      kind: step.kind,
      cta: channel.cta,
      index: columns.length,
    })
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

/** Les cinq issues du bouton « le prospect a réagi ». */
export const SALES_REACTIONS = [
  { id: 'rdv', label: 'A pris RDV lui-même', tone: 'ok', note: '→ RDV · séquence stoppée' },
  { id: 'reply', label: 'M’a rappelé / a répondu', tone: 'info', note: '→ RDV · séquence en pause' },
  { id: 'later', label: 'Intéressé, mais plus tard', tone: 'warn', note: '→ Nurturing · relance datée' },
  { id: 'no', label: 'Pas intéressé', tone: 'danger', note: '→ Perdu + motif' },
  { id: 'bad', label: 'Mauvais numéro / fermé', tone: 'danger', note: '→ Blacklist' },
] as const

export type SalesReactionId = (typeof SALES_REACTIONS)[number]['id']
