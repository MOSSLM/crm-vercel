// /api/email/verify — vérifier une adresse (ou un lot) à la demande.
//
// Deux usages :
//
//   · GET  ?email=…  — lire le verdict connu, sans rien déclencher. C'est ce
//     qu'affichent la fiche contact et la fiche entreprise ;
//   · POST { emails, force } — vérifier maintenant. Utilisé au moment où
//     quelqu'un saisit ou corrige une adresse : la réponse arrive en quelques
//     centaines de millisecondes, on ne fait pas attendre le prochain tick pour
//     dire qu'une adresse est morte.
//
// `force` relance la chaîne même sur un verdict encore frais : c'est le bouton
// « Re-vérifier ».

import { z } from 'zod'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { normalizeEmail } from '@/lib/email/verify/normalize'
import { eligibilityOf, loadVerdicts, verifyMany } from '@/lib/email/verify/service'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Au-delà, l'appel dépasserait la durée d'une fonction : on passe par le tick. */
const MAX_BATCH = 100

const verifySchema = z.object({
  emails: z.array(z.string()).min(1).max(MAX_BATCH),
  force: z.boolean().optional(),
})

async function ttlDays(sb: ReturnType<typeof getServiceClient>): Promise<number> {
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

export const GET = withAuth({}, async ({ req, cors }) => {
  const raw = new URL(req.url).searchParams.get('email')
  const email = normalizeEmail(raw)
  if (!email) return jsonError('email_invalide', 400, {}, cors)

  const verdicts = await loadVerdicts(getServiceClient(), [email])
  const verdict = verdicts.get(email) ?? null

  return json(
    {
      email,
      verdict,
      eligibility: eligibilityOf(verdict ?? undefined),
    },
    { headers: cors },
  )
})

export const POST = withAuth({ body: verifySchema }, async ({ body, cors }) => {
  const sb = getServiceClient()
  const results = await verifyMany(sb, body.emails, {
    validTtlDays: await ttlDays(sb),
    force: body.force === true,
  })

  // Une adresse déjà fraîche ne ressort pas de `verifyMany` : on complète avec
  // ce qui est en base, pour que l'appelant ait toujours une ligne par adresse.
  const covered = new Set(results.map((r) => r.email))
  const missing = body.emails
    .map((e) => normalizeEmail(e))
    .filter((e): e is string => !!e && !covered.has(e))
  const stored = missing.length > 0 ? await loadVerdicts(sb, missing) : new Map()

  return json(
    {
      checked: results.length,
      results: [
        ...results.map((r) => ({
          email: r.email,
          status: r.status,
          subStatus: r.subStatus,
          score: r.score,
          reason: r.reason,
          suggestion: r.details.suggestion,
          expiresAt: new Date(r.expiresAt).toISOString(),
        })),
        ...missing.map((email) => {
          const verdict = stored.get(email)
          return {
            email,
            status: verdict?.status ?? 'pending',
            subStatus: verdict?.subStatus ?? null,
            score: verdict?.score ?? 0,
            reason: verdict?.reason ?? '',
            suggestion: verdict?.suggestion ?? null,
            expiresAt: verdict?.expiresAt ? new Date(verdict.expiresAt).toISOString() : null,
            cached: true,
          }
        }),
      ],
    },
    { headers: cors },
  )
})
