// types.ts — miroir de /api/sales-pipeline/board (et de son pendant agent).
import type { HoldReason, SendWindow } from '@/lib/automations/regulator'
import type { CellStatus, SalesColumn, SalesStateRow } from '@/lib/sales-pipeline/stages'
import type { RegulatorQueueRow } from '@/components/automations/regulator/types'

export type { HoldReason, SendWindow, CellStatus, SalesColumn, SalesStateRow, RegulatorQueueRow }

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
  auditReady: boolean
  demoUrl: string | null
  state: SalesStateRow
  position: string | null
  cells: Record<string, CellStatus>
  hasTodo: boolean
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
  selectedSequenceId: string | null
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
  status: 'actifs' | 'rdv' | 'won' | 'closed' | 'tous'
  todoOnly: boolean
  page: number
  pipelineId: string | null
  sequenceId: string | null
}
