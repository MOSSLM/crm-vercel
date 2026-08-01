// task-routing.ts — à qui revient une tâche manuelle (WhatsApp, LinkedIn, appel).
//
// Un message WhatsApp n'est jamais envoyé par le CRM : wa.me n'a pas d'API
// d'envoi. La séquence le PRÉPARE, puis le pose dans la file de la bonne
// personne. La règle est réglable globalement (`regulator_settings`) :
//
//   pref   — l'agent propriétaire du contact de préférence ; si sa file du jour
//            est pleine ou s'il est indisponible, l'admin prend le relais ;
//   strict — tout reste chez l'agent propriétaire, la tâche l'attend ;
//   admin  — rien n'est distribué, l'admin traite et redistribue à la main.
//
// Dans tous les cas, une tâche sans propriétaire identifiable finit chez
// l'admin : elle ne reste jamais orpheline.

import type { TaskRoutingMode } from './regulator'

export interface RoutingCandidate {
  /** Agent propriétaire de l'entreprise (`entreprises.owner_id`). */
  ownerId: string | null
  /** Agent qui a lancé la séquence (`sequence_enrollments.created_by`). */
  createdBy?: string | null
  /** Propriétaire de l'opportunité, dernier repli avant l'admin. */
  opportunityOwnerId?: string | null
}

export interface RoutingContext {
  mode: TaskRoutingMode
  maxPerAgent: number
  /** Admin destinataire par défaut. `null` → la tâche reste non assignée. */
  adminId: string | null
  /** Nombre de tâches en attente par agent, avant ce routage. */
  loads: Map<string, number>
  /** Agents momentanément indisponibles (absence déclarée, compte désactivé). */
  unavailable?: Set<string>
}

export interface RoutingDecision {
  assigneeId: string | null
  /** Phrase courte affichée sur la carte de tâche : pourquoi elle est là. */
  reason: string
}

/**
 * Propriétaire retenu pour la tâche. On privilégie le propriétaire de
 * l'entreprise (c'est lui qui suit le prospect), puis celui qui a lancé la
 * séquence, puis le propriétaire de l'opportunité.
 */
function resolveOwner(candidate: RoutingCandidate): string | null {
  return candidate.ownerId ?? candidate.createdBy ?? candidate.opportunityOwnerId ?? null
}

export function routeTask(candidate: RoutingCandidate, ctx: RoutingContext): RoutingDecision {
  const admin = ctx.adminId
  const owner = resolveOwner(candidate)

  if (ctx.mode === 'admin') {
    return { assigneeId: admin, reason: 'règle : tout à l’admin' }
  }
  if (!owner) {
    return { assigneeId: admin, reason: 'aucun propriétaire → admin' }
  }
  if (ctx.mode === 'strict') {
    const waiting = ctx.unavailable?.has(owner) ?? false
    return {
      assigneeId: owner,
      reason: waiting ? 'propriétaire — la tâche attend son retour' : 'propriétaire du contact',
    }
  }

  // mode « pref » : l'admin est un filet de sécurité, pas un dépotoir.
  if (ctx.unavailable?.has(owner)) {
    return { assigneeId: admin, reason: 'propriétaire indisponible → admin' }
  }
  const load = ctx.loads.get(owner) ?? 0
  if (load >= ctx.maxPerAgent) {
    return { assigneeId: admin, reason: `file du propriétaire pleine (${ctx.maxPerAgent}) → admin` }
  }
  return { assigneeId: owner, reason: 'propriétaire du contact' }
}

/**
 * Route un lot de tâches en tenant compte des charges qui s'accumulent au fur
 * et à mesure : la 9ᵉ tâche du jour d'un agent plafonné à 8 bascule chez
 * l'admin, pas seulement celles qui dépassaient déjà au départ.
 */
export function routeBatch<T extends RoutingCandidate>(
  candidates: T[],
  ctx: RoutingContext,
): Array<T & RoutingDecision> {
  const loads = new Map(ctx.loads)
  return candidates.map((candidate) => {
    const decision = routeTask(candidate, { ...ctx, loads })
    if (decision.assigneeId) loads.set(decision.assigneeId, (loads.get(decision.assigneeId) ?? 0) + 1)
    return { ...candidate, ...decision }
  })
}

export const ROUTING_MODE_LABEL: Record<TaskRoutingMode, string> = {
  pref: 'Agent propriétaire — de préférence',
  strict: 'Strictement l’agent propriétaire',
  admin: 'Tout à l’admin',
}

export const ROUTING_MODE_HINT: Record<TaskRoutingMode, string> = {
  pref: 'La tâche part chez l’agent qui suit le contact. Si sa file est pleine ou s’il est indisponible, l’admin prend le relais.',
  strict: 'Tout reste chez l’agent, même absent — la tâche l’attend. Seuls les contacts sans propriétaire vont à l’admin.',
  admin: 'Aucune tâche n’est distribuée : l’admin traite et redistribue à la main.',
}
