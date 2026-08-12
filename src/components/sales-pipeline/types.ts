// types.ts — miroir de /api/sales-pipeline/board (et de son pendant agent).
import type { HoldReason, SendWindow } from '@/lib/automations/regulator'
import type { CellStatus, SalesColumn, SalesStateRow, SequencePart, StepNote } from '@/lib/sales-pipeline/stages'
import type { MessageVariant } from '@/lib/automations/variables'
import type { RegulatorQueueRow } from '@/components/automations/regulator/types'

export type {
  HoldReason,
  SendWindow,
  CellStatus,
  SalesColumn,
  SalesStateRow,
  SequencePart,
  StepNote,
  RegulatorQueueRow,
}

export interface SalesSequenceInfo {
  enrollmentId: string
  automationId: string
  name: string
  status: string
  currentStep: number
  totalSteps: number
  stepKind: string | null
  stepLabel: string
  sendAt: string | null
  holdReason: HoldReason | null
  rank: number | null
  gapMinutes: number | null
  /** Étape courante telle que la séquence la nomme — rattache une note. */
  stepId: string | null
  /** Version épinglée à la main, `null` = le moteur choisit. */
  variant: MessageVariant | null
}

export interface SalesTaskInfo {
  id: string
  kind: string
  dueAt: string
  message: string
  scriptName: string | null
  phone: string | null
  linkedin: string | null
  assigneeId: string | null
  routingReason: string | null
  /** Version que le moteur a préparée pour cette tâche. */
  variant: MessageVariant
  /** L'autre version, déjà rendue — `null` quand le modèle n'en a qu'une. */
  variantAlt: { variant: MessageVariant; message: string } | null
}

export interface SalesBoardRow {
  id: string
  name: string
  entrepriseId: number | null
  companyName: string
  companyUrl: string | null
  logoUrl: string | null
  ville: string | null
  sector: string | null
  phone: string | null
  montant: number | null
  type: string | null
  mrr: number | null
  contact: { id: string; name: string; role: string | null; email: string | null; phone: string | null } | null
  owner: { id: string; name: string } | null
  companyEmail: string | null
  emailMissing: boolean
  stageName: string | null
  sequence: SalesSequenceInfo | null
  tasks: SalesTaskInfo[]
  emailsSent: number
  lastExchange: { channel: string; at: string } | null
  /** La dernière note de chaque étape, la plus récente d'abord. */
  notes: StepNote[]
  auditReady: boolean
  demoUrl: string | null
  state: SalesStateRow
  position: string | null
  cells: Record<string, CellStatus>
  hasTodo: boolean
  /** Non nul = fiche archivée. Absent tant que la migration n'est pas jouée. */
  archive?: { at: string; reason: string | null; note: string | null } | null
}

export interface SalesSequenceOption {
  id: string
  name: string
  status: string
  steps: { id: string; kind: string; day: number; label: string }[]
  windows: SendWindow[]
  activeEnrollments: number
}

export interface SalesMissingEmailRow {
  id: string
  companyName: string
  contactName: string | null
  contactId: string | null
  entrepriseId: number | null
  sequenceName: string | null
  onEmailStep: boolean
}

export interface SalesBoardData {
  rows: SalesBoardRow[]
  total: number
  page: number
  perPage: number
  counts: { actifs: number; rdvPlus: number; won: number; todo: number; value: number; missingEmail: number }
  columns: SalesColumn[]
  columnCounts: Record<string, { active: number; done: number }>
  missingEmail: SalesMissingEmailRow[]
  sequenceHasEmailStep: boolean
  pipelines: { id: string; nom: string; isDefault: boolean }[]
  selectedPipelineId: string | null
  /** Non nul seulement quand une séquence précise est affichée. */
  selectedSequenceId: string | null
  /** La partie affichée : identifiant de séquence, `all` ou `none`. */
  selectedPart: SequencePart
  /** Ce que chaque onglet montrera si on clique dessus. */
  partCounts: { sequences: Record<string, number>; noSequence: number; all: number }
  agents: { id: string; name: string; isAdmin: boolean }[]
  sequences: SalesSequenceOption[]
  regulator: {
    paused: boolean
    testMode: boolean
    gapMinMinutes: number
    gapMaxMinutes: number
    dailyCap: number
    sentToday: number
    timezone: string
    openWindows: SendWindow[]
    queued: number
    blocked: number
    nextSendAt: string | null
  }
  queue: RegulatorQueueRow[]
}

export type SalesFilters = {
  q: string
  view: string
  status: 'actifs' | 'rdv' | 'won' | 'closed' | 'tous' | 'archives'
  todoOnly: boolean
  page: number
  pipelineId: string | null
  /** Séquence affichée, `all` (vue d'ensemble) ou `none` (stock à démarcher). */
  part: SequencePart | null
}
