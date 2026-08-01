// stages.ts — le modèle des huit colonnes du pipeline commercial.
//
// Trois moteurs avancent en parallèle et se lisent sur une seule ligne :
//   • la SÉQUENCE décide quoi envoyer et dans quel ordre  → colonnes 1 à 4
//   • le RÉGULATEUR décide quand l'email part réellement  → colonne 2
//   • le COMMERCIAL prend la main une fois le prospect en face → colonnes 5 à 8
//
// Partagé serveur/client : l'API en dérive l'état des cellules, l'interface s'en
// sert pour le rendu. Une seule définition, donc pas de dérive entre les deux.

export const SALES_STAGE_IDS = ['seq', 'email', 'wa', 'call', 'rdv', 'propo', 'nego', 'signe'] as const
export type SalesStageId = (typeof SALES_STAGE_IDS)[number]

/**
 * `auto`   : le moteur agit seul (le régulateur envoie).
 * `manual` : la séquence crée une tâche, un humain la fait.
 * `deal`   : décision commerciale, jamais automatisée.
 */
export type SalesStageMode = 'auto' | 'manual' | 'deal'

export interface SalesStageDef {
  id: SalesStageId
  name: string
  short: string
  color: string
  mode: SalesStageMode
  cta: string
}

export const SALES_STAGES: SalesStageDef[] = [
  { id: 'seq', name: 'Séquence', short: 'En séquence', color: '#7A5AE0', mode: 'deal', cta: 'Mettre en séquence' },
  { id: 'email', name: 'Email', short: 'Email', color: '#2A6FDB', mode: 'auto', cta: 'Voir la file d’envoi' },
  { id: 'wa', name: 'WhatsApp', short: 'WhatsApp', color: '#1F8A5B', mode: 'manual', cta: 'Ouvrir WhatsApp' },
  { id: 'call', name: 'Appel', short: 'Appelé', color: '#C8881F', mode: 'manual', cta: 'Ouvrir le cockpit d’appel' },
  { id: 'rdv', name: 'RDV', short: 'RDV', color: '#E2552B', mode: 'deal', cta: 'Caler le RDV' },
  { id: 'propo', name: 'Proposition', short: 'Proposition', color: '#2B7FB8', mode: 'deal', cta: 'Envoyer la proposition' },
  { id: 'nego', name: 'Négociation', short: 'Négo', color: '#A24E86', mode: 'deal', cta: 'Relancer la négociation' },
  { id: 'signe', name: 'Signature', short: 'Signé', color: '#1F8A5B', mode: 'deal', cta: 'Marquer comme signé' },
]

export const stageById = (id: string): SalesStageDef | undefined => SALES_STAGES.find((s) => s.id === id)
export const stageIndex = (id: string): number => SALES_STAGE_IDS.indexOf(id as SalesStageId)

/** Étape suivante, sans jamais dépasser la dernière. */
export function nextStage(id: string): SalesStageId {
  const i = stageIndex(id)
  return SALES_STAGE_IDS[Math.min(Math.max(i, 0) + 1, SALES_STAGE_IDS.length - 1)]
}

/** Colonne visée par une étape de séquence. LinkedIn partage la colonne « message manuel ». */
export function stageForStepKind(kind: string | null | undefined): SalesStageId | null {
  switch (kind) {
    case 'email':
      return 'email'
    case 'whatsapp':
    case 'linkedin':
    case 'task':
      return 'wa'
    case 'call':
      return 'call'
    default:
      return null
  }
}

export type SalesRowState = 'progress' | 'nurt' | 'lost' | 'black' | 'won'

/** État d'une cellule de la matrice. */
export type CellStatus = 'done' | 'active' | 'locked' | 'skip' | 'lost' | 'black' | 'nurt'

export interface SalesStateRow {
  reached: SalesStageId
  passed: SalesStageId[]
  skipped: SalesStageId[]
  skipReason: string | null
  state: SalesRowState
  stateReason: string | null
  nurtureAt: string | null
  replied: boolean
  rdvAt: string | null
  propoAmount: number | null
  objection: string | null
  stageDates: Partial<Record<SalesStageId, string>>
}

export const EMPTY_STATE: SalesStateRow = {
  reached: 'seq',
  passed: [],
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
 * Le pointeur est MONOTONE : `passed` mémorise ce qui a été franchi, si bien
 * qu'une séquence repassant par un email après un WhatsApp ne re-verrouille pas
 * la colonne WhatsApp — elle reste « faite ».
 */
export function cellStatuses(state: SalesStateRow): Record<SalesStageId, CellStatus> {
  const reachedIdx = stageIndex(state.reached)
  const out = {} as Record<SalesStageId, CellStatus>

  for (let i = 0; i < SALES_STAGE_IDS.length; i++) {
    const id = SALES_STAGE_IDS[i]
    if (state.skipped.includes(id)) {
      out[id] = 'skip'
      continue
    }
    if (state.state === 'won') {
      out[id] = 'done'
      continue
    }
    if (i < reachedIdx || (state.passed.includes(id) && i !== reachedIdx)) {
      out[id] = 'done'
      continue
    }
    if (i === reachedIdx) {
      out[id] = state.state === 'progress' ? 'active' : state.state
      continue
    }
    out[id] = 'locked'
  }
  return out
}

/**
 * Le prospect a déjà montré un signe de vie : insister par WhatsApp ou par
 * téléphone n'a plus de sens, on passe au rendez-vous.
 */
export const hasInterest = (state: SalesStateRow): boolean => state.replied

/** La cellule attend une action humaine aujourd'hui. */
export function isPendingTask(state: SalesStateRow, stage: SalesStageId): boolean {
  if (stage !== 'wa' && stage !== 'call') return false
  if (state.state !== 'progress') return false
  return cellStatuses(state)[stage] === 'active' && !hasInterest(state)
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
