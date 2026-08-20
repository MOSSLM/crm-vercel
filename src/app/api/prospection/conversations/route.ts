// /api/prospection/conversations — les fils, et le geste qui fait entrer.
//
// CE QU'ON LIT : `email_logs`, tel quel. Il porte l'e-mail, le WhatsApp et la
// note depuis `20260722_message_channel` — c'est déjà LE fil d'échanges d'une
// entreprise, il lui manquait un écran qui le lise d'une traite.
//
// CE QU'ON ÉCRIT : « coller la réponse ». C'est le SEUL transport entrant qui
// existe aujourd'hui, et ce n'est pas un pis-aller en attendant mieux — les 177
// WhatsApp partent par des `wa.me` ouverts à la main, et aucun mécanisme ne
// captera jamais une réponse WhatsApp sans l'API Business. L'agent recopie déjà
// ce qu'on lui dit, ailleurs et sans date ; ici c'est daté, attribué, et dans
// le fil.
//
// ⚠️ ON NE POSE JAMAIS `sales_pipeline_state.replied` ICI. Le raisonnement est
// écrit en tête de `reply.ts` : `hasInterest()` s'en sert pour éteindre les
// cellules WhatsApp et Appel, ce qui couperait les étapes que la séquence veut
// enchaîner. Une réponse débloque une attente ; elle ne dit pas que le prospect
// est intéressé. Cette distinction a déjà été payée une fois.
import { z } from 'zod'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { lireLesFils } from './_lecture'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

export const GET = withAuth({ role: 'admin' }, async ({ cors }) => {
  const { fils, tronque, erreur, migrationAbsente } = await lireLesFils(getServiceClient())

  if (erreur) {
    // La colonne `direction` est née le 20/08 : le dire vaut mieux qu'un 500.
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

export const POST = withAuth({ role: 'admin', body: Entrant }, async ({ body, user, cors }) => {
  const sb = getServiceClient()

  // L'opportunité et le contact se retrouvent depuis l'entreprise : le fil se
  // lit par entreprise, mais les autres écrans (pipeline, fiche) lisent par
  // opportunité — sans ce raccord, le message n'apparaîtrait que dans l'inbox.
  const { data: opp } = await sb
    .from('opportunites')
    .select('id, contact_id')
    .eq('entreprise_id', body.entrepriseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await sb
    .from('email_logs')
    .insert({
      channel: body.canal === 'call' ? 'note' : body.canal,
      direction: body.sens,
      // Qui a recopié. Ce n'est pas l'auteur du propos — c'est celui qui l'a
      // consigné, et c'est à lui qu'on ira demander des précisions.
      auteur_id: user.id,
      entreprise_id: body.entrepriseId,
      opportunite_id: opp?.id ?? null,
      contact_id: opp?.contact_id ?? null,
      // `to_email` est `not null` : un entrant n'a pas besoin de contourner
      // quoi que ce soit — le destinataire, c'est nous —, mais la colonne
      // attend une chaîne. Même geste que les notes.
      to_email: '',
      subject:
        body.sens === 'entrant'
          ? `Réponse ${body.canal === 'whatsapp' ? 'WhatsApp' : body.canal === 'email' ? 'e-mail' : 'au téléphone'}`
          : 'Note',
      body_text: body.texte,
      status: 'sent',
      sent_at: body.quand ?? new Date().toISOString(),
    })
    .select('id, sent_at')
    .maybeSingle()

  if (error) return jsonError(error.message, 500, {}, cors)
  return json({ message: data }, { headers: cors })
})
