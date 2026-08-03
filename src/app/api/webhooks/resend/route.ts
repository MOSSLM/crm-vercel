// /api/webhooks/resend — ce que les emails deviennent réellement.
//
// C'est la pièce qui rend tout le vérificateur fiable. Avant l'envoi, personne
// ne peut prouver qu'une boîte existe : les hébergeurs mutualisés acceptent
// toutes les adresses, et les gros providers ne renseignent plus rien. Après
// l'envoi, Resend le dit — et c'est une certitude, pas une estimation.
//
//   · rebond DUR      → la boîte n'existe pas. Adresse condamnée pour de bon,
//     ajoutée à la liste de suppression, et toutes les inscriptions qui la
//     visaient sont gelées AVANT de partir ;
//   · livraison       → la boîte existe. Le verdict repart pour 120 jours sans
//     qu'on ait rien à revérifier : une adresse qui reçoit régulièrement n'est
//     jamais retestée ;
//   · plainte         → suppression immédiate, et le prospect passe en
//     blacklist commerciale ;
//   · rebond doux     → on compte, sans condamner. Boîte pleine ou serveur
//     indisponible, ça se répare tout seul.
//
// ── Idempotence ────────────────────────────────────────────────────────────
// Resend rejoue les événements qu'il croit perdus. On insère d'abord dans
// `email_events`, dont `event_id` est la clé primaire : si l'insertion ne crée
// rien, l'événement a déjà été traité et on s'arrête là. Aucun compteur ne peut
// être incrémenté deux fois.
//
// ── Signature ──────────────────────────────────────────────────────────────
// Resend signe avec Svix. On vérifie le HMAC à la main plutôt que d'ajouter une
// dépendance pour trente lignes — et surtout, l'écrire ici rend explicite ce
// qu'on contrôle : la signature ET l'horodatage (sans quoi un ancien message
// capté pourrait être rejoué indéfiniment).

import { createHmac, timingSafeEqual } from 'node:crypto'
import { json } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { domainPart, normalizeEmail } from '@/lib/email/verify/normalize'
import { FOREVER_DAYS } from '@/lib/email/verify/score'
import { loadSuppressions } from '@/lib/email/verify/service'

export const runtime = 'nodejs'

const DAY_MS = 86_400_000

/** Fenêtre de tolérance sur l'horodatage, contre le rejeu d'un message capté. */
const TIMESTAMP_TOLERANCE_MS = 5 * 60_000

/* ── Vérification de signature (Svix) ────────────────────────────────────── */

/**
 * Le secret est de la forme `whsec_<base64>`. Svix signe
 * `<id>.<timestamp>.<payload>` en HMAC-SHA256, et publie le résultat dans
 * `svix-signature` sous la forme `v1,<base64> v1,<autre>` — plusieurs valeurs
 * pendant une rotation de secret, d'où la comparaison sur chacune.
 */
function verifySignature(secret: string, id: string, timestamp: string, payload: string, header: string): boolean {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest()

  for (const part of header.split(' ')) {
    const [version, value] = part.split(',')
    if (version !== 'v1' || !value) continue
    let candidate: Buffer
    try {
      candidate = Buffer.from(value, 'base64')
    } catch {
      continue
    }
    // `timingSafeEqual` exige deux tampons de même longueur.
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return true
  }
  return false
}

function timestampFresh(timestamp: string): boolean {
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds)) return false
  return Math.abs(Date.now() - seconds * 1000) <= TIMESTAMP_TOLERANCE_MS
}

/* ── Lecture du corps ────────────────────────────────────────────────────── */

type ResendEvent = {
  type?: string
  created_at?: string
  data?: {
    email_id?: string
    to?: string[] | string
    bounce?: { type?: string; subType?: string; message?: string }
  }
}

/** `to` est tantôt une chaîne, tantôt un tableau : on prend le premier. */
function firstRecipient(to: string[] | string | undefined): string | null {
  if (Array.isArray(to)) return normalizeEmail(to[0])
  return normalizeEmail(to)
}

/**
 * Rebond dur ou doux ?
 *
 * Resend suit la nomenclature d'Amazon SES : `Permanent` = la boîte n'existe
 * pas ou refuse définitivement, `Transient` = boîte pleine, serveur en carafe,
 * message trop gros. Seul le premier condamne une adresse ; traiter un
 * « Transient » comme définitif ferait perdre des prospects parfaitement bons.
 */
function bounceHardness(bounce: { type?: string; subType?: string } | undefined): 'hard' | 'soft' {
  const type = (bounce?.type ?? '').toLowerCase()
  if (type.includes('permanent') || type === 'hard') return 'hard'
  if (type.includes('transient') || type.includes('undetermined') || type === 'soft') return 'soft'
  // Sous-type sans type. Resend écrit tantôt `NoEmail`, tantôt `no_email` : on
  // ne garde que les lettres pour comparer une seule forme. Parmi les
  // sous-types SES, seuls ceux-là disent l'inexistence — `General`,
  // `MailboxFull` et `MessageTooLarge` sont passagers.
  const sub = (bounce?.subType ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (sub.includes('noemail') || sub.includes('suppressed') || sub.includes('onaccountsuppression')) return 'hard'
  return 'soft'
}

/**
 * État de livraison retenu pour le journal, du plus grave au plus anodin. Un
 * email rebondi qui reçoit ensuite un « opened » (ça arrive, les scanners
 * antispam ouvrent) ne doit pas repasser pour livré.
 */
const DELIVERY_RANK: Record<string, number> = {
  bounced: 5,
  complained: 4,
  delivered: 3,
  clicked: 2,
  opened: 1,
  deferred: 0,
}

const DELIVERY_OF: Record<string, string> = {
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.delivered': 'delivered',
  'email.clicked': 'clicked',
  'email.opened': 'opened',
  'email.delivery_delayed': 'deferred',
}

/* ── Traitement ──────────────────────────────────────────────────────────── */

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const payload = await req.text()

  const id = req.headers.get('svix-id')
  const timestamp = req.headers.get('svix-timestamp')
  const signature = req.headers.get('svix-signature')

  if (secret) {
    if (!id || !timestamp || !signature) return json({ error: 'signature_manquante' }, { status: 401 })
    if (!timestampFresh(timestamp)) return json({ error: 'horodatage_perime' }, { status: 401 })
    if (!verifySignature(secret, id, timestamp, payload, signature)) {
      return json({ error: 'signature_invalide' }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Sans secret en production, n'importe qui pourrait condamner nos adresses
    // en postant de faux rebonds. On refuse plutôt que de faire semblant.
    return json({ error: 'webhook_non_configure' }, { status: 503 })
  }

  let event: ResendEvent
  try {
    event = JSON.parse(payload) as ResendEvent
  } catch {
    return json({ error: 'corps_illisible' }, { status: 400 })
  }

  const type = event.type ?? ''
  const email = firstRecipient(event.data?.to)
  const resendId = event.data?.email_id ?? null
  const bounceType = type === 'email.bounced' ? bounceHardness(event.data?.bounce) : null

  const sb = getServiceClient()

  // ── Idempotence : l'insertion fait office de verrou ─────────────────────
  // `svix-id` identifie la LIVRAISON, pas l'événement — mais Resend rejoue avec
  // le même id, ce qui est exactement ce qu'on veut bloquer. Sans en-tête (mode
  // dev sans secret), on retombe sur une clé composite.
  const eventId = id ?? `${type}:${resendId ?? email ?? 'inconnu'}:${event.created_at ?? ''}`
  try {
    const { data, error } = await sb
      .from('email_events')
      .insert({
        event_id: eventId,
        type,
        email,
        resend_id: resendId,
        bounce_type: bounceType,
        payload: event as unknown as Record<string, unknown>,
        occurred_at: event.created_at ?? null,
      })
      .select('event_id')
    if (error) {
      // Conflit de clé primaire : déjà traité, rien à refaire. C'est un succès,
      // pas une erreur — Resend ne doit pas réessayer.
      if (error.code === '23505') return json({ ok: true, duplicate: true })
      // Tout autre échec d'enregistrement : on rend un 500 pour que Resend
      // REJOUE. Répondre 200 ici lui ferait considérer l'événement comme livré,
      // et le rebond serait perdu pour de bon — donc une adresse morte resterait
      // marquée valide et continuerait de recevoir. Exactement ce que ce
      // dispositif existe pour empêcher.
      return json({ ok: false, stored: false, error: error.message, code: error.code }, { status: 500 })
    }
    if (!data || data.length === 0) return json({ ok: true, duplicate: true })
  } catch (err) {
    return json({ ok: false, stored: false, error: String(err) }, { status: 500 })
  }

  if (!email) return json({ ok: true, applied: false, reason: 'destinataire_inconnu' })

  await applyDeliveryStatus(sb, resendId, type, bounceType)
  const applied = await applyToVerification(sb, email, type, bounceType, event)

  return json({ ok: true, applied, type, email })
}

/** Reporte l'état de livraison sur la ligne du journal d'envoi. */
async function applyDeliveryStatus(
  sb: ReturnType<typeof getServiceClient>,
  resendId: string | null,
  type: string,
  bounceType: string | null,
): Promise<void> {
  const status = DELIVERY_OF[type]
  if (!resendId || !status) return
  try {
    const { data } = await sb
      .from('email_logs')
      .select('id,delivery_status')
      .eq('resend_id', resendId)
      .maybeSingle()
    const row = data as { id: string; delivery_status: string | null } | null
    if (!row) return
    // On ne rétrograde jamais : un rebond reste un rebond même si un scanner
    // antispam « ouvre » le message ensuite.
    const current = row.delivery_status ? (DELIVERY_RANK[row.delivery_status] ?? -1) : -1
    if ((DELIVERY_RANK[status] ?? -1) < current) return
    await sb
      .from('email_logs')
      .update({
        delivery_status: status,
        bounce_type: bounceType,
        delivery_updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
  } catch {
    /* le journal est un confort ; le verdict, lui, doit passer */
  }
}

/** Applique l'événement au verdict de l'adresse — c'est le cœur du webhook. */
async function applyToVerification(
  sb: ReturnType<typeof getServiceClient>,
  email: string,
  type: string,
  bounceType: string | null,
  event: ResendEvent,
): Promise<boolean> {
  const domain = domainPart(email)
  const now = new Date().toISOString()

  const bump = async (kind: 'delivered' | 'hard_bounce' | 'soft_bounce' | 'complaint') => {
    const { error } = await sb.rpc('bump_email_event_counters', {
      p_email: email,
      p_domain: domain,
      p_kind: kind,
      p_at: now,
    })
    return !error
  }

  switch (type) {
    case 'email.delivered': {
      await bump('delivered')
      // Une adresse retirée de la prospection ne redevient pas « valide » parce
      // qu'un email transactionnel lui est arrivé. La suppression est une
      // décision ; la livraison n'est qu'une mesure, et elle ne la rediscute pas.
      const { emails: supprimees } = await loadSuppressions(sb, [email])
      if (supprimees.has(email)) return true

      // LA bonne nouvelle du système : la boîte existe, prouvé. On repart pour
      // la durée réglée sans rien revérifier. Une adresse qui reçoit
      // régulièrement ne repasse donc jamais par le DNS.
      const ttlDays = await readTtlDays(sb)
      await sb
        .from('email_verifications')
        .update({
          status: 'valid',
          sub_status: 'prouvee',
          score: 100,
          source: 'delivered',
          checked_at: now,
          expires_at: new Date(Date.now() + ttlDays * DAY_MS).toISOString(),
          last_error: null,
        })
        .eq('email', email)
      return true
    }

    case 'email.bounced': {
      if (bounceType !== 'hard') {
        await bump('soft_bounce')
        // Rebond passager : on compte, on ne condamne pas. Le prochain passage
        // du vérificateur basculera l'adresse en « douteuse » au troisième.
        return true
      }
      await bump('hard_bounce')
      await condemn(sb, email, domain, 'bounce_dur', 'hard_bounce', event.data?.bounce?.message ?? null)
      return true
    }

    case 'email.complained': {
      await bump('complaint')
      await condemn(sb, email, domain, 'plainte', 'complaint', null)
      await blacklistProspect(sb, email, event.data?.email_id ?? null)
      return true
    }

    default:
      // `email.sent`, `email.opened`, `email.clicked`, `email.delivery_delayed` :
      // journalisés, sans effet sur le verdict.
      return false
  }
}

/**
 * Condamne une adresse : verdict définitif, suppression, et gel de toutes les
 * inscriptions actives qui la visaient.
 *
 * Ce dernier point est le plus important : sans lui, les deux autres emails de
 * la séquence partiraient quand même vers une boîte qu'on sait morte.
 */
async function condemn(
  sb: ReturnType<typeof getServiceClient>,
  email: string,
  domain: string,
  subStatus: 'bounce_dur' | 'plainte',
  reason: 'hard_bounce' | 'complaint',
  detail: string | null,
): Promise<void> {
  const now = new Date().toISOString()
  const forever = new Date(Date.now() + FOREVER_DAYS * DAY_MS).toISOString()

  try {
    await sb.from('email_verifications').upsert(
      {
        email,
        domain,
        status: 'invalid',
        sub_status: subStatus,
        score: 0,
        source: 'bounce',
        checked_at: now,
        expires_at: forever,
        last_error: detail,
      },
      { onConflict: 'email' },
    )
  } catch {
    /* la suppression ci-dessous suffit à bloquer les envois */
  }

  try {
    await sb.from('email_suppressions').insert({ email, reason, note: detail })
  } catch {
    /* déjà supprimée : c'est le résultat voulu */
  }

  // Gel des séquences en cours vers cette adresse. On passe par les fiches qui
  // la portent : `sequence_enrollments` ne stocke pas l'adresse, elle est
  // résolue à l'envoi (contact d'abord, entreprise en repli).
  try {
    const { contactIds, entrepriseIds } = await fichesPortant(sb, email)

    const freeze = { send_at: null, hold_reason: 'email_invalid' }
    if (contactIds.length > 0) {
      await sb
        .from('sequence_enrollments')
        .update(freeze)
        .eq('status', 'active')
        .in('contact_id', contactIds)
    }
    if (entrepriseIds.length > 0) {
      await sb
        .from('sequence_enrollments')
        .update(freeze)
        .eq('status', 'active')
        .in('entreprise_id', entrepriseIds)
    }
  } catch {
    /* le garde d'envoi rattrapera au moment de l'envoi */
  }
}

/**
 * Fiches portant cette adresse — contacts ET entreprises.
 *
 * Deux pièges évités ici :
 *
 *   · `ilike` interprète `_` et `%` comme des JOKERS. `jean_dupont@garage.fr`
 *     attrapait aussi `jean.dupont@garage.fr` et `jeanXdupont@garage.fr` : on
 *     gelait, et pire on blacklistait, des prospects qui n'avaient rien
 *     demandé. Le motif est donc échappé.
 *   · la casse : les adresses sont stockées telles qu'elles ont été saisies
 *     (`Contact@Garage.fr`), d'où `ilike` plutôt que `eq` — mais sur un motif
 *     désormais littéral.
 */
async function fichesPortant(
  sb: ReturnType<typeof getServiceClient>,
  email: string,
): Promise<{ contactIds: string[]; entrepriseIds: number[] }> {
  const motif = escapeLike(email)
  const [contacts, entreprises] = await Promise.all([
    sb.from('contacts').select('id').ilike('email', motif),
    sb.from('entreprises').select('id').ilike('email', motif),
  ])
  return {
    contactIds: ((contacts.data ?? []) as { id: string }[]).map((r) => r.id),
    entrepriseIds: ((entreprises.data ?? []) as { id: number }[]).map((r) => r.id),
  }
}

/** Neutralise les jokers de LIKE/ILIKE : `\`, `%`, `_`. */
const escapeLike = (value: string): string => value.replace(/([\\%_])/g, '\\$1')

/**
 * Une plainte n'est pas qu'un problème de délivrabilité : c'est un prospect qui
 * dit non. On le sort du pipeline commercial, pas seulement de la file d'envoi.
 *
 * On cherche l'opportunité par TROIS chemins, parce qu'un seul ne suffisait pas :
 * le destinataire d'une séquence est `contacts.email` en priorité, et
 * `entreprises.email` seulement en repli. Ne regarder que les entreprises, comme
 * avant, laissait donc la carte du prospect en « en cours » dans le pipeline —
 * un commercial rappelait quelqu'un qui venait de nous signaler comme
 * indésirables.
 */
async function blacklistProspect(sb: ReturnType<typeof getServiceClient>, email: string, resendId: string | null): Promise<void> {
  try {
    const opportuniteIds = new Set<string>()

    // 1. Le plus précis : la ligne du journal d'envoi, qui porte déjà l'opportunité.
    if (resendId) {
      const { data } = await sb
        .from('email_logs')
        .select('opportunite_id')
        .eq('resend_id', resendId)
        .maybeSingle()
      const id = (data as { opportunite_id?: string | null } | null)?.opportunite_id
      if (id) opportuniteIds.add(id)
    }

    // 2. Par les fiches qui portent l'adresse — contacts compris.
    const { contactIds, entrepriseIds } = await fichesPortant(sb, email)
    if (contactIds.length > 0) {
      const { data } = await sb.from('opportunites').select('id').in('contact_id', contactIds)
      for (const o of (data ?? []) as { id: string }[]) opportuniteIds.add(o.id)
      // Un contact rattaché à une entreprise sort l'entreprise entière : c'est
      // la même personne morale qui nous a signalés.
      const { data: ents } = await sb.from('contacts').select('entreprise_id').in('id', contactIds)
      for (const c of (ents ?? []) as { entreprise_id: number | null }[]) {
        if (c.entreprise_id != null) entrepriseIds.push(c.entreprise_id)
      }
    }

    const ids = [...new Set(entrepriseIds)]
    if (ids.length > 0) {
      const { data } = await sb.from('opportunites').select('id').in('entreprise_id', ids)
      for (const o of (data ?? []) as { id: string }[]) opportuniteIds.add(o.id)
    }

    for (const opportuniteId of opportuniteIds) {
      await sb.from('sales_pipeline_state').upsert(
        {
          opportunite_id: opportuniteId,
          state: 'black',
          state_reason: 'a signalé nos emails comme indésirables',
        },
        { onConflict: 'opportunite_id' },
      )
    }
  } catch {
    /* la suppression d'adresse a déjà eu lieu, l'essentiel est fait */
  }
}

async function readTtlDays(sb: ReturnType<typeof getServiceClient>): Promise<number> {
  try {
    const { data } = await sb
      .from('regulator_settings')
      .select('verify_ttl_days')
      .eq('id', 'global')
      .maybeSingle()
    const days = Number((data as { verify_ttl_days?: number } | null)?.verify_ttl_days)
    return Number.isFinite(days) && days > 0 ? Math.round(days) : 120
  } catch {
    return 120
  }
}
