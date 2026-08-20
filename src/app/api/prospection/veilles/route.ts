// /api/prospection/veilles — les veilles, et le catalogue de ce qu'on sait voir.
//
// LE CATALOGUE PART AVEC LA LISTE, ET C'EST VOULU. L'écran a besoin des trois
// choses en même temps : ce qui existe, ce qu'on pourrait surveiller, et ce
// qu'on ne saura PAS voir. Les faire venir de trois appels laisserait l'écran
// afficher un catalogue amputé pendant que le troisième charge — et un
// déclencheur manquant se lit comme un déclencheur impossible.
//
// `HORS_PORTEE` VOYAGE AVEC LE RESTE. Les quatre veilles du plan qui ne sont
// pas mesurables (la note d'audit qui chute, le site qui vient de tomber,
// l'intention GA4, le concurrent détecté) s'affichent grisées, avec leur
// raison. C'est ce qui empêche de les redemander tous les trois mois.
import { z } from 'zod'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { preflight } from '@/app/api/_lib/cors'
import { DECLENCHEURS, FICHES, HORS_PORTEE, classer, etatDe, phraseDe, type BilanPasse, type Declencheur } from '@/lib/prospection/signaux'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const OPTIONS = (req: Request) => preflight(req)

/** Les tables sont nées le 20/08 — sans elles, la route le DIT plutôt que de rendre 500. */
const migrationAbsente = (message: string) =>
  /relation .*veille.* does not exist|could not find the table/i.test(message)

const ABSENTE = 'Les tables des veilles n’existent pas encore : appliquer `sql/20260820_veilles.sql`.'

/** Le catalogue, tel que l'écran le consomme. Ordonné : les signaux avant les segments. */
const catalogue = () => ({
  declencheurs: classer([...DECLENCHEURS]).map((c) => FICHES[c]),
  horsPortee: HORS_PORTEE,
})

export const GET = withAuth({ role: 'admin' }, async ({ cors }) => {
  const sb = getServiceClient()
  const { data, error } = await sb
    .from('veilles')
    .select('id, nom, declencheur, perimetre, actif, cree_le, premiere_passe_le, derniere_passe_le, derniere_passe_bilan')
    .order('cree_le', { ascending: true })

  if (error) {
    return migrationAbsente(error.message)
      ? jsonError(ABSENTE, 503, {}, cors)
      : jsonError(error.message, 500, {}, cors)
  }

  const lignes = data ?? []

  // Le nombre de signaux NON TRAITÉS par veille — c'est le seul chiffre que
  // l'écran met en gros. Une lecture séparée, parce qu'un `count` par ligne
  // ferait autant d'allers-retours que de veilles.
  const compte = new Map<string, number>()
  if (lignes.length) {
    const { data: aTraiter } = await sb
      .from('veille_constats')
      .select('veille_id')
      .is('traite_le', null)
      .in('veille_id', lignes.map((l) => l.id as string))
      .limit(10_000)
    for (const c of aTraiter ?? []) {
      const k = c.veille_id as string
      compte.set(k, (compte.get(k) ?? 0) + 1)
    }
  }

  const veilles = lignes.map((v) => {
    const bilan = (v.derniere_passe_bilan as BilanPasse | null) ?? null
    const etat = etatDe({ premierePasseLe: (v.premiere_passe_le as string | null) ?? null, derniereBilan: bilan })
    return {
      id: v.id as string,
      nom: v.nom as string,
      declencheur: v.declencheur as Declencheur,
      perimetre: v.perimetre as 'attribuees' | 'parc',
      actif: v.actif as boolean,
      creeLe: v.cree_le as string,
      premierePasseLe: (v.premiere_passe_le as string | null) ?? null,
      dernierePasseLe: (v.derniere_passe_le as string | null) ?? null,
      bilan,
      etat,
      phrase: phraseDe(etat, bilan),
      aTraiter: compte.get(v.id as string) ?? 0,
    }
  })

  return json({ veilles, ...catalogue() }, { headers: cors })
})

const Nouvelle = z.object({
  nom: z.string().trim().min(1).max(60),
  declencheur: z.enum(DECLENCHEURS),
  perimetre: z.enum(['attribuees', 'parc']).default('attribuees'),
})

export const POST = withAuth({ role: 'admin', body: Nouvelle }, async ({ body, user, cors }) => {
  const sb = getServiceClient()
  const { data, error } = await sb
    .from('veilles')
    .insert({
      nom: body.nom,
      declencheur: body.declencheur,
      perimetre: body.perimetre,
      cree_par: user.id,
    })
    .select('id, nom, declencheur, perimetre, actif, cree_le')
    .maybeSingle()

  if (error) {
    if (migrationAbsente(error.message)) return jsonError(ABSENTE, 503, {}, cors)
    if (/duplicate key|veilles_nom_unique/i.test(error.message)) {
      return jsonError(`Une veille s’appelle déjà « ${body.nom} ».`, 409, {}, cors)
    }
    return jsonError(error.message, 500, {}, cors)
  }

  return json({ veille: data }, { headers: cors })
})

const Modification = z.object({
  id: z.string().uuid(),
  nom: z.string().trim().min(1).max(60).optional(),
  actif: z.boolean().optional(),
})

export const PATCH = withAuth({ role: 'admin', body: Modification }, async ({ body, cors }) => {
  const patch: Record<string, unknown> = {}
  if (body.nom !== undefined) patch.nom = body.nom
  if (body.actif !== undefined) patch.actif = body.actif
  if (Object.keys(patch).length === 0) return jsonError('Rien à modifier.', 400, {}, cors)

  const sb = getServiceClient()
  const { data, error } = await sb.from('veilles').update(patch).eq('id', body.id)
    .select('id, nom, actif').maybeSingle()

  if (error) {
    if (migrationAbsente(error.message)) return jsonError(ABSENTE, 503, {}, cors)
    if (/duplicate key|veilles_nom_unique/i.test(error.message)) {
      return jsonError(`Une veille s’appelle déjà « ${body.nom} ».`, 409, {}, cors)
    }
    return jsonError(error.message, 500, {}, cors)
  }
  if (!data) return jsonError('Veille introuvable.', 404, {}, cors)

  return json({ veille: data }, { headers: cors })
})

const Suppression = z.object({ id: z.string().uuid() })

// SUPPRIMER UNE VEILLE EFFACE SA MÉMOIRE — le `on delete cascade` emporte les
// constats. C'est voulu : ces constats ne veulent rien dire hors de leur
// veille, ce sont des « la première fois que CETTE question a trouvé cette
// entreprise ». En revanche rien n'est retiré aux entreprises elles-mêmes : une
// veille n'a jamais rien écrit sur elles.
export const DELETE = withAuth({ role: 'admin', body: Suppression }, async ({ body, cors }) => {
  const sb = getServiceClient()
  const { error } = await sb.from('veilles').delete().eq('id', body.id)
  if (error) {
    return migrationAbsente(error.message)
      ? jsonError(ABSENTE, 503, {}, cors)
      : jsonError(error.message, 500, {}, cors)
  }
  return json({ ok: true }, { headers: cors })
})
