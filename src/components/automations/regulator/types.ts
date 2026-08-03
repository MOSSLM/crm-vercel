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

/** Inscription arrêtée à une étape email faute d'adresse — hors file. */
export interface RegulatorMissingEmailRow {
  enrollmentId: string
  automationId: string
  sequenceName: string
  contactName: string
  companyName: string
  entrepriseId: number | null
  contactId: string | null
  opportuniteId: string | null
  ownerId: string | null
  step: number
  stepLabel: string
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
  missingEmail: RegulatorMissingEmailRow[]
  /** Prospects gelés par la phase de test : rien envoyé, rien avancé. */
  testHeld?: RegulatorMissingEmailRow[]
  sent: RegulatorSentRow[]
  sequences: RegulatorSequenceRow[]
  agents: RegulatorAgentRow[]
  pendingTasks: number
  unassignedTasks: number
  testAddresses: { id: string; label: string; email: string }[]
  blockedToday: number
  /** `false` quand la migration de la phase de test n'a pas été jouée sur cette base. */
  testGuardReady?: boolean
  /** Fichier SQL à jouer quand `testGuardReady` est faux. */
  testGuardMigration?: string
}
