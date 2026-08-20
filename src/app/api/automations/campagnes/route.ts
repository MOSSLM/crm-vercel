// /api/automations/campagnes — la liste des campagnes.
//
// L'ÉCRAN QUI MANQUAIT. Une séquence, aujourd'hui, ne dit ni qui elle vise, ni
// combien attendent d'être lancés, ni ce que sont devenus ceux qui sont partis :
// on inscrivait des prospects depuis quatre écrans différents et personne ne
// voyait le stock. Une campagne rassemble les quatre en un objet — séquence,
// liste, lancement, rapport — et c'est cette route qui en donne l'index.
//
// Deux décomptes, jamais fusionnés : la LISTE (qui doit partir) et les
// INSCRIPTIONS (ce que sont devenus ceux qui sont partis). Les confondre est
// exactement ce qui faisait compter deux fois le même prospect en haut de la
// page Démarchage.
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import type { Automation, SequenceDefinition, SequenceStep } from '@/components/automations/types'
import { comptesDeCampagnes } from '@/lib/automations/campagne-db'
import { MIGRATION_COMPTE, cibleDe, migrationAbsente, type Audience } from './_campagne'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

/** Le décompte des inscriptions, tel que `v_campagne_inscriptions` le rend. */
interface LigneInscriptions {
  automation_id: string
  inscriptions: number | string
  vivantes: number | string
  ont_repondu: number | string
  gelees: number | string
  attente_sans_reveil: number | string
  enlisees: number | string
  prochain_reveil: string | null
}

export const GET = withAuth({ role: 'admin' }, async ({ cors }) => {
  const sc = getServiceClient()

  const { data: autos, error } = await sc
    .from('automations')
    .select('*')
    .eq('kind', 'sequence')
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error) return jsonError(error.message, 500, { message: error.message }, cors)

  const campagnes = (autos ?? []) as Automation[]
  const ids = campagnes.map((a) => a.id)

  let comptes
  try {
    comptes = await comptesDeCampagnes(sc, ids)
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (migrationAbsente(err)) {
      return jsonError('migration_non_appliquee', 503, { sql_file: MIGRATION_COMPTE, message: `${MIGRATION_COMPTE} n’est pas appliquée.` }, cors)
    }
    return jsonError(err.message ?? 'erreur', 500, { message: err.message }, cors)
  }

  const { data: inscrData } = ids.length
    ? await sc.from('v_campagne_inscriptions').select('*').in('automation_id', ids)
    : { data: [] as LigneInscriptions[] }
  const inscrPar = new Map(
    ((inscrData ?? []) as LigneInscriptions[]).map((r) => [r.automation_id, r]),
  )

  const items = campagnes.map((a) => {
    const def = (a.definition as SequenceDefinition | null) ?? { steps: [] }
    const steps: SequenceStep[] = Array.isArray(def.steps) ? def.steps : []
    const liste = comptes.get(a.id)
    const inscr = inscrPar.get(a.id)
    const audience = ((a.settings ?? {}) as { audience?: Audience }).audience ?? null

    return {
      id: a.id,
      nom: a.name,
      description: a.description,
      statut: a.status,
      // Les canaux SE LISENT dans les étapes : rien à déclarer, donc rien à
      // laisser diverger. Une séquence qui gagne une étape WhatsApp devient
      // multicanale sans que personne n'ait à cocher quoi que ce soit.
      canaux: [...new Set(steps.map((s) => s.kind).filter((k) => k !== 'wait'))],
      etapes: steps.length,
      cible: cibleDe(a),
      audience,
      liste,
      inscriptions: inscr
        ? {
            total: Number(inscr.inscriptions),
            vivantes: Number(inscr.vivantes),
            ontRepondu: Number(inscr.ont_repondu),
            gelees: Number(inscr.gelees),
            attenteSansReveil: Number(inscr.attente_sans_reveil),
            enlisees: Number(inscr.enlisees),
            prochainReveil: inscr.prochain_reveil,
          }
        : null,
      majLe: a.updated_at,
    }
  })

  return json({ campagnes: items }, { headers: cors })
})
