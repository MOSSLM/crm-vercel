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
 *   · une étape posée sur la voie « il a répondu » D'UNE ATTENTE-RÉPONSE
 *     n'existe que parce que le prospect a répondu — c'est une discussion, par
 *     construction ;
 *   · sinon, une étape est une discussion si une attente-réponse la précède ET
 *     que cette attente a réellement été levée (`vars.replies`). La condition
 *     sur `replies` compte : une attente-réponse peut expirer
 *     (`replyTimeoutDays`) et la séquence reprendre SANS que personne n'ait
 *     répondu. Ce message-là est une relance à froid, il rentre dans le quota.
 *
 * `on` EST UN NOM DE SORTIE, PAS UN SENS — LA FOURCHE SEULE LE DONNE
 * `branch.on` ne vaut pas « le prospect a répondu » : c'est le NOM DE LA
 * PREMIÈRE SORTIE de la fourche visée (cf. `src/lib/automations/branches.ts`).
 * Sur une attente-réponse elle se lit « il a répondu » ; sur une CONDITION elle
 * se lit « oui » ; sur un AIGUILLAGE ce n'est qu'un cas parmi N. Le même octet,
 * trois sens. Il faut donc toujours résoudre `branch.waitId` avant de conclure.
 *
 * Ce qu'a coûté l'oubli, le 28/08/2026 : la voie « oui » de la condition
 * d'entrée de « S1 — Premier contact » porte `on: 'reply'`, et c'est le TOUT
 * PREMIER WhatsApp — un premier contact par définition. Les neuf de la journée
 * étaient classés « en discussion », donc rangés dans l'onglet des relances au
 * lieu des premiers contacts, invisibles au milieu de cent autres ; et comme
 * les canaux en discussion ne consomment aucune place, ils échappaient au même
 * moment au compteur de cadence. Trois séquences actives sur trois portaient le
 * défaut.
 */

/** Ce que ce module a besoin de savoir d'une étape — rien de plus. */
export type ConversationStep = {
  id?: string;
  kind?: string;
  waitMode?: string | null;
  branch?: { waitId?: string; on?: string } | null;
};

/**
 * Cette étape est-elle une ATTENTE DE RÉPONSE — la seule fourche dont une voie
 * dise quelque chose du prospect plutôt que de sa fiche ?
 *
 * Même définition qu'`estAttenteReponse` dans `src/lib/automations/branches.ts`,
 * réécrite ici et non importée : ce module est pur et ne connaît d'une étape
 * que les quatre champs ci-dessus, là où `branches.ts` type sur `SequenceStep`
 * entier. Deux champs, une seule règle — si elle change, elle change aux deux
 * endroits.
 */
const attendUneReponse = (step: ConversationStep | undefined): boolean =>
  !!step && step.kind === "wait" && step.waitMode === "reply";

/**
 * La fourche dont cette étape suit une voie, ou `undefined`.
 *
 * Une voie dont la fourche est INTROUVABLE ne se devine pas : le cas a pu être
 * supprimé de la séquence (cf. « voie orpheline » dans `branches.ts`). On rend
 * `undefined`, l'appelant retombe sur la lecture des attentes en amont — ce qui
 * classe l'étape en premier contact plutôt qu'en discussion. C'est le bon
 * défaut : compter une place de démarchage de trop se voit et se corrige, ne
 * pas la compter fausse la cadence en silence.
 */
const fourcheDe = (
  steps: readonly ConversationStep[],
  step: ConversationStep | undefined,
): ConversationStep | undefined => {
  const waitId = step?.branch?.waitId;
  return waitId == null ? undefined : steps.find((s) => s.id === waitId);
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

  // La voie « il a répondu » d'une ATTENTE n'est jamais atteinte autrement.
  // Celle d'une condition ou d'un aiguillage, si — voir l'en-tête.
  const etape = steps[stepIndex];
  if (etape?.branch?.on === "reply" && attendUneReponse(fourcheDe(steps, etape))) return true;

  for (let i = 0; i < stepIndex; i++) {
    const s = steps[i];
    // La clé est l'identifiant de l'étape depuis le 20/08/2026, son rang avant.
    // Chercher les deux, sinon une réponse notée hier deviendrait invisible dès
    // qu'on insère une étape au-dessus (cf. `cleDeFourche`).
    const note = s?.id != null ? (replies[s.id] ?? replies[String(i)]) : replies[String(i)];
    if (attendUneReponse(s) && note) return true;
  }
  return false;
}
