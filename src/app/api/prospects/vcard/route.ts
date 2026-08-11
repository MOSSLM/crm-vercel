// /api/prospects/vcard — le carnet d'adresses du démarchage, en `.vcf`.
//
// POURQUOI CETTE ROUTE EXISTE
// WhatsApp n'affiche que le nom du répertoire. Tant que les numéros ne sont pas
// dans le téléphone, chaque conversation ouverte depuis le CRM arrive comme un
// numéro nu — et deux prospects démarchés le même jour deviennent
// indiscernables. Le bouton « Exporter les contacts (vCard) » existait déjà dans
// les Paramètres, mais sans rien derrière : il n'a jamais rien exporté.
//
// POURQUOI CÔTÉ SERVEUR
// Le navigateur ne voit que les entreprises que la RLS lui laisse lire, et il
// les lit page par page. Un export doit être complet ou ne pas exister — on
// passe donc par le client de service, en re-filtrant explicitement sur ce que
// le demandeur a le droit d'emporter.
import { preflight } from '@/app/api/_lib/cors'
import { jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import {
  compterExport,
  construireLot,
  nombreDeLots,
  TAILLE_LOT,
  type FicheProspect,
} from '@/lib/prospects/vcard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

/** Ce qu'on emporte. */
type Portee = 'mine' | 'sequence' | 'all'

const PORTEES: readonly Portee[] = ['mine', 'sequence', 'all']

interface LigneEntreprise {
  id: number
  name: string | null
  telephone: string | null
  telephones: string[] | null
  owner_id: string | null
  contacts:
    | {
        id: string
        first_name: string | null
        last_name: string | null
        tel: string | null
        role_title: string | null
        is_decision_maker: boolean | null
      }[]
    | null
}

/** Au-delà, on arrête : c'est une boucle folle, pas un portefeuille. */
const PLAFOND_LIGNES = 20_000
const TAILLE_PAGE = 1000

/**
 * Lit toutes les pages d'une requête, sans se faire plafonner en silence.
 *
 * PostgREST rend 1000 lignes au maximum et ne le signale pas. Le parc qualifié
 * en compte 295 aujourd'hui, donc rien ne casserait — mais un export tronqué ne
 * se voit pas : il manque simplement des gens dans le téléphone, et on ne s'en
 * aperçoit qu'en constatant qu'un prospect « n'a jamais été enregistré ».
 */
async function toutesLesPages<T>(
  construire: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < PLAFOND_LIGNES; from += TAILLE_PAGE) {
    const { data, error } = await construire(from, from + TAILLE_PAGE - 1)
    if (error) throw new Error(error.message)
    const page = (data ?? []) as T[]
    out.push(...page)
    if (page.length < TAILLE_PAGE) break
  }
  return out
}

/**
 * Les entreprises à exporter, et la séquence en cours de chacune.
 *
 * `sequence` part des inscriptions actives plutôt que des entreprises : ce qu'on
 * veut dans le téléphone avant une tournée d'appels, c'est exactement les gens
 * qu'on est en train de démarcher, pas tout le portefeuille.
 */
async function chargerFiches(
  sb: ReturnType<typeof getServiceClient>,
  portee: Portee,
  userId: string,
): Promise<FicheProspect[]> {
  const colonnes =
    'id, name, telephone, telephones, owner_id, ' +
    'contacts(id,first_name,last_name,tel,role_title,is_decision_maker)'

  // La séquence de chaque entreprise, pour l'écrire en NOTE sur les fiches.
  const sequenceParEntreprise = new Map<number, string>()
  let idsSousSequence: number[] | null = null

  if (portee === 'sequence') {
    const lignes = await toutesLesPages<{
      entreprise_id: number | null
      automations: { name: string | null } | null
    }>((from, to) =>
      sb
        .from('sequence_enrollments')
        .select('entreprise_id, automations(name)')
        .eq('status', 'active')
        .order('entreprise_id', { ascending: true })
        .range(from, to),
    )
    for (const l of lignes) {
      if (l.entreprise_id == null) continue
      if (l.automations?.name) sequenceParEntreprise.set(l.entreprise_id, l.automations.name)
    }
    idsSousSequence = [...new Set(lignes.map((l) => l.entreprise_id).filter((id): id is number => id != null))]
    // Aucune séquence en cours : un fichier vide, pas le portefeuille entier.
    if (idsSousSequence.length === 0) return []
  }

  const lignes = await toutesLesPages<LigneEntreprise>((from, to) => {
    let requete = sb
      .from('entreprises')
      .select(colonnes)
      .eq('qualifie', true)
      .is('archived_at', null)
      .is('merged_into_id', null)

    if (portee === 'mine') requete = requete.eq('owner_id', userId)
    if (idsSousSequence) requete = requete.in('id', idsSousSequence)

    return requete.order('id', { ascending: true }).range(from, to)
  })

  return lignes.map((e) => ({
    entreprise: {
      id: e.id,
      name: e.name,
      telephone: e.telephone,
      telephones: e.telephones,
    },
    contacts: e.contacts ?? [],
    sequence: sequenceParEntreprise.get(e.id) ?? null,
  }))
}

/**
 * `?portee=mine|sequence|all` — mes prospects par défaut.
 * `?compte=1` — ne rend que le décompte, pour l'annoncer avant le clic.
 */
export const GET = withAuth<undefined, Record<string, never>>({}, async ({ req, user, cors }) => {
  const url = new URL(req.url)
  const demandee = url.searchParams.get('portee') ?? 'mine'
  if (!PORTEES.includes(demandee as Portee)) {
    return jsonError('portee_inconnue', 400, { message: 'Portée d’export inconnue.' }, cors)
  }
  const portee = demandee as Portee
  const sb = getServiceClient()

  let fiches: FicheProspect[]
  try {
    fiches = await chargerFiches(sb, portee, user.id)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Export impossible'
    return jsonError('export_impossible', 500, { message }, cors)
  }

  if (url.searchParams.get('compte')) {
    const { cartes, numeros } = compterExport(fiches)
    return Response.json(
      { entreprises: fiches.length, cartes, numeros, lots: nombreDeLots(fiches), tailleLot: TAILLE_LOT },
      { headers: { ...cors, 'cache-control': 'no-store' } },
    )
  }

  // Un lot par téléchargement : les répertoires mobiles n'enregistrent qu'une
  // fiche sur un fichier de plusieurs centaines, sans dire pourquoi.
  const lot = Number(url.searchParams.get('lot') ?? '1')
  const { vcf, lots } = construireLot(fiches, Number.isFinite(lot) ? lot : 1)
  if (!vcf) {
    return jsonError('rien_a_exporter', 404, { message: 'Aucun prospect avec un numéro exploitable.' }, cors)
  }

  const nom = lots > 1 ? `prospects-${portee}-lot${lot}-sur-${lots}.vcf` : `prospects-${portee}.vcf`
  return new Response(vcf, {
    headers: {
      ...cors,
      // `charset=utf-8` explicite : les accents des raisons sociales arrivent
      // sinon en mojibake dans le répertoire, et on ne peut plus les corriger.
      'content-type': 'text/vcard; charset=utf-8',
      'content-disposition': `attachment; filename="${nom}"`,
      'cache-control': 'no-store',
    },
  })
})
