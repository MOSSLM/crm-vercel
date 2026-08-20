// /api/agent/conversations — les fils de l'agent, et rien que les siens.
//
// LA MÊME LECTURE QUE L'ADMIN, FILTRÉE. `lireLesFils` est partagée avec
// `/api/prospection/conversations` : deux écrans, une définition de « ce qu'est
// un fil ». Le périmètre est un paramètre, pas une seconde route qui
// divergerait à la première colonne ajoutée.
//
// CE QUE L'AGENT VOIT : les entreprises dont il est propriétaire
// (`entreprises.owner_id`). C'est le même mur que partout ailleurs dans son
// portail — `/api/agent/tasks`, `/api/agent/pipeline` — et il est posé côté
// serveur, jamais dans l'écran.
//
// ET CE QU'IL Y VOIT QUAND MÊME : les notes de ses coéquipiers sur SES
// entreprises. C'est le grief « je ne vois pas les notes de Bilal » lu depuis
// l'autre bout : le fil porte tout le monde, le filtre porte sur l'entreprise.
//
// ⚠️ ON NE POSE JAMAIS `sales_pipeline_state.replied` ICI — voir l'en-tête de
// `reply.ts`. Une réponse débloque une attente ; elle ne dit pas que le
// prospect est intéressé.
import { z } from 'zod'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { lireLesFils } from '@/app/api/prospection/conversations/_lecture'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

export const GET = withAuth({ role: 'freelance' }, async ({ user, cors }) => {
  const { fils, tronque, erreur, migrationAbsente } = await lireLesFils(getServiceClient(), {
    agentId: user.id,
  })

  if (erreur) {
    return migrationAbsente
      ? jsonError(
          'La colonne `direction` n’existe pas encore : appliquer `sql/20260820_conversation.sql`.',
          503,
          {},
          cors,
        )
      : jsonError(erreur, 500, {}, cors)
  }

  return json({ fils, tronque }, { headers: cors })
})

/* ── Faire entrer ce que le prospect a dit ───────────────────────────────── */

const Entrant = z.object({
  entrepriseId: z.number().int().positive(),
  texte: z.string().trim().min(1).max(4000),
  /** `entrant` = le prospect a parlé · `interne` = une note d'équipe. */
  sens: z.enum(['entrant', 'interne']).default('entrant'),
  canal: z.enum(['whatsapp', 'email', 'call', 'note']).default('whatsapp'),
  /** Quand il l'a dit, si ce n'est pas maintenant. */
  quand: z.string().datetime().optional(),
})

export const POST = withAuth({ role: 'freelance', body: Entrant }, async ({ body, user, cors }) => {
  const sb = getServiceClient()

  // LE MUR EST ICI, PAS DANS L'ÉCRAN. Un agent ne colle une réponse que sur une
  // entreprise qui est à lui : sans cette vérification, l'identifiant du corps
  // de la requête suffirait à écrire dans le fil de n'importe qui.
  const { data: ent, error: eEnt } = await sb
    .from('entreprises')
    .select('id, owner_id')
    .eq('id', body.entrepriseId)
    .maybeSingle()

  if (eEnt) return jsonError(eEnt.message, 500, {}, cors)
  if (!ent) return jsonError('Entreprise introuvable.', 404, {}, cors)
  if (ent.owner_id !== user.id) {
    return jsonError('Cette entreprise n’est pas dans votre portefeuille.', 403, {}, cors)
  }

  // L'opportunité et le contact se retrouvent depuis l'entreprise, comme côté
  // admin : le fil se rattache au même endroit quel que soit qui l'écrit.
  const [{ data: opp }, { data: contacts }] = await Promise.all([
    sb.from('opportunites').select('id').eq('entreprise_id', body.entrepriseId).limit(1).maybeSingle(),
    sb.from('contacts').select('id').eq('entreprise_id', body.entrepriseId).limit(1),
  ])

  const quand = body.quand ?? new Date().toISOString()
  const { data, error } = await sb
    .from('email_logs')
    .insert({
      entreprise_id: body.entrepriseId,
      opportunite_id: opp?.id ?? null,
      contact_id: contacts?.[0]?.id ?? null,
      channel: body.canal,
      direction: body.sens,
      sent_at: quand,
      // `to_email` est NOT NULL : une note et un entrant recopié n'ont pas de
      // destinataire, la chaîne vide est la convention déjà posée par
      // `20260815_notes_de_demarchage.sql`.
      to_email: '',
      subject: '',
      body_text: body.texte,
      auteur_id: user.id,
    })
    .select('id, sent_at')
    .maybeSingle()

  if (error) {
    if (/direction/i.test(error.message)) {
      return jsonError(
        'La colonne `direction` n’existe pas encore : appliquer `sql/20260820_conversation.sql`.',
        503,
        {},
        cors,
      )
    }
    return jsonError(error.message, 500, {}, cors)
  }

  return json({ message: data }, { headers: cors })
})
