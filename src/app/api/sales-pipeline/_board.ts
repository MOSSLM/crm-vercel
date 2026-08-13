// _board.ts — le tableau du pipeline commercial.
//
// Une ligne = une opportunité. Les colonnes viennent de deux sources réelles :
// les étapes de la SÉQUENCE choisie, puis les étapes du PIPELINE à partir de
// l'étape de reprise. Rien n'est inventé, tout suit ce qui est configuré.
//
// La position d'une ligne est DÉRIVÉE, jamais stockée :
//   • inscription vivante sur la séquence choisie → son étape courante ;
//   • sinon → l'étape de pipeline de l'opportunité.
// `sales_pipeline_state` ne garde que ce qui n'est pas déductible : perdu /
// nurturing / blacklist, étapes sautées, et les jalons commerciaux.
//
// Partagé entre le board admin (tout le CRM) et le board agent (`ownerId` posé).

import { isSchemaGap } from '@/app/api/_lib/schema-gap'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { SITE_DOMAIN } from '@/lib/site-domain'
import type { Automation, SequenceDefinition } from '@/components/automations/types'
import {
  ALL_SEQUENCES,
  EMPTY_STATE,
  NO_SEQUENCE,
  SEQ_ANY_COLUMN_ID,
  buildColumns,
  cellStatuses,
  defaultHandoffOrdre,
  estColonneVisible,
  hasInterest,
  isLostStage,
  isPendingTask,
  partKind,
  ALL_PIPELINES,
  colonneDeLEtape as colonneDeLEtapeDansLaVue,
  stageColumnId,
  stepColumnId,
  type CellStatus,
  type PipelineStageRef,
  type SalesColumn,
  type SalesStateRow,
  type SequencePart,
  type StepNote,
} from '@/lib/sales-pipeline/stages'
import { readVariant } from '@/lib/automations/week'
import { retourVersLaReponse } from '@/lib/automations/branches'
import { chargerAcces, filtrerPourAgent } from '@/lib/automations/acces'
import type { MessageVariant } from '@/lib/automations/variables'
import { buildRegulatorView, type RegulatorQueueRow } from '@/app/api/automations/regulator/_view'
import { cleanEmail } from '@/lib/automations/regulator-db'
import type { HoldReason, SendWindow } from '@/lib/automations/regulator'

/** Combien d'opportunités on remonte au maximum avant filtrage. */
const OPPORTUNITY_LIMIT = 1000

export type SalesStatusFilter = 'actifs' | 'rdv' | 'won' | 'closed' | 'tous' | 'archives'

export interface SalesBoardQuery {
  /** Agent : restreint aux prospects qui lui appartiennent. */
  ownerId?: string | null
  q?: string
  view?: string
  status?: SalesStatusFilter
  todoOnly?: boolean
  page?: number
  perPage?: number
  /** Pipeline dont les colonnes de droite sont issues. */
  pipelineId?: string | null
  /**
   * La partie regardée : l'identifiant de la séquence dont on veut voir les
   * étapes, `all` (vue d'ensemble) ou `none` (le stock à démarcher).
   * Un identifiant inconnu retombe sur la séquence qui travaille le plus.
   */
  automationId?: SequencePart | null
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
  /** Identifiant de l'étape courante dans la séquence — rattache une note. */
  stepId: string | null
  /**
   * Version de message épinglée à la main sur cette ligne, `null` si personne
   * n'a choisi : le moteur tranche alors seul (`pickVariant`).
   */
  variant: MessageVariant | null
  /**
   * L'inscription est sur la voie « sans réponse » d'une attente, et une voie
   * « il a répondu » existe : déclarer une réponse la ramène sur celle-ci.
   *
   * Sans ce drapeau, le bouton n'apparaissait que tant que l'inscription était
   * garée — or un prospect qui répond APRÈS la relance est le cas le plus
   * fréquent, c'est elle qui l'a réveillé.
   */
  rattrapageReponse?: boolean
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
  /**
   * L'étape (`step:s3` → `s3`) qui a produit cette tâche, `null` pour les
   * tâches hors moteur de séquence (ex. tâche « appel » créée à la main).
   *
   * Sert à distinguer deux tâches du même canal sur des étapes différentes
   * (deux WhatsApp dans une même séquence) : sans elle, la carte de l'étape 2
   * pouvait retrouver le message de l'étape 1 simplement parce qu'il était
   * premier dans la liste.
   */
  stepId: string | null
  /** Laquelle des deux versions du modèle le moteur a préparée. */
  variant: MessageVariant
  /**
   * L'autre version, déjà rendue — `null` quand le modèle n'en a qu'une.
   *
   * Le moteur l'a posée dans la tâche au moment de la préparer : la carte peut
   * donc proposer de basculer juste avant d'ouvrir WhatsApp, sans relire ni le
   * modèle ni les variables, et donc sans risquer d'afficher autre chose que ce
   * qui est réellement prêt à partir.
   */
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
  /**
   * Par où l'on peut joindre ce prospect — la matière première, pas une liste
   * déjà triée.
   *
   * `numerosDuProspect` (`src/lib/prospects/numeros.ts`) en tire les numéros
   * dédoublonnés avec leur origine (« Julien Martin · Gérant », « fiche
   * entreprise »), dans l'ordre que veut l'usage. On envoie les ingrédients
   * parce que l'ordre dépend de la colonne regardée — mobile d'abord sur
   * WhatsApp, fixe d'abord à l'appel — et que la colonne n'est connue qu'ici.
   */
  joignable: {
    companyPhones: string[]
    contacts: {
      id: string
      first_name: string | null
      last_name: string | null
      tel: string | null
      email: string | null
      role_title: string | null
      is_decision_maker: boolean | null
    }[]
  }
  owner: { id: string; name: string } | null
  /** Adresse de repli portée par la fiche entreprise (`entreprises.email`). */
  companyEmail: string | null
  /**
   * Ni le contact ni l'entreprise n'ont d'adresse : l'étape email ne peut pas
   * partir. Le drapeau est posé dès la première ligne du tableau, avant même la
   * mise en séquence — c'est ce qui évite d'inscrire un prospect injoignable.
   */
  emailMissing: boolean
  /** Étape de pipeline réelle — affichée en badge, même pendant la séquence. */
  stageName: string | null
  sequence: SalesSequenceInfo | null
  tasks: SalesTaskInfo[]
  emailsSent: number
  lastExchange: { channel: string; at: string } | null
  /**
   * La dernière note par étape, la plus récente d'abord.
   *
   * Ce qu'on garde ici, c'est le DERNIER mot de chaque étape — de quoi rendre la
   * carte. Le fil complet se lit sur la fiche entreprise, qui le tient déjà :
   * les notes sont des lignes de `email_logs`, au milieu des e-mails et des
   * WhatsApp qui les ont provoquées.
   */
  notes: StepNote[]
  auditReady: boolean
  demoUrl: string | null
  state: SalesStateRow
  /** Colonne où se trouve la ligne. */
  position: string | null
  cells: Record<string, CellStatus>
  hasTodo: boolean
  /**
   * Non nul = fiche archivée. Toujours `null` tant que la migration
   * `20260809_archivage_motive_et_concurrents.sql` n'est pas jouée.
   */
  archive: { at: string; reason: string | null; note: string | null } | null
}

export interface SalesBoardCounts {
  actifs: number
  rdvPlus: number
  won: number
  todo: number
  value: number
  /** Prospects actifs sans aucune adresse email — l'étape email leur est impossible. */
  missingEmail: number
}

/** Une ligne de l'alerte « sans email », indépendante de la pagination. */
export interface SalesMissingEmailRow {
  id: string
  companyName: string
  contactName: string | null
  contactId: string | null
  entrepriseId: number | null
  /** Déjà en séquence : l'étape email est gelée en attendant une adresse. */
  sequenceName: string | null
  onEmailStep: boolean
}

export interface SalesBoardData {
  rows: SalesBoardRow[]
  total: number
  page: number
  perPage: number
  counts: SalesBoardCounts
  /** Les colonnes de la matrice, séquence puis pipeline. */
  columns: SalesColumn[]
  /** Compteurs par colonne, sur l'ensemble filtré (pas sur la page). */
  columnCounts: Record<string, { active: number; done: number }>
  /** Toutes les lignes sans email du périmètre filtré — pas seulement la page. */
  missingEmail: SalesMissingEmailRow[]
  /** La séquence affichée comporte-t-elle au moins une étape email ? */
  sequenceHasEmailStep: boolean
  pipelines: { id: string; nom: string; isDefault: boolean }[]
  selectedPipelineId: string | null
  /** Non nul seulement quand une séquence précise est affichée. */
  selectedSequenceId: string | null
  /** La partie affichée : identifiant de séquence, `all` ou `none`. */
  selectedPart: SequencePart
  /**
   * Combien de prospects derrière chaque onglet, tous les autres filtres
   * appliqués : c'est le nombre qu'on verra en cliquant dessus.
   */
  partCounts: { sequences: Record<string, number>; noSequence: number; all: number }
  agents: { id: string; name: string; isAdmin: boolean }[]
  sequences: {
    id: string
    name: string
    status: string
    steps: { id: string; kind: string; day: number; label: string }[]
    windows: SendWindow[]
    activeEnrollments: number
  }[]
  /**
   * Ce que l'agent ne voit pas, et pourquoi — sans quoi un tableau vide se lit
   * comme « il n'y a aucune séquence » alors qu'il y en a, simplement pas pour
   * lui. `restreint` est faux côté admin, où rien n'est filtré.
   */
  sequenceAcces: { restreint: boolean; masquees: number }
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

type OppRow = {
  id: string
  entreprise_id: number | null
  contact_id: string | null
  pipeline_id: string | null
  stage_id: number | null
  name: string | null
  montant: number | null
  type: string | null
  mrr: number | null
  owner_id: string | null
  created_at: string | null
  updated_at: string | null
  archived_at?: string | null
  archive_reason?: string | null
  archive_note?: string | null
}

type StateRow = {
  opportunite_id: string
  skipped: string[] | null
  skip_reason: string | null
  state: string
  state_reason: string | null
  nurture_at: string | null
  replied: boolean | null
  rdv_at: string | null
  propo_amount: number | string | null
  objection: string | null
  stage_dates: Record<string, string> | null
}

export function toStateRow(row: StateRow | undefined): SalesStateRow {
  if (!row) return { ...EMPTY_STATE, skipped: [], stageDates: {} }
  const amount = row.propo_amount == null ? null : Number(row.propo_amount)
  return {
    skipped: (row.skipped ?? []).filter(Boolean),
    skipReason: row.skip_reason,
    state: (['progress', 'nurt', 'lost', 'black', 'won'].includes(row.state)
      ? row.state
      : 'progress') as SalesStateRow['state'],
    stateReason: row.state_reason,
    nurtureAt: row.nurture_at,
    replied: !!row.replied,
    rdvAt: row.rdv_at,
    propoAmount: Number.isFinite(amount) ? amount : null,
    objection: row.objection,
    stageDates: (row.stage_dates ?? {}) as Record<string, string>,
  }
}

/**
 * Où se trouve la ligne dans la matrice.
 *
 * Une inscription vivante sur la séquence affichée prime : c'est elle qui
 * pilote le prospect. Sinon on retombe sur l'étape de pipeline de
 * l'opportunité. Une opportunité qui n'est pas encore arrivée à l'étape de
 * reprise se place sur la première colonne : il faut la mettre en séquence.
 */
/**
 * Sur quelle COLONNE se trouve un prospect, à partir de l'index moteur.
 *
 * Deux numérotations coexistent et ne peuvent pas être confondues :
 * `sequence_enrollments.current_step` compte toutes les étapes, attentes
 * comprises ; les colonnes du pipeline n'en montrent aucune (une attente n'est
 * pas un geste commercial). Indexer les unes avec l'autre décale la ligne d'un
 * cran par attente franchie.
 *
 * Renvoie une position 1-based dans la liste SANS attentes, ou 0 quand rien n'a
 * encore été fait. Quand l'étape courante EST une attente, la position reste
 * celle du dernier message parti — c'est lui qui attend une réponse, et c'est ce
 * que l'opérateur doit voir.
 */
export function visibleStepPosition(
  steps: { kind: string; waitMode?: string | null }[],
  currentStep: number,
): number {
  let count = 0
  for (let i = 0; i < steps.length && i <= currentStep; i++) {
    if (estColonneVisible(steps[i])) count++
  }
  return count
}

export function derivePosition(opts: {
  columns: SalesColumn[]
  sequence: SalesSequenceInfo | null
  steps: { id: string }[]
  stageId: number | null
  /**
   * L'identifiant de colonne où ranger cette étape. Injecté parce qu'il dépend
   * du mode : `stage:<id>` sur un pipeline précis, `role:<rôle>` en vue fondue.
   * Absent = l'ancien comportement, un pipeline à la fois.
   */
  colonneDeLEtape?: (stageId: number) => string | null
}): string | null {
  const { columns, sequence, steps, stageId } = opts
  if (columns.length === 0) return null

  const viser = opts.colonneDeLEtape ?? ((id: number) => stageColumnId(id))
  const cible = stageId != null ? viser(stageId) : null
  const stageColumn = cible ? columns.find((c) => c.id === cible) : undefined

  if (sequence && (sequence.status === 'active' || sequence.status === 'paused')) {
    const step = steps[sequence.currentStep - 1]
    if (step) {
      const id = stepColumnId(step.id)
      if (columns.some((c) => c.id === id)) return id
    }
    // Vue d'ensemble : aucune étape n'est affichée, mais une inscription
    // vivante se voit quand même — dans la colonne « en séquence », à moins que
    // le prospect ne soit déjà passé en phase commerciale : cette étape-là le
    // décrit mieux qu'un démarchage qui n'a plus la main.
    if (columns.some((c) => c.id === SEQ_ANY_COLUMN_ID)) return stageColumn?.id ?? SEQ_ANY_COLUMN_ID
  }

  if (stageColumn) return stageColumn.id

  // Séquence terminée mais pas encore d'étape de pipeline atteinte : on pose la
  // ligne sur la première colonne du groupe pipeline, là où le commercial
  // reprend la main.
  if (sequence && (sequence.status === 'finished' || sequence.status === 'exited')) {
    const firstDeal = columns.find((c) => c.group === 'pipeline')
    if (firstDeal) return firstDeal.id
  }

  // Rien de tout ça : le prospect n'a pas encore démarré. Il attend dans le
  // stock de départ, avec les autres à mettre en séquence.
  return columns[0].id
}

/* ── Quelle partie du tableau ? ──────────────────────────────────────────── */

/**
 * La partie demandée, ramenée à quelque chose d'affichable.
 *
 * `all` et `none` sont pris tels quels. Un identifiant de séquence n'est retenu
 * que s'il existe encore — une séquence supprimée ou renommée ne doit pas
 * ouvrir un tableau vide sans explication. À défaut : la séquence active qui
 * travaille le plus, celle-là même sur laquelle il y a quelque chose à voir.
 */
export function resolveSequencePart(
  requested: string | null | undefined,
  sequences: { id: string; status: string }[],
  activeByAutomation: Map<string, number>,
): { part: SequencePart; sequenceId: string | null } {
  const asked = (requested ?? '').trim()
  if (asked === ALL_SEQUENCES || asked === NO_SEQUENCE) return { part: asked, sequenceId: null }

  const known = sequences.find((s) => s.id === asked)
  const fallback =
    [...sequences]
      .filter((s) => s.status === 'on')
      .sort((a, b) => (activeByAutomation.get(b.id) ?? 0) - (activeByAutomation.get(a.id) ?? 0))[0] ??
    sequences[0] ??
    null
  const sequence = known ?? fallback
  // Aucune séquence configurée : il n'y a pas d'étapes à afficher, la vue
  // d'ensemble est la seule qui ait un sens.
  if (!sequence) return { part: ALL_SEQUENCES, sequenceId: null }
  return { part: sequence.id, sequenceId: sequence.id }
}

/**
 * Cette ligne appartient-elle à la partie affichée ?
 *
 * Une opportunité peut porter plusieurs inscriptions (une terminée, une en
 * cours) : elle apparaît alors sous chacune des séquences concernées, chaque
 * fois à l'étape qui la concerne. « Sans séquence » est le stock : jamais
 * inscrit nulle part.
 */
export function matchesPart(part: SequencePart, automationIds: Set<string> | undefined): boolean {
  if (part === ALL_SEQUENCES) return true
  if (part === NO_SEQUENCE) return !automationIds || automationIds.size === 0
  return automationIds?.has(part) ?? false
}

/**
 * Le pipeline où l'agent a le plus d'affaires — le seul défaut qui ne lui
 * ouvre pas un tableau vide maintenant que ses prospects restent dans le
 * pipeline d'origine de leur affaire.
 */
async function busiestPipelineFor(
  sb: ReturnType<typeof getServiceClient>,
  ownerId: string,
): Promise<string | null> {
  const { data } = await sb
    .from('opportunites')
    .select('pipeline_id')
    .eq('owner_id', ownerId)
    .not('pipeline_id', 'is', null)
    .limit(OPPORTUNITY_LIMIT)

  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    const id = row.pipeline_id as string
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  let best: string | null = null
  let bestCount = 0
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id
      bestCount = count
    }
  }
  return best
}

export async function buildSalesBoard(query: SalesBoardQuery = {}): Promise<
  { ok: true; data: SalesBoardData } | { ok: false; error: string; status: number }
> {
  const sb = getServiceClient()
  const perPage = Math.min(200, Math.max(1, query.perPage ?? 100))
  const page = Math.max(0, query.page ?? 0)

  // ── 1. Pipelines, étapes, séquences ──────────────────────────────────────
  const [pipelinesRes, stagesRes, sequencesRes] = await Promise.all([
    sb.from('pipelines').select('id, nom, ordre, is_default').eq('visible', true).order('ordre', { ascending: true }),
    sb.from('etapes_pipeline').select('id, nom, ordre, pipeline_id').eq('visible', true).order('ordre', { ascending: true }),
    sb.from('automations').select('id, name, status, definition, settings').eq('kind', 'sequence').order('name'),
  ])

  const pipelines = ((pipelinesRes.data ?? []) as { id: string; nom: string; is_default: boolean }[]).map((p) => ({
    id: p.id,
    nom: p.nom,
    isDefault: !!p.is_default,
  }))
  if (pipelines.length === 0) return { ok: false, error: 'aucun_pipeline', status: 404 }

  // Le pipeline demandé, sinon celui où l'appelant a le plus d'affaires, sinon
  // « Agent SAMA », sinon le pipeline par défaut du CRM.
  //
  // Le repli sur « Agent SAMA » était juste tant que l'attribution y ouvrait une
  // affaire pour chaque prospect. Depuis qu'elle réutilise l'affaire existante,
  // les prospects d'un agent restent dans « Streak Mars/Avril » ou le pipeline
  // par défaut : ouvrir le tableau commercial sur « Agent SAMA » afficherait un
  // écran vide à un agent qui a pourtant tout son portefeuille.
  // « Tous les pipelines » : un seul tableau pour tout le portefeuille. Sans
  // cette vue, un prospect n'était visible qu'en devinant dans quel pipeline son
  // affaire vivait — et deux prospects au même stade, dans deux pipelines
  // différents, ne se voyaient jamais côte à côte.
  const fusionne = query.pipelineId === ALL_PIPELINES
  const busiestPipelineId = query.ownerId && !fusionne ? await busiestPipelineFor(sb, query.ownerId) : null
  const selectedPipeline = fusionne
    ? null
    : (pipelines.find((p) => p.id === query.pipelineId) ??
      pipelines.find((p) => p.id === busiestPipelineId) ??
      pipelines.find((p) => /agent sama/i.test(p.nom)) ??
      pipelines.find((p) => p.isDefault) ??
      pipelines[0])

  const allStages = (stagesRes.data ?? []) as (PipelineStageRef & { pipeline_id: string })[]
  // En vue fondue, les étapes de TOUS les pipelines alimentent la classification
  // par rôle ; sinon, seulement celles du pipeline regardé.
  const stages = fusionne ? allStages : allStages.filter((s) => s.pipeline_id === selectedPipeline!.id)
  /**
   * Cette étape est-elle l'étape « Perdu » ? Un prédicat plutôt qu'une étape
   * unique : en vue fondue, chaque pipeline a la sienne, et n'en retenir qu'une
   * laisserait passer pour actives les affaires perdues des autres.
   */
  const etapePerdue = (stageId: number | null) =>
    stageId != null && stages.some((s) => s.id === stageId && isLostStage(s.nom))
  /** Où ranger une étape : sa colonne d'étape, ou celle de son rôle. */
  const colonneDeLEtape = (stageId: number) => colonneDeLEtapeDansLaVue(stageId, allStages, fusionne)

  // Toutes les séquences, archives comprises : cette carte-là ne sert pas à
  // CHOISIR mais à RELIRE. Une inscription sur une séquence archivée ou non
  // attribuée doit garder son nom et ses étapes sur la ligne du prospect —
  // sinon le travail en cours devient anonyme le jour où l'on range.
  const toutesLesSequences = (sequencesRes.data ?? []) as Automation[]

  // Ce dans quoi on peut choisir. Deux filtres, pour deux raisons distinctes :
  //
  //   · archivée — « plus dans les listes de choix », c'est la définition même
  //     du statut ;
  //   · non attribuée — l'agent ne voit que les séquences qui lui sont
  //     ouvertes (cf. `src/lib/automations/acces.ts`). Sans ce filtre, son
  //     tableau proposait des séquences que la garde d'inscription refusait
  //     ensuite en 403 : on ne l'apprenait qu'au clic.
  //
  // Les inscriptions passées ne disparaissent pas pour autant : `partCounts` se
  // calcule sur les inscriptions, pas sur cette liste, et les lignes concernées
  // restent lisibles dans la vue d'ensemble.
  const nonArchivees = toutesLesSequences.filter((a) => a.status !== 'archived')
  const acces = await chargerAcces(sb)
  const sequenceRows = filtrerPourAgent(nonArchivees, query.ownerId ?? null, acces)
  const sequenceAcces = {
    restreint: Boolean(query.ownerId),
    masquees: nonArchivees.length - sequenceRows.length,
  }

  // ── 2. Quelle séquence pilote les colonnes ? ─────────────────────────────
  const { data: activeCounts } = await sb
    .from('sequence_enrollments')
    .select('automation_id')
    .eq('status', 'active')
    .limit(5000)
  const activeByAutomation = new Map<string, number>()
  for (const row of (activeCounts ?? []) as { automation_id: string }[]) {
    activeByAutomation.set(row.automation_id, (activeByAutomation.get(row.automation_id) ?? 0) + 1)
  }

  // Une partie à la fois : les étapes du milieu appartiennent à UNE séquence.
  // Deux séquences côte à côte se liraient avec la règle du voisin.
  const { part, sequenceId } = resolveSequencePart(query.automationId, sequenceRows, activeByAutomation)
  const selectedSequence = sequenceId ? (sequenceRows.find((s) => s.id === sequenceId) ?? null) : null

  const stepsOfSequence = (automation: Automation | null) => {
    const def = (automation?.definition as SequenceDefinition) ?? { steps: [] }
    const steps = Array.isArray(def.steps) ? def.steps : []
    // Une attente de délai pur s'écoule seule : pas de colonne. Une
    // attente-RÉPONSE en a une — c'est là qu'on déclare ce que le prospect a
    // dit (cf. `estColonneVisible`).
    return steps.filter(estColonneVisible)
  }
  const selectedSteps = stepsOfSequence(selectedSequence)

  const settings = (selectedSequence?.settings ?? {}) as Record<string, unknown>
  const handoffStageId = settings.handoffStage != null ? Number(settings.handoffStage) : null
  const handoffOrdre =
    (handoffStageId != null ? stages.find((s) => s.id === handoffStageId)?.ordre : undefined) ??
    defaultHandoffOrdre(stages, (selectedSequence?.trigger_stage_id as number | null) ?? null)

  const columns = buildColumns({
    steps: selectedSteps.map((s) => ({
      id: s.id,
      kind: s.kind,
      day: s.day ?? 0,
      label: s.label ?? null,
      waitMode: s.waitMode ?? null,
      replyTimeoutDays: s.replyTimeoutDays ?? null,
      branch: s.branch ?? null,
    })),
    sequenceName: selectedSequence?.name ?? null,
    stages,
    handoffOrdre,
    // Vue d'ensemble : une seule colonne « en séquence » à la place des étapes.
    // Le stock, lui, n'a par définition personne en séquence.
    overview: partKind(part) === 'all',
    parRole: fusionne,
  })

  // ── 3. Opportunités du pipeline choisi ───────────────────────────────────
  const OPP_COLUMNS =
    'id, entreprise_id, contact_id, pipeline_id, stage_id, name, montant, type, mrr, owner_id, created_at, updated_at'
  let oppQuery = sb
    .from('opportunites')
    .select(`${OPP_COLUMNS}, archived_at, archive_reason, archive_note`)
    .order('updated_at', { ascending: false })
    .limit(OPPORTUNITY_LIMIT)
  if (selectedPipeline) oppQuery = oppQuery.eq('pipeline_id', selectedPipeline.id)
  if (query.ownerId) oppQuery = oppQuery.eq('owner_id', query.ownerId)

  const firstTry = await oppQuery
  let oppData = firstTry.data as OppRow[] | null
  let oppError: { code?: string; message?: string } | null = firstTry.error

  // Le board doit continuer de tourner tant que la migration d'archivage n'est
  // pas jouée : on relit sans ces colonnes, et rien n'est archivé.
  if (isSchemaGap(oppError)) {
    let fallback = sb
      .from('opportunites')
      .select(OPP_COLUMNS)
      .order('updated_at', { ascending: false })
      .limit(OPPORTUNITY_LIMIT)
    if (selectedPipeline) fallback = fallback.eq('pipeline_id', selectedPipeline.id)
    if (query.ownerId) fallback = fallback.eq('owner_id', query.ownerId)
    const retry = await fallback
    oppData = retry.data as OppRow[] | null
    oppError = retry.error
  }

  if (oppError) return { ok: false, error: oppError.message ?? 'erreur', status: 500 }
  const opps = (oppData ?? []) as OppRow[]

  const oppIds = opps.map((o) => o.id)
  const entIds = [...new Set(opps.map((o) => o.entreprise_id).filter((v) => v != null))] as number[]

  // ── 4. Tout ce qui décore une ligne, en lots ─────────────────────────────
  const [entsRes, statesRes, enrollRes, tasksRes, logsRes, auditsRes, sitesRes, contactsRes] = await Promise.all([
    entIds.length > 0
      ? sb
          .from('entreprises')
          // `telephones` en plus de `telephone` : un prospect porte jusqu'à
          // quatre numéros répartis sur trois colonnes, et la carte doit dire
          // lequel elle compose plutôt que d'en montrer un choisi au hasard.
          .select(
            'id, name, ville, telephone, telephones, email, site_web_canonique, canonical_url, logo_url, owner_id, service_tags',
          )
          .in('id', entIds)
      : Promise.resolve({ data: [] as unknown[] }),
    oppIds.length > 0
      ? sb.from('sales_pipeline_state').select('*').in('opportunite_id', oppIds)
      : Promise.resolve({ data: [] as unknown[] }),
    oppIds.length > 0
      ? sb
          .from('sequence_enrollments')
          // `vars` porte l'épingle de version posée sur la ligne (`readVariant`).
          .select('id, automation_id, opportunite_id, current_step, status, send_at, hold_reason, vars')
          .in('opportunite_id', oppIds)
      : Promise.resolve({ data: [] as unknown[] }),
    oppIds.length > 0
      ? sb
          .from('prospection_tasks')
          .select('id, kind, status, step_id, due_at, payload, opportunite_id, assignee_id, routing_reason')
          .in('opportunite_id', oppIds)
          .eq('status', 'pending')
      : Promise.resolve({ data: [] as unknown[] }),
    oppIds.length > 0
      ? sb
          .from('email_logs')
          // `outcome` / `step_id` / `body_text` : les lignes `channel = 'note'`
          // portent ce que le prospect a dit, et l'étape qui l'a provoqué.
          .select('id, opportunite_id, sent_at, channel, type, status, outcome, step_id, subject, body_text')
          .in('opportunite_id', oppIds)
          .eq('status', 'sent')
          .order('sent_at', { ascending: false })
          .limit(5000)
      : Promise.resolve({ data: [] as unknown[] }),
    oppIds.length > 0
      ? sb.from('audits').select('opportunite_id, statut, pdf_url, demo_site_url').in('opportunite_id', oppIds)
      : Promise.resolve({ data: [] as unknown[] }),
    entIds.length > 0
      ? sb
          .from('sites')
          .select('enterprise_id, is_published, published_subdomain, published_domain, build_stage, is_template')
          .in('enterprise_id', entIds)
      : Promise.resolve({ data: [] as unknown[] }),
    entIds.length > 0
      ? sb
          .from('contacts')
          .select('id, first_name, last_name, email, tel, role_title, entreprise_id, is_decision_maker')
          .in('entreprise_id', entIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const entById = new Map(
    (
      (entsRes.data ?? []) as {
        id: number
        name: string | null
        ville: string | null
        telephone: string | null
        telephones: (string | null)[] | null
        email: string | null
        site_web_canonique: string | null
        canonical_url: string | null
        logo_url: string | null
        owner_id: string | null
        service_tags: string[] | string | null
      }[]
    ).map((e) => [e.id, e]),
  )

  const stateByOpp = new Map(((statesRes.data ?? []) as StateRow[]).map((s) => [s.opportunite_id, s]))
  const stageById = new Map(stages.map((s) => [s.id, s]))

  type ContactRow = {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    tel: string | null
    role_title: string | null
    entreprise_id: number | null
    is_decision_maker: boolean | null
  }
  const contacts = (contactsRes.data ?? []) as ContactRow[]
  const known = new Set(contacts.map((c) => c.id))
  const orphanIds = opps.map((o) => o.contact_id).filter((id): id is string => !!id && !known.has(id))
  if (orphanIds.length > 0) {
    const { data: extra } = await sb
      .from('contacts')
      .select('id, first_name, last_name, email, tel, role_title, entreprise_id, is_decision_maker')
      .in('id', [...new Set(orphanIds)])
    contacts.push(...((extra ?? []) as ContactRow[]))
  }
  const contactById = new Map(contacts.map((c) => [c.id, c]))
  const contactByEnt = new Map<number, ContactRow>()
  // TOUS les contacts d'une entreprise, pas seulement celui de l'affaire : c'est
  // ce qui permet à la carte de dire « à qui » on écrit quand la fiche en porte
  // plusieurs, et de proposer l'autre numéro plutôt que de choisir en silence.
  const contactsByEnt = new Map<number, ContactRow[]>()
  for (const c of contacts) {
    if (c.entreprise_id == null) continue
    const current = contactByEnt.get(c.entreprise_id)
    if (!current || (c.is_decision_maker && !current.is_decision_maker)) contactByEnt.set(c.entreprise_id, c)
    const liste = contactsByEnt.get(c.entreprise_id) ?? []
    liste.push(c)
    contactsByEnt.set(c.entreprise_id, liste)
  }

  // Inscription retenue : celle de la séquence affichée en priorité, car c'est
  // elle qui pilote les colonnes. Sinon la plus vivante.
  type EnrollRow = {
    id: string
    automation_id: string
    opportunite_id: string | null
    current_step: number
    status: string
    send_at: string | null
    hold_reason: string | null
    /** Sac de contexte de l'inscription — porte l'épingle de version. */
    vars: Record<string, unknown> | null
  }
  const enrollments = (enrollRes.data ?? []) as EnrollRow[]
  const enrollByOpp = new Map<string, EnrollRow>()
  const rank = (e: EnrollRow) => {
    const onSelected = selectedSequence && e.automation_id === selectedSequence.id ? 0 : 10
    const byStatus = e.status === 'active' ? 0 : e.status === 'paused' ? 1 : 2
    return onSelected + byStatus
  }
  /** Les séquences sur lesquelles chaque opportunité a été inscrite, un jour. */
  const sequencesByOpp = new Map<string, Set<string>>()
  for (const e of enrollments) {
    if (!e.opportunite_id) continue
    const current = enrollByOpp.get(e.opportunite_id)
    if (!current || rank(e) < rank(current)) enrollByOpp.set(e.opportunite_id, e)
    const seen = sequencesByOpp.get(e.opportunite_id) ?? new Set<string>()
    seen.add(e.automation_id)
    sequencesByOpp.set(e.opportunite_id, seen)
  }

  // Volontairement bâtie sur TOUTES les séquences : c'est la carte de relecture.
  const automationById = new Map(toutesLesSequences.map((a) => [a.id, a]))

  /** L'autre version telle que le moteur l'a posée dans la tâche. */
  const readVariantAlt = (raw: unknown): SalesTaskInfo['variantAlt'] => {
    const v = raw as { variant?: unknown; message?: unknown } | null
    if (!v || (v.variant !== 'company' && v.variant !== 'contact')) return null
    return { variant: v.variant, message: String(v.message ?? '') }
  }

  const tasksByOpp = new Map<string, SalesTaskInfo[]>()
  for (const t of (tasksRes.data ?? []) as {
    id: string
    kind: string
    step_id: string | null
    due_at: string
    payload: Record<string, unknown> | null
    opportunite_id: string | null
    assignee_id: string | null
    routing_reason: string | null
  }[]) {
    if (!t.opportunite_id) continue
    const list = tasksByOpp.get(t.opportunite_id) ?? []
    const payload = t.payload ?? {}
    list.push({
      id: t.id,
      kind: t.kind,
      stepId: t.step_id,
      dueAt: t.due_at,
      message: String(payload.message ?? payload.script ?? ''),
      scriptName: (payload.scriptName as string | undefined) ?? null,
      phone: (payload.phone as string | undefined) ?? null,
      linkedin: (payload.linkedin as string | undefined) ?? null,
      assigneeId: t.assignee_id,
      routingReason: t.routing_reason,
      // Les tâches créées avant la bascule à deux versions n'ont rien dans leur
      // payload : elles restent une version unique, ce qui est exact.
      variant: payload.variant === 'contact' ? 'contact' : 'company',
      variantAlt: readVariantAlt(payload.variantAlt),
    })
    tasksByOpp.set(t.opportunite_id, list)
  }

  const emailCount = new Map<string, number>()
  const lastExchange = new Map<string, { channel: string; at: string }>()
  // La dernière note PAR ÉTAPE : c'est ce que la carte de l'étape affiche.
  // Une seule note par prospect ne suffirait pas — la carte WhatsApp montrerait
  // ce qui s'est dit au téléphone trois jours plus tard.
  const notesByOpp = new Map<string, StepNote[]>()
  for (const log of (logsRes.data ?? []) as {
    id: string
    opportunite_id: string | null
    sent_at: string
    channel: string | null
    outcome: string | null
    step_id: string | null
    body_text: string | null
  }[]) {
    if (!log.opportunite_id) continue
    const channel = log.channel ?? 'email'
    if (channel === 'email') emailCount.set(log.opportunite_id, (emailCount.get(log.opportunite_id) ?? 0) + 1)
    if (!lastExchange.has(log.opportunite_id)) lastExchange.set(log.opportunite_id, { channel, at: log.sent_at })

    if (channel !== 'note' || !log.outcome) continue
    const list = notesByOpp.get(log.opportunite_id) ?? []
    // Les logs arrivent du plus récent au plus ancien : la première note vue
    // pour une étape est la bonne, les suivantes sont son historique.
    if (!list.some((n) => n.stepId === (log.step_id ?? null))) {
      list.push({ id: log.id, outcome: log.outcome, note: log.body_text ?? '', at: log.sent_at, stepId: log.step_id ?? null })
      notesByOpp.set(log.opportunite_id, list)
    }
  }

  const auditByOpp = new Map(
    ((auditsRes.data ?? []) as { opportunite_id: string | null; statut: string | null; demo_site_url: string | null }[])
      .filter((a) => a.opportunite_id)
      .map((a) => [a.opportunite_id as string, a]),
  )

  const siteByEnt = new Map<number, string>()
  for (const s of (sitesRes.data ?? []) as {
    enterprise_id: number | null
    is_published: boolean | null
    published_subdomain: string | null
    published_domain: string | null
    is_template: boolean | null
  }[]) {
    if (s.enterprise_id == null || s.is_template) continue
    const url = s.published_domain
      ? s.published_domain.startsWith('http')
        ? s.published_domain
        : `https://${s.published_domain}`
      : s.published_subdomain
        ? `https://${s.published_subdomain}.${SITE_DOMAIN}`
        : null
    if (url && (s.is_published || !siteByEnt.has(s.enterprise_id))) siteByEnt.set(s.enterprise_id, url)
  }

  // ── 5. Le régulateur : quand part le prochain email de chaque ligne ──────
  const regulatorView = await buildRegulatorView()
  const slotByEnrollment = new Map(regulatorView.queue.map((q) => [q.id, q]))
  const agents = regulatorView.agents.map((a) => ({ id: a.id, name: a.name, isAdmin: a.isAdmin }))
  const agentNameById = new Map(agents.map((a) => [a.id, a.name]))

  // ── 6. Montage des lignes ────────────────────────────────────────────────
  const rows: SalesBoardRow[] = opps.map((opp) => {
    const ent = opp.entreprise_id != null ? entById.get(opp.entreprise_id) : undefined
    const contact =
      (opp.contact_id ? contactById.get(opp.contact_id) : undefined) ??
      (opp.entreprise_id != null ? contactByEnt.get(opp.entreprise_id) : undefined)

    const enrollment = enrollByOpp.get(opp.id)
    let sequence: SalesSequenceInfo | null = null
    let stepsOfEnrollment: { id: string }[] = []
    if (enrollment) {
      const automation = automationById.get(enrollment.automation_id)
      const def = (automation?.definition as SequenceDefinition) ?? { steps: [] }
      const fullSteps = Array.isArray(def.steps) ? def.steps : []
      const allSteps = fullSteps.filter(estColonneVisible)
      stepsOfEnrollment = allSteps
      // `current_step` compte TOUTES les étapes, attentes comprises ; les
      // colonnes n'en montrent aucune. Sans conversion, un prospect garé après
      // son accroche WhatsApp s'affichait dans la colonne du message SUIVANT —
      // on l'aurait cru déjà envoyé.
      const visible = visibleStepPosition(fullSteps, enrollment.current_step)
      const step = fullSteps[enrollment.current_step]
      const slot = slotByEnrollment.get(enrollment.id)
      sequence = {
        enrollmentId: enrollment.id,
        automationId: enrollment.automation_id,
        name: automation?.name ?? 'Séquence',
        status:
          automation && automation.status !== 'on' && enrollment.status === 'active' ? 'paused' : enrollment.status,
        currentStep: visible,
        totalSteps: allSteps.length,
        stepKind: step?.kind ?? null,
        stepLabel: step?.label || step?.template || `Étape ${Math.max(1, visible)}`,
        sendAt: slot?.sendAt ?? enrollment.send_at,
        holdReason: (slot?.reason ?? (enrollment.hold_reason as HoldReason | null)) ?? null,
        rank: slot?.rank ?? null,
        gapMinutes: slot?.gapMinutes ?? null,
        /** L'étape courante, telle que la séquence la nomme (`s1`, `s2`…). */
        stepId: step?.id ?? null,
        variant: readVariant(enrollment.vars),
        // La relance est partie et il répond quand même — le cas le plus
        // fréquent, puisque c'est elle qui l'a réveillé. L'écran doit alors
        // proposer « il a répondu » alors que l'inscription n'attend plus rien,
        // pour la ramener sur la branche de la conversation.
        rattrapageReponse: retourVersLaReponse(fullSteps, enrollment.current_step) != null,
      }
    }

    let state = toStateRow(stateByOpp.get(opp.id))
    // Une opportunité posée sur l'étape « Perdu » du pipeline est perdue, même
    // si personne n'a cliqué dans le pipeline commercial.
    if (state.state === 'progress' && etapePerdue(opp.stage_id)) {
      state = { ...state, state: 'lost', stateReason: state.stateReason ?? 'Étape « Perdu » du pipeline' }
    }

    const position = derivePosition({
      columns,
      sequence,
      steps: sequence && selectedSequence && sequence.automationId === selectedSequence.id ? selectedSteps : stepsOfEnrollment,
      stageId: opp.stage_id,
      colonneDeLEtape,
    })
    const cells = cellStatuses(columns, position, state)
    const tasks = tasksByOpp.get(opp.id) ?? []
    // En vue d'ensemble, aucune colonne manuelle n'est affichée : c'est la tâche
    // en attente elle-même qui dit qu'il y a un geste à faire aujourd'hui.
    // Sans ça, « à faire aujourd'hui » y tombait à zéro alors que les tâches
    // existaient bel et bien.
    const hasTodo =
      columns.some((c) => isPendingTask(columns, position, state, c.id)) ||
      (position === SEQ_ANY_COLUMN_ID && state.state === 'progress' && !hasInterest(state) && tasks.length > 0)
    const ownerId = opp.owner_id ?? ent?.owner_id ?? null
    const audit = auditByOpp.get(opp.id)
    // Même règle que le régulateur : l'adresse du contact d'abord, celle de la
    // fiche entreprise ensuite. Les deux vides = prospect injoignable par email.
    const companyEmail = cleanEmail(ent?.email)
    const emailMissing = !cleanEmail(contact?.email) && !companyEmail
    const tags = Array.isArray(ent?.service_tags)
      ? ent?.service_tags.filter(Boolean).join(' · ')
      : typeof ent?.service_tags === 'string'
        ? ent.service_tags
        : null

    return {
      id: opp.id,
      name: opp.name ?? ent?.name ?? 'Opportunité',
      entrepriseId: opp.entreprise_id,
      companyName: ent?.name ?? opp.name ?? '—',
      companyUrl: ent?.site_web_canonique ?? ent?.canonical_url ?? null,
      logoUrl: ent?.logo_url ?? null,
      ville: ent?.ville ?? null,
      sector: tags,
      phone: ent?.telephone ?? contact?.tel ?? null,
      montant: opp.montant,
      type: opp.type,
      mrr: opp.mrr,
      contact: contact
        ? {
            id: contact.id,
            name: `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim() || 'Contact',
            role: contact.role_title,
            email: contact.email,
            phone: contact.tel,
          }
        : null,
      // De quoi recalculer les destinataires côté écran avec `numerosDuProspect`,
      // la seule définition de « quels numéros a ce prospect ». On envoie la
      // matière première plutôt qu'une liste déjà cuisinée : l'ordre dépend de
      // l'usage (mobile d'abord sur WhatsApp, fixe d'abord à l'appel), et la
      // colonne qu'on regarde n'est connue qu'à l'affichage.
      joignable: {
        companyPhones: [ent?.telephone ?? null, ...(ent?.telephones ?? [])].filter(
          (t): t is string => !!(t ?? '').trim(),
        ),
        contacts: (opp.entreprise_id != null ? (contactsByEnt.get(opp.entreprise_id) ?? []) : []).map((c) => ({
          id: c.id,
          first_name: c.first_name,
          last_name: c.last_name,
          tel: c.tel,
          email: c.email,
          role_title: c.role_title,
          is_decision_maker: c.is_decision_maker,
        })),
      },
      owner: ownerId ? { id: ownerId, name: agentNameById.get(ownerId) ?? 'Agent' } : null,
      companyEmail,
      emailMissing,
      stageName: opp.stage_id != null ? (stageById.get(opp.stage_id)?.nom ?? null) : null,
      sequence,
      tasks,
      emailsSent: emailCount.get(opp.id) ?? 0,
      lastExchange: lastExchange.get(opp.id) ?? null,
      notes: notesByOpp.get(opp.id) ?? [],
      auditReady: audit?.statut === 'ready',
      demoUrl: (opp.entreprise_id != null ? siteByEnt.get(opp.entreprise_id) : undefined) ?? audit?.demo_site_url ?? null,
      state,
      position,
      cells,
      hasTodo,
      archive: opp.archived_at
        ? {
            at: opp.archived_at,
            reason: opp.archive_reason ?? null,
            note: opp.archive_note ?? null,
          }
        : null,
    }
  })

  // ── 7. Filtres ───────────────────────────────────────────────────────────
  const indexOf = (id: string | null) => columns.findIndex((c) => c.id === id)
  const firstDealIndex = columns.findIndex((c) => c.group === 'pipeline')
  const needle = (query.q ?? '').trim().toLowerCase()

  // Tous les filtres SAUF celui de la partie : c'est la base des compteurs
  // d'onglets, qui doivent annoncer ce qu'on verra en cliquant dessus.
  const preFiltered = rows.filter((row) => {
    if (needle) {
      const hay = `${row.companyName} ${row.name} ${row.ville ?? ''} ${row.sector ?? ''} ${row.contact?.name ?? ''}`
      if (!hay.toLowerCase().includes(needle)) return false
    }
    if (query.view && query.view !== 'all') {
      if (query.view === 'none' ? row.owner != null : row.owner?.id !== query.view) return false
    }
    const status = query.status ?? 'actifs'
    // Les archivées ne sont visibles que sous leur propre onglet — y compris
    // sous « Tous », qui parle des états du pipeline, pas des fiches rangées.
    if (status === 'archives' ? !row.archive : !!row.archive) return false
    if (status === 'actifs' && row.state.state !== 'progress') return false
    // « RDV et + » = la ligne est passée dans le groupe pipeline.
    if (status === 'rdv' && (firstDealIndex < 0 || indexOf(row.position) < firstDealIndex)) return false
    if (status === 'won' && row.state.state !== 'won') return false
    if (status === 'closed' && row.state.state === 'progress') return false
    if (query.todoOnly && !row.hasTodo) return false
    return true
  })

  const partCounts = { sequences: {} as Record<string, number>, noSequence: 0, all: preFiltered.length }
  for (const row of preFiltered) {
    const ids = sequencesByOpp.get(row.id)
    if (!ids || ids.size === 0) {
      partCounts.noSequence++
      continue
    }
    for (const id of ids) partCounts.sequences[id] = (partCounts.sequences[id] ?? 0) + 1
  }

  const filtered = preFiltered.filter((row) => matchesPart(part, sequencesByOpp.get(row.id)))

  // ── 8. Compteurs et pagination ───────────────────────────────────────────
  const columnCounts: SalesBoardData['columnCounts'] = {}
  for (const column of columns) columnCounts[column.id] = { active: 0, done: 0 }
  for (const row of filtered) {
    for (const column of columns) {
      const status = row.cells[column.id]
      if (status === 'active') columnCounts[column.id].active++
      else if (status === 'done') columnCounts[column.id].done++
    }
  }

  // ── L'alerte « sans email » ──────────────────────────────────────────────
  // Elle porte sur TOUT le périmètre filtré, jamais sur la seule page : c'est
  // un compte qu'on veut voir tomber à zéro, pas un aperçu.
  const emailColumnIds = new Set(columns.filter((c) => c.kind === 'email').map((c) => c.id))
  // Hors vue d'une séquence précise, aucune colonne email n'est affichée : c'est
  // l'étape courante de l'inscription qui dit si la ligne est bloquée là.
  const onEmailStep = (row: SalesBoardRow) =>
    (row.position != null && emailColumnIds.has(row.position)) || row.sequence?.stepKind === 'email'
  const sequenceHasEmailStep =
    partKind(part) === 'one'
      ? emailColumnIds.size > 0
      : partKind(part) === 'all'
        ? sequenceRows.some((a) => stepsOfSequence(a).some((s) => s.kind === 'email'))
        : false
  const missingEmail: SalesMissingEmailRow[] = filtered
    .filter((row) => row.emailMissing && row.state.state === 'progress')
    .slice(0, 300)
    .map((row) => ({
      id: row.id,
      companyName: row.companyName,
      contactName: row.contact?.name ?? null,
      contactId: row.contact?.id ?? null,
      entrepriseId: row.entrepriseId,
      sequenceName: row.sequence?.name ?? null,
      onEmailStep: onEmailStep(row),
    }))

  // Les compteurs du bandeau parlent de la partie regardée, pas du CRM entier :
  // sinon « 412 actifs » au-dessus de six lignes affichées.
  const partRows = rows.filter((row) => matchesPart(part, sequencesByOpp.get(row.id)))
  const active = partRows.filter((r) => r.state.state === 'progress')
  const counts: SalesBoardCounts = {
    actifs: active.length,
    rdvPlus: firstDealIndex >= 0 ? active.filter((r) => indexOf(r.position) >= firstDealIndex).length : 0,
    won: partRows.filter((r) => r.state.state === 'won').length,
    todo: partRows.filter((r) => r.hasTodo).length,
    value: active.reduce((sum, r) => sum + (r.montant ?? 0), 0),
    missingEmail: filtered.filter((r) => r.emailMissing && r.state.state === 'progress').length,
  }

  const total = filtered.length
  const maxPage = Math.max(0, Math.ceil(total / perPage) - 1)
  const safePage = Math.min(page, maxPage)
  const pageRows = filtered.slice(safePage * perPage, safePage * perPage + perPage)

  // ── 9. Séquences proposables + état du régulateur ────────────────────────
  const sequences = sequenceRows.map((a) => {
    const def = (a.definition as SequenceDefinition) ?? { steps: [] }
    const conf = regulatorView.sequences.find((s) => s.id === a.id)
    return {
      id: a.id,
      name: a.name,
      status: a.status,
      steps: (Array.isArray(def.steps) ? def.steps : []).map((step) => ({
        id: step.id,
        kind: step.kind,
        day: step.day ?? 0,
        label: step.label || step.template || step.kind,
      })),
      windows: conf?.windows ?? regulatorView.settings.defaultWindows,
      activeEnrollments: activeByAutomation.get(a.id) ?? 0,
    }
  })

  const scopedQueue = query.ownerId
    ? regulatorView.queue.filter((q) => q.ownerId === query.ownerId)
    : regulatorView.queue
  const nextSend = scopedQueue.find((q) => q.sendAt != null)

  return {
    ok: true,
    data: {
      rows: pageRows,
      total,
      page: safePage,
      perPage,
      counts,
      columns,
      columnCounts,
      missingEmail,
      sequenceHasEmailStep,
      pipelines,
      selectedPipelineId: selectedPipeline?.id ?? ALL_PIPELINES,
      selectedSequenceId: selectedSequence?.id ?? null,
      selectedPart: part,
      partCounts,
      agents,
      sequences,
      sequenceAcces,
      regulator: {
        paused: regulatorView.settings.paused,
        testMode: regulatorView.settings.testMode,
        gapMinMinutes: regulatorView.settings.gapMinMinutes,
        gapMaxMinutes: regulatorView.settings.gapMaxMinutes,
        dailyCap: regulatorView.settings.dailyCap,
        sentToday: regulatorView.sentToday,
        timezone: regulatorView.settings.timezone,
        openWindows: regulatorView.openWindows,
        queued: scopedQueue.filter((q) => q.sendAt != null).length,
        blocked: scopedQueue.filter((q) => q.sendAt == null).length,
        nextSendAt: nextSend?.sendAt ?? null,
      },
      queue: scopedQueue,
    },
  }
}
