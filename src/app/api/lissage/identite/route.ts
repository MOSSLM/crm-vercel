// /api/lissage/identite — la file des SIRET à trancher, et la décision.
//
// POURQUOI CETTE ROUTE, ALORS QUE `/api/donnees-publiques/resolution` EXISTE
// Elle existe et elle est bonne : elle PROPOSE (`POST`) et elle TRANCHE
// (`PATCH`), et aucun chemin ne fait les deux. Ce qui lui manquait n'est ni la
// recherche ni la décision — c'est la FILE. Son `GET` rend 500 candidats à plat,
// triés par score, tous mélangés, et sans regarder si la fiche a entre-temps
// reçu son SIRET : de quoi trancher une fiche qu'on a sous les yeux, pas de quoi
// vider une file.
//
// Cette route ne réimplémente donc rien. Elle groupe (`fichesAChoisir`), et pour
// la décision elle appelle `validerCandidat` / `rejeterCandidat` — LE MÊME
// module que le `PATCH` voisin. La porte qui écrit `entreprises.siret` reste
// unique : c'est `validerCandidat`, pas une route.
//
// CE QU'ELLE FAIT EN PLUS, ET QUE LE `PATCH` NE PEUT PAS FAIRE : rendre à la
// file de lissage les lignes que la décision débloque. Une ligne posée sur une
// étape `humain` porte `lieu = 'humain'`, et le tick serveur ne réclame jamais
// ces lignes-là — c'est justement ce qui l'empêche de trancher à la place d'un
// humain. Sans cette libération, une fiche tranchée à l'écran resterait « attend
// une relecture » pour toujours, sur une relecture déjà faite.
import { z } from 'zod'

import { preflight } from '@/app/api/_lib/cors'
import { json, jsonError } from '@/app/api/_lib/respond'
import { getServiceClient } from '@/app/api/_lib/service-client'
import { withAuth } from '@/app/api/_lib/with-auth'
import { rejeterCandidat, validerCandidat } from '@/lib/donnees-publiques/resolution'
import { libererEtapeHumaine } from '@/lib/lissage/passe-db'
import {
  fichesAChoisir,
  resumeDeLaFile,
  type CandidatSiret,
  type FicheDuParc,
} from '@/lib/lissage/choix-siret'
import { MIGRATION, migrationAbsente } from '../_lissage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const OPTIONS = (req: Request) => preflight(req)

/** L'identifiant de l'outil, tel que `passe.ts` et le registre le nomment. */
const OUTIL = 'choix-siret'

/** Le plafond de lecture. Au-delà, l'écran ne s'ouvre plus et personne ne tranche. */
const PLAFOND_FICHES = 60

interface LigneCandidat {
  id: string
  entreprise_id: number
  siret: string
  denomination: string | null
  enseignes: string[] | null
  adresse: string | null
  code_postal: string | null
  ville: string | null
  etat_administratif: string | null
  naf_code: string | null
  score: number | null
  score_detail: Record<string, unknown> | null
}

/**
 * GET — les fiches qui attendent une décision.
 *
 * ⚠️ ON ÉCARTE LES FICHES QUI ONT DÉJÀ UN SIRET, ET C'EST CE FILTRE QUI FAIT
 * L'ÉCRAN. Mesuré le 20/08 : 506 lignes `propose` sur 186 fiches, dont **172
 * fiches ont déjà leur SIRET** — écrit par un versement antérieur
 * (`proeco_registre_auto`, `api_gouv`, `proeco_site_mentions_legales`) qui n'est
 * jamais passé par `validerCandidat` et n'a donc rejeté aucun concurrent. Sans
 * ce filtre, l'écran ouvrirait sur 186 fiches dont 172 questions déjà répondues.
 * Avec, il en reste 14 — et ce sont les vraies.
 */
export const GET = withAuth({ role: 'admin' }, async ({ req, cors }) => {
  const sc = getServiceClient()
  const sp = new URL(req.url).searchParams

  const { data: brut, error } = await sc
    .from('entreprise_siret_candidats')
    .select(
      'id, entreprise_id, siret, denomination, enseignes, adresse, code_postal, ville, etat_administratif, naf_code, score, score_detail',
    )
    .eq('statut', 'propose')
    .order('score', { ascending: false })
    .limit(1000)
  if (error) return jsonError(error.message, 500, {}, cors)

  const lignes = (brut ?? []) as LigneCandidat[]
  const ids = [...new Set(lignes.map((l) => Number(l.entreprise_id)))]
  if (ids.length === 0) {
    return json({ fiches: [], resume: resumeDeLaFile([]), plafonne: false }, { headers: cors })
  }

  const { data: fichesBrutes, error: errFiches } = await sc
    .from('entreprises')
    .select('id, name, ville, code_postal, siret')
    .in('id', ids)
    .is('merged_into_id', null)
    .is('siret', null)
  if (errFiches) return jsonError(errFiches.message, 500, {}, cors)

  const fiches: FicheDuParc[] = (
    (fichesBrutes ?? []) as { id: number; name: string | null; ville: string | null; code_postal: string | null }[]
  ).map((f) => ({
    entrepriseId: Number(f.id),
    nom: f.name,
    ville: f.ville,
    codePostal: f.code_postal,
  }))

  const candidats: CandidatSiret[] = lignes.map((l) => ({
    id: String(l.id),
    entrepriseId: Number(l.entreprise_id),
    siret: l.siret,
    denomination: l.denomination,
    enseignes: l.enseignes ?? [],
    adresse: l.adresse,
    codePostal: l.code_postal,
    ville: l.ville,
    etatAdministratif: l.etat_administratif,
    nafCode: l.naf_code,
    score: Number(l.score ?? 0),
    detail: (l.score_detail ?? null) as CandidatSiret['detail'],
  }))

  const toutes = fichesAChoisir(candidats, fiches)
  const limite = Math.max(1, Math.min(Number(sp.get('taille')) || PLAFOND_FICHES, PLAFOND_FICHES))

  return json(
    {
      // Le résumé porte sur TOUTE la file, pas sur la page : « 12 fiches »
      // quand il en reste 186 est le genre de chiffre qui fait croire le
      // travail fini.
      resume: resumeDeLaFile(toutes),
      fiches: toutes.slice(0, limite),
      plafonne: toutes.length > limite,
    },
    { headers: cors },
  )
})

const decisionSchema = z.object({
  entreprise_id: z.number().int().positive(),
  siret: z.string().regex(/^\d{14}$/),
  decision: z.enum(['valide', 'rejete']),
  commentaire: z.string().max(500).optional(),
  /** `saisie` / `recherche_web` : le SIRET lu ailleurs — pied de page, registre. */
  source: z.enum(['resolution', 'recherche_web', 'saisie']).optional(),
  source_url: z.string().url().max(500).optional(),
})

/**
 * POST — trancher, puis débloquer la file.
 *
 * Réservé à l'admin, comme le `PATCH` voisin et pour la même raison : valider un
 * SIRET engage tout ce qui en découle, jusqu'aux logos RGE affichés sur un site
 * public. Le registre est réinterrogé avant l'écriture, même quand le numéro
 * vient d'ailleurs que de la liste — la clé de Luhn valide une forme, pas une
 * existence.
 */
export const POST = withAuth(
  { role: 'admin', body: decisionSchema },
  async ({ body, user, cors }) => {
    const sc = getServiceClient()

    let avertissements: string[] = []
    if (body.decision === 'valide') {
      const res = await validerCandidat(sc, {
        entreprise_id: body.entreprise_id,
        siret: body.siret,
        decide_par: user.id,
        source: body.source,
        // La preuve voyage avec la décision : dans six mois, devant une fiche
        // douteuse, on veut pouvoir dire OÙ le numéro a été lu.
        commentaire:
          [body.commentaire, body.source_url && `source : ${body.source_url}`]
            .filter(Boolean)
            .join(' — ') || undefined,
      })
      if (!res.ok) return jsonError(res.erreur, 409, {}, cors)
      avertissements = res.avertissements
    } else {
      await rejeterCandidat(sc, {
        entreprise_id: body.entreprise_id,
        siret: body.siret,
        decide_par: user.id,
        commentaire: body.commentaire,
      })
    }

    // Reste-t-il quelque chose à trancher sur cette fiche ? Tant qu'il en reste,
    // la ligne de file DOIT rester sur l'étape humaine : la libérer maintenant
    // classerait l'outil comme « tenté » et l'écran ne reverrait jamais les
    // candidats restants.
    const { count } = await sc
      .from('entreprise_siret_candidats')
      .select('id', { count: 'exact', head: true })
      .eq('entreprise_id', body.entreprise_id)
      .eq('statut', 'propose')

    let liberees = 0
    if ((count ?? 0) === 0) {
      try {
        liberees = await libererEtapeHumaine(
          sc,
          body.entreprise_id,
          OUTIL,
          body.decision === 'valide' ? undefined : 'aucun candidat d’identité n’a été retenu',
        )
      } catch (e) {
        const err = e as { code?: string; message?: string }
        // La file de lissage peut ne pas exister sur cet environnement : la
        // DÉCISION, elle, est prise et écrite. On le dit sans la défaire.
        if (!migrationAbsente(err)) throw e
        return json(
          {
            ok: true,
            decision: body.decision,
            avertissements,
            file: `non mise à jour : ${MIGRATION} n’est pas appliquée`,
          },
          { headers: cors },
        )
      }
    }

    return json(
      { ok: true, decision: body.decision, avertissements, liberees, restants: count ?? 0 },
      { headers: cors },
    )
  },
)
