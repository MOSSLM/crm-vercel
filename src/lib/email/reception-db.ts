// reception-db.ts — faire entrer un message dans le CRM, une fois pour toutes.
//
// CE FICHIER EST LE SEUL À ÉCRIRE UN ENTRANT. Le transport (webhook de routage,
// relève IMAP, ou les deux) n'a qu'à normaliser son message en `MessageEntrant`
// et appeler `enregistrerEntrant`. C'est ce découpage qui permet de brancher le
// transport plus tard sans rouvrir la logique — et surtout qui garantit qu'un
// second transport ne réinventera pas une deuxième façon de décider.
//
// ── L'IDEMPOTENCE EST UNE INSERTION, PAS UNE LECTURE ─────────────────────
// On n'interroge pas la base pour savoir si le message est déjà là : deux
// livraisons simultanées passeraient toutes les deux le contrôle avant que
// l'une n'écrive. C'est l'index unique sur `message_id` qui tranche, et le
// conflit (`23505`) qui dit « déjà vu ». Même parade que le webhook Resend.
//
// Conséquence assumée : un message SANS `Message-ID` n'est pas protégé. Il
// entre quand même — perdre une réponse serait pire qu'en avoir deux — mais le
// bilan le DIT (`protege: false`), pour qu'un doublon dans un fil ne passe pas
// pour un mystère.
//
// ── CE QUI DÉBLOQUE, ET CE QUI ATTEND UN CLIC ────────────────────────────
// `peutDebloquer` (module pur) décide seul. Ici on obéit. Un message rangé sans
// débloquer n'est pas un échec : il est dans le fil, daté, à sa place, et
// l'écran propose « c'est bien une réponse » en un clic.

import type { SupabaseClient } from '@supabase/supabase-js'
import { declarerReponse } from '@/lib/automations/reply'
import {
  adresseNue,
  apparier,
  inscriptionDepuisReference,
  natureDuMessage,
  peutDebloquer,
  texteUtile,
  type MessageEntrant,
  type MoyenAppariement,
  type NatureEntrant,
} from '@/lib/email/reception'

export interface BilanReception {
  /** L'identifiant de la ligne écrite dans le fil, ou `null` si rien n'a été écrit. */
  messageId: string | null
  /** Déjà reçu : rien n'a été écrit, et c'est un succès. */
  doublon: boolean
  nature: NatureEntrant
  /** Ce qui a fait dire « automatique » ou « rebond » — en clair. */
  motif: string
  moyen: MoyenAppariement
  inscriptionId: string | null
  entrepriseId: number | null
  /** La séquence a-t-elle réellement repris ? */
  debloque: boolean
  /**
   * Pourquoi elle n'a pas repris, quand elle n'a pas repris. Ce champ est la
   * raison d'être du bilan : « rien ne s'est passé » sans motif est exactement
   * l'écran muet que ce projet corrige partout ailleurs.
   */
  raison: string | null
  /** `false` quand le message n'avait pas de `Message-ID` : rejeu possible. */
  protege: boolean
}

/** Ce qu'on retrouve d'un prospect à partir de ce qu'on a pu apparier. */
interface Rattachement {
  inscriptionId: string | null
  automationId: string | null
  entrepriseId: number | null
  contactId: string | null
  opportuniteId: string | null
}

const VIDE: Rattachement = {
  inscriptionId: null,
  automationId: null,
  entrepriseId: null,
  contactId: null,
  opportuniteId: null,
}

/**
 * Enregistre un message reçu, et fait repartir la séquence quand c'est légitime.
 *
 * Ne jette jamais sur un message mal formé : un transport qui reçoit une erreur
 * réessaie, et réessayer sur un message qu'on ne saura jamais lire, c'est une
 * boucle. Ce qui ne va pas se dit dans le bilan.
 */
export async function enregistrerEntrant(
  sb: SupabaseClient,
  msg: MessageEntrant,
): Promise<BilanReception> {
  const { nature, motif } = natureDuMessage(msg)
  const appariement = apparier(msg)
  const rattachement = await retrouver(sb, msg, appariement.inscriptionId, appariement.reference)

  const recuLe = msg.recuLe ?? new Date().toISOString()
  const de = adresseNue(msg.de)
  const pour = msg.pour.map((p) => adresseNue(p)).find(Boolean) ?? ''

  const ligne = {
    channel: 'email',
    direction: 'entrant',
    // L'auteur est le prospect, qui n'a pas de compte : la colonne dit « qui,
    // chez nous, a consigné ». Personne ne l'a consigné — c'est le point.
    auteur_id: null,
    message_id: msg.messageId ?? null,
    in_reply_to: msg.enReponseA ?? null,
    recu_le: recuLe,
    sent_at: recuLe,
    from_email: de,
    to_email: pour,
    subject: (msg.objet ?? '').trim() || '(sans objet)',
    body_text: texteUtile(msg.texte),
    body_html: msg.html ?? null,
    // `status` dit l'état d'un ENVOI. Un entrant n'en a pas ; on garde la
    // valeur des autres lignes plutôt que d'inventer un mot que personne ne
    // lit — c'est `direction` qui porte le sens, et elle est contrainte.
    status: 'sent',
    type: 'reponse',
    enrollment_id: rattachement.inscriptionId,
    automation_id: rattachement.automationId,
    entreprise_id: rattachement.entrepriseId,
    contact_id: rattachement.contactId,
    opportunite_id: rattachement.opportuniteId,
  }

  const { data, error } = await sb.from('email_logs').insert(ligne).select('id').maybeSingle()

  if (error) {
    if (error.code === '23505') {
      return {
        messageId: null,
        doublon: true,
        nature,
        motif,
        moyen: appariement.moyen,
        inscriptionId: rattachement.inscriptionId,
        entrepriseId: rattachement.entrepriseId,
        debloque: false,
        raison: 'message déjà reçu',
        protege: true,
      }
    }
    // Colonnes absentes : la migration n'est pas jouée. On le nomme.
    const manquante = /message_id|recu_le|in_reply_to/i.test(error.message)
    throw new Error(
      manquante
        ? `sql/20260820_reception.sql n’est pas appliquée (${error.message})`
        : error.message,
    )
  }

  const bilan: BilanReception = {
    messageId: (data as { id: string } | null)?.id ?? null,
    doublon: false,
    nature,
    motif,
    moyen: appariement.moyen,
    inscriptionId: rattachement.inscriptionId,
    entrepriseId: rattachement.entrepriseId,
    debloque: false,
    raison: null,
    protege: Boolean(msg.messageId),
  }

  if (!peutDebloquer(nature, appariement.moyen)) {
    bilan.raison =
      nature !== 'reponse'
        ? `${nature === 'rebond' ? 'rebond' : 'réponse automatique'} — ${motif}`
        : 'apparié par l’adresse seule : à confirmer à la main'
    return bilan
  }
  if (!rattachement.inscriptionId) {
    bilan.raison = 'aucune inscription retrouvée'
    return bilan
  }

  const suite = await declarerReponse(sb, rattachement.inscriptionId)
  bilan.debloque = suite.ok
  // `pas_en_attente` est le cas ordinaire, pas une panne : le prospect a écrit
  // deux fois, ou il répond à une séquence déjà terminée. On le dit sans crier.
  if (!suite.ok) bilan.raison = raisonLisible(suite.error)
  return bilan
}

const RAISONS: Record<string, string> = {
  introuvable: 'l’inscription n’existe plus',
  inactive: 'la séquence de ce prospect est terminée',
  pas_en_attente: 'la séquence n’attendait pas de réponse à cette étape',
}

const raisonLisible = (e: string | undefined): string => RAISONS[e ?? ''] ?? 'la séquence n’a pas repris'

/**
 * De ce qu'on a apparié vers le prospect.
 *
 * Trois portes, de la plus sûre à la plus faible, et chacune s'arrête dès
 * qu'elle trouve. La dernière — l'adresse de l'expéditeur — ne sert QU'À RANGER
 * le message : `peutDebloquer` refuse déjà qu'elle fasse avancer une séquence.
 */
async function retrouver(
  sb: SupabaseClient,
  msg: MessageEntrant,
  inscriptionId: string | null,
  reference: string | null,
): Promise<Rattachement> {
  if (inscriptionId) {
    const parInscription = await depuisInscription(sb, inscriptionId)
    if (parInscription) return parInscription
  }

  if (reference) {
    const parEnvoi = await depuisEnvoiOrigine(sb, reference)
    if (parEnvoi) return parEnvoi
  }

  const de = adresseNue(msg.de)
  return de ? await depuisAdresse(sb, de) : VIDE
}

async function depuisInscription(sb: SupabaseClient, id: string): Promise<Rattachement | null> {
  const { data } = await sb
    .from('sequence_enrollments')
    .select('id, automation_id, entreprise_id, contact_id')
    .eq('id', id)
    .maybeSingle()
  const e = data as {
    id: string
    automation_id: string | null
    entreprise_id: number | null
    contact_id: string | null
  } | null
  if (!e) return null
  return {
    inscriptionId: e.id,
    automationId: e.automation_id,
    entrepriseId: e.entreprise_id,
    contactId: e.contact_id,
    opportuniteId: await opportuniteDe(sb, e.entreprise_id),
  }
}

/**
 * L'envoi auquel ce message répond.
 *
 * Deux formes de référence, parce qu'on n'a pas toujours écrit le
 * `Message-ID` : celle qu'on a stockée, et l'identifiant Resend qu'on retrouve
 * DANS la référence. La seconde est une observation du format de Resend, pas un
 * contrat — d'où le repli silencieux sur l'adresse quand elle ne donne rien.
 */
async function depuisEnvoiOrigine(sb: SupabaseClient, reference: string): Promise<Rattachement | null> {
  const { data } = await sb
    .from('email_logs')
    .select('enrollment_id, automation_id, entreprise_id, contact_id, opportunite_id')
    .eq('message_id', reference)
    .maybeSingle()

  const parResend = data
    ? null
    : await (async () => {
        const uuid = inscriptionDepuisReference(reference)
        if (!uuid) return null
        const { data: r } = await sb
          .from('email_logs')
          .select('enrollment_id, automation_id, entreprise_id, contact_id, opportunite_id')
          .eq('resend_id', uuid)
          .maybeSingle()
        return r
      })()

  const l = (data ?? parResend) as {
    enrollment_id: string | null
    automation_id: string | null
    entreprise_id: number | null
    contact_id: string | null
    opportunite_id: string | null
  } | null
  if (!l) return null
  return {
    inscriptionId: l.enrollment_id,
    automationId: l.automation_id,
    entrepriseId: l.entreprise_id,
    contactId: l.contact_id,
    opportuniteId: l.opportunite_id,
  }
}

/**
 * L'adresse seule. Le contact d'abord, l'entreprise ensuite — le même ordre
 * qu'à l'envoi (`collecterCanaux`), sans quoi une réponse se rangerait sur une
 * autre fiche que le message auquel elle répond.
 */
async function depuisAdresse(sb: SupabaseClient, email: string): Promise<Rattachement> {
  const { data: contacts } = await sb
    .from('contacts')
    .select('id, entreprise_id')
    .ilike('email', email)
    .limit(1)
  const c = ((contacts ?? []) as { id: string; entreprise_id: number | null }[])[0]
  if (c) {
    return {
      ...VIDE,
      contactId: c.id,
      entrepriseId: c.entreprise_id,
      opportuniteId: await opportuniteDe(sb, c.entreprise_id),
    }
  }

  const { data: entreprises } = await sb.from('entreprises').select('id').ilike('email', email).limit(1)
  const e = ((entreprises ?? []) as { id: number }[])[0]
  if (!e) return VIDE
  return { ...VIDE, entrepriseId: e.id, opportuniteId: await opportuniteDe(sb, e.id) }
}

/**
 * L'opportunité la plus récente d'une entreprise.
 *
 * Sans elle, le message n'apparaîtrait que dans l'inbox : le pipeline et la
 * fiche lisent par opportunité. C'est le même raccord que le geste « coller la
 * réponse » de la couche 5a.
 */
async function opportuniteDe(sb: SupabaseClient, entrepriseId: number | null): Promise<string | null> {
  if (!entrepriseId) return null
  const { data } = await sb
    .from('opportunites')
    .select('id')
    .eq('entreprise_id', entrepriseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}
