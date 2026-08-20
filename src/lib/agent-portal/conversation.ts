/**
 * Premier contact, ou message dans une discussion déjà ouverte ? — pur, sans
 * base ni React.
 *
 * POURQUOI CETTE FRONTIÈRE EXISTE
 * La cadence quotidienne plafonne le DÉMARCHAGE : vingt entreprises abordées
 * par jour. Elle n'a jamais eu vocation à plafonner les échanges avec celles
 * qui ont répondu — répondre à un message coûte une minute, et faire attendre
 * un prospect qui vient d'écrire est exactement la façon de le perdre.
 *
 * IL FAUT QUE LA RÉPONSE SOIT UNE PROPRIÉTÉ DE L'ÉTAPE, PAS DE L'INSTANT
 * Le premier réflexe — « l'inscription a-t-elle enregistré une réponse ? » — se
 * retourne contre le compteur : un premier contact envoyé ce matin cesserait
 * d'avoir consommé sa place dès que le prospect répond l'après-midi, et la
 * journée se rouvrirait toute seule. On regarde donc la POSITION de l'étape
 * dans la séquence, qui elle ne bouge pas :
 *
 *   · une étape marquée `branch.on === 'reply'` n'existe que parce que le
 *     prospect a répondu — c'est une discussion, par construction ;
 *   · sinon, une étape est une discussion si une attente-réponse la précède ET
 *     que cette attente a réellement été levée (`vars.replies`). La condition
 *     sur `replies` compte : une attente-réponse peut expirer
 *     (`replyTimeoutDays`) et la séquence reprendre SANS que personne n'ait
 *     répondu. Ce message-là est une relance à froid, il rentre dans le quota.
 */

/** Ce que ce module a besoin de savoir d'une étape — rien de plus. */
export type ConversationStep = {
  id?: string;
  kind?: string;
  waitMode?: string | null;
  branch?: { waitId?: string; on?: string } | null;
};

/**
 * L'étape `stepIndex` de cette séquence tombe-t-elle dans une discussion ouverte ?
 *
 * `replies` est `vars.replies` de l'inscription : index d'étape d'attente →
 * instant du clic « le prospect a répondu » (cf. `readReplies`).
 */
export function stepIsInConversation(
  steps: readonly ConversationStep[],
  stepIndex: number,
  replies: Readonly<Record<string, string>>,
): boolean {
  if (stepIndex < 0 || stepIndex >= steps.length) return false;

  // Une étape de la branche « il a répondu » n'est jamais atteinte autrement.
  if (steps[stepIndex]?.branch?.on === "reply") return true;

  for (let i = 0; i < stepIndex; i++) {
    const s = steps[i];
    // La clé est l'identifiant de l'étape depuis le 20/08/2026, son rang avant.
    // Chercher les deux, sinon une réponse notée hier deviendrait invisible dès
    // qu'on insère une étape au-dessus (cf. `cleDeFourche`).
    const note = s?.id != null ? (replies[s.id] ?? replies[String(i)]) : replies[String(i)];
    if (s?.kind === "wait" && s.waitMode === "reply" && note) return true;
  }
  return false;
}
