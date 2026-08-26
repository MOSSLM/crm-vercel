// /api/lissage/passes — créer une passe, et voir où elles en sont.
//
// CE QUE ÇA DÉBLOQUE
// L'enrichissement passait presque entièrement par Claude Code, parce que la
// boîte à outils n'avait pas de porte côté app. Ce n'était pas une limite de
// nature — dix-neuf bots sur trente-trois tournent déjà côté serveur — mais une
// absence d'écran. Cette route est la porte : on choisit une population par
// filtres, on dit ce qu'on veut trancher, et la file fait le reste.
import { z } from 'zod'

import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { avancementDePasse, creerPasse, peuplerPasse, planDe } from '@/lib/lissage/passe-db'
import { nomDeSelection } from '@/lib/lissage/passe'
import {
  MAX_POPULATION,
  MIGRATION,
  criteresDepuisLeCorps,
  migrationAbsente,
  planDepuisLeCorps,
  populationDeLaSelection,
  populationDesCriteres,
} from '../_lissage'

export const runtime = 'nodejs'
// Créer une passe résout la population par `chercher_entreprises`, qui plafonne
// à 200 par appel : une passe de 2 000 fait dix allers-retours. Depuis l'index
// partiel `entreprises_sans_site_idx` chacun tient en ~350 ms au lieu de
// ~1 700, mais le nombre d'appels, lui, n'a pas changé. On déclare donc le
// budget plutôt que de dépendre du défaut de la plateforme.
export const maxDuration = 60
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

const cinqCentTrois = (cors: Record<string, string> | undefined) =>
  jsonError(
    'migration_non_appliquee',
    503,
    { sql_file: MIGRATION, message: `${MIGRATION} n’est pas appliquée.` },
    cors,
  )

interface LignePasse {
  id: string
  nom: string
  criteres: Record<string, unknown>
  plan: unknown
  statut: string
  cree_le: string
}

export const GET = withAuth({ role: 'admin' }, async ({ cors }) => {
  const sc = getServiceClient()
  const { data, error } = await sc
    .from('lissage_passes')
    .select('id, nom, criteres, plan, statut, cree_le')
    .order('cree_le', { ascending: false })
    .limit(100)
  if (error) {
    return migrationAbsente(error) ? cinqCentTrois(cors) : jsonError(error.message, 500, {}, cors)
  }

  const passes = (data ?? []) as LignePasse[]
  // Un aller-retour par passe, plafonné à cent : l'index doit s'ouvrir, et
  // l'avancement est ce qu'on vient y lire.
  const items = await Promise.all(
    passes.map(async (p) => ({
      id: p.id,
      nom: p.nom,
      criteres: p.criteres ?? {},
      plan: planDe(p.plan),
      statut: p.statut,
      creeLe: p.cree_le,
      avancement: await avancementDePasse(sc, p.id),
    })),
  )
  // Les propriétaires QUI ONT DES FICHES, avec leur compte. Pas « tous les
  // utilisateurs » : un sélecteur qui propose quelqu'un sans une seule fiche
  // fabrique une passe vide, et on ne le découvre qu'après l'avoir créée.
  return json({ items, proprietaires: await proprietairesDuParc(sc) }, { headers: cors })
})

/** Qui possède des fiches vivantes, et combien. Une lecture, pas une par personne. */
async function proprietairesDuParc(
  sc: ReturnType<typeof getServiceClient>,
): Promise<{ id: string; nom: string; fiches: number }[]> {
  const { data, error } = await sc
    .from('entreprises')
    .select('owner_id')
    .not('owner_id', 'is', null)
    .is('merged_into_id', null)
    .is('archived_at', null)
  if (error) return []

  const comptes = new Map<string, number>()
  for (const r of (data ?? []) as { owner_id: string }[]) {
    comptes.set(r.owner_id, (comptes.get(r.owner_id) ?? 0) + 1)
  }
  if (comptes.size === 0) return []

  const { data: profils } = await sc
    .from('user_profiles')
    .select('id, full_name')
    .in('id', [...comptes.keys()])
  const noms = new Map(
    ((profils ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]),
  )
  return [...comptes.entries()]
    .map(([id, fiches]) => ({ id, nom: noms.get(id) ?? id.slice(0, 8), fiches }))
    .sort((a, b) => b.fiches - a.fiches)
}

/**
 * ⚠️ CE SCHÉMA N'EST PAS DÉCORATIF : SANS LUI, LE CORPS N'EST PAS LU.
 *
 * `withAuth` ne parse la requête que si on lui passe `body:` — le paramètre de
 * type générique, lui, ne fait que TYPER ce qu'on croit recevoir. La première
 * version écrivait `withAuth<CorpsCreation>({ role: 'admin' }, …)` sans schéma :
 * `body` valait donc toujours `undefined`, `nom` toujours vide, et la route
 * refusait toute création en disant « Une passe se nomme » à quelqu'un qui
 * venait de la nommer. Aucune passe n'a jamais pu être créée.
 *
 * Il reste VOLONTAIREMENT permissif sur le contenu : `criteres` et `plan` sont
 * validés par `criteresDepuisLeCorps` / `planDepuisLeCorps`, qui écartent un
 * filtre ou un sujet inconnu au lieu de le traduire. Les redéclarer ici ferait
 * une deuxième définition — et deux définitions divergent toujours.
 */
const corpsCreation = z.object({
  nom: z.string().optional(),
  criteres: z.unknown().optional(),
  plan: z.unknown().optional(),
  taille: z.coerce.number().optional(),
  /**
   * La DEUXIÈME porte d'entrée : une population cochée à l'écran plutôt que
   * décrite par des filtres. Quand elle est là, `criteres` et `taille` ne
   * servent plus — la liste EST la population.
   */
  entrepriseIds: z.array(z.coerce.number()).optional(),
  /** D'où vient la sélection, pour composer le nom. Libellé, jamais un filtre. */
  origine: z.string().optional(),
})

/**
 * Le nom lisible d'une provenance. Court, et fermé : un libellé libre venu du
 * navigateur finirait affiché tel quel dans la liste des passes.
 */
const LIBELLE_ORIGINE: Readonly<Record<string, string>> = {
  'marketing-pipeline': 'Pipeline marketing',
  explorateur: 'Explorateur',
}

export const POST = withAuth({ role: 'admin', body: corpsCreation }, async ({ body, user, cors }) => {
  const plan = planDepuisLeCorps(body?.plan)
  const sc = getServiceClient()
  const choisies = body?.entrepriseIds ?? []
  // UNE SÉLECTION, OU DES FILTRES — jamais les deux. La liste cochée gagne :
  // c'est le geste le plus explicite des deux, et l'envoyer avec des critères
  // n'a de sens que si un écran fait les deux, ce qu'aucun ne fait.
  const parSelection = choisies.length > 0

  let population: { ids: number[]; total: number }
  let criteres: Record<string, unknown>
  let nom: string
  let ecartees = 0

  if (parSelection) {
    let selection
    try {
      selection = await populationDeLaSelection(sc, choisies)
    } catch (e) {
      const err = e as { message?: string }
      return jsonError(err.message ?? 'erreur', 500, {}, cors)
    }
    population = { ids: selection.ids, total: selection.demandes }
    ecartees = selection.ecartees
    // Les critères d'une sélection ne DÉCRIVENT pas sa population, ils disent
    // d'où elle vient. Écrire ici des filtres qu'on n'a pas appliqués ferait
    // croire qu'on peut la rejouer — on ne peut pas : c'est une liste figée.
    criteres = {
      origine: LIBELLE_ORIGINE[body?.origine ?? ''] ? (body?.origine as string) : 'selection',
      selection: selection.ids.length,
    }
    // Le nom est composé, pas demandé : personne ne nomme un lot qu'il vient de
    // cocher, et une passe sans nom serait introuvable dans la liste.
    nom =
      (body?.nom ?? '').trim() ||
      nomDeSelection(
        selection.ids.length,
        new Date(),
        LIBELLE_ORIGINE[body?.origine ?? ''] ?? 'Sélection',
      )
  } else {
    nom = (body?.nom ?? '').trim()
    if (!nom) return jsonError('nom_requis', 400, { message: 'Une passe se nomme.' }, cors)

    const taille = Math.max(1, Math.min(Number(body?.taille) || 100, MAX_POPULATION))
    criteres = criteresDepuisLeCorps(body?.criteres)
    try {
      population = await populationDesCriteres(sc, criteres, taille)
    } catch (e) {
      const err = e as { code?: string; message?: string }
      if (err.code === 'PGRST202' || err.code === '42883') {
        return jsonError('chercher_entreprises n’est pas déployée', 503, {}, cors)
      }
      return jsonError(err.message ?? 'erreur', 500, {}, cors)
    }
  }

  // LA POPULATION EST FIGÉE À LA CRÉATION, comme un lot et pas comme un segment.
  // C'est ce dénominateur stable qui rend la couverture lisible : si la
  // population bougeait sous la mesure, « 62 % tranchés » ne voudrait plus rien
  // dire d'un jour sur l'autre.
  if (population.ids.length === 0) {
    return jsonError(
      'population_vide',
      400,
      {
        message: parSelection
          ? 'Aucune des fiches cochées n’est lissable : elles sont archivées ou fusionnées.'
          : 'Ces filtres ne désignent aucune entreprise.',
        total: population.total,
      },
      cors,
    )
  }

  try {
    const passe = await creerPasse(sc, { nom, criteres, plan, creePar: user.id })
    const ajoutes = await peuplerPasse(sc, passe.id, population.ids)
    return json(
      {
        passe,
        ajoutes,
        // `total` est ce que les filtres désignent EN TOUT ; `ajoutes` ce qu'on
        // a pris. Les afficher tous les deux évite de croire qu'on a couvert
        // toute la population quand on en a pris cent.
        total_disponible: population.total,
        // Sur une sélection : les fiches cochées qu'on a refusées (archivées,
        // fusionnées, ou disparues). Zéro la plupart du temps, et c'est
        // justement pourquoi il faut le dire quand ça ne l'est pas.
        ecartees,
      },
      { status: 201, headers: cors },
    )
  } catch (e) {
    const err = e as { code?: string; message?: string }
    return migrationAbsente(err)
      ? cinqCentTrois(cors)
      : jsonError(err.message ?? 'erreur', 500, {}, cors)
  }
})
