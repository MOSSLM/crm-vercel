// GET /api/automations/preview?entreprise_id=42
//
// Le sac de variables d'un vrai prospect, pour que l'aperçu d'un message montre
// EXACTEMENT ce que l'envoi produira. Sans entreprise, renvoie le jeu d'exemple
// — de quoi écrire un modèle avant d'avoir choisi sur qui l'essayer.
//
// Passe volontairement par `resolveEntities` plutôt que de relire les tables :
// un aperçu qui calcule ses valeurs autrement que l'envoi finit par mentir, et
// c'est le prospect qui découvre l'écart.
//
// SANS ENTREPRISE MAIS AVEC UNE SÉQUENCE, ON EN CHOISIT UNE
// L'aperçu ne servait qu'à qui pensait à coller un numéro d'entreprise dans un
// champ discret ; tous les autres relisaient des valeurs d'exemple où tout est
// toujours rempli. Or c'est précisément ce qui manque — un site démo pas encore
// prêt, une fiche sans prénom — qui décide du texte qui part. La séquence
// déclare son public en canaux : on prend donc une vraie fiche de CE public,
// et l'aperçu montre un cas que la séquence rencontrera pour de bon.
import { preflight } from '@/app/api/_lib/cors'
import { json } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { renderStepMessage, resolveMessageVars } from '@/lib/automations/engine'
import { sampleVars } from '@/lib/automations/variables'
import { collecterCanaux, correspondAuPublic, type PublicVise } from '@/lib/prospects/canal'
import type { SequenceDefinition, SequenceSettings } from '@/components/automations/types'
import type { SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const OPTIONS = (req: Request) => preflight(req)

/** Combien de fiches on regarde avant de renoncer à trouver un cas réel. */
const CANDIDATS = 200

/**
 * Une entreprise réelle du public que cette séquence vise.
 *
 * L'ORDRE DE PRÉFÉRENCE
 * 1. Une fiche DÉJÀ inscrite sur la séquence — c'est le cas le plus concret qui
 *    soit : elle a réellement reçu, ou va recevoir, ces messages-là.
 * 2. À défaut, une fiche qualifiée non archivée qui remplit le public déclaré
 *    (`requireCanaux` / `excludeCanaux`). Le rapprochement passe par
 *    `collecterCanaux`, donc par la même règle que le tableau : l'aperçu ne peut
 *    pas montrer une fiche que la séquence n'accepterait jamais.
 * 3. Rien : l'appelant retombe sur les valeurs d'exemple, ce qui reste honnête
 *    tant qu'on le dit (`sample: true`).
 */
async function choisirEntrepriseDEssai(
  sb: SupabaseClient,
  automationId: string,
): Promise<number | null> {
  const { data: auto } = await sb
    .from('automations')
    .select('settings')
    .eq('id', automationId)
    .maybeSingle()
  const settings = (auto?.settings ?? {}) as SequenceSettings
  const cible: PublicVise = {
    requireCanaux: settings.requireCanaux ?? null,
    excludeCanaux: settings.excludeCanaux ?? null,
  }

  const { data: inscrits } = await sb
    .from('sequence_enrollments')
    .select('entreprise_id')
    .eq('automation_id', automationId)
    .not('entreprise_id', 'is', null)
    .order('entered_at', { ascending: false })
    .limit(1)
  const dejaInscrite = (inscrits ?? [])[0]?.entreprise_id as number | undefined
  if (dejaInscrite != null) return dejaInscrite

  const { data: ents } = await sb
    .from('entreprises')
    .select('id, email, telephone, telephones')
    .eq('qualifie', true)
    .is('archived_at', null)
    .order('id', { ascending: false })
    .limit(CANDIDATS)
  const lignes = (ents ?? []) as {
    id: number
    email: string | null
    telephone: string | null
    telephones: (string | null)[] | null
  }[]
  if (lignes.length === 0) return null

  // Les contacts en un seul appel : le public se lit sur le prospect ENTIER,
  // fiche entreprise et contacts confondus — une entreprise dont seul le gérant
  // a un mobile appartient bien au public « WhatsApp seul ».
  const { data: contacts } = await sb
    .from('contacts')
    .select('entreprise_id, email, tel, is_decision_maker')
    .in(
      'entreprise_id',
      lignes.map((e) => e.id),
    )
  const parEntreprise = new Map<number, { email: string | null; tel: string | null; isDecisionMaker: boolean }[]>()
  for (const c of (contacts ?? []) as {
    entreprise_id: number | null
    email: string | null
    tel: string | null
    is_decision_maker: boolean | null
  }[]) {
    if (c.entreprise_id == null) continue
    const liste = parEntreprise.get(c.entreprise_id) ?? []
    liste.push({ email: c.email, tel: c.tel, isDecisionMaker: !!c.is_decision_maker })
    parEntreprise.set(c.entreprise_id, liste)
  }

  for (const e of lignes) {
    const { canaux } = collecterCanaux({
      entrepriseEmail: e.email,
      entrepriseTelephones: [e.telephone, ...(e.telephones ?? [])],
      contacts: parEntreprise.get(e.id) ?? [],
    })
    if (correspondAuPublic(canaux, cible)) return e.id
  }
  return null
}

export const GET = withAuth({}, async ({ req, cors }) => {
  const url = new URL(req.url)
  const raw = url.searchParams.get('entreprise_id')
  const demandee = raw ? Number(raw) : NaN
  const automationId = url.searchParams.get('automation_id')
  const stepIndexRaw = url.searchParams.get('step_index')
  // `auto=0` coupe le choix automatique : c'est ce que l'écran envoie quand on
  // VIDE le champ « entreprise d'essai », pour redemander les valeurs d'exemple.
  const autoriseChoix = url.searchParams.get('auto') !== '0'

  const sb = getServiceClient()

  let entrepriseId = Number.isFinite(demandee) ? demandee : null
  let choisie = false
  if (entrepriseId == null && automationId && autoriseChoix) {
    entrepriseId = await choisirEntrepriseDEssai(sb, automationId)
    choisie = entrepriseId != null
  }

  let vars = sampleVars()
  let sample = true
  if (entrepriseId != null) {
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

  return json(
    {
      vars,
      sample,
      company: sample ? null : vars['company.name'] || null,
      /** Numéro de la fiche employée — l'écran le remet dans son champ. */
      entrepriseId,
      /** `true` = personne ne l'a demandée, on l'a prise dans le public visé. */
      choisie,
      message,
    },
    { headers: cors },
  )
})
