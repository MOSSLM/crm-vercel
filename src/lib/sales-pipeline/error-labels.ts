/**
 * Les codes d'erreur du pipeline commercial, en français.
 *
 * Les routes répondent des codes (`sequence_inactive`, `motif_requis`…) : c'est
 * ce qu'il faut pour un contrat d'API, mais pas ce qu'on montre. Chaque écran
 * qui appelait ces routes retraduisait de son côté — ou ne traduisait pas du
 * tout, et le tableau marketing affichait `sequence_inactive` tel quel, quand
 * il ne se contentait pas d'annoncer « 1 inscription en échec ». La table vit
 * donc ici, une fois, partagée par les deux surfaces.
 */
export const ERROR_LABELS: Record<string, string> = {
  motif_requis: 'Un motif est obligatoire.',
  date_de_relance_requise: 'Choisissez une date de relance.',
  prospect_non_attribue: 'Ce prospect ne vous est pas attribué.',
  sequence_non_assignee: 'Cette séquence ne vous a pas été attribuée.',
  sequence_inactive: 'Séquence inactive — activez-la dans Automatisations › Séquences.',
  sequence_introuvable: 'Séquence introuvable.',
  aucune_inscription: 'Ce prospect n’est inscrit dans aucune séquence.',
  aucun_pipeline: 'Aucun pipeline configuré.',
  introuvable: 'Introuvable.',
  email_invalide: 'Cette adresse email n’est pas valide.',
  aucune_fiche: 'Ce prospect n’a ni entreprise ni contact où enregistrer l’adresse.',
  cible_manquante: 'Aucune fiche visée par cette action.',
  invalid_body: 'Requête invalide.',
  internal_error: 'Erreur interne — réessayez.',
}

/**
 * Le message à afficher pour un code d'erreur d'API.
 *
 * `sequenceName` nomme la séquence quand l'appelant la connaît : sur une action
 * de masse répartie entre plusieurs séquences, « Séquence inactive » sans nom
 * n'indique pas laquelle aller activer.
 */
export function errorLabel(code: unknown, sequenceName?: string | null): string {
  if (typeof code !== 'string') return 'Action impossible'
  const label = ERROR_LABELS[code]
  if (!label) return 'Action impossible'
  if (sequenceName && code.startsWith('sequence_')) return `« ${sequenceName} » — ${label}`
  return label
}
