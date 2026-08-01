// types.ts — miroir de /api/sales-pipeline/board (et de son pendant agent).
import type { HoldReason, SendWindow } from '@/lib/automations/regulator'
import type { CellStatus, SalesStageId, SalesStateRow } from '@/lib/sales-pipeline/stages'
import type { RegulatorQueueRow } from '@/components/automations/regulator/types'

export type { HoldReason, SendWindow, CellStatus, SalesStageId, SalesStateRow, RegulatorQueueRow }

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
  stageName: string | null
  sequence: SalesSequenceInfo | null
  tasks: SalesTaskInfo[]
  emailsSent: number
  lastExchange: { channel: string; at: string } | null
  auditReady: boolean
  demoUrl: string | null
  state: SalesStateRow
  cells: Record<SalesStageId, CellStatus>
  hasTodo: boolean
}

export interface SalesBoardData {
  rows: SalesBoardRow[]
  total: number
  page: number
  perPage: number
  counts: { actifs: number; rdvPlus: number; won: number; todo: number; value: number }
  columns: Record<SalesStageId, { active: number; done: number }>
  agents: { id: string; name: string; isAdmin: boolean }[]
  sequences: {
    id: string
    name: string
    status: string
    steps: { kind: string; day: number; label: string }[]
    windows: SendWindow[]
    activeEnrollments: number
  }[]
  regulator: {
    paused: boolean
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
  sequence: string
  todoOnly: boolean
  page: number
}
