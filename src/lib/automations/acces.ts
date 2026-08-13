// acces.ts — qui voit quelle séquence.
//
// CE QU'IL Y AVAIT, ET POURQUOI ÇA NE MARCHAIT PAS
// La table `sequence_agent_assignments` existe depuis
// `sql/20260703_sequence_agent_assignments.sql`, et deux routes s'en servaient
// déjà pour REFUSER une mise en séquence (403 `sequence_non_assignee`). Mais :
//
//   · le tableau commercial de l'agent listait TOUTES les séquences, sans
//     jamais lire cette table. L'agent voyait donc des séquences qu'il ne
//     pouvait pas lancer, et ne l'apprenait qu'au clic ;
//   · la table est vide en production — aucune attribution n'a jamais été
//     faite. Le refus par défaut ne protégeait donc rien : il interdisait
//     TOUT à TOUT LE MONDE. C'est la raison pour laquelle un agent ne pouvait
//     mettre personne en séquence depuis son pipeline.
//
// LA RÈGLE, DÉSORMAIS PORTÉE PAR LA SÉQUENCE ELLE-MÊME
// Le refus par défaut est une décision, pas un état par omission. Chaque
// séquence dit donc ce qu'elle est :
//
//     settings.acces = 'tous'    (défaut) — tous les agents la voient
//     settings.acces = 'choisis'          — seuls les agents nommés la voient
//
// L'absence de la clé vaut « tous » : rien ne se referme dans le dos de
// personne, et restreindre reste un geste explicite de l'admin. La liste des
// agents nommés vit dans `sequence_agent_assignments`, inchangée.
//
// UN SEUL ENDROIT
// Cette règle décide à la fois de ce qu'on VOIT (tableau commercial, pipeline
// marketing, espace agent) et de ce qu'on PEUT LANCER (les gardes d'inscription).
// Les deux ne peuvent plus diverger : une séquence proposée est une séquence
// lançable, et l'inverse.
//
// Module PUR : ni base, ni React. `chargerAcces` prend le client en argument.

import type { SequenceSettings } from '@/components/automations/types'

/** Ce que la séquence déclare sur son public interne. */
export type ModeAcces = 'tous' | 'choisis'

/** Une ligne de `sequence_agent_assignments`, réduite à ce qui décide. */
export interface AttributionSequence {
  automation_id: string
  agent_id: string
}

/** Le minimum qu'une séquence doit porter pour qu'on tranche. */
export interface SequenceAcces {
  id: string
  settings?: SequenceSettings | null
}

export const MODE_ACCES_LABEL: Readonly<Record<ModeAcces, { titre: string; aide: string }>> = {
  tous: {
    titre: 'Tous les agents',
    aide: 'Chaque agent la voit dans son pipeline commercial et peut la lancer sur ses prospects.',
  },
  choisis: {
    titre: 'Agents choisis',
    aide: 'Seuls les agents cochés la voient. Les autres ne l’ont ni dans leurs onglets, ni dans le lanceur.',
  },
}

/**
 * Le mode déclaré par la séquence. Tout ce qui n'est pas explicitement
 * `choisis` vaut `tous` : une valeur inconnue en base (réglage écrit à la main,
 * migration future) ne doit pas fermer l'accès par accident.
 */
export function modeAcces(settings: SequenceSettings | null | undefined): ModeAcces {
  return settings?.acces === 'choisis' ? 'choisis' : 'tous'
}

/**
 * Les agents nommés, séquence par séquence.
 *
 * Une `Map` plutôt qu'un filtre à la volée : le tableau commercial tranche pour
 * une dizaine de séquences à chaque chargement, et repasser la liste complète
 * des attributions à chaque fois est le genre de détail qui ne se voit qu'à
 * cinquante agents.
 */
export function agentsParSequence(rows: AttributionSequence[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!row?.automation_id || !row.agent_id) continue
    const set = map.get(row.automation_id) ?? new Set<string>()
    set.add(row.agent_id)
    map.set(row.automation_id, set)
  }
  return map
}

/** Les séquences nommément attribuées à cet agent. */
export function sequencesDeLAgent(rows: AttributionSequence[], agentId: string): Set<string> {
  const set = new Set<string>()
  for (const row of rows) {
    if (row?.agent_id === agentId && row.automation_id) set.add(row.automation_id)
  }
  return set
}

/**
 * Cet agent a-t-il accès à cette séquence ?
 *
 * `agentId` à `null` = l'admin : il voit tout, y compris les séquences
 * restreintes — c'est lui qui les restreint.
 */
export function agentPeutVoir(
  sequence: SequenceAcces,
  agentId: string | null,
  parSequence: Map<string, Set<string>>,
): boolean {
  if (!agentId) return true
  if (modeAcces(sequence.settings) === 'tous') return true
  return parSequence.get(sequence.id)?.has(agentId) ?? false
}

/**
 * La liste réduite à ce que cet agent a le droit de voir, dans l'ordre reçu.
 *
 * Renvoie le tableau tel quel côté admin — pas de copie inutile, et surtout pas
 * de risque d'y perdre une séquence par recopie partielle.
 */
export function filtrerPourAgent<T extends SequenceAcces>(
  sequences: T[],
  agentId: string | null,
  parSequence: Map<string, Set<string>>,
): T[] {
  if (!agentId) return sequences
  return sequences.filter((s) => agentPeutVoir(s, agentId, parSequence))
}

/**
 * Ce qu'on affiche dans la liste des séquences, en une ligne.
 *
 * « Tous les agents » et « 2 agents » ne se lisent pas de la même façon :
 * le premier est un état ouvert, le second une décision. Le cas qui compte est
 * le troisième — restreinte à personne, donc invisible pour tout le monde, et
 * on le dit avec ces mots-là plutôt qu'avec « 0 agent ».
 */
export function libelleAcces(mode: ModeAcces, nbAgents: number): string {
  if (mode === 'tous') return 'Tous les agents'
  if (nbAgents === 0) return 'Aucun agent'
  return `${nbAgents} agent${nbAgents > 1 ? 's' : ''}`
}

/**
 * Chargement des attributions depuis Supabase.
 *
 * Le client est passé en argument : ce module reste importable depuis le
 * navigateur (la liste des séquences s'en sert pour afficher l'accès) sans
 * embarquer la clé de service.
 *
 * Ne lève jamais. Si la table manque — migration non jouée sur un environnement
 * neuf — on renvoie une carte vide, ce qui laisse passer les séquences en
 * `tous` et n'ouvre rien de plus qu'avant. Refuser bruyamment ici viderait le
 * tableau commercial de tout le monde pour une table absente.
 */
export async function chargerAcces(sb: {
  from: (table: string) => {
    select: (cols: string) => PromiseLike<{ data: unknown; error: unknown }>
  }
}): Promise<Map<string, Set<string>>> {
  try {
    const { data } = await sb.from('sequence_agent_assignments').select('automation_id, agent_id')
    return agentsParSequence((data ?? []) as AttributionSequence[])
  } catch {
    return new Map()
  }
}
