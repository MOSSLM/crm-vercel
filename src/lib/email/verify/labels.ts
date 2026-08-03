// labels.ts — les mots que l'interface met sur les verdicts.
//
// Séparé du moteur pour une raison concrète : `score.ts` tire `domains.ts`, qui
// tire 130 Ko de domaines jetables. Ce fichier-ci n'importe que des TYPES
// (effacés à la compilation), donc un composant client peut l'utiliser sans
// embarquer quoi que ce soit.
//
// Les libellés sont volontairement descriptifs plutôt que techniques : dans la
// file du régulateur comme dans le pipeline, on doit comprendre POURQUOI un
// email n'est pas parti sans avoir lu le code.

import type { SubStatus, VerificationStatus } from './score'

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  valid: 'Vérifiée',
  risky: 'Douteuse',
  invalid: 'Invalide',
  unknown: 'Indéterminée',
  pending: 'À vérifier',
}

/** Résumé d'une ligne, à côté de la pastille. */
export const STATUS_HINT: Record<VerificationStatus, string> = {
  valid: 'rien à signaler — envoi normal',
  risky: 'signal négatif — envoi au compte-gouttes',
  invalid: 'ne recevra pas — aucun envoi',
  unknown: 'verdict impossible pour l’instant — nouvel essai bientôt',
  pending: 'jamais vérifiée — en file',
}

/** Couleur de la pastille, dans le vocabulaire déjà utilisé par le CRM. */
export const STATUS_TONE: Record<VerificationStatus, 'ok' | 'warn' | 'bad' | 'mute'> = {
  valid: 'ok',
  risky: 'warn',
  invalid: 'bad',
  unknown: 'mute',
  pending: 'mute',
}

export const SUB_STATUS_LABEL: Record<SubStatus, string> = {
  syntaxe: 'adresse mal formée',
  jetable: 'adresse jetable',
  boite_automatique: 'boîte automatique — personne ne la lit',
  domaine_mort: 'le domaine n’existe pas',
  sans_mx: 'aucun serveur mail déclaré',
  parking: 'domaine en parking',
  domaine_suspect: 'une autre adresse du domaine a rebondi',
  bounce_dur: 'a rebondi — la boîte n’existe pas',
  bounce_doux: 'rebonds temporaires répétés',
  plainte: 'a signalé nos emails comme indésirables',
  desabonne: 'désabonnée',
  dns_muet: 'le DNS n’a pas répondu',
  prouvee: 'a déjà reçu nos emails',
  mx_ok: 'domaine joignable',
}
