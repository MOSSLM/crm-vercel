// /api/prospection/veilles/[id] — ce qu'une veille a trouvé, et ce qu'on en fait.
//
// TROIS VIDES, TROIS PHRASES — comme partout ailleurs dans cette refonte. Une
// veille sans ligne peut vouloir dire trois choses opposées : elle n'a jamais
// tourné, elle a tourné et n'a rien trouvé, ou la lecture a échoué. La route
// rend donc TOUJOURS l'état et le bilan de la veille à côté de ses lignes ;
// l'écran n'a pas à le deviner d'un tableau vide.
//
// « TRAITER » N'EST PAS « AGIR ». Marquer un signal traité veut dire « j'ai
// regardé », rien de plus : aucune inscription, aucun envoi, aucune tâche. La
// veille ne sait pas ce qu'on a décidé, et c'est très bien — verser dans une
// campagne se fait depuis la campagne, où le geste est visible.
import { z } from 'zod'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { FICHES, etatDe, phraseDe, type BilanPasse, type Declencheur } from '@/lib/prospection/signaux'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

type Params = { id: string }

const migrationAbsente = (message: string) =>
  /relation .*veille.* does not exist|could not find the table/i.test(message)

const ABSENTE = 'Les tables des veilles n’existent pas encore : appliquer `sql/20260820_veilles.sql`.'

/** Le plafond d'affichage. 305 lignes pour la note d'audit : il faut un cran d'arrêt, et le dire. */
const PLAFOND = 500

export const GET = withAuth<unknown, Params>({ role: 'admin' }, async ({ params, cors }) => {
  const sb = getServiceClient()

  const { data: v, error: eVeille } = await sb
    .from('veilles')
    .select('id, nom, declencheur, perimetre, actif, premiere_passe_le, derniere_passe_le, derniere_passe_bilan')
    .eq('id', params.id)
    .maybeSingle()

  if (eVeille) {
    return migrationAbsente(eVeille.message)
      ? jsonError(ABSENTE, 503, {}, cors)
      : jsonError(eVeille.message, 500, {}, cors)
  }
  if (!v) return jsonError('Veille introuvable.', 404, {}, cors)

  const bilan = (v.derniere_passe_bilan as BilanPasse | null) ?? null
  const etat = etatDe({ premierePasseLe: (v.premiere_passe_le as string | null) ?? null, derniereBilan: bilan })
  const fiche = FICHES[v.declencheur as Declencheur] ?? null

  const { data: constats, error: eConstats } = await sb
    .from('veille_constats')
    .select('id, entreprise_id, vu_le, reprise, valeur, traite_le')
    .eq('veille_id', params.id)
    .order('traite_le', { ascending: true, nullsFirst: true })
    .order('vu_le', { ascending: false })
    .limit(PLAFOND + 1)

  if (eConstats) {
    return migrationAbsente(eConstats.message)
      ? jsonError(ABSENTE, 503, {}, cors)
      : jsonError(eConstats.message, 500, {}, cors)
  }

  const lignes = (constats ?? []).slice(0, PLAFOND)
  const tronque = (constats ?? []).length > PLAFOND

  // Le nom de l'entreprise et de quoi appeler : sans ça, un signal est un
  // identifiant numérique, et personne ne décroche un téléphone pour un entier.
  const ids = [...new Set(lignes.map((l) => l.entreprise_id as number))]
  const fiches = new Map<number, { nom: string; ville: string | null; telephone: string | null; ownerId: string | null }>()
  if (ids.length) {
    const { data: ents } = await sb
      .from('entreprises')
      .select('id, name, ville, telephone, owner_id')
      .in('id', ids)
    for (const e of ents ?? []) {
      fiches.set(e.id as number, {
        nom: (e.name as string | null) ?? '(sans nom)',
        ville: (e.ville as string | null) ?? null,
        telephone: (e.telephone as string | null) ?? null,
        ownerId: (e.owner_id as string | null) ?? null,
      })
    }
  }

  return json(
    {
      veille: {
        id: v.id as string,
        nom: v.nom as string,
        declencheur: v.declencheur as Declencheur,
        perimetre: v.perimetre as 'attribuees' | 'parc',
        actif: v.actif as boolean,
        premierePasseLe: (v.premiere_passe_le as string | null) ?? null,
        dernierePasseLe: (v.derniere_passe_le as string | null) ?? null,
        bilan,
        etat,
        phrase: phraseDe(etat, bilan),
      },
      fiche,
      tronque,
      lignes: lignes.map((l) => {
        const e = fiches.get(l.entreprise_id as number)
        return {
          id: l.id as number,
          entrepriseId: l.entreprise_id as number,
          nom: e?.nom ?? `Entreprise ${l.entreprise_id}`,
          ville: e?.ville ?? null,
          telephone: e?.telephone ?? null,
          ownerId: e?.ownerId ?? null,
          vuLe: l.vu_le as string,
          reprise: l.reprise as boolean,
          valeur: (l.valeur as Record<string, unknown> | null) ?? {},
          traiteLe: (l.traite_le as string | null) ?? null,
        }
      }),
    },
    { headers: cors },
  )
})

const Traitement = z.object({
  /** Les lignes de constat, pas les entreprises : on marque un signal, pas un prospect. */
  constatIds: z.array(z.number().int().positive()).min(1).max(500),
  /** Rouvrir un signal traité par erreur doit rester possible. */
  traite: z.boolean().default(true),
})

export const PATCH = withAuth<z.infer<typeof Traitement>, Params>(
  { role: 'admin', body: Traitement },
  async ({ body, params, user, cors }) => {
    const sb = getServiceClient()
    const { data, error } = await sb
      .from('veille_constats')
      .update(
        body.traite
          ? { traite_le: new Date().toISOString(), traite_par: user.id }
          : { traite_le: null, traite_par: null },
      )
      .eq('veille_id', params.id)
      .in('id', body.constatIds)
      .select('id')

    if (error) {
      return migrationAbsente(error.message)
        ? jsonError(ABSENTE, 503, {}, cors)
        : jsonError(error.message, 500, {}, cors)
    }
    return json({ modifies: (data ?? []).length }, { headers: cors })
  },
)
