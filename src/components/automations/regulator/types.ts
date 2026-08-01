// types.ts — miroir de la réponse de /api/automations/regulator.
import type { HoldReason, RegulatorSettings, SendWindow } from '@/lib/automations/regulator'

export type { HoldReason, RegulatorSettings, SendWindow }

export interface RegulatorQueueRow {
  id: string
  automationId: string
  sequenceName: string
  contactName: string
  companyName: string
  ownerId: string | null
  step: number
  stepLabel: string
  sendAt: string | null
  gapMinutes: number
  reason: HoldReason | null
  rank: number | null
  lastEmailAt: string | null
}

export interface RegulatorSequenceRow {
  id: string
  name: string
  status: string
  priority: number
  windows: SendWindow[]
  dailyCap: number | null
  sentToday: number
  queued: number
  activeEnrollments: number
  manualTasks: number
  nextSendAt: string | null
  stepKinds: string[]
}

export interface RegulatorAgentRow {
  id: string
  name: string
  role: string | null
  isAdmin: boolean
  unavailable: boolean
  pendingTasks: number
}

export interface RegulatorSentRow {
  id: string
  at: string
  automationId: string | null
  toName: string | null
  subject: string
  gapMinutes: number | null
}

export interface RegulatorView {
  now: string
  settings: RegulatorSettings
  adminUserId: string | null
  openWindows: SendWindow[]
  sentToday: number
  queue: RegulatorQueueRow[]
  sent: RegulatorSentRow[]
  sequences: RegulatorSequenceRow[]
  agents: RegulatorAgentRow[]
  pendingTasks: number
  unassignedTasks: number
}
