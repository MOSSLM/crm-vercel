// desabonnement.ts — le jeton qui permet à un prospect de nous faire taire.
//
// POURQUOI CE MODULE EXISTE
// Le CRM n'a AUCUN mécanisme de désabonnement : ni `List-Unsubscribe`, ni route
// à jeton. Le seul opt-out est la phrase « répondez-moi juste non » au bas du
// corps. Deux textes disent que ça ne suffit pas, et ils ne disent pas la même
// chose :
//
//   · RGPD art. 21.4 — le droit d'opposition doit être « explicitement porté à
//     l'attention » et « présenté clairement et SÉPARÉMENT de toute autre
//     information ». Une phrase noyée dans le corps n'y répond pas. C'est
//     exactement ce qui a été reproché à CALOGA : le retrait doit être aussi
//     simple que l'adhésion.
//   · Gmail/Yahoo — `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058).
//     Ce n'est une obligation qu'au-dessus de 5 000 envois par jour, très
//     au-dessus de nous. Mais depuis novembre 2025 Gmail REJETTE le courrier non
//     conforme au lieu de le classer en spam, et l'en-tête reste le meilleur
//     réducteur de taux de plainte qui existe : quelqu'un qui trouve le bouton
//     ne clique pas sur « signaler comme spam ».
//
// TROIS DÉCISIONS, ET LEURS RAISONS
//
// [1] LE JETON EST SIGNÉ, PAS STOCKÉ. Le lien se calcule au rendu du message,
//     sans écrire une ligne. C'est la leçon déjà payée par `liensDesPieces` :
//     une fonction qui FABRIQUE des jetons manquants transforme une lecture en
//     écriture, et ouvrir une fiche se met à modifier la base. Ici le coût
//     serait pire — un envoi qui échoue laisserait un jeton orphelin, et un
//     jeton purgé casserait un lien déjà parti.
//
// [2] LE JETON PORTE L'INSCRIPTION, PAS L'ADRESSE. Une adresse email dans une
//     URL est une donnée personnelle qui traverse les journaux de tous les
//     intermédiaires, et qui se retrouve dans le `Referer`. L'inscription est
//     un UUID que le CRM sait déjà résoudre — c'est le même identifiant que
//     porte le `Reply-To` sous-adressé (`adresse-reponse.ts`) et l'en-tête
//     `X-Sama-Inscription`. Trois chemins, un seul identifiant.
//
// [3] SANS CLÉ, ON NE REND RIEN. Même parti pris que `coffre.ts` : refuser
//     plutôt que produire un jeton non signé. Un jeton devinable laisserait
//     n'importe qui désabonner n'importe qui — le dommage est faible mais il
//     est silencieux, et un lien de désinscription qui accepte tout est pire
//     qu'un lien absent parce qu'il donne l'illusion du contrôle.
//
// CE QUI NE DOIT JAMAIS CHANGER : la clé. Un lien de désinscription part dans
// un email et doit fonctionner des ANNÉES plus tard — la CNIL note que « les
// liens de désinscription ne fonctionnent pas toujours, lorsqu'ils existent »
// et que c'est un motif de réclamation fréquent. Tourner la clé invalide d'un
// coup tous les liens déjà envoyés.
//
// Les deux fonctions vont par paire : `jetonDeDesabonnement` écrit,
// `inscriptionDepuisJeton` relit. Les séparer les ferait diverger.

import { createHmac, timingSafeEqual } from 'node:crypto'

/** La clé de signature. Absente = on ne fabrique aucun lien. */
export function cleDisponible(): boolean {
  return Boolean((process.env.DESABONNEMENT_CLE ?? '').trim())
}

/**
 * Le jeton à mettre dans l'URL de désinscription, ou `null`.
 *
 * Forme : `<inscription>.<signature>` — l'identifiant en clair (c'est un UUID
 * opaque, il ne dit rien de personne) et sa signature tronquée à 32 caractères,
 * ce qui laisse 128 bits d'entropie : très au-delà de ce qu'une énumération
 * peut atteindre, et assez court pour qu'un lien reste lisible dans un email en
 * texte brut.
 */
export function jetonDeDesabonnement(inscriptionId: string | null | undefined): string | null {
  const id = (inscriptionId ?? '').trim().toLowerCase()
  if (!estUuid(id)) return null

  const signature = signer(id)
  return signature ? `${id}.${signature}` : null
}

/**
 * L'inscription portée par un jeton, ou `null` si la signature ne tient pas.
 *
 * On refuse tout ce qui n'est pas exactement conforme plutôt que de l'assainir.
 * Un jeton tronqué ou réécrit désabonnerait le mauvais prospect, ce qui est
 * pire que de ne rien désabonner : le vrai demandeur continuerait de recevoir,
 * et un autre cesserait sans l'avoir demandé.
 */
export function inscriptionDepuisJeton(jeton: string | null | undefined): string | null {
  const brut = (jeton ?? '').trim()
  const point = brut.indexOf('.')
  if (point < 0) return null

  // ⚠️ SEUL L'IDENTIFIANT SE NORMALISE. La signature est du base64url, donc
  // SENSIBLE À LA CASSE : `toLowerCase()` sur le jeton entier la détruit et
  // aucun lien ne fonctionne plus. Le premier test de ce module existe pour
  // ça — c'est le défaut qu'il a attrapé.
  const id = brut.slice(0, point).toLowerCase()
  const signature = brut.slice(point + 1)
  if (!estUuid(id) || !signature) return null

  const attendue = signer(id)
  if (!attendue) return null

  // Comparaison à temps constant : une comparaison naïve fuit, caractère par
  // caractère, de quoi reconstruire une signature valide.
  const a = Buffer.from(signature, 'utf8')
  const b = Buffer.from(attendue, 'utf8')
  if (a.length !== b.length) return null
  return timingSafeEqual(a, b) ? id : null
}

/**
 * L'URL complète de désinscription.
 *
 * ⚠️ LA BASE N'EST PAS CELLE DU CRM, ET C'EST LE POINT LE MOINS ÉVIDENT DU
 * MODULE. Un lien de désinscription apparaît dans le CORPS de chaque email
 * froid. Or la Domain Blocklist de Spamhaus est interrogée sur « les domaines
 * apparaissant dans les en-têtes ET LE CORPS », et elle liste « au niveau du
 * domaine principal, tous ses sous-domaines rendant également un résultat
 * listé ». Mettre `app.samadigitalstudio.fr` dans chaque email froid, c'est
 * exposer au listage le domaine qui porte TOUTES les démos — un sous-domaine
 * n'isole rien.
 *
 * D'où le paramètre : la base doit être celle du domaine d'ENVOI, un
 * consommable qu'on remplace, jamais celle du domaine qui porte les liens de
 * démo. Le repli sur l'URL du CRM ne vaut que pour le transactionnel, qui n'est
 * pas du courrier non sollicité.
 */
export function urlDeDesabonnement(base: string, inscriptionId: string | null | undefined): string | null {
  const jeton = jetonDeDesabonnement(inscriptionId)
  if (!jeton) return null

  const racine = base.trim().replace(/\/+$/, '')
  if (!racine) return null
  return `${racine}/desabonnement/${jeton}`
}

function signer(id: string): string | null {
  const cle = (process.env.DESABONNEMENT_CLE ?? '').trim()
  if (!cle) return null
  return createHmac('sha256', cle).update(id).digest('base64url').slice(0, 32)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const estUuid = (v: string): boolean => UUID.test(v)
