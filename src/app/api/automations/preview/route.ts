// GET /api/automations/preview?entreprise_id=42
//
// Le sac de variables d'un vrai prospect, pour que l'aperçu d'un message montre
// EXACTEMENT ce que l'envoi produira. Sans entreprise, renvoie le jeu d'exemple
// — de quoi écrire un modèle avant d'avoir choisi sur qui l'essayer.
//
// Passe volontairement par `resolveEntities` plutôt que de relire les tables :
// un aperçu qui calcule ses valeurs autrement que l'envoi finit par mentir, et
// c'est le prospect qui découvre l'écart.
import { preflight } from '@/app/api/_lib/cors'
import { json } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { renderStepMessage, resolveMessageVars } from '@/lib/automations/engine'
import { sampleVars } from '@/lib/automations/variables'
import type { SequenceDefinition } from '@/components/automations/types'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

export const GET = withAuth({}, async ({ req, cors }) => {
  const url = new URL(req.url)
  const raw = url.searchParams.get('entreprise_id')
  const entrepriseId = raw ? Number(raw) : NaN
  const automationId = url.searchParams.get('automation_id')
  const stepIndexRaw = url.searchParams.get('step_index')

  const sb = getServiceClient()

  let vars = sampleVars()
  let sample = true
  if (Number.isFinite(entrepriseId)) {
    // L'opportunité de l'entreprise, quand elle en a une : c'est elle qui porte
    // l'audit, donc le lien du rapport.
    const { data: opp } = await sb
      .from('opportunites')
      .select('id, contact_id')
      .eq('entreprise_id', entrepriseId)
      .limit(1)
      .maybeSingle()
    vars = await resolveMessageVars({
      entreprise_id: entrepriseId,
      opportunite_id: opp?.id ?? null,
      contact_id: opp?.contact_id ?? null,
    })
    sample = false
  }

  // Le message d'une étape précise, rendu comme il partira. Passe par
  // `renderStepMessage`, le même code que l'envoi : un aperçu qui résoudrait
  // les modèles autrement finirait par mentir.
  let message = null
  const stepIndex = stepIndexRaw != null ? Number(stepIndexRaw) : NaN
  if (automationId && Number.isInteger(stepIndex)) {
    const { data: auto } = await sb
      .from('automations')
      .select('definition')
      .eq('id', automationId)
      .maybeSingle()
    const def = (auto?.definition as SequenceDefinition) ?? { steps: [] }
    const step = (Array.isArray(def.steps) ? def.steps : [])[stepIndex]
    if (step) message = await renderStepMessage(sb, step, vars)
  }

  return json({ vars, sample, company: sample ? null : vars['company.name'] || null, message }, { headers: cors })
})
