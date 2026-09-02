// /api/marketing-pipeline/service-tags — poser des métiers sur tout un lot.
//
// POURQUOI EN MASSE. Les tags décident de tout ce qui suit : les pages du
// site, les sections, le tirage des photos dans la médiathèque, et depuis la
// #692 la COMPLÉTUDE de la fiche — sans tag autorisé, « Créer le site » refuse.
// Or 161 entreprises du pipeline sur 818 n'en ont aucun d'autorisé au
// 02/09/2026 (122 sans le moindre tag, 39 avec des tags hors catalogue). Les
// corriger une par une, c'est ouvrir 161 modales.
//
// ── ON N'ÉCRIT QUE DES TAGS AUTORISÉS, ET LE SERVEUR LE VÉRIFIE ──────────
// La liste déroulante ne propose déjà que le catalogue, mais un plafond posé
// par l'écran n'est pas un plafond : cette route revalide chaque libellé contre
// `enrichment_tag_settings`. Sans quoi le geste de masse deviendrait le trou
// par lequel rentrent les tags jumeaux — « climatisation » vs « climatisaton »
// — que ni les pages, ni les sections, ni la médiathèque ne reconnaissent.
//
// ── ELLE ÉCRIT AUX DEUX ENDROITS, ET C'EST TOUT L'INTÉRÊT ────────────────
// `resolve-variables` rend `projectServiceTags ?? serviceTags` : le snapshot du
// dossier lead magnet ÉCRASE l'entreprise au rendu. Poser un tag sur la fiche
// sans toucher au snapshot ne changerait donc RIEN au site — le geste
// paraîtrait avoir marché, et la page resterait la même. Les deux se réalignent
// ensemble, comme le fait désormais la modale « Informations ».
//
// ⚠️ `UPDATE`, JAMAIS `INSERT`. Des triggers posent les dossiers et les fiches
// à la création d'une opportunité ; insérer ici ferait des doublons.
import { z } from 'zod'

import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { loadServiceTagUniverse } from '@/app/api/_lib/service-tag-universe'
import { buildServiceTagCatalog, serviceTagKey } from '@/utils/serviceTags'

export const runtime = 'nodejs'
// Deux `UPDATE` par entreprise, jusqu'à cinq cents : rapide, mais ce sont mille
// allers-retours. Sans cette ligne, un gros lot tombe sur la limite par défaut
// de Vercel, et l'écran verrait un échec là où la moitié est déjà écrite.
export const maxDuration = 300
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

/** Le plafond d'un lot. C'est celui de la sélection du tableau. */
const PLAFOND = 500

const Corps = z.object({
  entreprise_ids: z.array(z.number().int().positive()).min(1).max(PLAFOND),
  tags: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  /**
   * `ajouter` complète sans rien perdre — le cas ordinaire, sur des fiches qui
   * portent déjà un libellé RGE générique. `remplacer` repart de zéro, pour les
   * fiches dont les étiquettes sont fausses. Il n'y a pas de troisième mode :
   * retirer un tag précis se fait dans la fiche, où l'on voit ce qu'on retire.
   */
  mode: z.enum(['ajouter', 'remplacer']).default('ajouter'),
})

export const POST = withAuth({ role: 'admin', body: Corps }, async ({ body, cors }) => {
  const sb = getServiceClient()

  // ── Le catalogue fait foi, pas la requête ───────────────────────────────
  let catalogue: string[]
  try {
    catalogue = buildServiceTagCatalog(await loadServiceTagUniverse(sb))
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'catalogue indisponible', 503, {}, cors)
  }
  if (catalogue.length === 0) {
    return jsonError(
      'Aucun tag autorisé dans les Paramètres : rien à poser tant que la décision métier n’est pas prise.',
      409,
      {},
      cors,
    )
  }

  // Le libellé RETENU est celui du catalogue, pas celui reçu : c'est ce qui
  // empêche « Climatisation » et « climatisation » de coexister en base.
  const parCle = new Map(catalogue.map((t) => [serviceTagKey(t), t]))
  const retenus: string[] = []
  const refuses: string[] = []
  for (const t of body.tags) {
    const canon = parCle.get(serviceTagKey(t))
    if (canon) {
      if (!retenus.includes(canon)) retenus.push(canon)
    } else refuses.push(t)
  }
  if (refuses.length > 0) {
    return jsonError(
      `Tag(s) non autorisé(s) : ${refuses.join(', ')}. Autorise-les dans Réglages → Tags avant de les poser.`,
      422,
      { refuses },
      cors,
    )
  }

  // ── Les fiches, lues avant d'être écrites ───────────────────────────────
  const { data: fiches, error: lecture } = await sb
    .from('entreprises')
    .select('id, service_tags')
    .in('id', body.entreprise_ids)
  if (lecture) return jsonError(lecture.message, 500, {}, cors)

  /** `service_tags` est un jsonb qui porte tantôt un tableau, tantôt une chaîne. */
  const enTableau = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
      : typeof v === 'string' && v.trim()
        ? [v.trim()]
        : []

  let modifiees = 0
  let inchangees = 0
  let snapshots = 0
  const erreurs: string[] = []

  for (const f of fiches ?? []) {
    const avant = enTableau(f.service_tags)
    const cles = new Set(avant.map((t) => serviceTagKey(t)))
    const apres =
      body.mode === 'remplacer'
        ? [...retenus]
        : [...avant, ...retenus.filter((t) => !cles.has(serviceTagKey(t)))]

    // Rien à écrire : on ne touche pas `updated_at` pour rien — le trigger
    // détruirait la preuve de ce qui était là sans rien apporter.
    if (apres.length === avant.length && apres.every((t, i) => t === avant[i])) {
      inchangees += 1
      continue
    }

    const { error } = await sb.from('entreprises').update({ service_tags: apres }).eq('id', f.id)
    if (error) {
      erreurs.push(`#${f.id} : ${error.message}`)
      continue
    }
    modifiees += 1

    // LE SNAPSHOT SUIT, sinon le site continue d'afficher les anciens métiers.
    const { error: errSnap, count } = await sb
      .from('lead_magnet_projects')
      .update({ service_tags_snapshot: apres }, { count: 'exact' })
      .eq('entreprise_id', f.id)
    if (errSnap) erreurs.push(`#${f.id} (snapshot) : ${errSnap.message}`)
    else snapshots += count ?? 0
  }

  const introuvables = body.entreprise_ids.length - (fiches?.length ?? 0)

  return json(
    { ok: true, tags: retenus, mode: body.mode, modifiees, inchangees, snapshots, introuvables, erreurs },
    { headers: cors },
  )
})
