// types.ts — types du domaine Automatisations (workflows, séquences, démarchage).
import type { Canal } from '@/lib/prospects/canal'

export type AutomationKind = 'workflow' | 'sequence'
/**
 * `archived` : rangée, hors des listes où l'on choisit une séquence, mais
 * gardée en base avec ses inscriptions (cf. `sql/20260816_automations_archivees.sql`).
 * Comme tout ce qui n'est pas `on`, le moteur n'en fait rien avancer.
 */
export type AutomationStatus = 'on' | 'paused' | 'draft' | 'error' | 'archived'
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
export type SeqStepKind =
  | 'email'
  | 'linkedin'
  | 'whatsapp'
  | 'sms'
  | 'call'
  | 'wait'
  | 'task'
  | 'condition'
  /** Passe le prospect à une AUTRE séquence, et sort de celle-ci. */
  | 'transition'
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
  /**
   * @deprecated Inertes, et volontairement.
   *
   * Resend n'expose aucune option de suivi dans son appel d'envoi : c'est un
   * réglage de domaine. Ces deux champs n'ont donc jamais été transmis. Et on
   * n'active pas le réglage de domaine non plus — pixel d'ouverture et
   * réécriture de liens dégradent la réputation de la boîte.
   *
   * Conservés parce que d'anciennes définitions les portent en base ; à ne pas
   * lire pour décider quoi que ce soit. Ce qui se mesure : les vues des liens à
   * jeton (rapport d'audit, plaquette, démo), comptées côté serveur.
   */
  trackOpens?: boolean
  /** @deprecated Voir `trackOpens`. */
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
  /**
   * Cette étape n'appartient qu'à l'une des deux suites d'une attente-réponse.
   *
   * Absent = étape du tronc, traversée quoi qu'il arrive. La règle
   * d'atteignabilité vit dans `src/lib/automations/branches.ts` et nulle part
   * ailleurs — le moteur, l'éditeur et la prévision s'y réfèrent tous.
   */
  branch?: { waitId: string; on: string } | null
  /**
   * Étape `condition` : ce qu'on teste avant de bifurquer.
   *
   * UNE CONDITION EST UNE FOURCHE, EXACTEMENT COMME UNE ATTENTE — et c'est
   * pour ça que `branch` ne change pas d'un octet. `on: 'reply'` veut dire
   * « la sortie 1 », `on: 'timeout'` « la sortie 2 » ; sur une attente ça se
   * lit « il a répondu / sans réponse », sur une condition « oui / non ».
   * Les six séquences existantes et les 92 `vars.replies` restent valides,
   * et `branches.ts` garde sa récursion telle quelle.
   *
   * Le vocabulaire des champs et des opérateurs vit dans
   * `src/lib/automations/conditions.ts`, avec ce qu'il faut aller chercher
   * pour l'évaluer.
   */
  condition?: {
    champ: string
    operateur: string
    valeurs?: string[]
    seuil?: number
    /**
     * Ce qu'on fait quand on NE SAIT PAS — la donnée n'a jamais été mesurée
     * pour ce prospect. Défaut `non`, jamais un gel : c'est un gel sans
     * réveil qui a laissé 59 inscriptions dormir des semaines. Mais la trace
     * écrite dans `vars.conditions` distingue alors `non_mesure` de `non`,
     * pour qu'on puisse compter après coup combien de prospects sont partis
     * dans une voie qu'on a devinée.
     */
    siInconnu?: 'oui' | 'non'
    /**
     * L'AIGUILLAGE — quand deux voies ne suffisent pas.
     *
     * Absent : la condition garde ses deux sorties, `reply` = oui et
     * `timeout` = non, et rien ne change. Présent : chaque cas ouvre SA voie,
     * le premier vrai gagne, et une voie `sinon` ramasse le reste. Le
     * vocabulaire et l'évaluation vivent dans
     * `src/lib/automations/conditions.ts`.
     *
     * ⚠️ Un cas qu'on ne sait pas trancher n'attrape personne : il laisse
     * passer au cas suivant. La voie « sinon » s'adresse donc AUSSI à ceux
     * dont on ne savait rien — c'est ce qu'il faut avoir en tête en l'écrivant.
     */
    cas?: {
      cle: string
      libelle?: string
      champ: string
      operateur: string
      valeurs?: string[]
      seuil?: number
    }[]
  } | null
  /**
   * CE QUI SE PASSE APRÈS CETTE ÉTAPE — la moitié qui manquait aux voies.
   *
   * Absent (défaut) : on descend au suivant atteignable, et les voies d'une
   * fourche se rejoignent sur le tronc. C'est le comportement de toujours, et
   * il reste juste pour l'immense majorité des étapes.
   *
   * `fin` : la voie s'arrête là. C'est ce qui manquait — nos six séquences
   * finissent toutes sur un appel, sans rien derrière, et le flou d'après le
   * premier contact vient précisément de là. Une fin explicite se lit dans le
   * canvas et se compte dans les rapports (`vars.fin`).
   *
   * `aller_a` : on saute à une autre étape, en avant pour couper court, en
   * arrière pour reboucler. Un rebouclage sans issue tournerait indéfiniment :
   * le moteur compte les passages et arrête à `MAX_TOURS`
   * (`src/lib/automations/branches.ts`).
   */
  suite?:
    | { type: 'suivre' }
    | { type: 'aller_a'; cible: string }
    | { type: 'fin'; motif?: string }
    | null
  /**
   * Étape `transition` : la séquence suivante.
   *
   * POURQUOI PLUSIEURS SÉQUENCES PLUTÔT QU'UNE ÉNORME. Une séquence unique qui
   * couvrirait premier contact, démo, engagement, closing et nurture serait
   * illisible dans le canvas et impossible à retoucher sans risquer l'ensemble.
   * Découpée, chaque séquence garde une question, se relit, et se réutilise —
   * « Nurture » sert à tout le monde, quelle que soit la porte d'entrée.
   *
   * CE QUE ÇA FAIT, EXACTEMENT : l'inscription courante SORT (motif
   * `transfert`, qui ne renvoie pas le prospect au stock), et une inscription
   * s'ouvre dans la séquence visée. Le prospect n'est jamais dans deux
   * séquences de démarchage à la fois.
   *
   * ⚠️ Une chaîne de séquences peut boucler. `vars.transitions` garde la liste
   * de celles déjà traversées : on n'entre jamais deux fois dans la même par
   * transition, et jamais plus de `MAX_TRANSITIONS` fois de suite.
   */
  transition?: { automationId: string; motif?: string } | null
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
  /**
   * Qui, parmi les agents, voit cette séquence — et donc peut la lancer.
   *
   * `tous` (défaut, y compris quand la clé est absente) : elle est dans le
   * pipeline commercial de tout le monde. `choisis` : seuls les agents inscrits
   * dans `sequence_agent_assignments` l'ont. La règle complète, avec ce qui l'a
   * motivée, vit dans `src/lib/automations/acces.ts`.
   */
  acces?: 'tous' | 'choisis'
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

/**
 * Les natures de tâche que la base accepte — miroir exact de la contrainte
 * `prospection_tasks_kind_check`, élargie au SMS par
 * `sql/20260820_canal_sms.sql`. Ajouter une valeur ici sans la migration fait
 * échouer l'INSERT, donc l'avancement de l'inscription ENTIÈRE, pas de la
 * seule étape.
 */
export type ProspectionKind = 'call' | 'whatsapp' | 'sms' | 'linkedin' | 'email'
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
  /**
   * Les deux versions du modèle, telles que le moteur les a rendues au moment
   * de préparer la tâche (cf. `processSequenceEnrollment`).
   *
   * Elles voyagent AVEC la tâche plutôt que d'être recalculées au clic : relire
   * modèle et variables depuis le navigateur, c'est risquer d'afficher autre
   * chose que ce qui est réellement prêt à partir. `variantAlt` est absent quand
   * le modèle n'a qu'un texte — et sur toutes les tâches créées avant la
   * bascule à deux versions, ce qui est exact : elles n'en avaient qu'une.
   */
  variant?: 'company' | 'contact'
  variantAlt?: { variant: 'company' | 'contact'; message: string } | null
  /**
   * La MISE DE CÔTÉ, telle que `PATCH /api/agent/tasks` l'a posée.
   *
   * Le motif vit ici et pas seulement dans l'historique : quand la tâche
   * ressort trois semaines plus tard, « il est en congés jusqu'au 8 » doit être
   * sur la carte, pas à retrouver en déroulant tous les échanges.
   */
  mise_de_cote?: { jusquau: string; motif: string | null; le: string } | null
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
