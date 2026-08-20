// /api/automations/campagnes/[id]/leads — la liste de leads d'une campagne.
//
// C'EST LA PIÈCE QUI MANQUAIT À UNE SÉQUENCE POUR ÊTRE UNE CAMPAGNE. Le reste
// existait : le moteur, le régulateur, les étapes, les tâches. Ce qu'aucun
// écran ne savait dire, c'est QUI est dedans, qui reste à lancer, et pourquoi
// les autres ne partiront pas.
//
// GET    la liste, filtrable par statut et par motif d'écart
// POST   ajouter — depuis un segment (rejoué), un lot (lu), une sélection, ou
//        en reprenant les inscriptions déjà en cours
// PATCH  écarter un lead à la main, ou le remettre dans la file
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { MOTIFS_ECART, ecartRattrapable, motifEcartLabel, type MotifEcart, type StatutListe } from '@/lib/automations/campagne'
import { ajouterLeads, ecarterLead, reprendreInscriptions } from '@/lib/automations/campagne-db'
import { releverLesStatuts } from '@/lib/automations/statut-lead-db'
import {
  MAX_AJOUT,
  MIGRATION_LISTE,
  ajoutLeadsSchema,
  chargerCampagne,
  majLeadSchema,
  migrationAbsente,
  noterAudience,
  type AjoutLeadsBody,
  type MajLeadBody,
} from '../../_campagne'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

type Params = { id: string }

const LIMITE_DEFAUT = 50
const LIMITE_MAX = 200

const erreurBase = (e: unknown, cors: Record<string, string>) => {
  const err = e as { code?: string; message?: string }
  if (migrationAbsente(err)) {
    return jsonError('migration_non_appliquee', 503, { sql_file: MIGRATION_LISTE, message: `${MIGRATION_LISTE} n’est pas appliquée.` }, cors)
  }
  return jsonError(err.message ?? 'erreur', 500, { message: err.message }, cors)
}

const introuvable = (cors: Record<string, string>) =>
  jsonError('campagne_introuvable', 404, { message: 'Cette campagne n’existe pas.' }, cors)

// ── Lire ────────────────────────────────────────────────────────────────────

export const GET = withAuth<undefined, Params>({ role: 'admin' }, async ({ req, params, cors }) => {
  const sc = getServiceClient()
  const campagne = await chargerCampagne(sc, params.id)
  if (!campagne) return introuvable(cors)

  const sp = new URL(req.url).searchParams
  const statut = sp.get('statut') as StatutListe | null
  const motif = sp.get('motif') as MotifEcart | null
  const limite = Math.min(Math.max(Number(sp.get('limite')) || LIMITE_DEFAUT, 1), LIMITE_MAX)
  const offset = Math.max(Number(sp.get('offset')) || 0, 0)

  let q = sc
    .from('campagne_leads')
    .select('id, entreprise_id, contact_id, enrollment_id, origine, origine_ref, statut, motif_ecart, ajoute_le', {
      count: 'exact',
    })
    .eq('automation_id', params.id)
  if (statut) q = q.eq('statut', statut)
  if (motif && (MOTIFS_ECART as readonly string[]).includes(motif)) q = q.eq('motif_ecart', motif)

  const { data, error, count } = await q
    .order('ajoute_le', { ascending: true })
    .range(offset, offset + limite - 1)
  if (error) return erreurBase(error, cors)

  const lignes = (data ?? []) as {
    id: number
    entreprise_id: number
    contact_id: string | null
    enrollment_id: string | null
    origine: string
    origine_ref: string | null
    statut: StatutListe
    motif_ecart: MotifEcart | null
    ajoute_le: string
  }[]

  // Les fiches des entreprises de la PAGE seulement, en une requête. La liste
  // peut compter dix mille leads ; l'écran n'en montre jamais cinquante.
  const ids = lignes.map((l) => l.entreprise_id)
  const { data: entData } = ids.length
    ? await sc.from('entreprises').select('id, name, ville, code_postal, email, telephone, owner_id').in('id', ids)
    : { data: [] as unknown[] }
  const entPar = new Map(
    ((entData ?? []) as { id: number }[]).map((e) => [Number(e.id), e]),
  )

  // Les deux axes de la couche 3, relevés pour la PAGE seulement.
  //
  // Le statut de LISTE (« à lancer », « écarté ») et le statut du LEAD (« en
  // cours », « a répondu ») ne sont pas la même chose, et la liste ne montrait
  // que le premier — donc elle affichait « inscrit » à quelqu'un dont
  // l'inscription est gelée depuis trois semaines. C'est exactement le grief
  // n° 2 sous une autre forme : un mot qui a l'air d'une mesure et n'en est
  // pas une.
  const statuts = await releverLesStatuts(
    sc,
    params.id,
    lignes.map((l) => ({
      entrepriseId: l.entreprise_id,
      statutListe: l.statut,
      motifEcart: l.motif_ecart,
      email: (entPar.get(l.entreprise_id) as { email?: string | null } | undefined)?.email ?? null,
    })),
  )

  const items = lignes.map((l) => ({
    id: l.id,
    entrepriseId: l.entreprise_id,
    entreprise: entPar.get(l.entreprise_id) ?? null,
    // `null` quand le relevé n'a rien rendu : l'écran dit « non mesuré »
    // plutôt que d'inventer un étage.
    statutLead: statuts.get(l.entreprise_id) ?? null,
    contactId: l.contact_id,
    enrollmentId: l.enrollment_id,
    origine: l.origine,
    origineRef: l.origine_ref,
    statut: l.statut,
    motifEcart: l.motif_ecart,
    // Le motif ne s'affiche jamais nu : il se dit en français, et il dit s'il
    // se répare. « Aucun canal » s'enrichit ; « désabonné » ne se répare pas.
    motifLibelle: l.motif_ecart ? motifEcartLabel(l.motif_ecart) : null,
    rattrapable: l.motif_ecart ? ecartRattrapable(l.motif_ecart) : false,
    ajouteLe: l.ajoute_le,
  }))

  return json({ items, total: count ?? items.length, limite, offset }, { headers: cors })
})

// ── Ajouter ─────────────────────────────────────────────────────────────────

/**
 * Rejoue un segment pour en tirer des identifiants d'entreprise.
 *
 * `segments_entreprises.criteres` a DÉJÀ la forme des paramètres de
 * `chercher_entreprises` : aucune traduction à écrire, et donc aucune
 * traduction à faire diverger. Un segment est une requête, jamais une liste —
 * c'est en le rejouant qu'on obtient sa population du jour.
 */
async function rejouerSegment(
  sc: ReturnType<typeof getServiceClient>,
  segmentId: string,
  offset: number,
): Promise<{ ids: number[]; total: number; nom: string } | { erreur: string }> {
  const { data: seg } = await sc
    .from('segments_entreprises')
    .select('id, nom, criteres')
    .eq('id', segmentId)
    .maybeSingle()
  if (!seg) return { erreur: 'segment_introuvable' }

  const criteres = (seg as { criteres: { q?: string | null; flags?: string[]; sources?: string[] } }).criteres ?? {}
  const { data, error } = await sc.rpc('chercher_entreprises', {
    p_recherche: criteres.q ?? null,
    p_flags: criteres.flags ?? [],
    p_sources: criteres.sources ?? [],
    p_limite: MAX_AJOUT,
    p_offset: offset,
  })
  if (error) return { erreur: error.message }

  const lignes = (data ?? []) as { id: number; total: number | string }[]
  await sc.from('segments_entreprises').update({ utilise_le: new Date().toISOString() }).eq('id', segmentId)
  return {
    ids: lignes.map((l) => Number(l.id)),
    total: lignes.length > 0 ? Number(lignes[0].total) : 0,
    nom: (seg as { nom: string }).nom,
  }
}

export const POST = withAuth<AjoutLeadsBody, Params>(
  { role: 'admin', body: ajoutLeadsSchema },
  async ({ body, params, user, cors }) => {
    const sc = getServiceClient()
    const campagne = await chargerCampagne(sc, params.id)
    if (!campagne) return introuvable(cors)

    const offset = body.offset ?? 0

    // La reprise ne passe pas par la revue : ces prospects sont DÉJÀ partis.
    // Les faire trancher par `motifEcart` les écarterait pour avoir répondu —
    // et c'est précisément ceux-là qu'on ne veut pas perdre de vue.
    if (body.origine === 'reprise') {
      try {
        const r = await reprendreInscriptions(sc, params.id)
        await noterAudience(sc, campagne.automation, {
          type: 'reprise',
          dernierRafraichissement: new Date().toISOString(),
        })
        return json({ ...r, origine: 'reprise' }, { headers: cors })
      } catch (e) {
        return erreurBase(e, cors)
      }
    }

    let entrepriseIds: number[] = []
    let origineRef: string | null = null
    let restant = 0

    if (body.origine === 'segment') {
      if (!body.segment_id) return jsonError('segment_id_manquant', 400, { message: 'Indiquez le segment à rejouer.' }, cors)
      const r = await rejouerSegment(sc, body.segment_id, offset)
      if ('erreur' in r) {
        const statut = r.erreur === 'segment_introuvable' ? 404 : 500
        return jsonError(r.erreur, statut, { message: 'Ce segment est introuvable.' }, cors)
      }
      entrepriseIds = r.ids
      origineRef = body.segment_id
      restant = Math.max(r.total - (offset + r.ids.length), 0)
    } else if (body.origine === 'lot') {
      if (!body.lot_id) return jsonError('lot_id_manquant', 400, { message: 'Indiquez le lot à ajouter.' }, cors)
      const { data, error, count } = await sc
        .from('lots_entreprises')
        .select('entreprise_id', { count: 'exact' })
        .eq('lot_id', body.lot_id)
        .order('entreprise_id', { ascending: true })
        .range(offset, offset + MAX_AJOUT - 1)
      if (error) return erreurBase(error, cors)
      entrepriseIds = ((data ?? []) as { entreprise_id: number }[]).map((r) => Number(r.entreprise_id))
      origineRef = body.lot_id
      restant = Math.max((count ?? entrepriseIds.length) - (offset + entrepriseIds.length), 0)
    } else {
      entrepriseIds = body.entreprise_ids ?? []
      if (entrepriseIds.length === 0) {
        return jsonError('selection_vide', 400, { message: 'Aucune entreprise dans la sélection.' }, cors)
      }
    }

    if (entrepriseIds.length === 0) {
      return jsonError('source_vide', 400, { message: 'Cette source ne rend aucune entreprise.' }, cors)
    }

    try {
      const resultat = await ajouterLeads(sc, {
        automationId: params.id,
        entrepriseIds,
        origine: body.origine,
        origineRef,
        ajoutePar: user.id,
        cible: campagne.cible,
      })

      if (body.origine === 'segment' || body.origine === 'lot') {
        await noterAudience(sc, campagne.automation, {
          type: body.origine,
          segmentId: body.origine === 'segment' ? body.segment_id : null,
          lotId: body.origine === 'lot' ? body.lot_id : null,
          dernierRafraichissement: new Date().toISOString(),
        })
      }

      // `restant` n'est pas un détail d'affichage : sans lui, un segment de
      // 1 200 entreprises s'ajouterait tronqué à 500 sans que rien ne le dise,
      // et la campagne mesurerait une population qu'elle croit complète.
      return json({ ...resultat, restant }, { headers: cors })
    } catch (e) {
      return erreurBase(e, cors)
    }
  },
)

// ── Écarter, réintégrer ─────────────────────────────────────────────────────

export const PATCH = withAuth<MajLeadBody, Params>(
  { role: 'admin', body: majLeadSchema },
  async ({ body, params, cors }) => {
    const sc = getServiceClient()
    const campagne = await chargerCampagne(sc, params.id)
    if (!campagne) return introuvable(cors)

    const { data: ligne } = await sc
      .from('campagne_leads')
      .select('id, statut')
      .eq('automation_id', params.id)
      .eq('entreprise_id', body.entreprise_id)
      .maybeSingle()
    if (!ligne) return jsonError('lead_absent', 404, { message: 'Ce prospect n’est pas dans cette liste.' }, cors)

    // Un lead déjà inscrit ne se retire pas de la liste : il est parti. Ce qui
    // l'arrête, c'est une sortie de séquence (`sortie-sequence.ts`), pas une
    // ligne de liste — et les confondre ferait croire à un arrêt qui n'a pas eu
    // lieu pendant que le moteur continue d'écrire.
    if ((ligne as { statut: StatutListe }).statut === 'inscrit') {
      return jsonError(
        'lead_deja_inscrit',
        409,
        { message: 'Ce prospect est déjà inscrit : arrêtez sa séquence plutôt que de le retirer de la liste.' },
        cors,
      )
    }

    try {
      if (body.action === 'ecarter') {
        await ecarterLead(sc, params.id, body.entreprise_id, 'manuel')
        return json({ ok: true, statut: 'ecarte', motif_ecart: 'manuel' }, { headers: cors })
      }
      // Réintégrer ne force rien : on efface l'écart à la main et on laisse les
      // faits retrancher. Un prospect désabonné redeviendra écarté au prochain
      // rafraîchissement, avec son vrai motif.
      const { error } = await sc
        .from('campagne_leads')
        .update({ statut: 'a_lancer', motif_ecart: null })
        .eq('id', (ligne as { id: number }).id)
      if (error) return erreurBase(error, cors)
      return json({ ok: true, statut: 'a_lancer', motif_ecart: null }, { headers: cors })
    } catch (e) {
      return erreurBase(e, cors)
    }
  },
)
