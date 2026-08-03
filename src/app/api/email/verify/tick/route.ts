// /api/email/verify/tick — la file de vérification des adresses.
//
// Déclenché par pg_cron toutes les cinq minutes (cf.
// sql/20260803_email_verification.sql). Le travail est borné : on prend une
// tranche, on la traite, on rend la main. Ce qui reste attendra le tick suivant
// — c'est ce qui permet de vérifier une base entière sans jamais dépasser la
// durée d'une fonction serverless.
//
// L'ordre de service compte : les adresses jamais vues passent AVANT les
// verdicts périmés. Sans ça, une séquence lancée sur des prospects tout neufs
// resterait gelée derrière la revérification de routine.

import { json } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { loadDueForVerification, verifyMany } from '@/lib/email/verify/service'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Adresses traitées au maximum par tick. Le coût dominant est la résolution
 * DNS, mutualisée par domaine : trois cents adresses de garages, c'est en
 * pratique quelques dizaines de requêtes.
 */
const MAX_PER_TICK = 300

/**
 * Vérifie la requête du ticker :
 *   - prod : au moins un des deux secrets DOIT être posé ET correspondre ;
 *   - dev/test : sans secret configuré, on laisse passer (tests locaux).
 *
 * Copie conforme de `/api/automations/tick` — même dispositif, même contrat.
 */
const verifyCron = (req: Request): boolean => {
  const cronSecret = process.env.CRON_SECRET
  const pgCronSecret = process.env.PG_CRON_SECRET

  if (process.env.NODE_ENV === 'production' && !cronSecret && !pgCronSecret) return false
  if (!cronSecret && !pgCronSecret) return true

  const auth = req.headers.get('authorization')
  const pgHeader = req.headers.get('x-pg-cron-secret')
  const validVercel = !!cronSecret && auth === `Bearer ${cronSecret}`
  const validPgCron = !!pgCronSecret && pgHeader === pgCronSecret
  return validVercel || validPgCron
}

/** Fraîcheur exigée d'un verdict valide, telle que réglée dans le régulateur. */
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
    // Migration pas encore appliquée : on retient la valeur par défaut plutôt
    // que de vérifier avec une fraîcheur absurde.
    return 120
  }
}

async function handle(req: Request): Promise<Response> {
  if (!verifyCron(req)) return json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getServiceClient()
  const startedAt = Date.now()
  const validTtlDays = await readTtlDays(sb)
  const { emails, remaining } = await loadDueForVerification(sb, MAX_PER_TICK)

  if (emails.length === 0) {
    return json({ ok: true, checked: 0, remaining, ms: Date.now() - startedAt })
  }

  const results = await verifyMany(sb, emails, { validTtlDays, force: true })

  // Le détail par statut rend le tick lisible depuis les journaux : on voit
  // d'un coup d'œil si une salve d'imports est massivement invalide.
  const byStatus = { valid: 0, risky: 0, invalid: 0, unknown: 0, pending: 0 }
  for (const result of results) byStatus[result.status]++

  return json({
    ok: true,
    checked: results.length,
    remaining,
    byStatus,
    ttlDays: validTtlDays,
    ms: Date.now() - startedAt,
  })
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
