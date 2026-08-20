// /api/email/entrant — la porte par laquelle une réponse rentre.
//
// UN SEUL PORTAIL, PLUSIEURS FACTEURS
// Le transport n'est pas tranché — routage d'e-mail vers webhook, relève IMAP
// en cron, ou les deux en même temps. Cette route est ce qu'ils ont en commun :
// ils normalisent, ils signent, ils postent. Toute la décision (vraie réponse
// ou absence, quelle inscription, faut-il débloquer) vit dans
// `lib/email/reception.ts` et `reception-db.ts`, et ne se rejouera donc pas
// différemment selon le facteur.
//
// ── LA SIGNATURE, ET POURQUOI ELLE N'EST PAS OPTIONNELLE EN PRODUCTION ────
// Sans elle, n'importe qui pourrait poster « le prospect a répondu » et faire
// avancer une séquence — donc faire partir un message écrit pour quelqu'un qui
// vient de parler. C'est le même risque que les faux rebonds du webhook Resend,
// pris par l'autre bout, et la parade est la même : HMAC-SHA256 sur
// `<horodatage>.<corps>`, plus un contrôle de fraîcheur sans lequel un message
// capté se rejouerait indéfiniment.
//
// La clé se lit dans `process.env` au moment de l'appel, JAMAIS dans `env.ts` :
// ce schéma valide tout à l'import, et une variable mal formée y éteindrait
// l'API entière. La leçon a déjà été payée le 20/08 avec `RESEND_FROM_EMAIL`.
//
// ── CE QUI EST RENDU ─────────────────────────────────────────────────────
// Un bilan par message, avec ce qui a été fait ET ce qui ne l'a pas été, en
// clair. Un facteur qui reçoit « ok » sans savoir si la séquence a repris ne
// peut rien signaler ; et une réponse rangée sans être débloquée n'est pas une
// panne — c'est un cas ordinaire qui attend un clic.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { json } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { enregistrerEntrant, type BilanReception } from '@/lib/email/reception-db'
import type { MessageEntrant } from '@/lib/email/reception'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Fenêtre de tolérance sur l'horodatage, contre le rejeu d'un message capté. */
const TOLERANCE_MS = 5 * 60_000

/**
 * Le plafond d'un envoi groupé. Une relève IMAP qui repart de zéro poussera
 * toute une boîte : on la fait paginer plutôt que de tenir une requête ouverte
 * jusqu'au plafond de durée de la route.
 */
const PLAFOND = 50

const unMessage = z.object({
  /** L'expéditeur. `Nom <a@b>` accepté. */
  de: z.string().min(3),
  /** Nos adresses touchées (`to` + `cc`) — c'est là que vit le sous-adressage. */
  pour: z.union([z.string(), z.array(z.string())]),
  objet: z.string().nullish(),
  texte: z.string().nullish(),
  html: z.string().nullish(),
  messageId: z.string().nullish(),
  enReponseA: z.string().nullish(),
  recuLe: z.string().nullish(),
  entetes: z.record(z.string(), z.string()).nullish(),
})

const corps = z.union([z.object({ messages: z.array(unMessage).min(1).max(PLAFOND) }), unMessage])

export async function POST(req: Request): Promise<Response> {
  const cle = process.env.RECEPTION_CLE
  const brut = await req.text()

  const signature = req.headers.get('x-sama-signature')
  const horodatage = req.headers.get('x-sama-horodatage')

  if (cle) {
    if (!signature || !horodatage) return json({ error: 'signature_manquante' }, { status: 401 })
    if (!horodatageFrais(horodatage)) return json({ error: 'horodatage_perime' }, { status: 401 })
    if (!signatureValide(cle, horodatage, brut, signature)) {
      return json({ error: 'signature_invalide' }, { status: 401 })
    }
  } else if (process.env.NODE_ENV === 'production') {
    // Sans clé en production, la porte serait grande ouverte. On refuse plutôt
    // que de faire semblant — et on nomme la variable, pour que la panne dise
    // quoi faire.
    return json(
      { error: 'reception_non_configuree', variable: 'RECEPTION_CLE' },
      { status: 503 },
    )
  }

  let lu: unknown
  try {
    lu = JSON.parse(brut)
  } catch {
    return json({ error: 'corps_illisible' }, { status: 400 })
  }

  const analyse = corps.safeParse(lu)
  if (!analyse.success) {
    return json({ error: 'corps_invalide', detail: analyse.error.issues[0]?.message }, { status: 400 })
  }

  const liste = 'messages' in analyse.data ? analyse.data.messages : [analyse.data]
  const sb = getServiceClient()
  const bilans: BilanReception[] = []

  for (const m of liste) {
    try {
      bilans.push(await enregistrerEntrant(sb, normaliser(m)))
    } catch (e) {
      // Un message qui échoue ne doit pas faire rejouer les autres : le facteur
      // réessaierait tout le lot, et les messages déjà entrés seraient bloqués
      // par leur `message_id` — ce qui marche, mais masquerait celui qui coince.
      return json(
        { error: 'enregistrement_impossible', detail: e instanceof Error ? e.message : String(e), traites: bilans },
        { status: 500 },
      )
    }
  }

  return json({
    ok: true,
    recus: bilans.length,
    doublons: bilans.filter((b) => b.doublon).length,
    debloques: bilans.filter((b) => b.debloque).length,
    bilans,
  })
}

type Entree = z.infer<typeof unMessage>

/** Du corps posté vers le message du module pur. */
function normaliser(m: Entree): MessageEntrant {
  return {
    de: m.de,
    pour: Array.isArray(m.pour) ? m.pour : [m.pour],
    objet: m.objet ?? null,
    texte: m.texte ?? null,
    html: m.html ?? null,
    messageId: m.messageId ?? null,
    enReponseA: m.enReponseA ?? null,
    recuLe: m.recuLe ?? null,
    entetes: m.entetes ?? undefined,
  }
}

/* ── La signature ────────────────────────────────────────────────────────── */

/**
 * HMAC-SHA256 sur `<horodatage>.<corps>`, rendu en hexadécimal, préfixé
 * `sha256=`. Écrit à la main plutôt qu'importé : trente lignes, et ça rend
 * explicite ce qu'on contrôle — la signature ET l'horodatage.
 */
export function signatureAttendue(cle: string, horodatage: string, corpsBrut: string): string {
  return `sha256=${createHmac('sha256', cle).update(`${horodatage}.${corpsBrut}`).digest('hex')}`
}

function signatureValide(cle: string, horodatage: string, corpsBrut: string, recue: string): boolean {
  const attendue = Buffer.from(signatureAttendue(cle, horodatage, corpsBrut))
  const candidate = Buffer.from(recue.trim())
  // `timingSafeEqual` exige deux tampons de même longueur.
  return candidate.length === attendue.length && timingSafeEqual(candidate, attendue)
}

function horodatageFrais(horodatage: string): boolean {
  const secondes = Number(horodatage)
  if (!Number.isFinite(secondes)) return false
  return Math.abs(Date.now() - secondes * 1000) <= TOLERANCE_MS
}
