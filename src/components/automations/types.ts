// types.ts — types du domaine Automatisations (workflows, séquences, démarchage).
import type { Canal } from '@/lib/prospects/canal'

export type AutomationKind = 'workflow' | 'sequence'
export type AutomationStatus = 'on' | 'paused' | 'draft' | 'error'
export type NodeCat = 'trigger' | 'cond' | 'action' | 'delay' | 'manual'

// ── Définition d'un workflow ───────────────────────────────────────────────
export interface WorkflowNode {
  id: string
  type: string // ex: 'trg.stage_changed', 'act.send_email'
  cat: NodeCat
  title: string
  config: Record<string, unknown>
}

/** Layout en arbre : enfants linéaires (string[]) ou branche OUI/NON. */
export type LayoutChildren = string[] | { yes: string[]; no: string[] }

export interface WorkflowLayout {
  root: string | null
  children: Record<string, LayoutChildren>
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[]
  layout: WorkflowLayout
}

// ── Définition d'une séquence ──────────────────────────────────────────────
export type SeqStepKind = 'email' | 'linkedin' | 'whatsapp' | 'call' | 'wait' | 'task'
export type SeqStepMode = 'auto' | 'manual'

export interface SequenceStep {
  id: string
  kind: SeqStepKind
  mode?: SeqStepMode
  day: number
  sendAt?: string
  template?: string | null
  script?: string | null
  message?: string
  label?: string
  duration?: string
  action?: string
  trackOpens?: boolean
  trackClicks?: boolean
  skipIfReplied?: boolean
  /** email : joindre le PDF d'audit de l'entreprise (si prêt) */
  attachAudit?: boolean
  /**
   * Étape `wait` : ce qu'on attend.
   *
   * `days` (défaut) — le J+n de l'étape suivante, comme avant.
   * `reply` — on attend qu'un humain déclare que le prospect a répondu. Rien ne
   * part tant que le bouton n'a pas été cliqué : c'est le cœur d'une séquence
   * WhatsApp, où le 2ᵉ message n'a de sens que si le 1ᵉʳ a reçu une réponse.
   */
  waitMode?: 'days' | 'reply'
  /**
   * Attente-réponse : au bout de combien de jours on relance quand même.
   * Absent ou 0 = on attend indéfiniment, le prospect reste garé.
   */
  replyTimeoutDays?: number
}

export interface SequenceSettings {
  pipeline?: string | null
  stage?: string | null
  exitStage?: string | null
  exitOnReply?: boolean
  cadence?: string
  timezone?: string
  ownerRR?: string[]
  oncePerDay?: boolean
  /**
   * Réglages de file — consommés par le régulateur (`src/lib/automations/regulator.ts`).
   * `sendWindows` : plages d'envoi [début, fin] en minutes depuis minuit, sans
   * chevauchement. Vide → les plages par défaut du régulateur s'appliquent.
   */
  sendWindows?: [number, number][]
  /** Qui passe devant quand deux séquences veulent envoyer au même moment (1 = prioritaire). */
  queuePriority?: number
  /** Plafond d'emails par jour pour cette séquence seule. `null` = pas de limite dédiée. */
  dailyCap?: number | null
  /**
   * Étape du pipeline où la séquence rend la main au commercial. Dans le
   * pipeline commercial, les colonnes de gauche sont les étapes de la séquence
   * et celles de droite commencent ici. Vide → première étape parlant de
   * rendez-vous (cf. `defaultHandoffOrdre`).
   */
  handoffStage?: number | null
  /**
   * Public visé — les canaux que le prospect DOIT avoir pour que cette séquence
   * ait un sens (« il me faut un mobile », « il me faut une adresse »).
   *
   * La séquence ne parle jamais de préfixes téléphoniques : « 06/07 = mobile »
   * est écrit une seule fois, dans `src/lib/prospects/canal.ts`, et vaut pour
   * tout le CRM. Ici on déclare un besoin, pas une règle de numérotation.
   *
   * Sert à SUGGÉRER la bonne séquence dans le tableau. Ne bloque rien : on peut
   * toujours inscrire une ligne hors public à la main.
   */
  requireCanaux?: Canal[]
  /** Canaux qui DISQUALIFIENT le prospect (« pas d'adresse e-mail, sinon on écrit »). */
  excludeCanaux?: Canal[]
}

export interface SequenceDefinition {
  steps: SequenceStep[]
}

// ── Lignes Supabase ────────────────────────────────────────────────────────
export interface Automation {
  id: string
  kind: AutomationKind
  name: string
  description: string
  status: AutomationStatus
  owner_id: string | null
  trigger_type: string | null
  trigger_pipeline_id: string | null
  trigger_stage_id: number | null
  definition: WorkflowDefinition | SequenceDefinition | Record<string, never>
  settings: SequenceSettings
  runs_7d: number
  success_7d: number | null
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export type RunStatus = 'running' | 'success' | 'error' | 'skipped'

export interface TraceEntry {
  node_id: string
  type: string
  status: 'ok' | 'error' | 'skipped'
  message?: string
  at: string
}

export interface AutomationRun {
  id: string
  automation_id: string
  status: RunStatus
  trigger_type: string | null
  context: Record<string, unknown>
  trace: TraceEntry[]
  error: string | null
  is_test: boolean
  started_at: string
  finished_at: string | null
}

export type JobStatus = 'pending' | 'processing' | 'done' | 'error' | 'canceled'
export type JobType = 'workflow_node' | 'sequence_step' | 'scheduled_trigger'

export interface AutomationJob {
  id: string
  automation_id: string | null
  run_id: string | null
  enrollment_id: string | null
  job_type: JobType
  payload: Record<string, unknown>
  run_at: string
  status: JobStatus
  attempts: number
  last_error: string | null
  created_at: string
  updated_at: string
}

export type EnrollmentStatus = 'active' | 'paused' | 'finished' | 'replied' | 'exited'

export interface SequenceEnrollment {
  id: string
  automation_id: string
  contact_id: string | null
  opportunite_id: string | null
  entreprise_id: number | null
  current_step: number
  status: EnrollmentStatus
  next_run_at: string | null
  /** Heure retenue par le régulateur pour l'envoi en cours. */
  send_at?: string | null
  /** Pourquoi l'inscription n'avance pas (cf. `HoldReason`). */
  hold_reason?: string | null
  /** Dernier email réellement sorti — vide si l'envoi a été retenu. */
  last_email_at?: string | null
  /**
   * Dernière reprise réelle de l'inscription (tâche manuelle faite, réponse
   * déclarée). Les J+n des étapes suivantes se comptent à partir de là plutôt
   * que d'`entered_at` — sinon une accroche répondue au bout d'une semaine
   * ferait partir la suite dans la seconde. `null` = depuis `entered_at`.
   */
  anchor_at?: string | null
  /** Étape où l'ancre a été posée : son `day` est le zéro du calcul. */
  anchor_step?: number | null
  vars: Record<string, unknown>
  created_by: string | null
  entered_at: string
  updated_at: string
  finished_at: string | null
}

export type ProspectionKind = 'call' | 'whatsapp' | 'linkedin' | 'email'
export type ProspectionStatus = 'pending' | 'done' | 'skipped' | 'snoozed'

export interface ProspectionTaskPayload {
  message?: string
  script?: string
  scriptName?: string
  duration?: string
  phone?: string
  email?: string
  linkedin?: string
  result?: string
  [k: string]: unknown
}

export interface ProspectionTask {
  id: string
  kind: ProspectionKind
  status: ProspectionStatus
  contact_id: string | null
  entreprise_id: number | null
  opportunite_id: string | null
  automation_id: string | null
  enrollment_id: string | null
  step_id: string | null
  assignee_id: string | null
  /**
   * Pourquoi cette tâche est chez cette personne (« propriétaire du contact »,
   * « file pleine → admin », « réattribué à la main »). Affiché sur la carte :
   * une file distribuée sans motif ressemble à de l'arbitraire.
   */
  routing_reason?: string | null
  title: string
  payload: ProspectionTaskPayload
  due_at: string
  done_at: string | null
  created_at: string
  updated_at: string
}

export type ConnectionStatus = 'on' | 'draft' | 'manual' | 'error'

export interface AutomationConnection {
  id: string
  name: string
  description: string
  status: ConnectionStatus
  config: Record<string, string>
  connected_at: string | null
  created_at: string
  updated_at: string
}

// ── Tables de référence ────────────────────────────────────────────────────
export interface WhatsappTemplate { id: string; name: string; body: string }
export interface CallScript { id: string; name: string; duration: string | null; body: string }
export interface TaskType { id: string; name: string; color: string | null }
export interface CrmTag { id: string; name: string; color: string }
export interface EmailTemplate { id: string; name: string; subject: string | null; body_preview?: string | null }
export interface PipelineRef { id: string; name: string; color?: string | null; count?: number }
export interface StageRef { id: number; pipeline_id: string; name: string; position: number; color?: string | null }
export interface UserRef { id: string; name: string; initials?: string | null; role?: string | null; color?: string | null }
export interface ContactRef {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  entreprise_id: number | null
}
