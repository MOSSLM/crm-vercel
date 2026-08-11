// vcard.ts — le carnet d'adresses du démarchage, tel qu'un téléphone le lit.
//
// POURQUOI
// WhatsApp n'affiche qu'un nom : celui du répertoire. Une conversation ouverte
// depuis le CRM arrive donc comme un numéro nu, et deux prospects démarchés le
// même jour deviennent indiscernables. Il faut que les numéros soient dans le
// téléphone AVANT le premier message — d'où cet export.
//
// CE QU'ON MET SUR UNE FICHE
// Une fiche par contact, portant SES numéros (`TYPE=CELL`) **et celui de son
// entreprise** (`TYPE=WORK`). C'est la demande, et c'est l'ergonomie d'un
// répertoire : on ouvre « AMI ELEC — Jean-Michel Pinto Ferreira » et on voit
// « mobile » et « bureau », sans avoir à chercher ailleurs. Le rôle va en
// `TITLE` — il est rempli sur 298 des 306 contacts du parc, donc il porte
// vraiment de l'information.
//
// Plus une fiche pour l'entreprise elle-même : sur 295 entreprises qualifiées,
// 218 n'ont aucun contact avec un numéro propre. Sans elle, l'immense majorité
// du parc ne serait pas exportée du tout.
//
// LE NOM AFFICHÉ MÈNE PAR L'ENTREPRISE
// « AMI ELEC — Jean-Michel », pas « Jean-Michel Pinto Ferreira ». Dans WhatsApp
// on cherche l'entreprise qu'on démarche ; le prénom du gérant, on ne s'en
// souvient pas trois semaines plus tard.
//
// Module PUR : ni base, ni React, ni requête. On lui donne des fiches, il rend
// du texte vCard.

import {
  nomDuContact,
  numerosDuProspect,
  type ContactSource,
  type EntrepriseSource,
  type NumeroProspect,
} from '@/lib/prospects/numeros'

export interface FicheProspect {
  entreprise: EntrepriseSource & { id?: string | number | null }
  contacts?: (ContactSource | null | undefined)[] | null
  /** Nom de la séquence en cours, écrit en NOTE — pour se situer avant d'appeler. */
  sequence?: string | null
}

/**
 * Échappe ce que la RFC 6350 réserve dans une valeur : `\`, `;`, `,` et les
 * retours à la ligne.
 *
 * Sans ça, une raison sociale comme « Cousin Éco Énergie : Photovoltaïque -
 * Climatisations » passe encore, mais un rôle comme « Gérant, directeur de
 * publication » — il y en a en base — couperait la valeur en deux au `,` et
 * décalerait tout le reste de la fiche.
 */
export function echapper(valeur: string): string {
  return valeur
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

/**
 * Le poids UTF-8 d'une chaîne, en octets.
 *
 * Calculé à la main plutôt qu'avec `TextEncoder` : ce module tourne dans la
 * route Node, dans le navigateur et sous jsdom en test, et `TextEncoder` n'est
 * pas garanti partout. La règle tient en quatre seuils, elle ne bougera pas.
 */
export function poidsOctets(texte: string): number {
  let total = 0
  for (const car of texte) {
    const cp = car.codePointAt(0) ?? 0
    total += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
  }
  return total
}

/**
 * Plie une ligne à 75 octets, la suite préfixée d'une espace (RFC 6350 §3.2).
 *
 * On compte en OCTETS, pas en caractères : « Énergie » pèse plus que sa
 * longueur, et une ligne coupée au milieu d'un caractère UTF-8 rend le fichier
 * illisible. Le découpage se fait donc sur les points de code, en surveillant le
 * poids encodé — c'est ce qui fait qu'une raison sociale à rallonge (il y en a
 * une de 99 caractères en base) s'importe au lieu d'être rejetée par iOS.
 */
export function plier(ligne: string): string {
  if (poidsOctets(ligne) <= 75) return ligne

  const morceaux: string[] = []
  let courant = ''
  let poids = 0
  // Limite de la première ligne : 75. Des suivantes : 74, l'espace de
  // continuation comptant dans les 75.
  let plafond = 75

  for (const car of ligne) {
    const p = poidsOctets(car)
    if (poids + p > plafond) {
      morceaux.push(courant)
      courant = ''
      poids = 0
      plafond = 74
    }
    courant += car
    poids += p
  }
  if (courant) morceaux.push(courant)

  return morceaux.map((m, i) => (i === 0 ? m : ` ${m}`)).join('\r\n')
}

/**
 * Le `TYPE` d'un numéro — UNE seule valeur, jamais une liste.
 *
 * `TYPE=WORK,VOICE` est pourtant licite en vCard 3.0. Mais la virgule non
 * échappée dans un paramètre est ce que la 4.0 interdit (elle veut
 * `TYPE="work,voice"`), et les répertoires modernes lisent souvent en 4.0 même
 * face à un fichier 3.0. Une valeur unique est comprise partout, sans rien
 * perdre : `VOICE` n'ajoutait aucune information à `WORK`.
 */
function typeTel(n: NumeroProspect): string {
  if (n.type === 'mobile') return 'CELL'
  if (n.type === 'fixe') return 'WORK'
  return 'VOICE'
}

/** Une fiche du carnet, avant mise en forme vCard. */
interface Carte {
  /** Stable et unique — cf. `rendreCarte`. */
  uid: string
  fn: string
  org: string
  nom?: { famille: string; prenom: string } | null
  titre?: string | null
  numeros: NumeroProspect[]
  note?: string | null
}

function rendreCarte(carte: Carte): string {
  const lignes: string[] = ['BEGIN:VCARD', 'VERSION:3.0']

  // Un identifiant stable par fiche. Sans `UID`, un répertoire n'a que le nom
  // pour distinguer deux cartes : les 60 entreprises dont le gérant porte le
  // numéro de la société produisent deux fiches très proches, que l'import peut
  // fusionner ou rejeter comme doublons. Il rend aussi le ré-import idempotent —
  // exporter deux fois ne crée plus deux carnets.
  lignes.push(`UID:${carte.uid}`)
  lignes.push(`FN:${echapper(carte.fn)}`)
  // `N` est obligatoire en 3.0. Pour une entreprise, la partie « nom de famille »
  // porte la raison sociale et le reste est vide — c'est ce que font les
  // exports des annuaires, et les répertoires l'affichent correctement.
  const n = carte.nom
  lignes.push(
    n
      ? `N:${echapper(n.famille)};${echapper(n.prenom)};;;`
      : `N:${echapper(carte.fn)};;;;`,
  )
  lignes.push(`ORG:${echapper(carte.org)}`)
  if (carte.titre) lignes.push(`TITLE:${echapper(carte.titre)}`)

  for (const num of carte.numeros) {
    lignes.push(`TEL;TYPE=${typeTel(num)}:${num.e164}`)
  }

  if (carte.note) lignes.push(`NOTE:${echapper(carte.note)}`)
  lignes.push('END:VCARD')

  return lignes.map(plier).join('\r\n')
}

/**
 * Les fiches vCard d'un prospect : une par contact joignable, plus celle de
 * l'entreprise.
 *
 * Le numéro de l'entreprise est répété sur la fiche de chaque contact, en
 * `WORK`. C'est voulu : cette ligne appartient autant à l'entreprise qu'aux gens
 * qui y travaillent, et c'est ce qui permet d'ouvrir une seule fiche pour voir
 * les deux façons de joindre quelqu'un.
 */
export function cartesDuProspect(fiche: FicheProspect): string[] {
  const raisonSociale = (fiche.entreprise.name ?? '').trim()
  if (!raisonSociale) return []

  const tousLesNumeros = numerosDuProspect(fiche, 'appel')
  if (tousLesNumeros.length === 0) return []

  // Les numéros de l'établissement se calculent SANS les contacts : quand le
  // gérant porte le même numéro que sa société — c'est le cas de 60 fiches sur
  // les 77 qui ont un `contacts.tel` — le dédoublonnage global l'attribue au
  // contact, et filtrer sur l'origine laisserait l'entreprise sans aucune fiche.
  const numerosEntreprise = numerosDuProspect({ entreprise: fiche.entreprise }, 'appel')
  const noteSequence = fiche.sequence ? `Séquence : ${fiche.sequence}` : null

  /** Une même ligne ne doit pas apparaître deux fois sur une fiche. */
  const sansDoublon = (numeros: NumeroProspect[]): NumeroProspect[] => {
    const vus = new Set<string>()
    return numeros.filter((n) => !vus.has(n.e164) && vus.add(n.e164))
  }

  const cartes: string[] = []
  const base = `sama-${fiche.entreprise.id ?? raisonSociale.replace(/[^a-z0-9]/gi, '').slice(0, 24)}`
  /** Numéros déjà portés par une fiche nominative. */
  const dejaPortes = new Set<string>()

  // Une fiche par contact qui a un numéro à lui.
  const contacts = (fiche.contacts ?? []).filter(Boolean) as ContactSource[]
  for (const c of contacts) {
    const nom = nomDuContact(c)
    if (!nom) continue
    const siens = tousLesNumeros.filter(
      (n) => n.origine.kind === 'contact' && n.origine.contactId === (c.id != null ? String(c.id) : null) &&
        n.origine.nom === nom,
    )
    if (siens.length === 0) continue

    const role = (c.role_title ?? '').trim() || null
    const prenom = (c.first_name ?? '').trim()
    const famille = (c.last_name ?? '').trim()
    const numeros = sansDoublon([...siens, ...numerosEntreprise])
    for (const n of numeros) dejaPortes.add(n.e164)

    cartes.push(
      rendreCarte({
        uid: `${base}-c${c.id ?? cartes.length}`,
        fn: `${raisonSociale} — ${prenom || nom}`,
        org: raisonSociale,
        nom: { famille: famille || raisonSociale, prenom },
        titre: role,
        // Les siens d'abord, puis ceux de l'établissement : l'ordre du répertoire
        // suit celui-là, et c'est son portable qu'on veut composer en premier.
        numeros,
        note: [role, noteSequence].filter(Boolean).join(' · ') || null,
      }),
    )
  }

  // La fiche de l'entreprise, SEULEMENT si elle apporte un numéro qu'aucune
  // fiche nominative ne porte déjà.
  //
  // Elle était émise systématiquement, ce qui créait deux entrées pour la même
  // ligne dès qu'un contact reprenait le numéro de sa société — 60 fiches du
  // parc sont dans ce cas. Un carnet qui reçoit deux fois le même numéro sous
  // deux noms proches, c'est exactement ce qu'un import mobile refuse ou
  // fusionne au hasard. Les 218 entreprises sans contact joignable gardent la
  // leur, puisque rien d'autre ne porte leur numéro.
  const inedits = numerosEntreprise.filter((n) => !dejaPortes.has(n.e164))
  if (inedits.length > 0) {
    cartes.push(
      rendreCarte({
        uid: `${base}-org`,
        fn: raisonSociale,
        org: raisonSociale,
        numeros: inedits,
        note: noteSequence,
      }),
    )
  }

  return cartes
}

/**
 * Le fichier `.vcf` complet.
 *
 * Terminé par un CRLF : certains lecteurs Android ignorent silencieusement la
 * dernière fiche quand le fichier ne finit pas par un saut de ligne.
 */
export function construireVCards(fiches: FicheProspect[]): string {
  const cartes = fiches.flatMap(cartesDuProspect)
  return cartes.length ? `${cartes.join('\r\n')}\r\n` : ''
}

/** Combien de fiches et de numéros cet export contiendra — annoncé avant le clic. */
export function compterExport(fiches: FicheProspect[]): { cartes: number; numeros: number } {
  let cartes = 0
  const numeros = new Set<string>()
  for (const f of fiches) {
    const c = cartesDuProspect(f)
    cartes += c.length
    for (const n of numerosDuProspect(f)) numeros.add(n.e164)
  }
  return { cartes, numeros: numeros.size }
}

/**
 * Taille d'un lot d'export.
 *
 * POURQUOI ON DÉCOUPE
 * Un `.vcf` de trois cents fiches se télécharge et s'ouvre sans erreur, mais
 * les répertoires mobiles n'en enregistrent qu'une : l'aperçu n'affiche que la
 * première carte et « Ajouter tous les contacts » ne fait rien. Le fichier est
 * pourtant conforme — c'est l'importeur qui renonce au-delà de quelques dizaines
 * de cartes, sans message.
 *
 * Cinquante est la taille que les importeurs avalent sans broncher, et elle
 * garde un nombre de lots gérable à la main (six pour le parc actuel).
 */
export const TAILLE_LOT = 50

/** Le nombre de lots nécessaires pour ces fiches. */
export function nombreDeLots(fiches: FicheProspect[], taille = TAILLE_LOT): number {
  const total = fiches.reduce((n, f) => n + cartesDuProspect(f).length, 0)
  return Math.max(1, Math.ceil(total / taille))
}

/**
 * Le fichier d'un lot donné (1-based), découpé À LA CARTE et non à l'entreprise.
 *
 * Découper par entreprise ferait des lots de tailles très inégales — certaines
 * en produisent trois, la plupart une seule — et on retomberait sur des lots
 * trop gros. Un contact peut donc se retrouver dans un lot différent de sa
 * société ; sans importance, chaque fiche est complète en elle-même.
 */
export function construireLot(
  fiches: FicheProspect[],
  lot: number,
  taille = TAILLE_LOT,
): { vcf: string; cartes: number; lots: number } {
  const toutes = fiches.flatMap(cartesDuProspect)
  const lots = Math.max(1, Math.ceil(toutes.length / taille))
  const index = Math.min(Math.max(1, lot), lots)
  const tranche = toutes.slice((index - 1) * taille, index * taille)
  return {
    vcf: tranche.length ? `${tranche.join('\r\n')}\r\n` : '',
    cartes: tranche.length,
    lots,
  }
}
