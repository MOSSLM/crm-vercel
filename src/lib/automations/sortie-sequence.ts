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
  motif === 'hors_canal' || motif === 'reattribution'

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
    default:
      return null
  }
}
