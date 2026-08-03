// domains.ts — ce qu'on sait d'un domaine sans lui parler.
//
// Trois savoirs, tous gratuits et instantanés :
//
//   1. le domaine est-il JETABLE (Yopmail & consorts) → invalide définitif ;
//   2. est-ce un provider GRAND PUBLIC (gmail, orange, wanadoo, free…) → deux
//      conséquences importantes, cf. plus bas ;
//   3. à qui appartiennent ses serveurs mail → sert à deviner s'il accepte
//      TOUTES les adresses (catch-all), auquel cas plus rien ne peut prouver
//      qu'une boîte existe avant de lui écrire.
//
// Pourquoi « provider grand public » compte autant :
//
//   · la mémoire des rebonds par domaine n'y a AUCUN sens. Qu'une adresse
//     `@gmail.com` ait rebondi ne dit rien de la suivante — alors que sur
//     `@garage-dupont.fr`, un rebond dur trahit un domaine mort et rend
//     suspectes toutes les autres adresses du même garage ;
//   · ils ne sont jamais catch-all : ils rejettent vraiment les boîtes
//     inexistantes. C'est une bonne nouvelle pour la fiabilité du verdict.
//
// Module pur : aucune base, aucun réseau.

import DISPOSABLE from './data/disposable-domains.json'

const DISPOSABLE_SET: ReadonlySet<string> = new Set(DISPOSABLE as string[])

/** Le domaine est-il une boîte jetable ? Verdict définitif : on ne réessaie pas. */
export const isDisposable = (domain: string): boolean => DISPOSABLE_SET.has(domain.toLowerCase())

/**
 * Providers grand public. Liste volontairement centrée sur la France : nos
 * prospects sont des artisans et des garages, chez qui `@orange.fr`,
 * `@wanadoo.fr`, `@free.fr` et `@sfr.fr` sont au moins aussi fréquents que
 * `@gmail.com`.
 */
const FREE_PROVIDERS: ReadonlySet<string> = new Set([
  // France
  'orange.fr',
  'wanadoo.fr',
  'free.fr',
  'sfr.fr',
  'neuf.fr',
  'laposte.net',
  'bbox.fr',
  'numericable.fr',
  'aliceadsl.fr',
  'club-internet.fr',
  'voila.fr',
  'cegetel.net',
  'dbmail.com',
  // International
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.fr',
  'hotmail.com',
  'hotmail.fr',
  'live.fr',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.fr',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'gmx.fr',
  'gmx.com',
  'gmx.net',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'zoho.com',
  'yandex.com',
  'mail.com',
  'tutanota.com',
  'fastmail.com',
])

export const isFreeProvider = (domain: string): boolean => FREE_PROVIDERS.has(domain.toLowerCase())

/** Les domaines grand public les plus fréquents — cible de la détection de faute de frappe. */
export const COMMON_DOMAINS: readonly string[] = [...FREE_PROVIDERS]

/**
 * Adresses génériques d'entreprise.
 *
 * Attention : sur NOS prospects, une adresse `contact@` ou `info@` est la cible
 * NORMALE, pas un défaut. C'est souvent la seule que le garage publie, et elle
 * est relevée tous les jours. On l'étiquette pour l'affichage, on ne la dégrade
 * jamais.
 *
 * Les adresses de la seconde liste, elles, ne sont lues par personne : écrire à
 * `noreply@` est une perte sèche.
 */
const ROLE_PREFIXES: ReadonlySet<string> = new Set([
  'contact',
  'info',
  'infos',
  'accueil',
  'commercial',
  'commande',
  'devis',
  'service',
  'services',
  'client',
  'clients',
  'sav',
  'atelier',
  'secretariat',
  'direction',
  'compta',
  'comptabilite',
  'facturation',
  'admin',
  'administration',
  'bureau',
  'agence',
  'boutique',
  'magasin',
  'rh',
  'recrutement',
  'sales',
  'support',
  'hello',
  'bonjour',
])

/** Boîtes qui ne sont lues par personne : y écrire ne sert à rien. */
const UNATTENDED_PREFIXES: ReadonlySet<string> = new Set([
  'noreply',
  'no-reply',
  'nepasrepondre',
  'ne-pas-repondre',
  'donotreply',
  'do-not-reply',
  'mailer-daemon',
  'postmaster',
  'abuse',
  'bounce',
  'bounces',
  'notification',
  'notifications',
  'newsletter',
  'automatique',
])

const prefixOf = (local: string): string => local.split('+')[0].toLowerCase()

/** Adresse générique d'entreprise (`contact@`) — étiquetée, jamais pénalisée. */
export const isRoleAddress = (local: string): boolean => ROLE_PREFIXES.has(prefixOf(local))

/** Boîte automatique (`noreply@`) — personne ne lira. */
export const isUnattendedAddress = (local: string): boolean => UNATTENDED_PREFIXES.has(prefixOf(local))

/* ── Empreintes des serveurs mail ────────────────────────────────────────── */

export type MailProvider =
  | 'google'
  | 'microsoft'
  | 'ovh'
  | 'ionos'
  | 'o2switch'
  | 'gandi'
  | 'orange'
  | 'free'
  | 'sfr'
  | 'laposte'
  | 'zoho'
  | 'proton'
  | 'yahoo'
  | 'apple'
  | 'infomaniak'
  | 'passerelle'
  | 'parking'
  | 'autre'

/**
 * Empreintes des hôtes MX, dans l'ordre d'évaluation. Le premier fragment
 * trouvé gagne — les listes sont disjointes en pratique.
 */
const MX_FINGERPRINTS: ReadonlyArray<{ provider: MailProvider; hosts: readonly string[] }> = [
  { provider: 'google', hosts: ['google.com', 'googlemail.com', 'gmail.com'] },
  { provider: 'microsoft', hosts: ['outlook.com', 'protection.outlook', 'hotmail.com', 'microsoft.com'] },
  { provider: 'ovh', hosts: ['ovh.net', 'ovh.com', 'ovhcloud.com'] },
  { provider: 'ionos', hosts: ['ionos.', '1and1.', 'united-domains', 'kundenserver', 'perfora.net'] },
  { provider: 'o2switch', hosts: ['o2switch.net'] },
  { provider: 'gandi', hosts: ['gandi.net'] },
  { provider: 'infomaniak', hosts: ['infomaniak.ch', 'infomaniak.com'] },
  { provider: 'orange', hosts: ['orange.fr', 'wanadoo.fr'] },
  { provider: 'free', hosts: ['free.fr', 'proxad.net'] },
  { provider: 'sfr', hosts: ['sfr.fr', 'neuf.fr', 'cegetel'] },
  { provider: 'laposte', hosts: ['laposte.net'] },
  { provider: 'zoho', hosts: ['zoho.com', 'zoho.eu'] },
  { provider: 'proton', hosts: ['protonmail.ch', 'proton.me'] },
  { provider: 'yahoo', hosts: ['yahoodns.net', 'yahoo.com'] },
  { provider: 'apple', hosts: ['icloud.com', 'apple.com', 'me.com'] },
  // Passerelles anti-spam placées DEVANT la vraie boîte. Elles acceptent le
  // message puis le filtrent : leur « oui » ne dit rien de l'existence du
  // destinataire, et certaines (Mailinblack) retiennent le premier email d'un
  // expéditeur inconnu jusqu'à confirmation. À traiter comme un catch-all.
  { provider: 'passerelle', hosts: ['mailinblack.com', 'mimecast', 'pphosted.com', 'barracudanetworks', 'messagelabs'] },
  // Parkings et revendeurs : le domaine est enregistré mais n'héberge rien.
  // Il « accepte » parfois le courrier, qui n'arrive nulle part.
  { provider: 'parking', hosts: ['parkingcrew', 'sedoparking', 'above.com', 'bodis.com', 'dan.com', 'afternic'] },
]

/** À qui appartiennent ces serveurs mail ? */
export function providerFromMx(mxHosts: readonly string[]): MailProvider {
  const hosts = mxHosts.map((h) => h.toLowerCase())
  for (const { provider, hosts: needles } of MX_FINGERPRINTS) {
    if (hosts.some((host) => needles.some((needle) => host.includes(needle)))) return provider
  }
  return 'autre'
}

/**
 * Ce provider accepte-t-il vraisemblablement n'importe quelle adresse ?
 *
 * Chez les mutualisés français, une adresse inexistante est acceptée puis jetée
 * en silence : rien, jamais, ne pourra prouver que la boîte existe avant de lui
 * écrire. Ce n'est pas un défaut de notre vérificateur, c'est une propriété du
 * serveur d'en face — et c'est la vraie raison pour laquelle les librairies
 * de validation « garanties » se trompent.
 *
 * Google, Microsoft, Orange, Free et les autres grands providers rejettent
 * franchement : leur verdict, lui, est fiable.
 */
export function guessCatchAll(provider: MailProvider): boolean {
  switch (provider) {
    case 'ovh':
    case 'ionos':
    case 'o2switch':
    case 'gandi':
    case 'infomaniak':
    case 'passerelle':
    case 'parking':
    case 'autre':
      return true
    default:
      return false
  }
}
