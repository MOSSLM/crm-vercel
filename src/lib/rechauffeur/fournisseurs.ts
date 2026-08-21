// fournisseurs.ts — comment fabriquer une boîte témoin, fournisseur par fournisseur.
//
// POURQUOI CE FICHIER EXISTE. Le maillage ne reste pas vide parce qu'on ignore
// qu'il faut le remplir : il reste vide parce que chaque fournisseur demande
// une manœuvre différente, qu'aucun ne l'appelle pareil, et qu'on la
// redécouvre à chaque boîte. Google veut un mot de passe d'application derrière
// une validation en deux étapes ; Orange veut qu'on autorise d'abord « les
// logiciels de messagerie » ; Free ne fabrique aucun mot de passe dédié et
// prend celui du compte. Trois chemins, trois vocabulaires, aucun point commun.
//
// LA CONTRAINTE QU'ON NE PEUT PAS CONTOURNER, ET QU'IL VAUT MIEUX LIRE AVANT
// D'ESSAYER : une adresse Orange ou Free NE SE CRÉE PAS. Elles viennent avec un
// abonnement — Livebox, Freebox. Ces deux familles-là, précisément les plus
// répandues chez nos artisans et absentes de tous les réseaux de chauffe
// américains, ne s'obtiennent qu'en empruntant une boîte existante avec
// l'accord de son propriétaire. Les trois autres se créent en cinq minutes.
//
// CE MODULE N'EST QUE DE LA DONNÉE, ET L'ÉCRAN LE REND SANS LE PARAPHRASER.
// Une consigne recopiée dans du JSX est une consigne qui diverge de
// `hotes-connus.ts` au premier changement d'hôte — d'où les `imapHote` lus
// ici plutôt que retapés.

import { HOTES_CONNUS, reglagesDeviness } from './hotes-connus'
import { familleDuDomaine } from './appariement'
import type { Famille } from './sante'

/**
 * Le serveur IMAP des boîtes hébergées chez LWS — celles du parc Sama.
 *
 * Il ne peut pas vivre dans `HOTES_CONNUS` : ce catalogue se lit par DOMAINE,
 * et une boîte LWS porte le domaine du client, pas celui de l'hébergeur. C'est
 * exactement pourquoi cet hôte-là ne se devine jamais et doit se taper.
 */
export const HOTE_LWS = 'mail84.lwspanel.com'

/** Comment une boîte de cette famille s'obtient, et ce qui la fait échouer. */
export interface ModeOperatoire {
  famille: Famille
  /** Le nom que l'humain reconnaît, pas la clé technique. */
  libelle: string
  /** Les domaines qui rangent une adresse dans cette famille. */
  domaines: readonly string[]
  /** L'hôte IMAP, lu dans `hotes-connus.ts`. */
  imap: string
  /**
   * `libre` : le compte se crée en cinq minutes.
   * `abonnement` : il faut une ligne chez l'opérateur — la boîte s'emprunte.
   * `hebergeur` : elle se crée dans le panneau de notre hébergeur.
   */
  creation: 'libre' | 'abonnement' | 'hebergeur'
  /** Les gestes, dans l'ordre, du compte au mot de passe collable. */
  etapes: readonly string[]
  /** Ce qui fait refuser la connexion alors que le mot de passe est le bon. */
  piege?: string
}

export const MODES_OPERATOIRES: readonly ModeOperatoire[] = [
  {
    famille: 'google',
    libelle: 'Gmail',
    domaines: ['gmail.com'],
    imap: HOTES_CONNUS['gmail.com'].imapHote,
    creation: 'libre',
    etapes: [
      'Créer le compte sur accounts.google.com/signup — un prénom et un nom plausibles, jamais « test » : cette boîte va répondre à nos messages, et son nom s’affichera dans le fil.',
      'Compte Google → Sécurité → activer la validation en deux étapes. Sans elle, l’écran des mots de passe d’application n’existe pas.',
      'Aller sur myaccount.google.com/apppasswords, nommer l’application « CRM Sama », copier les 16 lettres proposées.',
      'Dans le formulaire ci-dessus : l’adresse complète, et ces 16 lettres — jamais le mot de passe du compte.',
      'Deux ou trois comptes Google suffisent, et ce doivent être de VRAIS comptes distincts : Google ignore les points et tout ce qui suit un « + », donc m.sallami@ et msallami+crm@ sont la même boîte. Le formulaire les refuse désormais, mais mieux vaut le savoir avant de les fabriquer.',
    ],
    piege:
      'Deux pièges. Le mot de passe du compte est refusé par IMAP avec la même erreur qu’un mot de passe faux — rien ne dit qu’il fallait un mot de passe d’application. Et l’écran des mots de passe d’application n’existe pas du tout si le compte appartient à une organisation (Workspace), si la validation en deux étapes ne passe que par clé de sécurité, ou si la Protection Avancée est active : dans ces trois cas, la boîte s’enregistre à l’aveugle, comme Outlook.',
  },
  {
    famille: 'microsoft',
    libelle: 'Outlook',
    domaines: ['outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr'],
    imap: HOTES_CONNUS['outlook.com'].imapHote,
    creation: 'libre',
    etapes: [
      'Créer l’adresse sur outlook.com — c’est libre et immédiat.',
      'Ne PAS chercher de mot de passe d’application : il n’y en a pas. Microsoft écrit sur sa propre page de réglages que l’IMAP d’Outlook.com exige « OAuth2 / Modern authentication », et rien d’autre. Aucun mot de passe, d’application ou non, ne sera accepté.',
      'Enregistrer la boîte SANS mot de passe. Elle recevra — c’est ce qui construit l’historique chez Microsoft, et c’est l’essentiel — et l’écran affichera « envoi à l’aveugle » plutôt que de promettre une mesure qu’on n’a pas.',
    ],
    piege:
      'Microsoft est la seule famille qu’on ne peut PAS brancher : son IMAP n’accepte que OAuth2. Le placement y restera non mesuré tant que le connecteur Graph — écrit dans le réchauffeur d’origine, pas encore porté — ne l’est pas. Ces messages-là sont comptés « non mesurés », jamais comme des rejets : ils ne font pas baisser le score.',
  },
  {
    famille: 'yahoo',
    libelle: 'Yahoo',
    domaines: ['yahoo.com', 'yahoo.fr'],
    imap: HOTES_CONNUS['yahoo.com'].imapHote,
    creation: 'libre',
    etapes: [
      'Créer l’adresse sur login.yahoo.com/account/create.',
      'Informations du compte → Sécurité du compte → « Générer un mot de passe d’application ».',
      'Coller ce mot de passe dans le formulaire.',
    ],
    piege:
      'Yahoo refuse purement et simplement le mot de passe du compte sur IMAP : seul le mot de passe d’application passe.',
  },
  {
    famille: 'orange',
    libelle: 'Orange / Wanadoo',
    domaines: ['orange.fr', 'wanadoo.fr'],
    imap: HOTES_CONNUS['orange.fr'].imapHote,
    creation: 'abonnement',
    etapes: [
      'Une adresse Orange ne se crée pas sans ligne Orange. Il faut EMPRUNTER une boîte existante — la tienne, celle d’un proche — avec l’accord de son propriétaire, en lui disant ce qui va y arriver : quelques messages par jour, et des réponses automatiques.',
      'Dans le webmail Orange → Paramètres → Sécurité → autoriser l’accès à la messagerie depuis un logiciel tiers.',
      'Toujours dans Sécurité : générer un mot de passe pour les applications, et le coller ici.',
    ],
    piege:
      'Sans l’autorisation de l’étape 2, le mot de passe d’application est bien créé, accepté par notre formulaire, et refusé par le serveur d’Orange. L’erreur ne dit pas laquelle des deux manque.',
  },
  {
    famille: 'free',
    libelle: 'Free',
    domaines: ['free.fr'],
    imap: HOTES_CONNUS['free.fr'].imapHote,
    creation: 'abonnement',
    etapes: [
      'Une adresse @free.fr vient avec un abonnement Freebox : elle s’emprunte, elle ne se crée pas.',
      'Console de l’abonné (subscribe.free.fr) → vérifier que l’accès aux serveurs de messagerie est autorisé.',
      'Le mot de passe à coller est celui du compte Free : Free ne fabrique aucun mot de passe d’application.',
    ],
    piege:
      'Comme le mot de passe est celui du compte, l’emprunt engage plus qu’ailleurs : il vaut mieux une boîte à soi qu’une boîte prêtée.',
  },
  {
    famille: 'autre',
    libelle: 'Une boîte chez LWS (notre hébergeur)',
    domaines: ['nos propres domaines'],
    imap: HOTE_LWS,
    creation: 'hebergeur',
    etapes: [
      'Panneau LWS → l’hébergement du domaine → Emails → Créer une adresse.',
      'Choisir l’adresse et son mot de passe : c’est celui-là qu’on colle, il n’y a pas de mot de passe d’application chez LWS.',
      'Serveur IMAP : ' + HOTE_LWS + ', port 993. Il ne se devine pas depuis l’adresse — c’est le seul cas où il faut le taper.',
    ],
    piege:
      'Ces boîtes-là apportent de la CAPACITÉ, pas du SIGNAL : elles disent ce que fait le filtre de LWS, où nous n’avons aucun prospect. Elles ne remplacent aucune des cinq familles.',
  },
]

/** Le mode opératoire d'une famille — jamais `undefined`, la liste les couvre toutes. */
export function modeOperatoire(famille: Famille): ModeOperatoire {
  const trouve = MODES_OPERATOIRES.find((m) => m.famille === famille)
  // La liste couvre `FAMILLES` en entier ; le repli n'existe que pour le type.
  return trouve ?? MODES_OPERATOIRES[MODES_OPERATOIRES.length - 1]
}

/**
 * Ce qu'il faut mettre dans les champs « serveur » et « port » pour cette
 * adresse — `null` quand le domaine n'est d'aucun fournisseur connu.
 *
 * SERT À CE QUE PERSONNE NE TAPE UN HÔTE. Le formulaire proposait
 * `mail84.lwspanel.com` en dur, c'est-à-dire le serveur de NOTRE hébergeur pour
 * une boîte Gmail : une valeur fausse dans neuf cas sur dix, dans un champ que
 * l'humain n'a aucun moyen de vérifier.
 */
export function suggestionHote(
  email: string,
): { hote: string; port: number; libelle: string } | null {
  const reglages = reglagesDeviness(email)
  if (!reglages) return null
  return {
    hote: reglages.imapHote,
    port: reglages.imapPort,
    libelle: modeOperatoire(familleDuDomaine(email)).libelle,
  }
}

/**
 * La clé d'identité RÉELLE d'une boîte — pour ne pas en compter trois quand il
 * n'y en a qu'une.
 *
 * POURQUOI ÇA COMPTE ICI PLUS QU'AILLEURS. Google ignore les points et tout ce
 * qui suit un `+` : `m.sallami@gmail.com`, `msallami+crm@gmail.com` et
 * `msallami@googlemail.com` sont LA MÊME boîte, chez le même filtre, derrière
 * le même mot de passe. Enregistrées comme trois témoins, elles donneraient
 * trois plafonds de huit — vingt-quatre messages par jour dans une seule boîte
 * — et un maillage qui se croit trois fois plus large qu'il ne l'est. La
 * diversité de fournisseur est le SEUL signal qui vaut quelque chose ; un
 * maillage qui se trompe sur son propre effectif ment sur ce signal.
 *
 * ON NE NORMALISE QUE CE QUI EST DOCUMENTÉ. Les points ne s'effacent que chez
 * Google — chez tous les autres, `jean.dupont@` et `jeandupont@` sont deux
 * boîtes différentes, et les confondre refuserait un témoin légitime. Le `+`
 * se coupe là où le sous-adressage est garanti. Partout ailleurs, l'adresse
 * vaut pour elle-même.
 *
 * L'adresse d'origine est CONSERVÉE telle quelle : cette clé sert à comparer,
 * jamais à décider où le courrier part.
 */
export function cleBoite(email: string): string {
  const brut = email.trim().toLowerCase()
  const at = brut.lastIndexOf('@')
  if (at <= 0) return brut

  let local = brut.slice(0, at)
  const domaine = brut.slice(at + 1)

  const chezGoogle = domaine === 'gmail.com' || domaine === 'googlemail.com'
  const sousAdressageSur =
    chezGoogle || ['outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr'].includes(domaine)

  if (sousAdressageSur) local = local.split('+')[0]
  if (chezGoogle) local = local.replace(/\./g, '')

  return `${local}@${chezGoogle ? 'gmail.com' : domaine}`
}

/** Deux adresses qui désignent la même boîte réelle. */
export function memeBoite(a: string, b: string): boolean {
  return cleBoite(a) === cleBoite(b)
}
