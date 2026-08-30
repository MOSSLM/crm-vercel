// sortie-sequence.ts — pourquoi une inscription est sortie de sa séquence.
//
// `status = 'exited'` ne dit RIEN de la suite, et deux situations opposées s'y
// écrivent pareil :
//
//   « le numéro n'a pas de compte WhatsApp »  →  personne n'a rien reçu, le
//     prospect est intact, il reste entièrement à démarcher ;
//   « pas intéressé », « bloqué »             →  quelqu'un a répondu non, le
//     redémarcher serait insistant.
//
// Confondre les deux a un coût dans chaque sens : ranger le premier avec les
// démarchés perd un prospect neuf, remettre le second au stock le relance
// après un refus. D'où ce motif, écrit au moment de la sortie — c'est le seul
// instant où on le connaît.
//
// Module PUR : ni base, ni React. Le moteur l'écrit, le tableau le lit, et la
// règle ne vit qu'ici.

/** Pourquoi une inscription a été fermée. */
export type MotifSortie =
  /** Le canal ne menait nulle part (pas de compte WhatsApp, pas de LinkedIn). */
  | 'hors_canal'
  /** Le prospect a dit non, ou l'affaire s'est close côté commercial. */
  | 'stop'
  /** Retirée à son agent : le démarchage reprendra, ailleurs. */
  | 'reattribution'
  /** La fiche a été rangée — la question du démarchage ne se pose plus. */
  | 'archive'
  /**
   * Passé à une AUTRE séquence : le démarchage continue, ailleurs.
   *
   * Ne renvoie PAS au stock — contrairement à `reattribution`, où plus rien ne
   * tourne pour ce prospect. Ici une inscription est déjà ouverte en face ; le
   * remettre à démarcher le ferait ré-inscrire une seconde fois.
   */
  | 'transfert'
  /**
   * Le métier est mis de côté : on ne vend pas à ce prospect aujourd'hui.
   * NE RETOURNE PAS AU STOCK — c'est tout l'objet de la décision. Le jour où le
   * gabarit sait servir ce métier, ces fiches se réinscrivent par le geste qui
   * les rouvre, pas en réapparaissant toutes seules.
   */
  | 'metier_mis_de_cote'
  /**
   * Déchet de la phase de test : le régulateur retenait l'envoi parce que le
   * destinataire n'était pas une adresse de test. RIEN N'EST PARTI, donc le
   * prospect est intact et retourne au stock — l'oublier dans les démarchés
   * perdrait 42 fiches neuves (relevé du 30/08/2026).
   */
  | 'test'

/**
 * Cette sortie laisse-t-elle le prospect à démarcher ?
 *
 * `true` quand RIEN ne lui est parvenu : le canal était mort, ou on lui a
 * simplement changé d'agent. Ces lignes-là appartiennent au stock, au même
 * titre que celles jamais inscrites — c'est tout l'intérêt de garder le motif.
 *
 * Un motif inconnu (`null`, ou une valeur écrite par une version plus récente)
 * est traité comme un ARRÊT : mieux vaut oublier un prospect dans les démarchés
 * que relancer quelqu'un qui a dit non.
 */
export const sortieARedemarcher = (motif: string | null | undefined): boolean =>
  motif === 'hors_canal' || motif === 'reattribution' || motif === 'test'

/**
 * Le motif en clair, pour la carte du tableau. `null` si on ne sait pas — une
 * inscription fermée avant que la colonne existe, et qu'on ne veut pas
 * qualifier après coup.
 */
export const motifSortieLabel = (motif: string | null | undefined): string | null => {
  switch (motif) {
    case 'hors_canal':
      return 'pas joignable sur ce canal'
    case 'stop':
      return 'arrêtée — le prospect a dit non'
    case 'reattribution':
      return 'retirée à son agent'
    case 'archive':
      return 'fiche archivée'
    case 'transfert':
      return 'passée à une autre séquence'
    case 'metier_mis_de_cote':
      return 'métier mis de côté'
    case 'test':
      return 'retenue par la phase de test — rien n’est parti'
    default:
      return null
  }
}
