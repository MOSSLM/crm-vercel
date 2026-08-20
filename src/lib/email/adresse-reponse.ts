// adresse-reponse.ts — l'adresse à laquelle un prospect répond, et le chemin du
// retour.
//
// POURQUOI CE MODULE EXISTE
// Aujourd'hui, un email de séquence part sans `Reply-To` : la réponse arrive
// dans la boîte de l'expéditeur, où le CRM ne la voit pas, et surtout où **rien
// ne dit à quelle inscription elle répond**. Retrouver l'inscription après coup,
// à partir de l'adresse et du sujet, est une heuristique qui se trompe dès
// qu'un prospect écrit depuis une autre adresse ou change l'objet.
//
// Le sous-adressage règle ça : on écrit depuis `reponses+<inscription>@domaine`,
// et le retour porte l'identifiant dans son propre destinataire. Aucun en-tête
// à faire survivre, aucun client de messagerie à qui faire confiance.
//
// LE POINT À NE PAS MANQUER : cela ne se rattrape pas. Un email déjà parti sans
// `Reply-To` ne pourra jamais être apparié, quoi qu'on construise plus tard.
// C'est la raison pour laquelle ce module existe avant l'inbox.
//
// Les deux fonctions vont par paire : `adresseDeReponse` écrit, `inscriptionDepuisAdresse`
// relit. Les séparer les ferait diverger.

/**
 * Le sous-adressage n'est pas universel : Gmail, Microsoft 365, Fastmail et la
 * plupart des serveurs modernes le comprennent, quelques hébergeurs anciens non.
 * D'où le repli sur l'adresse nue quand on n'a pas d'inscription à encoder :
 * mieux vaut une réponse qu'on lira sans savoir d'où elle vient qu'une réponse
 * qui rebondit.
 */
export function adresseDeReponse(base: string | null | undefined, inscriptionId?: string | null): string | null {
  const propre = (base ?? '').trim().toLowerCase()
  if (!propre || !propre.includes('@')) return null

  const [locale, domaine] = propre.split('@')
  if (!locale || !domaine) return null

  // Une base déjà sous-adressée (`reponses+truc@…`) serait doublement suffixée.
  const racine = locale.split('+')[0]
  if (!inscriptionId) return `${racine}@${domaine}`

  const jeton = jetonSur(inscriptionId)
  return jeton ? `${racine}+${jeton}@${domaine}` : `${racine}@${domaine}`
}

/**
 * L'identifiant d'inscription porté par une adresse de retour, ou `null`.
 *
 * Utilisée par la voie d'entrée : le destinataire du message reçu est notre
 * adresse sous-adressée, et c'est elle qui dit à quelle inscription répondre.
 */
export function inscriptionDepuisAdresse(adresse: string | null | undefined): string | null {
  const propre = (adresse ?? '').trim().toLowerCase()
  if (!propre.includes('@')) return null

  const locale = propre.split('@')[0]
  const plus = locale.indexOf('+')
  if (plus < 0) return null

  const jeton = locale.slice(plus + 1)
  return estUuid(jeton) ? jeton : null
}

/**
 * Un jeton ne passe que s'il est un UUID.
 *
 * On refuse tout le reste plutôt que de l'assainir : un identifiant tronqué ou
 * réécrit apparierait la réponse à la mauvaise inscription, ce qui est pire que
 * de ne pas l'apparier du tout.
 */
function jetonSur(inscriptionId: string): string | null {
  const brut = inscriptionId.trim().toLowerCase()
  return estUuid(brut) ? brut : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const estUuid = (v: string): boolean => UUID.test(v)
