// reception.ts — ce qu'un message entrant est, avant de savoir qui l'a apporté.
//
// POURQUOI CE MODULE EXISTE, ET POURQUOI IL EST PUR
// Le transport n'est pas tranché : un routage d'e-mail vers un webhook, une
// relève IMAP en cron, ou les deux. Ce qui vient APRÈS, en revanche, est
// identique dans les trois cas — reconnaître l'inscription, distinguer une
// vraie réponse d'un accusé automatique, garder le texte utile. Écrire ça ici,
// sans base ni réseau, c'est ce qui permet de brancher le transport plus tard
// sans rien rouvrir.
//
// ── LE PIÈGE PRINCIPAL : UN ABSENT N'A PAS RÉPONDU ────────────────────────
// `declarerReponse` débloque une attente et REANCRE la suite de la séquence.
// Un « je suis en congés jusqu'au 25 août » traité comme une réponse ferait
// donc partir l'étape suivante — écrite pour quelqu'un qui vient de parler — à
// quelqu'un qui n'a rien lu. C'est exactement la faute des 59 inscriptions
// gelées, prise par l'autre bout : là on n'envoyait rien à qui attendait, ici
// on enverrait « merci de votre retour » à un répondeur.
//
// D'où trois natures, et une seule qui débloque :
//   · `reponse`     — un humain a écrit. Elle seule appelle `declarerReponse`.
//   · `automatique` — absence, accusé de réception, réponse de robot. Elle
//     entre dans le fil (elle prouve au moins que la boîte existe et lit), mais
//     ne fait avancer aucune séquence.
//   · `rebond`      — un serveur a renvoyé le message. Ni réponse, ni humain.
//
// ── L'APPARIEMENT : EXACT D'ABORD, HEURISTIQUE ENSUITE, JAMAIS DEVINÉ ─────
// Le sous-adressage (`contact+<inscription>@…`, éprouvé chez LWS le 19/08 et
// allumé depuis) porte l'identifiant DANS le destinataire du retour : aucun
// en-tête à faire survivre, aucun client de messagerie à qui faire confiance.
// C'est le seul moyen qui ne se trompe pas, et c'est celui qui servira pour
// tout ce qui part depuis le 19/08.
//
// Restent les messages d'avant, et ceux dont le client a mangé le `+`. Pour
// eux, `in-reply-to` désigne l'envoi d'origine. Et si même ça manque, il ne
// reste que l'adresse de l'expéditeur — qui suffit à RANGER le message dans le
// bon fil, mais pas à faire avancer une séquence : deux inscriptions peuvent
// viser la même adresse, et se tromper d'inscription ferait partir le mauvais
// message. Le classement se fait donc seul ; le déblocage attend un clic.

/* ── Ce qu'un transport doit fournir ─────────────────────────────────────── */

/**
 * Un message reçu, normalisé.
 *
 * Volontairement pauvre : tout transport sait remplir ces champs, et aucun
 * n'est obligé de les remplir tous. `entetes` est le sac de secours — c'est là
 * que se lisent les marqueurs d'automate, dont les noms varient d'un serveur à
 * l'autre.
 */
export interface MessageEntrant {
  /** L'expéditeur, tel qu'il arrive (`Nom <a@b>` accepté). */
  de: string
  /** Nos adresses touchées : `to` + `cc`. C'est là que vit le sous-adressage. */
  pour: readonly string[]
  objet: string | null
  texte: string | null
  html?: string | null
  /** `Message-ID` du message reçu — la clé d'idempotence. */
  messageId?: string | null
  /** `In-Reply-To`, puis `References` en repli. */
  enReponseA?: string | null
  /** Quand le message est arrivé. Défaut : maintenant, côté base. */
  recuLe?: string | null
  /** Les en-têtes bruts, en minuscules de préférence. */
  entetes?: Readonly<Record<string, string>>
}

/* ── Les adresses ────────────────────────────────────────────────────────── */

/** `Nom Prénom <a@b.fr>` → `a@b.fr`. Rend `null` si rien ne ressemble à une adresse. */
export function adresseNue(brut: string | null | undefined): string | null {
  const v = (brut ?? '').trim()
  if (!v) return null
  const entreChevrons = v.match(/<([^>]+)>/)
  const candidat = (entreChevrons ? entreChevrons[1] : v).trim().toLowerCase()
  return candidat.includes('@') ? candidat : null
}

/** Le domaine d'une adresse, ou `null`. */
export function domaineDe(adresse: string | null | undefined): string | null {
  const a = adresseNue(adresse)
  const at = a ? a.lastIndexOf('@') : -1
  return at > 0 && a ? a.slice(at + 1) : null
}

/* ── La nature du message ────────────────────────────────────────────────── */

export type NatureEntrant = 'reponse' | 'automatique' | 'rebond'

export interface Nature {
  nature: NatureEntrant
  /**
   * CE QUI A TRANCHÉ, en clair. Un message rangé « automatique » à tort est
   * invisible autrement : on ne saurait pas quoi corriger. Le motif remonte
   * jusqu'à l'écran.
   */
  motif: string
}

/** Les expéditeurs qui ne sont jamais quelqu'un. */
const ROBOTS = ['mailer-daemon', 'postmaster', 'no-reply', 'noreply', 'ne-pas-repondre', 'donotreply']

/**
 * Les préfixes d'objet d'une absence, dans les langues qu'on croise. La liste
 * est courte exprès : elle n'est qu'un filet de secours derrière les en-têtes,
 * et un objet est trop facile à confondre avec du texte écrit à la main.
 */
const OBJETS_AUTOMATIQUES = [
  'reponse automatique',
  'réponse automatique',
  'reponse auto',
  'absence du bureau',
  'message d absence',
  'automatic reply',
  'auto reply',
  'autoreply',
  'out of office',
  'automatische antwort',
  'respuesta automatica',
  'risposta automatica',
]

const sansAccentsNiPonctuation = (v: string): string =>
  v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/**
 * Un humain, un automate, ou un serveur ?
 *
 * L'ordre compte : le rebond se reconnaît en premier parce qu'un rapport de
 * non-remise porte souvent AUSSI les marqueurs d'automate, et les deux ne se
 * traitent pas pareil — l'un condamne une adresse, l'autre prouve qu'elle vit.
 */
export function natureDuMessage(msg: MessageEntrant): Nature {
  const h = enMinuscules(msg.entetes)
  const de = adresseNue(msg.de) ?? ''
  const locale = de.split('@')[0] ?? ''
  const objet = sansAccentsNiPonctuation(msg.objet ?? '')

  // ── Rebond ───────────────────────────────────────────────────────────────
  // Le rapport de non-remise a une forme normalisée (RFC 3464) que personne
  // n'imite : `multipart/report; report-type=delivery-status`.
  const typeContenu = h['content-type'] ?? ''
  if (/report-type\s*=\s*"?delivery-status/i.test(typeContenu)) {
    return { nature: 'rebond', motif: 'rapport de non-remise (RFC 3464)' }
  }
  if (locale === 'mailer-daemon' || locale === 'postmaster') {
    return { nature: 'rebond', motif: `renvoyé par ${locale}` }
  }
  if (/^(undelivered mail|delivery status notification|mail delivery|echec de remise)/.test(objet)) {
    return { nature: 'rebond', motif: 'objet de non-remise' }
  }

  // ── Automate ─────────────────────────────────────────────────────────────
  // `Auto-Submitted` est la seule déclaration normalisée (RFC 3834) : tout ce
  // qui n'est pas `no` est une machine qui parle.
  const autoSubmitted = (h['auto-submitted'] ?? '').trim().toLowerCase()
  if (autoSubmitted && autoSubmitted !== 'no') {
    return { nature: 'automatique', motif: `auto-submitted: ${autoSubmitted}` }
  }
  for (const entete of ['x-autoreply', 'x-autorespond', 'x-auto-response-suppress', 'x-autoreply-from']) {
    if (h[entete]) return { nature: 'automatique', motif: entete }
  }
  const precedence = (h['precedence'] ?? '').trim().toLowerCase()
  if (['bulk', 'auto_reply', 'junk', 'list'].includes(precedence)) {
    return { nature: 'automatique', motif: `precedence: ${precedence}` }
  }
  // Enveloppe vide : la convention pour « ne me réponds surtout pas ». Elle
  // sert aux rebonds ET aux absences ; arrivée ici, ce n'est pas un rebond.
  const retour = (h['return-path'] ?? '').trim()
  if (retour === '<>' || retour === '') {
    if (h['return-path'] !== undefined) {
      return { nature: 'automatique', motif: 'return-path vide' }
    }
  }
  if (ROBOTS.some((r) => locale.includes(r))) {
    return { nature: 'automatique', motif: `expéditeur ${locale}` }
  }
  if (OBJETS_AUTOMATIQUES.some((p) => objet.startsWith(p))) {
    return { nature: 'automatique', motif: 'objet d’absence' }
  }

  return { nature: 'reponse', motif: 'aucun marqueur d’automate' }
}

/* ── L'appariement ───────────────────────────────────────────────────────── */

export type MoyenAppariement = 'sous_adressage' | 'reference' | 'adresse' | 'aucun'

export interface Appariement {
  /** L'inscription visée, quand le sous-adressage la porte. */
  inscriptionId: string | null
  /** L'identifiant de l'envoi d'origine, quand `in-reply-to` le porte. */
  reference: string | null
  moyen: MoyenAppariement
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * À quelle inscription ce message répond-il ?
 *
 * Ne consulte QUE le message : c'est la couche base qui saura résoudre une
 * `reference` ou une adresse. Ici on dit seulement de quel moyen on dispose —
 * et c'est ce moyen qui décidera plus loin si l'on peut débloquer une séquence
 * tout seul.
 */
export function apparier(msg: MessageEntrant): Appariement {
  for (const destinataire of msg.pour) {
    const inscription = inscriptionDansAdresse(destinataire)
    if (inscription) return { inscriptionId: inscription, reference: null, moyen: 'sous_adressage' }
  }

  const reference = premiereReference(msg.enReponseA)
  if (reference) return { inscriptionId: null, reference, moyen: 'reference' }

  return { inscriptionId: null, reference: null, moyen: adresseNue(msg.de) ? 'adresse' : 'aucun' }
}

/**
 * L'inscription encodée dans un `+`.
 *
 * Jumelle de `adresseDeReponse` (`adresse-reponse.ts`), et volontairement
 * recopiée ici plutôt qu'importée : celle-là écrit une adresse à partir d'une
 * inscription, celle-ci lit un destinataire quelconque. Un jeton qui n'est pas
 * un UUID est REFUSÉ plutôt qu'assaini — un identifiant tronqué apparierait la
 * réponse à la mauvaise inscription, ce qui est pire que de ne pas l'apparier.
 */
function inscriptionDansAdresse(adresse: string | null | undefined): string | null {
  const a = adresseNue(adresse)
  if (!a) return null
  const locale = a.split('@')[0]
  const plus = locale.indexOf('+')
  if (plus < 0) return null
  const jeton = locale.slice(plus + 1)
  return UUID.test(jeton) ? jeton : null
}

/**
 * `<abc@domaine>` → `abc`. `References` en contient plusieurs séparées par des
 * espaces ; le PREMIER est la racine du fil, le DERNIER le message auquel on
 * répond — c'est celui-là qu'on veut, et `In-Reply-To` ne porte que lui.
 */
export function premiereReference(brut: string | null | undefined): string | null {
  const v = (brut ?? '').trim()
  if (!v) return null
  const jetons = v.match(/<[^>]+>/g)
  const dernier = jetons && jetons.length > 0 ? jetons[jetons.length - 1] : v
  const nu = dernier.replace(/^<|>$/g, '').trim()
  return nu.length > 0 ? nu : null
}

/**
 * L'identifiant Resend caché dans une référence, s'il y en a un.
 *
 * Resend forme son `Message-ID` avec l'identifiant qu'il nous a rendu à
 * l'envoi. On ne stocke pas l'en-tête complet des envois passés, mais on stocke
 * `resend_id` : extraire l'UUID d'une référence permet donc de retrouver
 * l'envoi d'origine sans rien avoir à rattraper.
 *
 * ⚠️ C'est une OBSERVATION du format, pas une garantie contractuelle. Si Resend
 * change de forme, cette voie rendra `null` et l'appariement retombera sur
 * l'adresse — dégradé, jamais faux.
 */
export function inscriptionDepuisReference(reference: string | null | undefined): string | null {
  const v = (reference ?? '').trim().toLowerCase()
  if (!v) return null
  const uuid = v.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)
  return uuid ? uuid[0] : null
}

/**
 * Peut-on faire avancer la séquence tout seul ?
 *
 * UN SEUL ENDROIT DÉCIDE, parce que la règle est le cœur de la couche : il faut
 * à la fois un humain qui parle et un appariement exact. Un accusé automatique
 * apparié parfaitement ne débloque pas ; une vraie réponse reconnue seulement
 * par l'adresse de son expéditeur non plus — elle sera rangée dans le fil, et
 * un humain cliquera.
 */
export function peutDebloquer(nature: NatureEntrant, moyen: MoyenAppariement): boolean {
  if (nature !== 'reponse') return false
  return moyen === 'sous_adressage' || moyen === 'reference'
}

/* ── Le texte utile ──────────────────────────────────────────────────────── */

/**
 * Les entames de citation, dans l'ordre où on les rencontre. Chacune marque le
 * début du message d'ORIGINE recopié sous la réponse.
 */
const ENTAMES_DE_CITATION: readonly RegExp[] = [
  /^>/, // la citation classique
  /^\s*le .{4,60}\s+a écrit\s*:/i, // Gmail / Thunderbird en français
  /^\s*on .{4,60}\s+wrote\s*:/i, // les mêmes en anglais
  /^\s*-{2,}\s*(message d['’]origine|original message|message transféré)\s*-{2,}/i,
  /^\s*_{10,}\s*$/, // le trait d'Outlook
  /^\s*(de|from)\s*:\s*.+<.+@.+>/i, // l'en-tête recopié par Outlook
  /^\s*envoyé\s*:\s*/i,
]

/**
 * Le texte que le prospect a réellement écrit, sans l'historique recopié.
 *
 * ⚠️ NE REND JAMAIS UNE CHAÎNE VIDE. Une découpe trop gourmande sur un client
 * de messagerie inconnu effacerait la réponse elle-même — et une réponse perdue
 * est bien pire qu'une réponse trop longue. Quand la coupe ne laisse rien, on
 * rend le texte entier.
 */
export function texteUtile(texte: string | null | undefined): string {
  const brut = (texte ?? '').replace(/\r\n/g, '\n')
  if (!brut.trim()) return ''

  const lignes = brut.split('\n')
  let coupe = lignes.length
  for (let i = 0; i < lignes.length; i += 1) {
    if (ENTAMES_DE_CITATION.some((r) => r.test(lignes[i]))) {
      coupe = i
      break
    }
  }

  const garde = lignes.slice(0, coupe).join('\n').trim()
  return garde.length > 0 ? garde : brut.trim()
}

/** Un aperçu d'une ligne, pour la liste des fils. */
export function apercuEntrant(msg: MessageEntrant, max = 140): string {
  const t = texteUtile(msg.texte).replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1).trimEnd()}…`
}

/* ── Outils ──────────────────────────────────────────────────────────────── */

function enMinuscules(entetes: Readonly<Record<string, string>> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(entetes ?? {})) out[k.trim().toLowerCase()] = String(v)
  return out
}
