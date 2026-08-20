// rechauffeur-db.ts — la couche base du réchauffeur.
//
// Les décisions sont dans `courbe.ts`, `sante.ts`, `appariement.ts` et
// `contenu.ts`, tous purs. Ici on ne fait que lire et écrire — même découpage
// que `regulator.ts` / `regulator-db.ts`, `campagne.ts` / `campagne-db.ts`.
//
// ── COMMENT DEUX TICKS SIMULTANÉS SONT EMPÊCHÉS, ET POURQUOI PAS PAR UN VERROU
//
// J'avais écrit dans `docs/lemlist/08-rechauffeur.md` qu'on remplacerait la
// table `engine_locks` de l'original par `pg_advisory_lock`. **Ça ne marche
// pas ici** : un verrou consultatif de session survivrait au-delà de l'appel,
// parce que PostgREST rend sa connexion au pool sans la fermer — le verrou ne
// serait jamais relâché. Et sa variante transactionnelle tombe à la fin de
// CHAQUE requête, donc bien avant la fin d'un tick qui en fait vingt.
//
// La bonne réponse est de ne verrouiller ni le moteur ni la journée, mais
// **chaque objet, au moment où on le prend** :
//
//   · la journée se réclame par un `insert … on conflict do nothing` sur
//     `rechauffe_jours` — la clé primaire (expediteur, jour) fait l'arbitre, et
//     le perdant repart sans avoir rien planifié ;
//   · un message se réclame par un `update … where tentatives = <ce qu'on a lu>`
//     — si un autre tick l'a pris entre-temps, le compteur a bougé et l'update
//     ne touche aucune ligne.
//
// Aucun TTL à surveiller, aucun verrou orphelin après un timeout, et rien à
// libérer de travers. C'est l'atomicité de Postgres qui tranche, pas nous.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Temoin } from './appariement'
import type { Famille, Glissant } from './sante'
import { ouvrir } from './coffre'
import { reglagesDeviness, type ReglagesHote } from './hotes-connus'
import type { SecretTemoin } from './connecteur-imap'

export interface Expediteur {
  id: string
  email: string
  nom: string
  domaineSignant: string
  statut: 'en_pause' | 'chauffe' | 'entretien' | 'erreur' | 'dns_bloquant'
  demarreLe: string | null
  cibleJour: number
  plafondProspection: number
  fuseau: string
  fenetre: { de: number; a: number }
}

export interface MessageDu {
  id: string
  reference: string
  expediteurId: string
  temoinId: string
  objet: string
  texte: string
  tentatives: number
}

/** Les expéditeurs en chauffe. Un expéditeur en pause n'est pas planifié. */
export async function chargerExpediteurs(
  sb: SupabaseClient,
  seulementEnChauffe = true,
): Promise<Expediteur[]> {
  let q = sb.from('rechauffe_expediteurs').select('*').order('email')
  if (seulementEnChauffe) q = q.eq('statut', 'chauffe')
  const { data, error } = await q
  if (error) throw new Error(`rechauffe_expediteurs: ${error.message}`)

  return (data ?? []).map((r) => ({
    id: String(r.id),
    email: String(r.email),
    nom: String(r.nom ?? ''),
    domaineSignant: String(r.domaine_signant),
    statut: r.statut,
    demarreLe: r.demarre_le ?? null,
    cibleJour: Number(r.cible_jour),
    plafondProspection: Number(r.plafond_prospection),
    fuseau: String(r.fuseau),
    fenetre: { de: Number(r.fenetre_de), a: Number(r.fenetre_a) },
  }))
}

/** Le maillage de témoins. */
export async function chargerTemoins(sb: SupabaseClient): Promise<Temoin[]> {
  const { data, error } = await sb
    .from('rechauffe_temoins')
    .select('id, email, nom, famille, taux_reponse, plafond_jour, actif, repond')
    .order('email')
  if (error) throw new Error(`rechauffe_temoins: ${error.message}`)

  return (data ?? []).map((r) => ({
    id: String(r.id),
    email: String(r.email),
    nom: String(r.nom ?? ''),
    famille: r.famille as Famille,
    plafondJour: Number(r.plafond_jour),
    // Un témoin qui ne répond pas garde un taux nul : c'est un seul chiffre à
    // lire dans `doitRepondre`, plutôt que deux drapeaux à croiser partout.
    tauxReponse: r.repond ? Number(r.taux_reponse) : 0,
    actif: Boolean(r.actif),
  }))
}

/**
 * De quoi appareiller : qui a été servi ces quatre derniers jours, et combien
 * chaque témoin a déjà reçu aujourd'hui.
 *
 * LA CHARGE DU JOUR SE COMPTE TOUS EXPÉDITEURS CONFONDUS. Le plafond protège
 * la boîte du témoin, pas la comptabilité d'un expéditeur : deux adresses
 * d'envoi qui écriraient chacune huit fois au même témoin lui en feraient seize.
 */
export async function historiqueAppariement(
  sb: SupabaseClient,
  expediteurId: string,
  maintenant: Date = new Date(),
): Promise<{ recents: string[]; chargeDuJour: Record<string, number> }> {
  const ilYaQuatreJours = new Date(maintenant.getTime() - 4 * 86_400_000).toISOString()
  const debutDuJour = new Date(
    Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate()),
  ).toISOString()

  const [recentsRes, chargeRes] = await Promise.all([
    sb
      .from('rechauffe_messages')
      .select('temoin_id, rechauffe_temoins(email)')
      .eq('expediteur_id', expediteurId)
      .eq('sens', 'sortant')
      .gte('prevu_le', ilYaQuatreJours),
    sb
      .from('rechauffe_messages')
      .select('temoin_id')
      .eq('sens', 'sortant')
      .gte('prevu_le', debutDuJour),
  ])
  if (recentsRes.error) throw new Error(`recents: ${recentsRes.error.message}`)
  if (chargeRes.error) throw new Error(`charge: ${chargeRes.error.message}`)

  const recents: string[] = []
  for (const r of recentsRes.data ?? []) {
    const jointure = (r as { rechauffe_temoins?: { email?: string } | { email?: string }[] })
      .rechauffe_temoins
    const email = Array.isArray(jointure) ? jointure[0]?.email : jointure?.email
    if (email) recents.push(email)
  }

  const chargeDuJour: Record<string, number> = {}
  for (const r of chargeRes.data ?? []) {
    const id = String(r.temoin_id)
    chargeDuJour[id] = (chargeDuJour[id] ?? 0) + 1
  }

  return { recents, chargeDuJour }
}

/**
 * Réclame la journée pour un expéditeur.
 *
 * Rend `true` une seule fois par (expéditeur, jour), quel que soit le nombre de
 * ticks qui se présentent — c'est la clé primaire de `rechauffe_jours` qui
 * tranche, pas un verrou qu'on aurait à relâcher.
 */
export async function reclamerLaJournee(
  sb: SupabaseClient,
  expediteurId: string,
  jour: string,
  jourDeChauffe: number,
): Promise<boolean> {
  const { data, error } = await sb
    .from('rechauffe_jours')
    .upsert(
      { expediteur_id: expediteurId, jour, jour_de_chauffe: jourDeChauffe },
      { onConflict: 'expediteur_id,jour', ignoreDuplicates: true },
    )
    .select('jour')
  if (error) throw new Error(`reclamerLaJournee: ${error.message}`)
  return (data ?? []).length > 0
}

export interface MessageAPlanifier {
  reference: string
  expediteurId: string
  temoinId: string
  objet: string
  texte: string
  prevuLe: string
}

/** Écrit les messages du jour. */
export async function planifierMessages(
  sb: SupabaseClient,
  messages: MessageAPlanifier[],
): Promise<number> {
  if (messages.length === 0) return 0
  const { error } = await sb.from('rechauffe_messages').insert(
    messages.map((m) => ({
      reference: m.reference,
      expediteur_id: m.expediteurId,
      temoin_id: m.temoinId,
      objet: m.objet,
      texte: m.texte,
      prevu_le: m.prevuLe,
      sens: 'sortant',
    })),
  )
  if (error) throw new Error(`planifierMessages: ${error.message}`)

  await sb
    .from('rechauffe_jours')
    .update({ prevus: messages.length })
    .eq('expediteur_id', messages[0].expediteurId)
    .eq('jour', messages[0].prevuLe.slice(0, 10))

  return messages.length
}

/** Les messages dus, du plus ancien au plus récent. */
export async function messagesDus(
  sb: SupabaseClient,
  limite: number,
  maintenant: Date = new Date(),
): Promise<MessageDu[]> {
  const { data, error } = await sb
    .from('rechauffe_messages')
    .select('id, reference, expediteur_id, temoin_id, objet, texte, tentatives')
    .is('envoye_le', null)
    .lte('prevu_le', maintenant.toISOString())
    .lt('tentatives', 3)
    .order('prevu_le')
    .limit(limite)
  if (error) throw new Error(`messagesDus: ${error.message}`)

  return (data ?? []).map((r) => ({
    id: String(r.id),
    reference: String(r.reference),
    expediteurId: String(r.expediteur_id),
    temoinId: String(r.temoin_id),
    objet: String(r.objet),
    texte: String(r.texte ?? ''),
    tentatives: Number(r.tentatives),
  }))
}

/**
 * Prend un message. Rend `false` si un autre tick l'a pris entre-temps.
 *
 * Le compteur de tentatives sert de jeton : il n'a pas la valeur qu'on a lue
 * dès qu'un autre est passé, et l'`update` ne touche alors aucune ligne. Un
 * message pris compte sa tentative même si l'envoi échoue ensuite — c'est ce
 * qui borne les reprises à trois plutôt que de boucler à l'infini.
 */
export async function reclamerMessage(
  sb: SupabaseClient,
  message: MessageDu,
): Promise<boolean> {
  const { data, error } = await sb
    .from('rechauffe_messages')
    .update({ tentatives: message.tentatives + 1 })
    .eq('id', message.id)
    .eq('tentatives', message.tentatives)
    .is('envoye_le', null)
    .select('id')
  if (error) throw new Error(`reclamerMessage: ${error.message}`)
  return (data ?? []).length > 0
}

export async function marquerEnvoye(
  sb: SupabaseClient,
  messageId: string,
  resendId: string | null,
  quand: Date = new Date(),
  // Décidée UNE FOIS, à l'envoi — jamais retirée en repassant : c'est ce qui
  // évite qu'un témoin décide de répondre un jour, puis l'autre, au hasard de
  // quand le tick l'observe.
  reponseDueLe: Date | null = null,
): Promise<void> {
  await sb
    .from('rechauffe_messages')
    .update({
      envoye_le: quand.toISOString(),
      resend_id: resendId,
      erreur: null,
      reponse_due_le: reponseDueLe?.toISOString() ?? null,
    })
    .eq('id', messageId)
}

export async function marquerEchec(
  sb: SupabaseClient,
  messageId: string,
  erreur: string,
): Promise<void> {
  await sb.from('rechauffe_messages').update({ erreur }).eq('id', messageId)
}

/** Le journal est append-only : il ne doit jamais faire échouer un envoi. */
export async function journaliser(
  sb: SupabaseClient,
  genre: string,
  detail: Record<string, unknown> = {},
  expediteurId?: string,
  messageId?: string,
): Promise<void> {
  try {
    await sb.from('rechauffe_journal').insert({
      genre,
      detail,
      expediteur_id: expediteurId ?? null,
      message_id: messageId ?? null,
    })
  } catch {
    /* la mémoire de l'outil ne bloque pas son travail */
  }
}

/**
 * Ce que l'expéditeur a obtenu sur les sept derniers jours.
 *
 * Lu dans l'agrégat, pas dans les messages : sept jours de messages font
 * quelques centaines de lignes à ramener pour six additions.
 */
export async function glissant7Jours(
  sb: SupabaseClient,
  expediteurId: string,
  aujourdHui: Date = new Date(),
): Promise<Glissant> {
  const depuis = new Date(aujourdHui.getTime() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const { data, error } = await sb
    .from('rechauffe_jours')
    .select('envoyes, en_boite, en_spam, introuvables, reponses, echecs')
    .eq('expediteur_id', expediteurId)
    .gte('jour', depuis)
  if (error) throw new Error(`glissant7Jours: ${error.message}`)

  const total: Glissant = {
    envoyes: 0, enBoite: 0, enSpam: 0, introuvables: 0, reponses: 0, echecs: 0,
  }
  for (const r of data ?? []) {
    total.envoyes += Number(r.envoyes ?? 0)
    total.enBoite += Number(r.en_boite ?? 0)
    total.enSpam += Number(r.en_spam ?? 0)
    total.introuvables += Number(r.introuvables ?? 0)
    total.reponses += Number(r.reponses ?? 0)
    total.echecs += Number(r.echecs ?? 0)
  }
  return total
}

/** Recompte la journée depuis les messages — la source, pas un compteur qu'on incrémente. */
export async function recompterLeJour(
  sb: SupabaseClient,
  expediteurId: string,
  jour: string,
): Promise<void> {
  const debut = `${jour}T00:00:00.000Z`
  const fin = `${jour}T23:59:59.999Z`
  const { data, error } = await sb
    .from('rechauffe_messages')
    .select('envoye_le, erreur, placement, sorti_du_spam_le, repondu_le, sens')
    .eq('expediteur_id', expediteurId)
    .gte('prevu_le', debut)
    .lte('prevu_le', fin)
  if (error) throw new Error(`recompterLeJour: ${error.message}`)

  const lignes = (data ?? []).filter((r) => r.sens === 'sortant')
  const compte = {
    prevus: lignes.length,
    envoyes: lignes.filter((r) => r.envoye_le).length,
    en_boite: lignes.filter((r) => r.placement === 'boite').length,
    en_spam: lignes.filter((r) => r.placement === 'spam').length,
    introuvables: lignes.filter((r) => r.placement === 'introuvable').length,
    sortis_du_spam: lignes.filter((r) => r.sorti_du_spam_le).length,
    reponses: lignes.filter((r) => r.repondu_le).length,
    echecs: lignes.filter((r) => !r.envoye_le && r.erreur).length,
  }
  const mesures = compte.en_boite + compte.en_spam
  await sb
    .from('rechauffe_jours')
    .update({
      ...compte,
      taux_placement: mesures > 0 ? compte.en_boite / mesures : null,
    })
    .eq('expediteur_id', expediteurId)
    .eq('jour', jour)
}

// ═══════════════════════════════════════════════════════════════════════
// Mesure du placement, sauvetage du spam, réponses des témoins.
//
// Ce qui suit complète le moteur : jusqu'ici il PLANIFIAIT et ENVOYAIT sans
// jamais savoir où le courrier atterrissait. Ces fonctions lui donnent la
// vue qui manquait — lue en IMAP, chez le témoin, jamais chez nous.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Le secret d'un témoin, déchiffré, avec ses réglages de serveur.
 *
 * `null` si le témoin n'a pas de secret (envoi à l'aveugle assumé) — ce n'est
 * pas une erreur, c'est l'état par défaut d'un témoin fraîchement ajouté sans
 * mot de passe.
 */
export async function secretDuTemoin(
  sb: SupabaseClient,
  temoinId: string,
): Promise<{ secret: SecretTemoin; hote: ReglagesHote } | null> {
  const { data, error } = await sb
    .from('rechauffe_temoins')
    .select('email, secret_enc, config')
    .eq('id', temoinId)
    .maybeSingle()
  if (error) throw new Error(`secretDuTemoin: ${error.message}`)
  if (!data?.secret_enc) return null

  const scelle = ouvrir<{ motDePasse: string }>(data.secret_enc)
  const config = (data.config ?? {}) as { hote?: string; port?: number }

  // On préfère TOUJOURS les réglages connus du fournisseur : un hôte tapé à la
  // main est une source d'erreur que `hotes-connus.ts` élimine pour les cinq
  // familles qu'on recommande. Le `config` manuel ne sert que si le domaine
  // est vraiment inconnu.
  const connu = reglagesDeviness(data.email)
  const hote: ReglagesHote =
    connu ??
    ({
      imapHote: config.hote ?? '', imapPort: config.port ?? 993, imapSecurise: true,
      smtpHote: config.hote ?? '', smtpPort: 465, smtpSecurise: true,
    } satisfies ReglagesHote)
  if (!hote.imapHote) return null

  return { secret: { utilisateur: data.email, motDePasse: scelle.motDePasse }, hote }
}

/** Un message retrouvé par sa référence — `null` si elle n'est pas la nôtre ou trop ancienne pour le tick. */
export async function messageParReference(
  sb: SupabaseClient,
  reference: string,
): Promise<{ id: string; expediteurId: string; temoinId: string; placement: string } | null> {
  const { data, error } = await sb
    .from('rechauffe_messages')
    .select('id, expediteur_id, temoin_id, placement')
    .eq('reference', reference)
    .maybeSingle()
  if (error) throw new Error(`messageParReference: ${error.message}`)
  if (!data) return null
  return {
    id: String(data.id),
    expediteurId: String(data.expediteur_id),
    temoinId: String(data.temoin_id),
    placement: String(data.placement),
  }
}

export async function marquerPlacement(
  sb: SupabaseClient,
  messageId: string,
  placement: 'boite' | 'spam',
  quand: Date = new Date(),
): Promise<void> {
  await sb
    .from('rechauffe_messages')
    .update({ placement, placement_le: quand.toISOString() })
    .eq('id', messageId)
}

export async function marquerSortiDuSpam(
  sb: SupabaseClient,
  messageId: string,
  quand: Date = new Date(),
): Promise<void> {
  await sb.from('rechauffe_messages').update({ sorti_du_spam_le: quand.toISOString() }).eq('id', messageId)
}

/**
 * Un message envoyé depuis plus de `seuilHeures` et jamais retrouvé est perdu
 * — ni boîte, ni spam. C'est le pire des trois cas : on ne sait même pas quoi
 * corriger. Rejoué à chaque tick, sans effet sur ce qui est déjà mesuré.
 */
export async function marquerIntrouvables(
  sb: SupabaseClient,
  seuilHeures = 6,
  maintenant: Date = new Date(),
): Promise<number> {
  const borne = new Date(maintenant.getTime() - seuilHeures * 3_600_000).toISOString()
  const { data, error } = await sb
    .from('rechauffe_messages')
    .update({ placement: 'introuvable', placement_le: maintenant.toISOString() })
    .eq('sens', 'sortant')
    .eq('placement', 'attente')
    .not('envoye_le', 'is', null)
    .lt('envoye_le', borne)
    .select('id')
  if (error) throw new Error(`marquerIntrouvables: ${error.message}`)
  return (data ?? []).length
}

export interface MessageARepondre {
  id: string
  expediteurId: string
  temoinId: string
  objetOriginal: string
  messageIdRfc: string | null
}

/** Les messages de chauffe dont un témoin doit désormais répondre. */
export async function messagesARepondre(
  sb: SupabaseClient,
  limite: number,
  maintenant: Date = new Date(),
): Promise<MessageARepondre[]> {
  const { data, error } = await sb
    .from('rechauffe_messages')
    .select('id, expediteur_id, temoin_id, objet, rfc_message_id')
    .eq('sens', 'sortant')
    .in('placement', ['boite', 'spam']) // un message introuvable ou en attente ne peut pas être « lu »
    .is('repondu_le', null)
    .not('reponse_due_le', 'is', null)
    .lte('reponse_due_le', maintenant.toISOString())
    .order('reponse_due_le')
    .limit(limite)
  if (error) throw new Error(`messagesARepondre: ${error.message}`)

  return (data ?? []).map((r) => ({
    id: String(r.id),
    expediteurId: String(r.expediteur_id),
    temoinId: String(r.temoin_id),
    objetOriginal: String(r.objet),
    messageIdRfc: r.rfc_message_id ?? null,
  }))
}

export async function marquerRepondu(sb: SupabaseClient, messageId: string, quand: Date = new Date()): Promise<void> {
  await sb.from('rechauffe_messages').update({ repondu_le: quand.toISOString() }).eq('id', messageId)
}

/** Enregistre la réponse elle-même comme un nouveau message, sens `reponse`. */
export async function enregistrerReponse(
  sb: SupabaseClient,
  args: {
    expediteurId: string; temoinId: string; reference: string
    objet: string; messageIdRfc: string | null
  },
  quand: Date = new Date(),
): Promise<void> {
  const { error } = await sb.from('rechauffe_messages').insert({
    reference: args.reference,
    expediteur_id: args.expediteurId,
    temoin_id: args.temoinId,
    sens: 'reponse',
    objet: args.objet,
    texte: '', // la réponse n'a pas besoin d'être relue : son texte a déjà servi à l'envoi
    rfc_message_id: args.messageIdRfc,
    prevu_le: quand.toISOString(),
    envoye_le: quand.toISOString(),
  })
  if (error) throw new Error(`enregistrerReponse: ${error.message}`)
}
