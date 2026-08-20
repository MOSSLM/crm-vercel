// contenu.ts — ce que raconte un message de chauffe.
//
// PORTÉ DE `/Users/matt/Code/email-warmup/src/lib/warmup/content.ts`.
//
// LES CONTRAINTES, ET POURQUOI ELLES SONT DES CONTRAINTES
// Texte brut, court, conversationnel : aucun lien, aucune image, aucun mot de
// démarchage. Un message de chauffe n'a rien à vendre — son seul travail est
// d'arriver en boîte de réception et d'y être traité comme du courrier normal.
// Tout ce qui ressemble à une campagne le fait échouer à sa propre mission.
//
// LA COMBINATOIRE COMPTE PLUS QUE LA BEAUTÉ. Vingt beaux modèles réutilisés
// tels quels forment vingt empreintes que n'importe quel filtre apprend. Une
// recombinaison de fragments n'en forme aucune : ici 10 ouvertures × 14 objets
// × 14 corps × 8 suites × 7 clôtures font 109 760 textes, que les quatre
// bascules de structure portent à près de 900 000. C'est le chiffre réel, et il
// est tenu par un test — un corpus qu'on rogne doit faire tomber quelque chose.
//
// DEUX CHANGEMENTS PAR RAPPORT À L'ORIGINAL
//
// 1. **Le hasard est injecté**, comme dans `courbe.ts` : sans ça on ne peut
//    pas tester « la structure varie », on ne peut que l'espérer.
//
// 2. **La référence de suivi sort du corps du message.** L'original n'en avait
//    pas et appariait à l'objet — or nos objets viennent d'un corpus de 14 :
//    deux messages du même jour peuvent porter le même. La référence part donc
//    en EN-TÊTE (`X-Sama-Ref`), lue en IMAP dans la boîte témoin. Elle reste
//    hors du texte à dessein : un jeton unique par message ne s'apprend pas,
//    mais le GABARIT qui l'entoure, lui, s'apprend — « réf. XXXX » en fin de
//    corps serait précisément le motif qu'on cherche à ne pas créer.

import type { Alea } from './courbe'

const OUVERTURES = [
  'Petit point rapide',
  'Je reviens vers toi',
  'Comme convenu',
  'Suite à notre échange',
  'Juste pour info',
  'Petite question',
  'Un mot rapide',
  'Je te tiens au courant',
  'Rapidement avant ce soir',
  'Pour faire suite',
]

const OBJETS = [
  'point rapide',
  "la question de tout à l'heure",
  're: le dossier',
  'récap de la semaine',
  'petit retour',
  'le doc de vendredi',
  'organisation de la semaine',
  'question rapide',
  'suite de notre échange',
  'pour info',
  'planning',
  'note rapide',
  'retour sur le compte rendu',
  'à valider quand tu peux',
]

const CORPS = [
  "J'ai relu le document ce matin, rien à signaler de mon côté. On peut avancer.",
  "Je n'ai pas eu le temps de finir hier, je m'y remets en début d'après-midi.",
  "C'est noté pour jeudi. Je bloque le créneau et je te confirme.",
  'Merci pour le retour, c\'est plus clair. Je reprends la partie du milieu.',
  'De mon côté c\'est bon. Tu me dis si tu veux qu\'on en reparle de vive voix.',
  "J'ai regardé les chiffres, ça correspond à ce qu'on avait estimé. Rien d'alarmant.",
  "Je pars du principe qu'on garde la même organisation que le mois dernier.",
  'Pas de nouvelle de leur côté pour l\'instant. Je relance en fin de semaine.',
  'Le point de ce matin a été utile. Je résume ce qu\'on s\'est dit et je te renvoie ça.',
  "Rien de pressé, c'était surtout pour garder une trace écrite.",
  "J'ai avancé sur les deux premiers points. Le troisième attendra lundi.",
  'Ça me va. Je préviens l\'équipe pour qu\'ils s\'organisent en conséquence.',
  "La version imprimée est passée au bureau, je la range avec le reste du dossier.",
  "On a décalé d'une heure, ça devrait mieux convenir à tout le monde.",
]

// La longueur d'un message est une variable comme une autre. L'original n'avait
// qu'une phrase par message : sept mille messages tous longs de deux lignes
// forment eux aussi un motif.
const SUITES = [
  'Rien de bloquant pour la suite.',
  'Je te redis en fin de semaine.',
  'On en reparle au prochain point.',
  "Dis-moi si tu vois les choses autrement.",
  "Je garde ça sous le coude en attendant.",
  "Ça peut attendre lundi sans problème.",
  "Je préfère te le dire maintenant plutôt qu'après coup.",
  "Tu me confirmes quand tu as deux minutes.",
]

const CLOTURES = [
  'Bonne journée',
  'À bientôt',
  'Bonne fin de journée',
  "Merci d'avance",
  'Bon courage',
  'À très vite',
  'Belle journée',
]

const REPONSES = [
  'Parfait, merci pour le retour.',
  "C'est noté, je regarde ça.",
  'Très bien, on fait comme ça.',
  'Reçu, merci. Je reviens vers toi si besoin.',
  'Ok pour moi, rien à ajouter.',
  "Merci, c'est plus clair maintenant.",
  'Ça marche, je m\'en occupe.',
  'Bien reçu. Bonne journée à toi.',
  "Impeccable, merci d'avoir pris le temps.",
  "D'accord, je te confirme ça demain.",
]

/** Tire un élément d'une liste. */
function tirer<T>(liste: readonly T[], alea: Alea): T {
  return liste[Math.min(liste.length - 1, Math.floor(alea() * liste.length))]
}

/**
 * Le prénom à utiliser, depuis le nom d'affichage ou, à défaut, l'adresse.
 *
 * `contact@…` donne « Contact » : c'est laid mais honnête, et ça ne se produit
 * que si la boîte témoin n'a pas de nom — ce que la fiche impose de renseigner.
 */
export function prenom(nomAffiche: string, email: string): string {
  const duNom = nomAffiche.trim().split(/\s+/)[0]
  if (duNom) return duNom
  const local = email.split('@')[0].split(/[._-]/)[0]
  return local.charAt(0).toUpperCase() + local.slice(1)
}

/**
 * Une référence de suivi, unique par message.
 *
 * Elle voyage en en-tête et sert à retrouver le message dans la boîte témoin —
 * c'est elle qui permet de dire « celui-ci est en spam » sans se tromper de
 * message quand deux envois du jour partagent le même objet.
 */
export function nouvelleReference(alea: Alea = Math.random): string {
  let sortie = ''
  for (let i = 0; i < 12; i++) sortie += Math.floor(alea() * 16).toString(16)
  return sortie
}

export interface Correspondants {
  nomExpediteur: string
  emailExpediteur: string
  nomDestinataire: string
  emailDestinataire: string
}

export interface MessageChauffe {
  objet: string
  texte: string
  /** À poser en en-tête `X-Sama-Ref`, jamais dans le texte. */
  reference: string
}

/** Compose un message de chauffe. */
export function composerMessage(
  qui: Correspondants,
  alea: Alea = Math.random,
): MessageChauffe {
  const vers = prenom(qui.nomDestinataire, qui.emailDestinataire)
  const de = prenom(qui.nomExpediteur, qui.emailExpediteur)

  // On fait varier la STRUCTURE, pas seulement les mots : avec ou sans
  // salutation, avec ou sans ouverture, une ou deux phrases, signature seule ou
  // précédée d'une clôture. Un corpus qui ne varie que le vocabulaire garde sa
  // silhouette, et c'est la silhouette qui se repère.
  const salutation = alea() < 0.75 ? `Bonjour ${vers},\n\n` : ''
  const ouverture = alea() < 0.5 ? `${tirer(OUVERTURES, alea)}. ` : ''
  const corps = tirer(CORPS, alea)
  const suite = alea() < 0.4 ? ` ${tirer(SUITES, alea)}` : ''
  const cloture =
    alea() < 0.85 ? `\n\n${tirer(CLOTURES, alea)},\n${de}` : `\n\n${de}`

  return {
    objet: tirer(OBJETS, alea),
    texte: `${salutation}${ouverture}${corps}${suite}${cloture}`,
    reference: nouvelleReference(alea),
  }
}

/**
 * Compose la réponse d'un témoin.
 *
 * La réponse est le signal d'engagement le plus fort qu'un fournisseur
 * enregistre — plus fort qu'une ouverture, qu'il ne mesure d'ailleurs pas
 * toujours. C'est pour elle qu'on tient un maillage de vraies boîtes.
 */
export function composerReponse(
  qui: Correspondants,
  objetOriginal: string,
  alea: Alea = Math.random,
): MessageChauffe {
  const vers = prenom(qui.nomDestinataire, qui.emailDestinataire)
  const de = prenom(qui.nomExpediteur, qui.emailExpediteur)
  const salutation = alea() < 0.5 ? `${vers},\n\n` : ''

  return {
    objet: /^re\s*:/i.test(objetOriginal) ? objetOriginal : `Re: ${objetOriginal}`,
    texte: `${salutation}${tirer(REPONSES, alea)}\n\n${de}`,
    reference: nouvelleReference(alea),
  }
}

/** Le corpus, exposé pour que les tests puissent l'auditer en entier. */
export const CORPUS = { OUVERTURES, OBJETS, CORPS, SUITES, CLOTURES, REPONSES }
